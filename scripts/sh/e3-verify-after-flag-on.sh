#!/usr/bin/env bash
# =============================================================================
# scripts/sh/e3-verify-after-flag-on.sh
# 호텔 모드 Feature Flag 활성화 후 단계별 검증 스크립트
#
# 사용법:
#   BASE_URL=https://your-app.vercel.app bash e3-verify-after-flag-on.sh <phase>
#
#   예시:
#     BASE_URL=https://my-app.vercel.app bash e3-verify-after-flag-on.sh 1
#     BASE_URL=https://my-app.vercel.app bash e3-verify-after-flag-on.sh 2
#     BASE_URL=https://my-app.vercel.app bash e3-verify-after-flag-on.sh all
#
# 인자:
#   phase   검증할 Phase 번호 (1~5) 또는 "all" (Phase 1~5 전체 순차 실행)
#
# 환경변수 (필수):
#   BASE_URL    앱 URL (trailing slash 없이)
#               예: https://my-project.vercel.app
#
# 환경변수 (선택):
#   COMPLEX_CODE        호텔 단지 코드 (기본값: ht-lamada)
#   APT_CODE_1          아파트 단지 코드 1 (기본값: apt-cjxi)
#   APT_CODE_2          아파트 단지 코드 2 (기본값: apt-sclass)
#   CURL_TIMEOUT        curl 타임아웃(초) (기본값: 10)
#   PHASE_WAIT_SEC      Phase 간 대기 시간(초) (기본값: 3, all 모드 전용)
#
# 출력:
#   각 검증 항목 PASS/FAIL 및 최종 결과
#   실패 시 exit 1 + 즉시 OFF 절차 안내
#
# 주의:
#   이 스크립트는 read-only 검증만 수행한다 (GET/POST 검증 요청만).
#   실제 예약/등록 데이터를 생성하지 않는다.
#   실제 Vercel 환경변수를 변경하지 않는다.
#
# 단계: E-3 / 작성일: 2026-06-07
# =============================================================================

set -euo pipefail

# ── 색상 코드 (터미널 지원 여부 확인) ────────────────────────────────────────
if [ -t 1 ] && command -v tput > /dev/null 2>&1; then
    RED=$(tput setaf 1)
    GREEN=$(tput setaf 2)
    YELLOW=$(tput setaf 3)
    CYAN=$(tput setaf 6)
    BOLD=$(tput bold)
    RESET=$(tput sgr0)
else
    RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

# ── 설정값 ───────────────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-}"
COMPLEX_CODE="${COMPLEX_CODE:-ht-lamada}"
APT_CODE_1="${APT_CODE_1:-apt-cjxi}"
APT_CODE_2="${APT_CODE_2:-apt-sclass}"
CURL_TIMEOUT="${CURL_TIMEOUT:-10}"
PHASE_WAIT_SEC="${PHASE_WAIT_SEC:-3}"

PASS_COUNT=0
FAIL_COUNT=0
FAIL_MESSAGES=()

# ── 사용법 출력 ───────────────────────────────────────────────────────────────
usage() {
    echo "${BOLD}사용법:${RESET}"
    echo "  BASE_URL=https://your-app.vercel.app bash $0 <phase>"
    echo ""
    echo "${BOLD}phase 인자:${RESET}"
    echo "  1     Phase 1: 마스터 스위치 (ENABLE_HOTEL_MODE) 검증"
    echo "  2     Phase 2: 무료 클래스 (ENABLE_HOTEL_QUICK_CLASS) 검증"
    echo "  3     Phase 3: 리프레시 PT (ENABLE_HOTEL_REFRESH_PT) 검증"
    echo "  4     Phase 4: 마이페이지 (ENABLE_HOTEL_MEMBER_PAGE) 검증"
    echo "  5     Phase 5: 임직원 인증 (ENABLE_HOTEL_STAFF_AUTH) 검증"
    echo "  all   Phase 1~5 전체 순차 실행"
    echo ""
    echo "${BOLD}필수 환경변수:${RESET}"
    echo "  BASE_URL    앱 URL (예: https://my-app.vercel.app)"
    exit 1
}

# ── 유틸: 헤더 출력 ───────────────────────────────────────────────────────────
print_header() {
    echo ""
    echo "${BOLD}${CYAN}════════════════════════════════════════════════════════${RESET}"
    echo "${BOLD}${CYAN}  $1${RESET}"
    echo "${BOLD}${CYAN}════════════════════════════════════════════════════════${RESET}"
}

# ── 유틸: 섹션 헤더 ───────────────────────────────────────────────────────────
print_section() {
    echo ""
    echo "${BOLD}── $1 ──${RESET}"
}

# ── 유틸: curl HTTP 상태코드 반환 ────────────────────────────────────────────
http_status() {
    local method="$1"
    local url="$2"
    local body="${3:-}"
    local status

    if [ -n "$body" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" \
            -X "$method" "$url" \
            -H "Content-Type: application/json" \
            --max-time "$CURL_TIMEOUT" \
            -d "$body" 2>/dev/null || echo "000")
    else
        status=$(curl -s -o /dev/null -w "%{http_code}" \
            -X "$method" "$url" \
            --max-time "$CURL_TIMEOUT" \
            2>/dev/null || echo "000")
    fi
    echo "$status"
}

# ── 유틸: 검증 항목 체크 ─────────────────────────────────────────────────────
check() {
    local desc="$1"
    local actual="$2"
    local expected="$3"

    if [ "$actual" = "$expected" ]; then
        echo "  ${GREEN}✅ PASS${RESET} $desc (HTTP $actual)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ${RED}❌ FAIL${RESET} $desc — 기대: HTTP $expected, 실제: HTTP $actual"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAIL_MESSAGES+=("FAIL: $desc — 기대 $expected, 실제 $actual")
    fi
}

# ── 유틸: 범위 검증 (expected 를 "ok" 문자열로 처리) ────────────────────────
check_any() {
    local desc="$1"
    local actual="$2"
    shift 2
    local expected_list=("$@")
    local matched=false

    for exp in "${expected_list[@]}"; do
        if [ "$actual" = "$exp" ]; then
            matched=true
            break
        fi
    done

    if $matched; then
        echo "  ${GREEN}✅ PASS${RESET} $desc (HTTP $actual)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        local joined
        joined=$(printf "/%s" "${expected_list[@]}")
        echo "  ${RED}❌ FAIL${RESET} $desc — 기대: HTTP ${joined#/}, 실제: HTTP $actual"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAIL_MESSAGES+=("FAIL: $desc — 기대 ${joined#/}, 실제 $actual")
    fi
}

# ── 공통: 서버 헬스체크 ───────────────────────────────────────────────────────
verify_health() {
    print_section "서버 헬스체크"
    local s
    s=$(http_status "GET" "$BASE_URL/api/health")
    check "/api/health 정상 응답" "$s" "200"
}

# ── 공통: 기존 아파트 단지 무영향 검증 ────────────────────────────────────────
verify_apt_isolation() {
    print_section "기존 아파트 단지 무영향 검증 (필수)"
    local s

    s=$(http_status "GET" "$BASE_URL/api/complexes")
    check "/api/complexes 목록 조회 정상" "$s" "200"

    s=$(http_status "GET" "$BASE_URL/api/complexes/$APT_CODE_1")
    check_any "/api/complexes/$APT_CODE_1 정상 응답" "$s" "200" "404"
    # 404는 code 기반 조회가 별도 엔드포인트일 경우 허용 — 200이 기대값

    s=$(http_status "GET" "$BASE_URL/api/complexes/$APT_CODE_2")
    check_any "/api/complexes/$APT_CODE_2 정상 응답" "$s" "200" "404"

    # 핵심: 아파트 단지 신청 API 오류 없음
    s=$(http_status "GET" "$BASE_URL/api/applications?limit=1")
    check_any "/api/applications 조회 정상 (500 아님)" "$s" "200" "400" "401"
}

# ── Phase 1: 마스터 스위치 검증 ───────────────────────────────────────────────
verify_phase1() {
    print_header "Phase 1 검증: ENABLE_HOTEL_MODE=true"
    echo "  기대: /api/hotel/* 404 아님 (마운트 확인) + 하위 Flag OFF → 403"
    echo ""

    verify_health
    local s

    print_section "호텔 라우트 마운트 확인 (404 vs 403)"

    # quick-class: hotelMode 마운트됨 + hotelQuickClass OFF → 403
    s=$(http_status "POST" "$BASE_URL/api/hotel/quick-class/apply" '{}')
    check_any "/api/hotel/quick-class/apply — 마운트 확인 (403 또는 400)" "$s" "403" "400"

    # refresh-pt: hotelMode 마운트됨 + hotelRefreshPt OFF → 403
    s=$(http_status "GET" "$BASE_URL/api/hotel/refresh-pt/instructors")
    check "/api/hotel/refresh-pt/instructors — Flag OFF → 403" "$s" "403"

    # members: hotelMode 마운트됨 + hotelMemberPage OFF → 403
    s=$(http_status "GET" "$BASE_URL/api/hotel/members/me")
    check "/api/hotel/members/me — Flag OFF → 403" "$s" "403"

    # verify-guest: hotelMode 직접 사용 → 400 (요청 도달, 입력값 오류)
    s=$(http_status "POST" "$BASE_URL/api/hotel/auth/verify-guest" \
        '{"room_number":"","name":""}')
    check_any "/api/hotel/auth/verify-guest — 마스터 Flag 활성 확인 (400/200)" "$s" "400" "200"

    # staff: hotelMode 마운트됨 + hotelStaffAuth OFF → 403
    s=$(http_status "POST" "$BASE_URL/api/hotel/auth/verify-staff" '{}')
    check "/api/hotel/auth/verify-staff — Flag OFF → 403" "$s" "403"

    verify_apt_isolation
}

# ── Phase 2: 무료 클래스 검증 ─────────────────────────────────────────────────
verify_phase2() {
    print_header "Phase 2 검증: ENABLE_HOTEL_QUICK_CLASS=true"
    echo "  기대: /api/hotel/quick-class/* 200/400 응답 (Flag 활성화 확인)"
    echo ""

    verify_health
    local s

    print_section "quick-class 엔드포인트 활성화 확인"

    # 잘못된 입력 → 400 (Flag 활성 + 입력 검증 동작)
    s=$(http_status "POST" "$BASE_URL/api/hotel/quick-class/apply" '{}')
    check_any "/api/hotel/quick-class/apply — Flag 활성 (400 또는 401)" "$s" "400" "401"

    # availability (program_id 누락) → 400
    s=$(http_status "GET" "$BASE_URL/api/hotel/quick-class/availability")
    check_any "/api/hotel/quick-class/availability — 파라미터 누락 400" "$s" "400" "200"

    print_section "다른 하위 Flag 여전히 OFF 확인"

    # refresh-pt: Phase 3 미활성 → 403 유지
    s=$(http_status "GET" "$BASE_URL/api/hotel/refresh-pt/instructors")
    check "/api/hotel/refresh-pt/instructors — Phase 3 미활성 403 유지" "$s" "403"

    verify_apt_isolation
}

# ── Phase 3: 리프레시 PT 검증 ─────────────────────────────────────────────────
verify_phase3() {
    print_header "Phase 3 검증: ENABLE_HOTEL_REFRESH_PT=true"
    echo "  기대: /api/hotel/refresh-pt/* 200 응답 (트레이너 3명 목록)"
    echo ""

    verify_health
    local s

    print_section "refresh-pt 엔드포인트 활성화 확인"

    # 트레이너 목록 조회 (complex_id 없이 → 400, 있으면 200)
    s=$(http_status "GET" "$BASE_URL/api/hotel/refresh-pt/instructors")
    check_any "/api/hotel/refresh-pt/instructors — Flag 활성 (200 또는 400)" "$s" "200" "400"

    # 슬롯 조회 (파라미터 누락 → 400)
    s=$(http_status "GET" "$BASE_URL/api/hotel/refresh-pt/slots")
    check_any "/api/hotel/refresh-pt/slots — 파라미터 누락 400" "$s" "400" "200"

    # 예약 요청 (빈 body → 400/401)
    s=$(http_status "POST" "$BASE_URL/api/hotel/refresh-pt/book" '{}')
    check_any "/api/hotel/refresh-pt/book — Flag 활성 (400 또는 401)" "$s" "400" "401"

    print_section "다른 하위 Flag 여전히 OFF 확인"

    # members: Phase 4 미활성 → 403
    s=$(http_status "GET" "$BASE_URL/api/hotel/members/me")
    check "/api/hotel/members/me — Phase 4 미활성 403 유지" "$s" "403"

    verify_apt_isolation
}

# ── Phase 4: 마이페이지 검증 ──────────────────────────────────────────────────
verify_phase4() {
    print_header "Phase 4 검증: ENABLE_HOTEL_MEMBER_PAGE=true"
    echo "  기대: /api/hotel/members/*, /api/hotel/workout-reports/* 401 응답"
    echo "        (Flag 활성 = 인증 요구, 403 아님)"
    echo ""

    verify_health
    local s

    print_section "members / workout-reports 활성화 확인"

    # 비인증 요청 → 401 (Flag 활성 증거: 403이면 Flag OFF)
    s=$(http_status "GET" "$BASE_URL/api/hotel/members/me")
    check_any "/api/hotel/members/me — Flag 활성 (401 또는 400)" "$s" "401" "400"

    # 운동 리포트 목록 (비인증)
    s=$(http_status "GET" "$BASE_URL/api/hotel/workout-reports")
    check_any "/api/hotel/workout-reports — Flag 활성 (401 또는 400)" "$s" "401" "400"

    # auth verify-member-token (빈 body → 400/401)
    s=$(http_status "POST" "$BASE_URL/api/hotel/auth/issue-member-token" '{}')
    check_any "/api/hotel/auth/issue-member-token — Flag 활성 (400 또는 401)" "$s" "400" "401"

    print_section "다른 하위 Flag 여전히 OFF 확인"

    # verify-staff: Phase 5 미활성 → 403
    s=$(http_status "POST" "$BASE_URL/api/hotel/auth/verify-staff" '{}')
    check "/api/hotel/auth/verify-staff — Phase 5 미활성 403 유지" "$s" "403"

    verify_apt_isolation
}

# ── Phase 5: 임직원 인증 검증 ─────────────────────────────────────────────────
verify_phase5() {
    print_header "Phase 5 검증: ENABLE_HOTEL_STAFF_AUTH=true"
    echo "  기대: /api/hotel/auth/verify-staff 400 응답 (Flag 활성 + 입력 검증)"
    echo ""

    verify_health
    local s

    print_section "verify-staff 활성화 확인"

    # 빈 요청 → 400 (Flag 활성 증거: 403이면 Flag OFF)
    s=$(http_status "POST" "$BASE_URL/api/hotel/auth/verify-staff" '{}')
    check_any "/api/hotel/auth/verify-staff 빈 요청 — Flag 활성 (400 또는 401)" "$s" "400" "401"

    # phone_last4 5자리 이상 → 400 (입력 검증)
    s=$(http_status "POST" "$BASE_URL/api/hotel/auth/verify-staff" \
        '{"phone_last4":"123456"}')
    check "/api/hotel/auth/verify-staff phone_last4 5자리 이상 → 400 입력 검증" "$s" "400"

    # phone_last4 정상 형식 (4자리) → 400 또는 404 (직원 없음)
    s=$(http_status "POST" "$BASE_URL/api/hotel/auth/verify-staff" \
        '{"phone_last4":"0000"}')
    check_any "/api/hotel/auth/verify-staff phone_last4 4자리 → 400/401/404" "$s" "400" "401" "404"

    print_section "staff-roster 활성화 확인"

    s=$(http_status "GET" "$BASE_URL/api/hotel/staff")
    check_any "/api/hotel/staff 목록 — Flag 활성 (200 또는 401)" "$s" "200" "401" "400"

    verify_apt_isolation

    print_section "전체 호텔 기능 통합 상태 최종 확인"
    echo "  Phase 5까지 모두 완료 = 호텔 모드 전체 활성화 상태"

    # quick-class
    s=$(http_status "GET" "$BASE_URL/api/hotel/quick-class/availability")
    check_any "quick-class 활성 유지 (200 또는 400)" "$s" "200" "400"

    # refresh-pt
    s=$(http_status "GET" "$BASE_URL/api/hotel/refresh-pt/instructors")
    check_any "refresh-pt 활성 유지 (200 또는 400)" "$s" "200" "400"

    # members
    s=$(http_status "GET" "$BASE_URL/api/hotel/members/me")
    check_any "members 활성 유지 (401 또는 400)" "$s" "401" "400"
}

# ── OFF 확인: 즉시 OFF 후 호출하는 검증 (내부 유틸) ─────────────────────────
verify_off() {
    print_header "즉시 OFF 확인: 호텔 라우트 전체 차단 검증"
    echo "  기대: /api/hotel/* 전체 404 반환"
    echo ""

    verify_health
    local s

    print_section "호텔 라우트 차단 확인 (전체 404여야 함)"

    s=$(http_status "GET" "$BASE_URL/api/hotel/quick-class/availability")
    check "/api/hotel/quick-class/availability — OFF 후 404" "$s" "404"

    s=$(http_status "GET" "$BASE_URL/api/hotel/refresh-pt/instructors")
    check "/api/hotel/refresh-pt/instructors — OFF 후 404" "$s" "404"

    s=$(http_status "POST" "$BASE_URL/api/hotel/auth/verify-staff" '{}')
    check "/api/hotel/auth/verify-staff — OFF 후 404" "$s" "404"

    s=$(http_status "GET" "$BASE_URL/api/hotel/members/me")
    check "/api/hotel/members/me — OFF 후 404" "$s" "404"

    verify_apt_isolation
}

# ── 최종 결과 출력 ────────────────────────────────────────────────────────────
print_result() {
    local phase_label="$1"
    echo ""
    echo "${BOLD}${CYAN}════════════════════════════════════════════════════════${RESET}"
    echo "${BOLD}  검증 결과: Phase ${phase_label}${RESET}"
    echo "${BOLD}${CYAN}════════════════════════════════════════════════════════${RESET}"
    echo "  PASS: ${GREEN}${PASS_COUNT}건${RESET}"
    echo "  FAIL: ${RED}${FAIL_COUNT}건${RESET}"

    if [ ${#FAIL_MESSAGES[@]} -gt 0 ]; then
        echo ""
        echo "${RED}${BOLD}  실패 항목:${RESET}"
        for msg in "${FAIL_MESSAGES[@]}"; do
            echo "  ${RED}  • $msg${RESET}"
        done
    fi

    echo ""

    if [ "$FAIL_COUNT" -eq 0 ]; then
        echo "${GREEN}${BOLD}  ✅ 전체 PASS — Phase ${phase_label} 검증 완료${RESET}"
        echo ""
        if [ "$phase_label" != "5" ] && [ "$phase_label" != "all" ]; then
            echo "  ${YELLOW}→ 10분 대기 후 이상 없으면 다음 Phase로 진행하세요.${RESET}"
            echo "  ${YELLOW}→ 절차서: docs/ops/E3-FLAG-ACTIVATION-PROCEDURE.md${RESET}"
        fi
        if [ "$phase_label" = "5" ] || [ "$phase_label" = "all" ]; then
            echo "  ${GREEN}  🎉 호텔 모드 전체 활성화 완료! 30분 모니터링을 시작하세요.${RESET}"
            echo "  ${YELLOW}→ 절차서 섹션 11: 활성화 후 30분 모니터링 체크리스트${RESET}"
        fi
    else
        echo "${RED}${BOLD}  ❌ FAIL — 즉시 점검이 필요합니다!${RESET}"
        echo ""
        echo "${YELLOW}${BOLD}  ━━━ 즉시 OFF 절차 (90초 목표) ━━━${RESET}"
        echo "  ${YELLOW}  [10초] Vercel Dashboard → Settings → Environment Variables${RESET}"
        echo "  ${YELLOW}  [20초] ENABLE_HOTEL_MODE 값을 false로 변경 → Save${RESET}"
        echo "  ${YELLOW}  [30초] Deployments → 최신 배포 → Redeploy (Cache 무효화)${RESET}"
        echo "  ${YELLOW}  [90초] 배포 완료 → 아래 명령으로 OFF 확인:${RESET}"
        echo ""
        echo "  ${YELLOW}  curl -s -o /dev/null -w \"%{http_code}\" \\${RESET}"
        echo "  ${YELLOW}    \"\$BASE_URL/api/hotel/quick-class/availability\"${RESET}"
        echo "  ${YELLOW}  # 기대값: 404${RESET}"
        echo ""
        echo "  ${YELLOW}  상세 절차 → docs/ops/E3-FLAG-ACTIVATION-PROCEDURE.md 섹션 10${RESET}"
        echo ""
        return 1
    fi
}

# ── 인자 검증 ─────────────────────────────────────────────────────────────────
if [ $# -lt 1 ]; then
    usage
fi

PHASE="$1"

if [ -z "$BASE_URL" ]; then
    echo "${RED}오류: BASE_URL 환경변수가 설정되지 않았습니다.${RESET}"
    echo "예시: BASE_URL=https://your-app.vercel.app bash $0 $PHASE"
    exit 1
fi

# trailing slash 제거
BASE_URL="${BASE_URL%/}"

echo ""
echo "${BOLD}${CYAN}E-3 Flag 활성화 검증 스크립트${RESET}"
echo "  대상 URL : $BASE_URL"
echo "  호텔 단지 : $COMPLEX_CODE"
echo "  아파트 1  : $APT_CODE_1"
echo "  아파트 2  : $APT_CODE_2"
echo "  타임아웃  : ${CURL_TIMEOUT}초"
echo "  실행 시각 : $(date '+%Y-%m-%d %H:%M:%S')"

# ── Phase 분기 ────────────────────────────────────────────────────────────────
case "$PHASE" in
    1)
        verify_phase1
        print_result "1" || exit 1
        ;;
    2)
        verify_phase2
        print_result "2" || exit 1
        ;;
    3)
        verify_phase3
        print_result "3" || exit 1
        ;;
    4)
        verify_phase4
        print_result "4" || exit 1
        ;;
    5)
        verify_phase5
        print_result "5" || exit 1
        ;;
    off|OFF)
        verify_off
        print_result "OFF 확인" || exit 1
        ;;
    all|ALL)
        echo ""
        echo "${YELLOW}all 모드: Phase 1~5 순차 실행합니다.${RESET}"
        echo "${YELLOW}각 Phase 실패 시 즉시 중단됩니다.${RESET}"

        for p in 1 2 3 4 5; do
            PASS_COUNT=0
            FAIL_COUNT=0
            FAIL_MESSAGES=()

            case "$p" in
                1) verify_phase1 ;;
                2) verify_phase2 ;;
                3) verify_phase3 ;;
                4) verify_phase4 ;;
                5) verify_phase5 ;;
            esac

            if ! print_result "$p"; then
                echo "${RED}Phase $p 실패 — all 모드 중단.${RESET}"
                echo "${YELLOW}즉시 OFF 절차를 실행하세요: docs/ops/E3-FLAG-ACTIVATION-PROCEDURE.md 섹션 10${RESET}"
                exit 1
            fi

            if [ "$p" -lt 5 ]; then
                echo ""
                echo "${YELLOW}Phase $p 완료. ${PHASE_WAIT_SEC}초 후 Phase $((p+1)) 시작...${RESET}"
                sleep "$PHASE_WAIT_SEC"
            fi
        done

        echo ""
        echo "${GREEN}${BOLD}✅ all 모드 완료 — Phase 1~5 전체 통과${RESET}"
        echo "${GREEN}  docs/ops/E3-FLAG-ACTIVATION-PROCEDURE.md 섹션 11로 이동하여${RESET}"
        echo "${GREEN}  30분 모니터링을 시작하세요.${RESET}"
        ;;
    *)
        echo "${RED}오류: 알 수 없는 phase '${PHASE}'.${RESET}"
        usage
        ;;
esac
