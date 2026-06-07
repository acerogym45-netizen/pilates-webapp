# C-1 호텔 전용 랜딩 페이지

**단계**: Phase C — C-1  
**접근 URL**: `/hotel/` (정적 파일 서빙, B-5까지의 API와 별개)  
**작성일**: 2026-06-07

---

## 생성 파일 (4개)

| 파일                              | 역할                                                   |
|-----------------------------------|--------------------------------------------------------|
| `public/hotel/index.html`         | 랜딩 페이지 HTML. 3개 CTA 카드 + 임직원 링크          |
| `public/hotel/css/style.css`      | 호텔 전용 스타일. 라마다 네이비·골드 브랜드 톤         |
| `public/hotel/js/landing.js`      | URL 토큰 저장 + 회원 이름 개인화. 자동 리다이렉트 없음 |
| `docs/ops/C1-HOTEL-LANDING.md`    | 이 문서                                                |

> **격리 원칙**: `public/hotel/` 디렉토리는 기존 `public/index.html`, `public/css/`, `public/js/`와 완전히 독립됩니다. 기존 파일은 이 단계에서 **전혀 수정되지 않았습니다.**

---

## 페이지 구조 (텍스트 와이어프레임)

```
┌─────────────────────────────────────────────┐
│  HEADER                                     │
│  ┌──────────────────┐   환영합니다           │
│  │ 🏋️ 아세로짐     │   (토큰 있으면         │
│  │    라마다 대전점 │    "○○님, 환영합니다") │
│  └──────────────────┘                       │
│                                             │
│  투숙 중 이용 가능한 피트니스 서비스를      │
│  아래에서 바로 신청하세요.                   │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ 💎  무료 클래스 신청하기           ›  │  │  ← CTA 1
│  │     매주 월·수 오전 10시              │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ 💪  리프레시 PT 예약하기           ›  │  │  ← CTA 2
│  │     ₩40,000 / 45분 · 출장 피로 케어   │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ 🪪  회원 마이페이지                ›  │  │  ← CTA 3
│  │     PT 잔여 · 예약 변경               │  │    (회원 토큰 있으면 "○○님의 PT..." 표시)
│  └───────────────────────────────────────┘  │
│                                             │
│  FOOTER                                     │
│           라마다 임직원이신가요?             │  ← 작은 텍스트 링크 (CTA 아님)
└─────────────────────────────────────────────┘
```

---

## 각 링크 목적지

| 요소            | href                  | 생성 단계  |
|-----------------|-----------------------|------------|
| 무료 클래스 CTA | `./quick-class.html`  | C-2에서 생성 예정 |
| 리프레시 PT CTA | `./refresh-pt.html`   | C-3에서 생성 예정 |
| 마이페이지 CTA  | `./member.html`       | C-4에서 생성 예정 |
| 임직원 링크     | `./staff-login.html`  | C-5에서 생성 예정 |

---

## landing.js 동작 흐름

```
페이지 로드
   │
   ├─ URL에 ?t=토큰 있음?
   │    └─ YES → localStorage['hotel_member_token'] = token
   │             URL에서 ?t= 제거 (replaceState, 히스토리 오염 없음)
   │
   ├─ localStorage에 token 있음?
   │    └─ NO  → 종료. 모든 CTA 기본 표시. 강제 로그인 없음.
   │
   │    └─ YES → GET /api/hotel/members/me?token=...
   │               │
   │               ├─ 성공 (200) → json.member.name 만 추출
   │               │    └─ 헤더: "○○님, 환영합니다"
   │               │       마이페이지 CTA 설명: "○○님의 PT 잔여 · 예약 변경"
   │               │       마이페이지 href에 ?t=token 추가
   │               │
   │               ├─ 401 (만료/무효) → localStorage 토큰 삭제 → 기본 표시
   │               └─ 기타 오류    → silent fail → 기본 표시
   │
   └─ 페이지 준비 완료 (자동 리다이렉트 없음)
```

**핵심 보호 규칙**:
- `fetchMemberName()`은 `json.member.name` 필드만 읽고 나머지(`pt_status`, `benefits` 등) 무시
- 어떤 상황에서도 `window.location.href = ...` 자동 리다이렉트 없음
- 토큰 없는 투숙객도 3개 CTA 전부 이용 가능

---

## 스타일 설계

### 브랜드 컬러 (CSS 변수)

| 변수                  | 값          | 용도                    |
|-----------------------|-------------|-------------------------|
| `--color-navy`        | `#1a2744`   | 전체 배경               |
| `--color-navy-d`      | `#111b33`   | 더 진한 네이비          |
| `--color-gold`        | `#c9a84c`   | 포인트 컬러             |
| `--color-gold-light`  | `#e2c97e`   | 밝은 골드 (무료클래스 타이틀) |
| `--color-text-muted`  | `#a8b4c8`   | 보조 텍스트             |
| `--cta-min-height`    | `64px`      | 최소 터치 영역          |

### 반응형 브레이크포인트

| 범위          | 동작                        |
|---------------|-----------------------------|
| `< 520px`     | 기본 (모바일 우선)          |
| `≥ 520px`     | 여백·폰트 소폭 확대         |
| `≥ 768px`     | 헤더·카드 패딩 확대         |

---

## 설계 결정 사유

### 왜 강제 인증을 하지 않는가

1. **라마다호텔 투숙객 특성**: 투숙객의 목표는 "빠르게 피트니스 서비스를 이용하는 것"입니다. 진입 즉시 로그인·회원가입 팝업을 마주하면 대다수는 포기합니다.

2. **비회원도 모든 서비스 이용 가능**: 무료 클래스와 리프레시 PT는 회원 토큰 없이도 이름·전화번호만으로 신청할 수 있습니다 (B-2, B-3 설계). 첫 화면에서 인증을 강제할 이유가 없습니다.

3. **토큰은 편의 기능**: QR 코드로 발급된 토큰(`?t=...`)은 개인화 환영 문구와 마이페이지 빠른 접근을 위한 편의 수단입니다. 없어도 서비스 이용에 지장이 없어야 합니다.

4. **신뢰 형성 우선**: 로그인 강제 없이 정보를 먼저 보여주는 것이, 장기적으로 고객이 자발적으로 회원 등록을 하게 만드는 올바른 순서입니다.

5. **임직원 분리**: 임직원은 별도 플로우가 필요한 소수입니다. 하단 작은 링크로 처리해 일반 투숙객의 화면을 오염시키지 않습니다.

---

## 호텔 모드 활성화 후 배포 절차

> 이 페이지(`public/hotel/`)는 정적 파일로 즉시 서빙됩니다.  
> API(`/api/hotel/*`) 활성화는 별도로 `ENABLE_HOTEL_MODE=true` 설정이 필요합니다.

### 단계 1 — Vercel 환경변수 설정

```
Vercel 대시보드 → Settings → Environment Variables

ENABLE_HOTEL_MODE        = true   ← 필수 (라우트 마운트)
ENABLE_HOTEL_QUICK_CLASS = true   ← 무료 클래스 CTA
ENABLE_HOTEL_REFRESH_PT  = true   ← 리프레시 PT CTA
ENABLE_HOTEL_MEMBER_PAGE = true   ← 마이페이지 + 토큰 개인화
```

### 단계 2 — 재배포

```bash
vercel --prod
# 또는 Vercel 대시보드 → Redeploy
```

### 단계 3 — 접근 URL 확인

```
https://your-domain.vercel.app/hotel/          ← 랜딩 페이지
https://your-domain.vercel.app/hotel/quick-class.html  ← C-2 생성 예정
https://your-domain.vercel.app/hotel/refresh-pt.html   ← C-3 생성 예정
https://your-domain.vercel.app/hotel/member.html       ← C-4 생성 예정
```

### 긴급 OFF 방법

```
Vercel 대시보드 → Settings → Environment Variables
→ ENABLE_HOTEL_MODE 값을 false 또는 삭제 → Redeploy
```

---

## 관련 파일

| 파일                                    | 역할                                     |
|-----------------------------------------|------------------------------------------|
| `public/hotel/index.html`               | 랜딩 페이지 HTML (이 문서 대상)          |
| `public/hotel/css/style.css`            | 호텔 전용 스타일시트                     |
| `public/hotel/js/landing.js`            | 토큰 저장 + 개인화 스크립트              |
| `server/config/feature-flags.js`        | hotelMemberPage Flag (API 활성화)        |
| `server/routes/hotel/members.js`        | GET /api/hotel/members/me (이름 조회)    |
| `docs/ops/B5-SERVER-INDEX-INTEGRATION.md` | API 라우터 통합 절차                   |
| `docs/ops/A4-FEATURE-FLAGS.md`          | Flag 전체 운영 가이드                    |
