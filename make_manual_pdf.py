#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
필라테스 무인 접수 시스템 — 단지 관리자 사용설명서 PDF 생성
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
import os

# ── 폰트 등록 ─────────────────────────────────────────
FONT_DIR = "/usr/share/fonts/truetype/nanum/"
pdfmetrics.registerFont(TTFont("Nanum",     FONT_DIR + "NanumGothic.ttf"))
pdfmetrics.registerFont(TTFont("NanumBold", FONT_DIR + "NanumGothicBold.ttf"))
pdfmetrics.registerFont(TTFont("NanumLight",FONT_DIR + "NanumBarunGothicLight.ttf"))

# ── 색상 팔레트 ───────────────────────────────────────
C_PRIMARY    = colors.HexColor("#4f46e5")   # 인디고 (브랜드)
C_SECONDARY  = colors.HexColor("#7c3aed")   # 보라
C_GREEN      = colors.HexColor("#059669")
C_ORANGE     = colors.HexColor("#d97706")
C_RED        = colors.HexColor("#dc2626")
C_BLUE       = colors.HexColor("#2563eb")
C_TEAL       = colors.HexColor("#0d9488")
C_GRAY_DARK  = colors.HexColor("#1f2937")
C_GRAY       = colors.HexColor("#4b5563")
C_GRAY_MID   = colors.HexColor("#6b7280")
C_GRAY_LIGHT = colors.HexColor("#d1d5db")
C_BG_LIGHT   = colors.HexColor("#f8fafc")
C_BG_BLUE    = colors.HexColor("#eff6ff")
C_BG_GREEN   = colors.HexColor("#f0fdf4")
C_BG_ORANGE  = colors.HexColor("#fff7ed")
C_BG_PURPLE  = colors.HexColor("#f5f3ff")
C_BG_GRAY    = colors.HexColor("#f9fafb")
C_WHITE      = colors.white

PW, PH = A4  # 595, 842

# ── 스타일 정의 ────────────────────────────────────────
def S(name, **kw):
    base = dict(fontName="Nanum", fontSize=10, leading=16,
                textColor=C_GRAY_DARK, spaceAfter=4)
    base.update(kw)
    return ParagraphStyle(name, **base)

STYLES = {
    # 표지
    "cover_title":   S("ct",  fontName="NanumBold", fontSize=28, leading=38, textColor=C_WHITE, alignment=TA_CENTER),
    "cover_sub":     S("cs",  fontName="Nanum",     fontSize=14, leading=22, textColor=colors.HexColor("#c7d2fe"), alignment=TA_CENTER),
    "cover_date":    S("cd",  fontName="Nanum",     fontSize=11, leading=16, textColor=colors.HexColor("#a5b4fc"), alignment=TA_CENTER),
    # 챕터/섹션
    "chapter":       S("ch",  fontName="NanumBold", fontSize=18, leading=26, textColor=C_WHITE, spaceAfter=0),
    "section":       S("sec", fontName="NanumBold", fontSize=14, leading=20, textColor=C_PRIMARY, spaceBefore=14, spaceAfter=6),
    "subsection":    S("sub", fontName="NanumBold", fontSize=11, leading=16, textColor=C_GRAY_DARK, spaceBefore=8, spaceAfter=4),
    # 본문
    "body":          S("bd",  fontName="Nanum",     fontSize=9.5, leading=17, textColor=C_GRAY, spaceAfter=4),
    "body_indent":   S("bi",  fontName="Nanum",     fontSize=9.5, leading=17, textColor=C_GRAY, leftIndent=14, spaceAfter=3),
    "body_bold":     S("bb",  fontName="NanumBold", fontSize=9.5, leading=17, textColor=C_GRAY_DARK),
    "caption":       S("cap", fontName="Nanum",     fontSize=8.5, leading=14, textColor=C_GRAY_MID, spaceAfter=2),
    # 콜아웃
    "tip":           S("tip", fontName="Nanum",     fontSize=9,   leading=16, textColor=C_GREEN),
    "warn":          S("wrn", fontName="NanumBold", fontSize=9,   leading=16, textColor=C_RED),
    "note":          S("nt",  fontName="Nanum",     fontSize=9,   leading=16, textColor=colors.HexColor("#1d4ed8")),
    # 목차
    "toc_chapter":   S("tcc", fontName="NanumBold", fontSize=11, leading=18, textColor=C_GRAY_DARK),
    "toc_item":      S("tci", fontName="Nanum",     fontSize=9.5, leading=16, textColor=C_GRAY, leftIndent=16),
    # 테이블
    "tbl_head":      S("th",  fontName="NanumBold", fontSize=9,  leading=14, textColor=C_WHITE, alignment=TA_CENTER),
    "tbl_body":      S("tb",  fontName="Nanum",     fontSize=8.5,leading=14, textColor=C_GRAY_DARK),
    "tbl_body_c":    S("tbc", fontName="Nanum",     fontSize=8.5,leading=14, textColor=C_GRAY_DARK, alignment=TA_CENTER),
}


# ── 헬퍼 컴포넌트 ─────────────────────────────────────

def chapter_header(num, title, subtitle=""):
    """챕터 헤더 박스"""
    title_p  = Paragraph(f"Part {num}. {title}", STYLES["chapter"])
    sub_p    = Paragraph(subtitle, S("csub", fontName="Nanum", fontSize=10, leading=15,
                                     textColor=colors.HexColor("#c7d2fe"))) if subtitle else Spacer(1, 2)
    tbl = Table([[title_p], [sub_p]], colWidths=[PW - 2*1.5*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_PRIMARY),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [C_PRIMARY, colors.HexColor("#3730a3")]),
        ("LEFTPADDING",  (0,0), (-1,-1), 18),
        ("RIGHTPADDING", (0,0), (-1,-1), 18),
        ("TOPPADDING",   (0,0), (0,0),  16),
        ("BOTTOMPADDING",(0,-1),(-1,-1),14),
        ("TOPPADDING",   (0,1), (-1,-1), 2),
        ("ROUNDEDCORNERS", [8,8,8,8]),
    ]))
    return [tbl, Spacer(1, 12)]


def section_title(text, color=C_PRIMARY):
    """섹션 제목 (하단 밑줄)"""
    p = Paragraph(text, STYLES["section"])
    hr = HRFlowable(width="100%", thickness=1.5, color=color, spaceAfter=6)
    return [p, hr]


def callout(text, kind="tip"):
    """팁/경고/안내 박스"""
    icons = {"tip": "✅", "warn": "⚠️", "note": "ℹ️", "important": "🔴"}
    bg_map = {"tip": C_BG_GREEN, "warn": C_BG_ORANGE, "note": C_BG_BLUE, "important": colors.HexColor("#fef2f2")}
    bd_map = {"tip": C_GREEN,    "warn": C_ORANGE,    "note": C_BLUE,    "important": C_RED}
    icon = icons.get(kind, "•")
    bg   = bg_map.get(kind, C_BG_LIGHT)
    bd   = bd_map.get(kind, C_GRAY_LIGHT)
    sty  = STYLES.get(kind, STYLES["body"])
    p    = Paragraph(f"{icon}  {text}", sty)
    tbl  = Table([[p]], colWidths=[PW - 2*1.5*cm - 4])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), bg),
        ("LEFTBORDER",   (0,0),(0,-1),  4, bd),
        ("LINEAFTER",    (0,0),(0,-1),  0, colors.transparent),
        ("BOX",          (0,0),(-1,-1), 0.5, bd),
        ("LEFTPADDING",  (0,0),(-1,-1), 12),
        ("RIGHTPADDING", (0,0),(-1,-1), 10),
        ("TOPPADDING",   (0,0),(-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1), 8),
        ("ROUNDEDCORNERS",[0,6,6,0]),
    ]))
    return [tbl, Spacer(1, 6)]


def step_table(rows):
    """번호 + 설명 단계 테이블"""
    data = [[Paragraph(f"<b>단계 {i+1}</b>", STYLES["tbl_head"]),
             Paragraph(title, STYLES["tbl_body"]),
             Paragraph(desc,  STYLES["tbl_body"])]
            for i, (title, desc) in enumerate(rows)]
    tbl = Table(data, colWidths=[42, 100, PW - 2*1.5*cm - 42 - 100 - 8])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(0,-1), C_PRIMARY),
        ("BACKGROUND",   (1,0),(1,-1), colors.HexColor("#e0e7ff")),
        ("BACKGROUND",   (2,0),(2,-1), C_WHITE),
        ("TEXTCOLOR",    (0,0),(0,-1), C_WHITE),
        ("FONTNAME",     (0,0),(-1,-1), "Nanum"),
        ("FONTNAME",     (0,0),(0,-1), "NanumBold"),
        ("FONTSIZE",     (0,0),(-1,-1), 9),
        ("LEADING",      (0,0),(-1,-1), 14),
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",   (0,0),(-1,-1), 7),
        ("BOTTOMPADDING",(0,0),(-1,-1), 7),
        ("LEFTPADDING",  (0,0),(-1,-1), 8),
        ("RIGHTPADDING", (0,0),(-1,-1), 8),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [None, None, None]),
        ("GRID",         (0,0),(-1,-1), 0.5, C_GRAY_LIGHT),
        ("LINEBELOW",    (0,-1),(-1,-1), 1, C_GRAY_LIGHT),
    ]))
    return [tbl, Spacer(1, 8)]


def info_table(rows, col_widths=None):
    """2열 정보 테이블 (항목 | 설명)"""
    if col_widths is None:
        col_widths = [100, PW - 2*1.5*cm - 100 - 4]
    data = [[Paragraph(f"<b>{k}</b>", STYLES["tbl_body"]),
             Paragraph(v, STYLES["tbl_body"])] for k, v in rows]
    tbl = Table(data, colWidths=col_widths)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(0,-1), C_BG_PURPLE),
        ("FONTNAME",     (0,0),(-1,-1), "Nanum"),
        ("FONTNAME",     (0,0),(0,-1), "NanumBold"),
        ("FONTSIZE",     (0,0),(-1,-1), 9),
        ("LEADING",      (0,0),(-1,-1), 15),
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",   (0,0),(-1,-1), 6),
        ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ("LEFTPADDING",  (0,0),(-1,-1), 10),
        ("RIGHTPADDING", (0,0),(-1,-1), 10),
        ("GRID",         (0,0),(-1,-1), 0.5, C_GRAY_LIGHT),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [C_BG_PURPLE, C_WHITE, C_BG_PURPLE, C_WHITE,
                                          C_BG_PURPLE, C_WHITE, C_BG_PURPLE, C_WHITE]),
    ]))
    return [tbl, Spacer(1, 8)]


def badge(text, bg=C_PRIMARY):
    """인라인 배지"""
    return f'<font color="white"><b> {text} </b></font>'


def bullet(items, indent=0):
    """불릿 리스트"""
    out = []
    for item in items:
        p = Paragraph(f"• &nbsp; {item}", S(f"bul{indent}", fontName="Nanum", fontSize=9.5,
                                             leading=17, textColor=C_GRAY,
                                             leftIndent=14+indent*12, spaceAfter=3))
        out.append(p)
    return out


def sub_bullet(items):
    return bullet(items, indent=1)


def p(text, style="body", **kw):
    """단락"""
    sty = STYLES.get(style, STYLES["body"])
    if kw:
        sty = ParagraphStyle("tmp", parent=sty, **kw)
    return Paragraph(text, sty)


def sp(h=8):
    return Spacer(1, h)


# ════════════════════════════════════════════════════════
#  PDF 내용 빌드
# ════════════════════════════════════════════════════════

def build_content():
    story = []

    # ╔══════════════════════════════════════════════╗
    # ║  표지                                        ║
    # ╚══════════════════════════════════════════════╝
    # 배경 박스 효과 (Table 이용)
    cover_data = [[
        Spacer(1, 60),
        Paragraph("필라테스 무인 접수 시스템", STYLES["cover_sub"]),
        sp(10),
        Paragraph("단지 관리자\n사용설명서", STYLES["cover_title"]),
        sp(20),
        HRFlowable(width="60%", thickness=1, color=colors.HexColor("#818cf8"), hAlign="CENTER"),
        sp(16),
        Paragraph("신청 접수 · 해지 관리 · 정산 · 공지사항 · 설정", STYLES["cover_sub"]),
        sp(40),
        Paragraph("Version 1.0 &nbsp;|&nbsp; 2025년", STYLES["cover_date"]),
        sp(60),
    ]]
    cover_tbl = Table([[item] for item in cover_data[0]], colWidths=[PW - 2*1.5*cm])
    cover_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_PRIMARY),
        ("TOPPADDING",   (0,0),(-1,-1), 0),
        ("BOTTOMPADDING",(0,0),(-1,-1), 0),
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
    ]))
    story.append(cover_tbl)
    story.append(PageBreak())

    # ╔══════════════════════════════════════════════╗
    # ║  목차                                        ║
    # ╚══════════════════════════════════════════════╝
    story.append(p("목  차", "section", fontName="NanumBold", fontSize=16, textColor=C_PRIMARY))
    story.append(HRFlowable(width="100%", thickness=2, color=C_PRIMARY, spaceAfter=14))

    toc = [
        ("Part 1", "시스템 개요 및 로그인",     ["1-1. 시스템 접속 방법", "1-2. 로그인 및 단지 전환", "1-3. 화면 구성"]),
        ("Part 2", "대시보드",                  ["2-1. KPI 카드 확인", "2-2. 최근 신청 / 미답변 문의 / 해지 대기"]),
        ("Part 3", "신청 관리 — 핵심 기능",     ["3-1. 신청 목록 조회 및 필터", "3-2. 신청 상세 확인 및 처리",
                                                "3-3. 프로그램 현황 패널", "3-4. 출석부 · 시간표",
                                                "3-5. 신청 추가 (수동 등록)", "3-6. 데이터 내보내기 / 가져오기"]),
        ("Part 4", "신청기간 & 종류 설정 — 중요",["4-1. 전체 기본 기간 설정", "4-2. 신청 종류별 개별 설정",
                                                "4-3. 대기 시스템 / 자동 승인", "4-4. 월별 운영 시나리오"]),
        ("Part 5", "해지 관리",                 ["5-1. 차월 해지 신청 처리", "5-2. 중도 해지 처리",
                                                "5-3. 환불 신청 처리", "5-4. 해지 직접 등록"]),
        ("Part 6", "월별 정산 리포트",           ["6-1. 정산 조회 방법", "6-2. 수업횟수 설정",
                                                "6-3. 엑셀 다운로드 (5종)", "6-4. 중도해지자 일괄 등록"]),
        ("Part 7", "프로그램 관리",             ["7-1. 프로그램 추가 · 수정 · 삭제", "7-2. 비활성화와 신규접수 차단"]),
        ("Part 8", "강사 관리 · 커리큘럼",      ["8-1. 강사 등록 및 관리", "8-2. 커리큘럼 등록"]),
        ("Part 9", "공지사항 관리",             ["9-1. 공지 작성 · 수정 · 삭제", "9-2. 상단 고정"]),
        ("Part 10","문의 관리",                 ["10-1. 문의 조회", "10-2. 답변 작성"]),
        ("Part 11","내 단지 설정",              ["11-1. 단지 기본 정보 수정", "11-2. QR코드 생성"]),
        ("Part 12","월별 운영 체크리스트",       ["12-1. 접수 오픈 전 (매월 21일)", "12-2. 접수 기간 중 (22~26일)",
                                               "12-3. 접수 마감 후 (27일~)", "12-4. 월말 정산 (말일)"]),
    ]

    for part, title, items in toc:
        story.append(p(f"<b>{part}. {title}</b>", "toc_chapter"))
        for item in items:
            story.append(p(f"└ {item}", "toc_item"))
        story.append(sp(4))

    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 1 — 시스템 개요 및 로그인
    # ════════════════════════════════════════════════
    story += chapter_header("1", "시스템 개요 및 로그인", "접속 방법, 화면 구성")

    story += section_title("1-1. 시스템 접속 방법")
    story.append(p("이 시스템은 <b>인터넷 브라우저</b>에서 접속하는 웹 기반 관리 도구입니다. 별도 앱 설치 없이 사용하며, 단지 관리자에게 별도로 안내된 <b>관리자 주소(/admin/)</b>로 접속합니다."))
    story.append(sp(6))
    story += callout("PC(크롬 권장) 또는 태블릿으로 접속하세요. 모바일 스마트폰에서는 일부 기능이 불편할 수 있습니다.", "tip")
    story += callout("관리자 주소는 입주민에게 절대 공유하지 마세요. 입주민은 별도 신청 주소만 사용합니다.", "warn")

    story += section_title("1-2. 로그인 및 단지 전환")
    story += step_table([
        ("주소 접속",    "관리자 전용 URL(/admin/)을 브라우저 주소창에 입력합니다."),
        ("비밀번호 입력","단지 비밀번호(초기값은 담당자에게 문의)를 입력하고 로그인 버튼을 누릅니다."),
        ("단지 확인",    "좌측 상단에 '단지명 / 관리자'가 표시되면 정상 로그인입니다."),
    ])
    story += callout("비밀번호는 내 단지 설정 → 비밀번호 변경에서 언제든지 변경할 수 있습니다.", "note")

    story += section_title("1-3. 화면 구성")
    story += info_table([
        ("좌측 사이드바", "각 메뉴로 이동하는 탐색 영역. 운영 관리·콘텐츠·설정으로 구분됩니다."),
        ("상단 헤더",    "현재 단지명, 로그아웃 버튼이 표시됩니다."),
        ("본문 영역",    "선택한 메뉴의 콘텐츠가 표시됩니다. 목록·버튼·모달 창 등이 여기에 나타납니다."),
    ])
    story += bullet([
        "<b>대시보드</b> — 현황 숫자 요약 (가장 먼저 확인하는 화면)",
        "<b>신청 관리</b> — 수강 신청 목록 처리 + 기간 설정",
        "<b>해지 관리</b> — 차월 해지 / 중도 해지 / 환불 신청 처리",
        "<b>문의 관리</b> — 입주민 질문 답변",
        "<b>공지사항</b> — 입주민 페이지에 공지 게시",
        "<b>월별 정산 리포트</b> — 엑셀 다운로드",
        "<b>프로그램 관리</b> — 수업 추가·수정·삭제",
        "<b>내 단지 설정</b> — 단지 정보·QR코드",
    ])
    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 2 — 대시보드
    # ════════════════════════════════════════════════
    story += chapter_header("2", "대시보드", "오늘의 현황을 한눈에 확인")

    story += section_title("2-1. KPI 카드 확인")
    story.append(p("대시보드는 로그인 후 처음 보이는 화면입니다. 숫자 카드로 현재 상황을 바로 파악할 수 있습니다."))
    story.append(sp(6))
    story += info_table([
        ("전체 신청",   "지금까지 접수된 신청 건수 합계 (승인·거부·대기 모두 포함)"),
        ("승인 완료",   "관리자가 승인하거나 자동 승인된 수강 중인 인원"),
        ("승인 대기",   "⚠️ 아직 처리하지 않은 신청 건수 — 즉시 신청 관리로 이동해 처리"),
        ("거부",        "거부 처리된 신청 건수"),
        ("해지 대기",   "⚠️ 해지 신청이 들어왔으나 미처리 건수 — 해지 관리에서 확인"),
        ("미답변 문의", "⚠️ 입주민 문의 중 아직 답변하지 않은 건수"),
        ("처리 필요",   "대기 + 해지 대기 + 미답변 문의 합계 — 0이 목표"),
    ])
    story += callout("카드에 '⚠ 처리 필요'가 표시되면 가능한 당일 처리하세요. 입주민이 결과를 기다리고 있습니다.", "warn")

    story += section_title("2-2. 최근 활동 패널")
    story += bullet([
        "<b>최근 신청</b> — 가장 최근 접수된 신청 미리보기. '전체보기' 클릭 시 신청 관리로 이동.",
        "<b>미답변 문의</b> — 답변이 필요한 문의 목록. '전체보기' 클릭 시 문의 관리로 이동.",
        "<b>해지 대기</b> — 처리 대기 중인 해지 신청 목록.",
        "<b>입주민 바로가기</b> — 단지별 입주민 신청 페이지 링크 (QR코드 확인 가능).",
    ])
    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 3 — 신청 관리
    # ════════════════════════════════════════════════
    story += chapter_header("3", "신청 관리", "수강 신청 접수 · 처리 · 조회")

    story += section_title("3-1. 신청 목록 조회 및 필터")
    story.append(p("신청 관리 화면 상단에는 상태별 필터 탭이 있습니다."))
    story += info_table([
        ("전체",    "모든 신청 내역 표시"),
        ("승인",    "현재 수강 중(승인된) 인원"),
        ("대기",    "정원 초과로 대기 중인 신청자 — 대기 순번이 자동 표시됨"),
        ("거부",    "거부 처리된 신청"),
        ("해지",    "해지 완료된 신청 (차월 해지 적용 완료)"),
        ("양도/양수","기존 수강자가 다른 입주민에게 자리를 양도한 경우"),
    ])
    story.append(sp(6))
    story.append(p("<b>검색 및 세부 필터</b>"))
    story += bullet([
        "검색창에 이름 · 동호수 · 전화번호 · 프로그램명을 입력하면 즉시 필터링됩니다.",
        "프로그램 / 시간대 / 동 필터를 조합하여 원하는 인원만 추출할 수 있습니다.",
        "'초기화' 버튼으로 모든 필터를 한번에 해제합니다.",
    ])

    story += section_title("3-2. 신청 상세 확인 및 처리")
    story.append(p("신청 카드를 클릭하면 상세 정보가 펼쳐집니다."))
    story += info_table([
        ("신청자 정보", "이름 · 동호수 · 전화번호 · 신청일시"),
        ("프로그램",    "신청한 수업명 · 희망 시간대"),
        ("서명 확인",   "입주민이 작성한 서명 이미지를 확인할 수 있습니다."),
        ("상태 변경",   "승인 · 거부 · 대기 · 해지 · 취소 등으로 상태를 변경합니다."),
        ("메모",        "관리자 전용 메모 입력 가능 (입주민에게는 보이지 않음)"),
    ])
    story += callout("승인 처리 시 입주민에게 자동으로 확인 메시지가 발송됩니다 (SMS 설정 시).", "tip")
    story += callout("자동 승인이 ON인 경우, 신청이 들어오면 즉시 '승인' 상태로 처리됩니다. OFF로 설정하면 관리자가 직접 승인해야 합니다.", "note")

    story += section_title("3-3. 프로그램 현황 패널")
    story.append(p("신청 목록 위에 있는 <b>▼ 프로그램 현황</b>을 클릭하면 수업별 정원 현황이 펼쳐집니다."))
    story += bullet([
        "각 수업 · 시간대별 현재 승인 인원 / 정원을 막대 그래프로 확인합니다.",
        "초록색: 여유 있음 / 주황색: 거의 마감 / 빨간색: 마감 / 보라색: 정원 초과",
        "대기 인원이 있으면 '대기 N명' 표시가 나타납니다.",
    ])

    story += section_title("3-4. 출석부 · 시간표")
    story += bullet([
        "<b>출석부</b> 버튼 — 승인된 수강자 목록을 수업별·시간대별 출석부 형태로 표시. 인쇄 가능.",
        "<b>시간표</b> 버튼 — 전체 수업 시간표를 한눈에 조회.",
    ])

    story += section_title("3-5. 신청 추가 (수동 등록)")
    story.append(p("입주민이 직접 신청하지 못한 경우 관리자가 대신 등록합니다."))
    story += step_table([
        ("신청 추가 클릭",  "상단의 '+ 신청 추가' 버튼을 클릭합니다."),
        ("정보 입력",       "이름, 동, 호수, 전화번호, 프로그램, 희망 시간대를 입력합니다."),
        ("저장",           "저장 버튼을 누르면 승인 상태로 바로 등록됩니다."),
    ])

    story += section_title("3-6. 데이터 내보내기 / 가져오기")
    story += bullet([
        "<b>내보내기(CSV)</b> — 현재 조회된 신청 목록을 엑셀(CSV) 파일로 다운로드합니다.",
        "<b>가져오기</b> — 엑셀(CSV) 파일에서 신청 데이터를 일괄 업로드합니다 (양식 주의).",
    ])
    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 4 — 신청기간 & 종류 설정 ★ 핵심
    # ════════════════════════════════════════════════
    story += chapter_header("4", "신청기간 & 종류 설정", "★ 가장 중요한 운영 설정 — 반드시 숙지")

    story.append(p("신청 관리 화면 상단에는 두 개의 설정 버튼이 있습니다. 이 두 설정이 입주민 신청 페이지의 접수 가능 여부를 완전히 제어합니다."))
    story.append(sp(6))

    # 구조 설명 테이블
    hdr_row = [Paragraph("<b>버튼</b>", STYLES["tbl_head"]),
               Paragraph("<b>역할</b>", STYLES["tbl_head"]),
               Paragraph("<b>언제 사용</b>", STYLES["tbl_head"])]
    data_rows = [
        [p("🕐 신청기간 설정", "tbl_body", fontName="NanumBold"),
         p("전체 기본 기간 + 각 신청 종류별 기간 설정", "tbl_body"),
         p("매월 운영 일정 조정, 상시 개방, 기간 직접 지정", "tbl_body")],
        [p("⚙️ 신청 종류 설정", "tbl_body", fontName="NanumBold"),
         p("각 신청 종류 ON/OFF + 대기시스템 + 자동승인 설정", "tbl_body"),
         p("특정 신청 종류를 일시 중단하거나, 대기 기능 켜기/끄기", "tbl_body")],
    ]
    tbl = Table([hdr_row] + data_rows,
                colWidths=[90, 200, PW - 2*1.5*cm - 90 - 200 - 8])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,0), C_PRIMARY),
        ("FONTNAME",     (0,0),(-1,-1), "Nanum"),
        ("FONTSIZE",     (0,0),(-1,-1), 9),
        ("LEADING",      (0,0),(-1,-1), 14),
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",   (0,0),(-1,-1), 7),
        ("BOTTOMPADDING",(0,0),(-1,-1), 7),
        ("LEFTPADDING",  (0,0),(-1,-1), 8),
        ("RIGHTPADDING", (0,0),(-1,-1), 8),
        ("GRID",         (0,0),(-1,-1), 0.5, C_GRAY_LIGHT),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [C_BG_BLUE, C_WHITE]),
    ]))
    story.append(tbl)
    story.append(sp(12))

    story += section_title("4-1. 전체 기본 기간 설정 (신청기간 설정 첫 번째 탭)")
    story.append(p("'🕐 신청기간 설정' 버튼 클릭 → 첫 번째 탭 <b>[전체 기본 기간]</b>"))
    story.append(sp(4))
    story.append(p("모든 신청 종류의 기본값이 됩니다. 각 신청 종류를 '단지 기본기간 따름'으로 설정하면 여기서 정한 기간이 일괄 적용됩니다."))
    story.append(sp(6))

    story += info_table([
        ("① 자동 (기본값)",
         "매월 22일 09:00 ~ 26일 09:00 KST 고정. 별도 설정 없이 이 기간에 자동으로 접수가 열리고 닫힙니다."),
        ("② 상시 개방",
         "기간 제한 없이 항상 신청 가능. 오픈형 운영 시 선택합니다."),
        ("③ 직접 설정",
         "시작일시와 종료일시를 관리자가 직접 입력합니다. 예: 5월 20일 10:00 ~ 5월 25일 18:00"),
    ], col_widths=[90, PW - 2*1.5*cm - 90 - 4])
    story.append(sp(4))
    story += callout("저장 버튼을 눌러야 입주민 페이지에 즉시 반영됩니다. 설정 후 반드시 저장하세요.", "important")
    story += callout("'전체 기본값 복귀' 버튼을 누르면 자동(22~26일) 설정으로 초기화됩니다.", "note")

    story += section_title("4-2. 신청 종류별 개별 설정 (나머지 탭)")
    story.append(p("같은 모달의 두 번째 탭부터 각 신청 종류를 개별 설정할 수 있습니다."))
    story.append(sp(4))
    story += info_table([
        ("신규 수강 신청", "새로 등록하는 입주민의 신청"),
        ("대기 신청",      "정원 마감 후 대기자 등록 (대기 시스템 ON 필요)"),
        ("차월 해지",      "다음 달부터 해지를 원하는 기존 수강자의 신청"),
        ("중도 해지",      "당월 수업 중 즉시 해지 (별도 운영)"),
        ("환불 신청",      "환불을 요청하는 신청"),
    ])
    story.append(sp(4))
    story.append(p("<b>각 종류별 기간 모드 선택:</b>"))
    story += info_table([
        ("단지 기본기간 따름", "위에서 설정한 전체 기본 기간을 그대로 적용. 대부분 이 값 사용 권장."),
        ("상시 개방",          "이 신청 종류만 항상 받습니다."),
        ("항상 닫힘",          "이 신청 종류는 임시로 접수를 완전히 중단합니다."),
        ("직접 설정",          "이 신청 종류만 별도 날짜를 지정합니다."),
    ])
    story += callout("차월 해지와 신규 수강 신청은 같은 기간(22~26일)에 동시에 운영하는 것이 일반적입니다. 두 종류 모두 '단지 기본기간 따름'으로 설정하면 한 번에 관리됩니다.", "tip")

    story += section_title("4-3. 신청 종류 설정 (⚙️ 버튼)")
    story.append(p("'⚙️ 신청 종류 설정' 버튼을 클릭하면 다음 항목을 설정합니다."))
    story.append(sp(4))
    story.append(p("<b>각 신청 종류 ON/OFF 토글:</b>"))
    story += bullet([
        "ON — 해당 신청 종류가 활성화됩니다.",
        "OFF — 해당 신청 종류가 비활성화됩니다 (입주민 페이지에서 해당 기능 차단).",
        "'전체 ON' / '전체 OFF' 버튼으로 한 번에 전환 가능.",
    ])
    story.append(sp(6))
    story.append(p("<b>대기 시스템:</b>"))
    story += bullet([
        "ON — 수업 정원이 꽉 찼을 때 입주민이 대기 신청을 할 수 있습니다.",
        "누군가 해지하면 대기 1번 순서 입주민에게 자동으로 안내됩니다.",
        "<b>대기 응답 제한</b>: 대기자에게 안내 후 N시간 이내 응답 없으면 다음 순번으로 자동 이동 (기본 3시간).",
    ])
    story.append(sp(6))
    story.append(p("<b>신규 신청 자동 승인:</b>"))
    story += bullet([
        "ON (기본) — 신청 즉시 자동으로 승인됩니다. 관리자 개입 불필요.",
        "OFF — 모든 신청이 '대기' 상태로 접수되며, 관리자가 직접 승인해야 합니다.",
    ])
    story += callout("자동 승인이 ON이어도 정원이 초과된 경우에는 대기 상태로 접수됩니다 (대기 시스템 ON 시).", "note")

    story += section_title("4-4. 월별 운영 시나리오")
    story.append(p("아래는 일반적인 한 달 운영 흐름입니다."))
    story.append(sp(6))
    rows = [
        ("21일 (접수 전날)",  "자동 설정이라면 별도 조작 불필요. 직접 설정인 경우 다음날 오픈 시간을 지금 설정합니다."),
        ("22일 09:00",        "자동 설정이면 접수가 자동으로 열립니다. 상시 개방이면 이미 열려 있습니다."),
        ("22~26일",           "신청이 들어오면 대시보드에서 대기 건수를 확인하고 처리합니다."),
        ("26일 09:00",        "자동 설정이면 접수가 자동으로 닫힙니다."),
        ("27일 이후",         "해지 신청 목록을 해지 관리에서 최종 확인합니다."),
        ("월말",              "월별 정산 리포트에서 엑셀을 다운로드하고 청구서를 작성합니다."),
    ]
    tbl_data = [[Paragraph(f"<b>{d}</b>", STYLES["tbl_body"]),
                 Paragraph(v, STYLES["tbl_body"])] for d, v in rows]
    tbl = Table(tbl_data, colWidths=[100, PW - 2*1.5*cm - 100 - 4])
    tbl.setStyle(TableStyle([
        ("FONTNAME",      (0,0),(-1,-1), "Nanum"),
        ("FONTSIZE",      (0,0),(-1,-1), 9),
        ("LEADING",       (0,0),(-1,-1), 15),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",    (0,0),(-1,-1), 7),
        ("BOTTOMPADDING", (0,0),(-1,-1), 7),
        ("LEFTPADDING",   (0,0),(-1,-1), 10),
        ("RIGHTPADDING",  (0,0),(-1,-1), 10),
        ("GRID",          (0,0),(-1,-1), 0.5, C_GRAY_LIGHT),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [C_BG_BLUE, C_WHITE, C_BG_BLUE, C_WHITE,
                                          C_BG_BLUE, C_WHITE]),
        ("BACKGROUND",    (0,1),(0,1), colors.HexColor("#dcfce7")),  # 22일 09:00 하이라이트
        ("BACKGROUND",    (0,3),(0,3), colors.HexColor("#fee2e2")),  # 26일 09:00 하이라이트
    ]))
    story.append(tbl)
    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 5 — 해지 관리
    # ════════════════════════════════════════════════
    story += chapter_header("5", "해지 관리", "차월 해지 · 중도 해지 · 환불 신청")

    story.append(p("좌측 메뉴의 <b>해지 관리</b>에서 세 가지 유형의 해지를 관리합니다."))
    story.append(sp(8))

    story += section_title("5-1. 차월 해지 신청 처리")
    story.append(p("입주민이 '다음 달부터 수강을 종료'하겠다고 신청하는 가장 일반적인 해지 유형입니다."))
    story.append(sp(4))
    story += info_table([
        ("신청 기간", "매월 22일 09:00 ~ 26일 09:00 (설정에 따라 변경 가능)"),
        ("적용 시점", "당월은 정상 수강 후 다음 달부터 수강 종료 + 수강료 미청구"),
        ("자동 승인",  "기본 설정: 신청 즉시 자동 승인됩니다."),
        ("처리 방법",  "해지 관리 → 차월 해지 탭에서 목록 확인 → 상태 변경 가능"),
    ])
    story += callout("승인된 해지 건은 다음 달 정산 시 청구 명단에서 반드시 제외하세요. 월별 정산 리포트의 엑셀에 자동 반영됩니다.", "warn")

    story += section_title("5-2. 중도 해지 처리")
    story.append(p("당월 수업 진행 중 즉시 해지를 원하는 경우입니다."))
    story += bullet([
        "해지 관리 → <b>중도 해지</b> 탭에서 조회합니다.",
        "출석 횟수를 입력하면 위약금(원금의 10%) + 수강 횟수 차감 후 환불액이 자동 계산됩니다.",
        "월별 정산 리포트의 '중도해지 청구' 시트에 자동 반영됩니다.",
    ])

    story += section_title("5-3. 환불 신청 처리")
    story.append(p("질병·부상 등 불가피한 사유로 환불을 요청한 경우입니다."))
    story += bullet([
        "해지 관리 → <b>환불 신청</b> 탭에서 조회합니다.",
        "단순 변심·취업 등은 환불 대상이 아닙니다 (이용약관 기준).",
        "승인/거부를 직접 처리하고 처리 결과 메모를 남깁니다.",
    ])

    story += section_title("5-4. 해지 직접 등록")
    story.append(p("입주민이 직접 신청하지 못한 경우 관리자가 대신 등록합니다."))
    story += step_table([
        ("해지 관리 이동",   "좌측 메뉴 → 해지 관리 클릭"),
        ("해지신청 등록 클릭","상단의 '+ 해지신청 등록' 버튼 클릭"),
        ("정보 입력",        "신청자 정보 · 해지 유형 · 사유를 입력합니다."),
        ("저장",             "저장 시 즉시 승인 상태로 등록됩니다."),
    ])
    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 6 — 월별 정산 리포트
    # ════════════════════════════════════════════════
    story += chapter_header("6", "월별 정산 리포트", "매월 말 필수 작업 — 엑셀 5시트 다운로드")

    story.append(p("좌측 메뉴의 <b>월별 정산 리포트</b>에서 매월 수강료 정산 엑셀을 다운로드합니다."))
    story.append(sp(8))

    story += section_title("6-1. 정산 조회 방법")
    story += step_table([
        ("월 선택",     "조회할 연도-월을 선택합니다 (예: 2025-06)"),
        ("조회 클릭",   "'조회' 버튼을 누르면 해당 월의 정산 데이터가 화면에 표시됩니다."),
        ("내용 확인",   "당월 수강생 목록, 중도해지 내역, 신규 접수자 등을 화면에서 확인합니다."),
        ("엑셀 다운로드","'엑셀 다운로드 (5시트)' 버튼을 눌러 파일을 저장합니다."),
    ])

    story += section_title("6-2. 엑셀 5시트 구성")
    story += info_table([
        ("📋 시트1 — 정산 내역",  "[당월] 이번 달 수강 중인 전원 목록 + 수강료. 청구서 작성 기준 시트."),
        ("🏠 시트2 — 동호수계",   "[당월] 세대별 월수강료 합산표. 관리사무소 제출용."),
        ("✂️ 시트3 — 중도해지 청구","[당월] 중도해지자의 위약금 + 잔여 환불액 계산표."),
        ("📑 시트4 — 수강신청 내역","[차월] 다음 달 수강 예정자 전체 명단."),
        ("🆕 시트5 — 신규접수자", "[차월] 이번 달 신규로 승인된 입주민 (다음 달부터 수강 시작)."),
    ])
    story += callout("시트1이 이번 달 청구 기준 명단입니다. 해지 완료된 입주민은 자동으로 제외됩니다.", "tip")

    story += section_title("6-3. 수업횟수 설정")
    story.append(p("'수업횟수 설정' 버튼을 클릭하면 이번 달과 다음 달의 수업 횟수를 시간대별로 직접 입력할 수 있습니다."))
    story += bullet([
        "당월 횟수 → 정산 내역(시트1)의 요금 계산에 반영됩니다.",
        "차월 횟수 → 수강신청 내역(시트4)의 예상 요금에 반영됩니다.",
        "입력하지 않으면 기본 단가만 표시됩니다.",
    ])

    story += section_title("6-4. 추가 엑셀 출력")
    story += bullet([
        "<b>관리사무실 제출용</b> — 관리사무소에 제출하는 별도 양식 엑셀",
        "<b>운영비 청구서</b> — 운영비 항목 청구서 엑셀",
        "<b>강사 인건비</b> — 강사별 인건비 정산서 엑셀 (수업횟수 × 단가 자동 계산)",
    ])

    story += section_title("6-5. 중도해지자 일괄 등록")
    story.append(p("여러 명의 중도해지자를 한 번에 등록할 때 사용합니다."))
    story += step_table([
        ("일괄등록 클릭",  "'해지자 일괄등록' 버튼 클릭"),
        ("목록 작성",      "이름, 동호수, 프로그램, 해지사유 등을 입력합니다."),
        ("저장",           "저장하면 중도해지 탭에 일괄 등록됩니다."),
    ])
    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 7 — 프로그램 관리
    # ════════════════════════════════════════════════
    story += chapter_header("7", "프로그램 관리", "수업 종류 추가 · 수정 · 삭제")

    story.append(p("좌측 메뉴 → 콘텐츠 섹션의 <b>프로그램 관리</b>에서 수업(프로그램)을 관리합니다."))
    story.append(sp(8))

    story += section_title("7-1. 프로그램 추가 · 수정 · 삭제")
    story += step_table([
        ("추가",   "'+ 프로그램 추가' 클릭 → 프로그램명, 유형, 운영 요일, 시간대, 월 수강료, 정원 입력 → 저장"),
        ("수정",   "목록에서 수정 아이콘(✏️) 클릭 → 내용 변경 → 저장"),
        ("삭제",   "삭제 아이콘(🗑️) 클릭 → 확인"),
    ])
    story.append(sp(4))
    story += info_table([
        ("프로그램 유형", "그룹 / 듀엣 / 개인 중 선택. 개인·듀엣은 시간대가 자유 선택 방식으로 변경됨."),
        ("운영 요일",    "월·화·수·목·금·토·일 체크박스로 선택"),
        ("시간대",       "그룹 수업은 시간대 체크박스로 선택. 개인/듀엣은 입주민이 직접 입력."),
        ("표시 순서",    "숫자가 낮을수록 입주민 신청 폼에서 위에 표시됩니다."),
    ])

    story += section_title("7-2. 비활성화와 신규접수 차단")
    story.append(p("프로그램을 수정할 때 <b>활성화 체크박스</b>를 해제하면 해당 프로그램의 신규 접수가 차단됩니다."))
    story += bullet([
        "비활성 상태에서도 기존 수강자의 해지 신청은 정상 처리됩니다.",
        "비활성 상태의 프로그램은 입주민 신청 폼에서 '[곧 오픈 예정]'으로 표시됩니다.",
        "'입주민 페이지에 표시' 체크를 해제하면 입주민 페이지에서 완전히 숨길 수 있습니다.",
    ])
    story += callout("신청 기간(22~26일)이 아닐 때는 신청기간 설정에 의해 모든 프로그램이 자동으로 '곧 오픈 예정'으로 표시됩니다. 프로그램 관리에서 별도 조작할 필요가 없습니다.", "note")
    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 8 — 강사 관리 · 커리큘럼
    # ════════════════════════════════════════════════
    story += chapter_header("8", "강사 관리 · 커리큘럼", "강사 정보 등록 및 수업 커리큘럼 관리")

    story += section_title("8-1. 강사 관리")
    story.append(p("좌측 메뉴 → 콘텐츠 섹션의 <b>강사 관리</b>에서 강사 정보를 관리합니다."))
    story += info_table([
        ("강사 추가",   "'+ 강사 추가' 버튼 → 이름, 소개, 사진 URL 입력 → 저장"),
        ("강사 수정",   "수정 아이콘 클릭 → 내용 변경 → 저장"),
        ("강사 삭제",   "삭제 아이콘 클릭 → 확인"),
        ("표시 순서",   "숫자가 낮을수록 입주민 페이지에서 위에 표시됩니다."),
    ])

    story += section_title("8-2. 커리큘럼 관리")
    story.append(p("좌측 메뉴 → 콘텐츠 섹션의 <b>커리큘럼</b>에서 수업 커리큘럼 내용을 관리합니다."))
    story += bullet([
        "프로그램별로 커리큘럼 내용을 작성하여 입주민 페이지에 안내할 수 있습니다.",
        "추가 / 수정 / 삭제 모두 다른 메뉴와 동일한 방식으로 사용합니다.",
    ])
    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 9 — 공지사항 관리
    # ════════════════════════════════════════════════
    story += chapter_header("9", "공지사항 관리", "입주민 페이지 공지 게시")

    story += section_title("9-1. 공지 작성 · 수정 · 삭제")
    story += step_table([
        ("새 공지 클릭",   "'+ 새 공지' 버튼 클릭"),
        ("내용 작성",      "제목, 본문 입력. 이미지 첨부 가능 (JPG/PNG/GIF, 5MB 이하)."),
        ("저장",           "저장하면 즉시 입주민 페이지에 표시됩니다."),
        ("수정/삭제",      "목록에서 수정(✏️) 또는 삭제(🗑️) 아이콘 클릭"),
    ])
    story += callout("이미지가 포함된 공지는 입주민 페이지에서 이미지를 클릭하면 전체화면으로 확대됩니다.", "tip")

    story += section_title("9-2. 상단 고정 (핀 고정)")
    story += bullet([
        "공지 작성 시 '상단 고정' 체크박스를 선택하면 📌 배지가 붙고 목록 최상단에 고정됩니다.",
        "중요한 공지(접수 안내, 휴관 안내 등)는 고정 설정을 권장합니다.",
        "비활성 처리 시 입주민 페이지에서 숨겨집니다 (삭제하지 않고 숨김 가능).",
    ])
    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 10 — 문의 관리
    # ════════════════════════════════════════════════
    story += chapter_header("10", "문의 관리", "입주민 질문 답변 처리")

    story += section_title("10-1. 문의 조회")
    story.append(p("좌측 메뉴의 <b>문의 관리</b>에서 입주민이 신청 페이지에서 보낸 문의를 조회합니다."))
    story += info_table([
        ("전체",   "모든 문의 목록"),
        ("대기",   "아직 답변하지 않은 문의 (⚠️ 우선 처리 권고)"),
        ("완료",   "답변이 완료된 문의"),
        ("공개",   "입주민 페이지에서 다른 입주민도 볼 수 있도록 공개된 문의"),
    ])

    story += section_title("10-2. 답변 작성")
    story += step_table([
        ("문의 클릭",    "목록에서 문의 항목을 클릭합니다."),
        ("답변 입력",    "하단 답변 입력창에 내용을 작성합니다."),
        ("공개 여부 설정","다른 입주민도 볼 수 있게 공개할지 선택합니다."),
        ("저장",         "저장하면 상태가 '완료'로 변경되고 입주민에게 알림이 발송됩니다."),
    ])
    story += callout("미답변 문의는 대시보드에 숫자로 표시됩니다. 가능한 24시간 이내에 답변하세요.", "warn")
    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 11 — 내 단지 설정
    # ════════════════════════════════════════════════
    story += chapter_header("11", "내 단지 설정", "단지 기본 정보 · QR코드")

    story += section_title("11-1. 단지 기본 정보 수정")
    story += info_table([
        ("단지명",       "관리자 화면에 표시되는 단지명을 변경합니다."),
        ("입주민 페이지 주소", "입주민이 신청할 때 접속하는 URL입니다. QR코드와 동일."),
        ("비밀번호 변경", "현재 비밀번호 입력 → 새 비밀번호 입력 → 확인"),
    ])
    story += callout("비밀번호를 잊어버리면 시스템 운영사에 문의하세요.", "warn")

    story += section_title("11-2. QR코드 생성")
    story += bullet([
        "단지 입주민 페이지 주소로 QR코드가 자동 생성됩니다.",
        "QR코드 이미지를 다운로드하여 공용 게시판, 안내문 등에 인쇄하여 부착합니다.",
        "입주민은 QR코드를 스캔하면 바로 신청 페이지로 이동합니다.",
    ])
    story.append(PageBreak())

    # ════════════════════════════════════════════════
    #  PART 12 — 월별 운영 체크리스트
    # ════════════════════════════════════════════════
    story += chapter_header("12", "월별 운영 체크리스트", "매월 반복 업무 — 이것만 기억하세요")

    story.append(p("아래 체크리스트를 매월 따르면 놓치는 업무 없이 운영할 수 있습니다."))
    story.append(sp(10))

    def checklist_table(title, color, items):
        hdr = [Paragraph(f"<b>{title}</b>", S("x", fontName="NanumBold", fontSize=10,
                                               textColor=C_WHITE, leading=15))]
        hdr_tbl = Table([hdr], colWidths=[PW - 2*1.5*cm])
        hdr_tbl.setStyle(TableStyle([
            ("BACKGROUND",   (0,0),(-1,-1), color),
            ("LEFTPADDING",  (0,0),(-1,-1), 14),
            ("RIGHTPADDING", (0,0),(-1,-1), 14),
            ("TOPPADDING",   (0,0),(-1,-1), 8),
            ("BOTTOMPADDING",(0,0),(-1,-1), 8),
        ]))
        rows = [[Paragraph("□", S("x2", fontName="NanumBold", fontSize=11, textColor=color, alignment=TA_CENTER)),
                 Paragraph(item, STYLES["body"])] for item in items]
        body_tbl = Table(rows, colWidths=[22, PW - 2*1.5*cm - 22 - 4])
        body_tbl.setStyle(TableStyle([
            ("FONTNAME",      (0,0),(-1,-1), "Nanum"),
            ("FONTSIZE",      (0,0),(-1,-1), 9.5),
            ("LEADING",       (0,0),(-1,-1), 16),
            ("VALIGN",        (0,0),(-1,-1), "TOP"),
            ("TOPPADDING",    (0,0),(-1,-1), 5),
            ("BOTTOMPADDING", (0,0),(-1,-1), 5),
            ("LEFTPADDING",   (0,0),(-1,-1), 8),
            ("RIGHTPADDING",  (0,0),(-1,-1), 8),
            ("GRID",          (0,0),(-1,-1), 0.3, C_GRAY_LIGHT),
            ("ROWBACKGROUNDS",(0,0),(-1,-1), [C_WHITE, C_BG_LIGHT, C_WHITE, C_BG_LIGHT,
                                              C_WHITE, C_BG_LIGHT, C_WHITE]),
        ]))
        return [hdr_tbl, body_tbl, sp(14)]

    story += checklist_table(
        "📅 접수 오픈 전 — 매월 21일",
        C_BLUE,
        [
            "신청기간 설정 확인: 자동(22~26일) 또는 직접 설정 날짜 확인",
            "프로그램 목록 확인: 삭제·비활성화된 수업 없는지 점검",
            "공지사항 등록: '다음 달 수강 신청 안내' 공지 게시",
            "대기 시스템 ON/OFF 설정 확인",
            "이번 달 해지자로 인해 빈 자리가 생긴 경우 정원 업데이트",
        ]
    )

    story += checklist_table(
        "📋 접수 기간 중 — 매월 22일~26일",
        C_GREEN,
        [
            "대시보드 매일 확인: 신청 대기 건수 → 즉시 처리",
            "자동 승인 OFF 설정 시: 신청 건 수동 승인 처리",
            "대기 신청자 발생 시: 대시보드 대기 카드 확인 후 순번 관리",
            "미답변 문의 처리: 24시간 이내 답변",
            "26일 이전 해지 신청 접수 여부 확인",
        ]
    )

    story += checklist_table(
        "🔒 접수 마감 후 — 매월 27일 이후",
        C_ORANGE,
        [
            "해지 관리 → 차월 해지 탭: 해지 신청 목록 최종 확인 및 처리",
            "신청 관리 → 프로그램 현황: 다음 달 수강 인원 확정",
            "신규 접수자 명단 확인 (시트5 미리 확인)",
            "입주민에게 다음 달 수강 확정 안내 공지 게시 (선택)",
        ]
    )

    story += checklist_table(
        "💰 월말 정산 — 매월 말일",
        C_SECONDARY,
        [
            "월별 정산 리포트 → 해당 월 선택 → 조회",
            "수업횟수 설정: 타임별 실제 수업 횟수 입력",
            "중도해지자 출석 횟수 확인 및 입력",
            "엑셀 다운로드 (5시트) → 저장",
            "시트1(정산 내역)으로 수강료 청구서 작성",
            "시트2(동호수계)를 관리사무소 제출",
            "강사 인건비 엑셀 출력 → 강사 지급",
            "다음 달 운영 일정 신청기간 설정 확인",
        ]
    )

    story.append(sp(10))

    # 부록: 자주 묻는 질문
    story.append(HRFlowable(width="100%", thickness=1.5, color=C_GRAY_LIGHT, spaceAfter=10))
    story.append(p("<b>자주 묻는 질문 (FAQ)</b>", "section", fontSize=13, textColor=C_PRIMARY))
    story.append(HRFlowable(width="100%", thickness=1, color=C_GRAY_LIGHT, spaceAfter=8))

    faqs = [
        ("입주민이 신청을 했는데 '곧 오픈 예정'이라고 나온다고 합니다.",
         "신청기간 설정을 확인하세요. '자동' 설정이면 22~26일에만 접수가 열립니다. 기간 외에는 정상 동작입니다. 지금 당장 열어야 하면 '상시 개방'으로 변경 후 저장하세요."),
        ("신청이 들어왔는데 대시보드에 숫자가 안 올라가요.",
         "자동 승인이 ON이면 신청 즉시 '승인' 상태로 처리됩니다. 승인 완료 카드 숫자를 확인해 보세요."),
        ("정원이 꽉 찼는데 대기자가 없어요.",
         "신청 종류 설정에서 '대기 시스템'이 ON인지 확인하세요. OFF이면 정원 마감 시 신청 자체가 차단됩니다."),
        ("해지 신청이 들어왔는데 정산에서 빠지지 않아요.",
         "해지 관리에서 해당 건을 '승인' 상태로 처리해야 합니다. 처리 후 월별 정산 리포트를 다시 조회하면 반영됩니다."),
        ("비밀번호를 잊어버렸어요.",
         "내 단지 설정 → 비밀번호 변경 화면에서 변경 가능합니다. 현재 비밀번호도 모른다면 시스템 운영사에 문의하세요."),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            p(f"<b>Q. {q}</b>", "body_bold"),
            p(f"A. {a}", "body_indent"),
            sp(6),
        ]))

    return story


# ── 페이지 번호 푸터 ──────────────────────────────────
def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Nanum", 8)
    canvas.setFillColor(C_GRAY_MID)
    canvas.drawCentredString(PW / 2, 18 * mm,
                             f"필라테스 무인 접수 시스템 — 단지 관리자 사용설명서   |   {doc.page}")
    canvas.setStrokeColor(C_GRAY_LIGHT)
    canvas.setLineWidth(0.5)
    canvas.line(1.5 * cm, 22 * mm, PW - 1.5 * cm, 22 * mm)
    canvas.restoreState()


# ── PDF 생성 ─────────────────────────────────────────
OUT = "/home/user/webapp/필라테스_관리자_사용설명서.pdf"
doc = SimpleDocTemplate(
    OUT,
    pagesize=A4,
    leftMargin=1.5*cm, rightMargin=1.5*cm,
    topMargin=1.5*cm,  bottomMargin=2.5*cm,
    title="필라테스 관리자 사용설명서",
    author="필라테스 무인 접수 시스템",
)

story = build_content()
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(f"✅ PDF 생성 완료: {OUT}")
print(f"   파일 크기: {os.path.getsize(OUT):,} bytes")
