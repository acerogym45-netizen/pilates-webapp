#!/usr/bin/env bash
# =============================================================================
# scripts/sh/e1-smoke-test.sh
# 호텔 모드 스모크 테스트 — E-1 검증 자동화
#
# 사용법:
#   BASE_URL=https://your-domain.vercel.app bash scripts/sh/e1-smoke-test.sh
#
# 옵션 환경변수:
#   BASE_URL        (필수) 대상 서버 도메인 (끝 슬래시 없이)
#   COMPLEX_CODE    (선택) 호텔 단지 코드  (기본: ht-lamada)
#   TIMEOUT         (선택) curl 타임아웃 초 (기본: 10)
#   VERBOSE         (선택) 1이면 응답 전문 출력 (기본: 0)
#
# 테스트 순서:
#   STEP-1  GET  /api/health               서버 정상 여부
#   STEP-2  GET  /api/complexes            기존 라우트 정상 + 아파트 단지 보호
#   STEP-3  GET  /api/hotel/quick-class/availability  Flag OFF → 404, ON → 400/200
#   STEP-4  POST /api/hotel/auth/verify-staff         Flag OFF → 404, ON → 400
#   STEP-5  GET  /api/hotel/refresh-pt/instructors    Flag OFF → 404, ON → 400/200
#
# 종료 코드:
#   0  — 모든 필수 검사 통과
#   1  — 하나 이상의 필수 검사 실패
#
# 주의:
#   - 이 스크립트는 READ ONLY 검사만 수행한다 (POST는 의도적 실패 케이스만)
#   - prod DB 데이터를 변경하지 않는다
#   - check-in / 혼잡도 / 인원카운트 관련 검사 없음
#
# 단계: E-1 / 작성일: 2026-06-07
# =============================================================================

set -euo pipefail

# ── 설정 ──────────────────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-}"
COMPLEX_CODE="${COMPLEX_CODE:-ht-lamada}"
TIMEOUT="${TIMEOUT:-10}"
VERBOSE="${VERBOSE:-0}"

# ── 색상 ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── 카운터 ────────────────────────────────────────────────────────────────────
PASS=0
FAIL=0
SKIP=0

# ── 헬퍼 함수 ─────────────────────────────────────────────────────────────────

log_header() {
    echo ""
    echo -e "${BOLD}${BLUE}══════════════════════════════════════════════${RESET}"
    echo -e "${BOLD}${BLUE}  $1${RESET}"
    echo -e "${BOLD}${BLUE}══════════════════════════════════════════════${RESET}"
}

log_step() {
    echo ""
    echo -e "${CYAN}▶ $1${RESET}"
}

log_pass() {
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✅ PASS${RESET} — $1"
}

log_fail() {
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}❌ FAIL${RESET} — $1"
}

log_warn() {
    echo -e "  ${YELLOW}⚠️  INFO${RESET} — $1"
}

log_skip() {
    SKIP=$((SKIP + 1))
    echo -e "  ${YELLOW}⏭  SKIP${RESET} — $1"
}

# curl 실행 후 HTTP 상태코드와 응답 본문을 분리 반환
# 사용: http_call <method> <url> [body_json]
# 출력: HTTP_CODE 변수와 BODY 변수에 저장
http_call() {
    local method="$1"
    local url="$2"
    local body="${3:-}"

    local tmpfile
    tmpfile="$(mktemp)"

    local curl_args=(
        --silent
        --max-time "${TIMEOUT}"
        --write-out "%{http_code}"
        --output "${tmpfile}"
        -X "${method}"
        -H "Content-Type: application/json"
        -H "Accept: application/json"
    )

    if [[ -n "${body}" ]]; then
        curl_args+=(--data "${body}")
    fi

    HTTP_CODE=$(curl "${curl_args[@]}" "${url}" 2>/dev/null || echo "000")
    BODY=$(cat "${tmpfile}" 2>/dev/null || echo "")
    rm -f "${tmpfile}"

    if [[ "${VERBOSE}" == "1" ]]; then
        echo -e "    ${YELLOW}→ HTTP ${HTTP_CODE}${RESET}"
        echo "    ${BODY}" | head -5
    fi
}

# JSON 필드 간단 추출 (jq 없이도 동작하나 jq 있으면 사용)
json_get() {
    local json="$1"
    local key="$2"
    if command -v jq &>/dev/null; then
        echo "${json}" | jq -r "${key} // empty" 2>/dev/null || echo ""
    else
        # jq 없을 때 간이 파싱 (단순 문자열 값만)
        echo "${json}" | grep -o "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
            | sed "s/\"${key}\"[[:space:]]*:[[:space:]]*\"//;s/\"//" | head -1 || echo ""
    fi
}

# ── 사전 조건 확인 ─────────────────────────────────────────────────────────────

log_header "E-1 스모크 테스트 시작"
echo -e "  대상 서버  : ${BOLD}${BASE_URL:-미설정}${RESET}"
echo -e "  호텔 코드  : ${BOLD}${COMPLEX_CODE}${RESET}"
echo -e "  타임아웃   : ${TIMEOUT}초"
echo -e "  실행 시각  : $(date '+%Y-%m-%d %H:%M:%S')"

if [[ -z "${BASE_URL}" ]]; then
    echo ""
    echo -e "${RED}${BOLD}[오류] BASE_URL 환경변수를 설정하세요.${RESET}"
    echo ""
    echo "  사용법:"
    echo "    BASE_URL=https://your-domain.vercel.app bash scripts/sh/e1-smoke-test.sh"
    echo ""
    exit 1
fi

# URL 끝 슬래시 제거
BASE_URL="${BASE_URL%/}"

# curl 존재 확인
if ! command -v curl &>/dev/null; then
    echo -e "${RED}[오류] curl이 설치되어 있지 않습니다.${RESET}"
    exit 1
fi

# ── STEP-1: 서버 헬스체크 ──────────────────────────────────────────────────────

log_header "STEP-1 서버 정상 여부 확인"
log_step "GET /api/health"

http_call "GET" "${BASE_URL}/api/health"

if [[ "${HTTP_CODE}" == "200" ]]; then
    log_pass "HTTP ${HTTP_CODE} — 서버 정상 응답"

    SUCCESS=$(json_get "${BODY}" ".success")
    STATUS=$(json_get "${BODY}"  ".status")

    if [[ "${SUCCESS}" == "true" ]]; then
        log_pass "응답 본문 success=true"
    else
        log_fail "응답 본문 success가 true가 아님: ${BODY}"
    fi

    if [[ -n "${STATUS}" ]]; then
        log_pass "status 필드 존재: ${STATUS}"
    else
        log_warn "status 필드를 파싱하지 못함 (jq 없는 환경일 수 있음)"
    fi
else
    log_fail "HTTP ${HTTP_CODE} — 서버가 응답하지 않거나 오류 상태"
    echo ""
    echo -e "${RED}[중단] 서버가 정상 응답하지 않으면 이후 테스트를 진행할 수 없습니다.${RESET}"
    echo "  확인 사항:"
    echo "    1. BASE_URL이 올바른지 확인: ${BASE_URL}"
    echo "    2. 서버가 배포/실행 중인지 확인"
    echo "    3. 네트워크 연결 상태 확인"
    exit 1
fi

# ── STEP-2: 기존 라우트 + 아파트 단지 보호 확인 ───────────────────────────────

log_header "STEP-2 기존 아파트 단지 무영향 확인 (최우선)"
echo -e "  ${YELLOW}⚠️  이 검사가 실패하면 호텔 모드와 무관하게 서비스 이상입니다.${RESET}"

# 2-1: GET /api/complexes
log_step "GET /api/complexes — 전체 단지 목록 조회"
http_call "GET" "${BASE_URL}/api/complexes"

if [[ "${HTTP_CODE}" == "200" ]]; then
    log_pass "HTTP ${HTTP_CODE} — 단지 목록 API 정상"
else
    log_fail "HTTP ${HTTP_CODE} — 단지 목록 API 비정상 (기대: 200)"
fi

# 2-2: 아파트 신청 화면 (apt-cjxi)
log_step "GET /?complex=apt-cjxi — 청주자이 신청 화면"
http_call "GET" "${BASE_URL}/?complex=apt-cjxi"

if [[ "${HTTP_CODE}" == "200" ]]; then
    log_pass "HTTP ${HTTP_CODE} — 청주자이(apt-cjxi) 신청 화면 정상"
else
    log_fail "HTTP ${HTTP_CODE} — 청주자이(apt-cjxi) 신청 화면 비정상 (기대: 200)"
    log_warn "기존 아파트 서비스에 영향이 감지되었습니다. 즉시 확인하세요."
fi

# 2-3: 아파트 신청 화면 (apt-sclass)
log_step "GET /?complex=apt-sclass — S클래스 신청 화면"
http_call "GET" "${BASE_URL}/?complex=apt-sclass"

if [[ "${HTTP_CODE}" == "200" ]]; then
    log_pass "HTTP ${HTTP_CODE} — S클래스(apt-sclass) 신청 화면 정상"
else
    log_fail "HTTP ${HTTP_CODE} — S클래스(apt-sclass) 신청 화면 비정상 (기대: 200)"
    log_warn "기존 아파트 서비스에 영향이 감지되었습니다. 즉시 확인하세요."
fi

# 2-4: 기존 신청 API
log_step "GET /api/applications?limit=5 — 기존 신청 목록 API"
http_call "GET" "${BASE_URL}/api/applications?limit=5"

if [[ "${HTTP_CODE}" == "200" ]]; then
    log_pass "HTTP ${HTTP_CODE} — 신청 목록 API 정상"
else
    log_fail "HTTP ${HTTP_CODE} — 신청 목록 API 비정상 (기대: 200)"
fi

# ── STEP-3: 호텔 퀵클래스 availability (Flag 상태 판별) ───────────────────────

log_header "STEP-3 호텔 퀵클래스 API — Feature Flag 상태 판별"
log_step "GET /api/hotel/quick-class/availability (파라미터 없이 → 상태 판별)"

http_call "GET" "${BASE_URL}/api/hotel/quick-class/availability"

echo ""
case "${HTTP_CODE}" in
    "404")
        log_warn "HTTP 404 — ENABLE_HOTEL_MODE=false (라우트 미마운트)"
        log_warn "→ 호텔 모드가 아직 비활성화 상태입니다. Flag OFF 동작 정상."
        log_pass "Flag OFF 상태에서 404 반환 — 예상 동작"
        HOTEL_MODE_STATUS="off"
        ;;
    "400")
        log_warn "HTTP 400 — 라우트 마운트됨, 파라미터 누락으로 400 (Flag ON 상태)"
        log_pass "Flag ON 상태에서 라우트 접근 가능 확인"
        HOTEL_MODE_STATUS="on"
        ;;
    "403")
        log_warn "HTTP 403 — ENABLE_HOTEL_MODE=true이나 ENABLE_HOTEL_QUICK_CLASS=false"
        log_pass "하위 Flag OFF 시 403 반환 — 예상 동작"
        HOTEL_MODE_STATUS="partial"
        ;;
    "200")
        log_warn "HTTP 200 — 호텔 모드 완전 활성화 상태"
        log_pass "Flag ON, 파라미터 없이도 200 반환 (단지 코드 기본값 있는 경우)"
        HOTEL_MODE_STATUS="on"
        ;;
    "000")
        log_fail "연결 실패 — 서버에 도달하지 못했습니다 (timeout 또는 연결 오류)"
        HOTEL_MODE_STATUS="error"
        ;;
    *)
        log_fail "HTTP ${HTTP_CODE} — 예상하지 못한 응답 코드"
        log_warn "응답 본문: ${BODY}"
        HOTEL_MODE_STATUS="unknown"
        ;;
esac

echo ""
echo -e "  📊 호텔 모드 상태: ${BOLD}${HOTEL_MODE_STATUS}${RESET}"

# Flag OFF일 때 추가 확인 (각 하위 라우트도 404인지)
if [[ "${HOTEL_MODE_STATUS}" == "off" ]]; then
    log_step "Flag OFF 추가 확인 — 호텔 라우트 전부 404인지 점검"

    for endpoint in \
        "/api/hotel/auth/verify-staff" \
        "/api/hotel/refresh-pt/instructors" \
        "/api/hotel/members/me" \
        "/api/hotel/staff" \
        "/api/hotel/workout-reports"
    do
        http_call "GET" "${BASE_URL}${endpoint}"
        if [[ "${HTTP_CODE}" == "404" ]]; then
            log_pass "GET ${endpoint} → 404 (라우트 미마운트 확인)"
        elif [[ "${HTTP_CODE}" == "405" ]]; then
            log_pass "GET ${endpoint} → 405 (라우트 마운트됨, Method Not Allowed)"
            log_warn "→ ENABLE_HOTEL_MODE=true일 수 있습니다. 환경변수를 재확인하세요."
        else
            log_fail "GET ${endpoint} → ${HTTP_CODE} (기대: 404)"
        fi
    done
fi

# ── STEP-4: 임직원 인증 API — 의도적 실패 케이스 ─────────────────────────────

log_header "STEP-4 임직원 인증 API — 입력 검증 확인"
log_step "POST /api/hotel/auth/verify-staff (빈 body → Flag 상태에 따라 404 또는 400)"

http_call "POST" "${BASE_URL}/api/hotel/auth/verify-staff" '{}'

case "${HTTP_CODE}" in
    "404")
        log_pass "HTTP 404 — Flag OFF 상태. 라우트 미마운트 정상."
        ;;
    "400")
        log_pass "HTTP 400 — Flag ON 상태. 필수 파라미터 누락 검증 정상."
        # 에러 메시지 확인
        ERR_MSG=$(json_get "${BODY}" ".error")
        if [[ -n "${ERR_MSG}" ]]; then
            log_pass "오류 메시지 포함: ${ERR_MSG}"
        fi
        ;;
    "403")
        log_pass "HTTP 403 — ENABLE_HOTEL_STAFF_AUTH=false. Flag 가드 동작 정상."
        ;;
    "000")
        log_fail "연결 실패 — 타임아웃 또는 네트워크 오류"
        ;;
    *)
        log_fail "HTTP ${HTTP_CODE} — 예상하지 못한 응답 (기대: 404 또는 400 또는 403)"
        log_warn "응답 본문: ${BODY}"
        ;;
esac

# phone_last4 정규식 검증 (Flag ON인 경우만)
if [[ "${HOTEL_MODE_STATUS}" == "on" ]]; then
    log_step "POST /api/hotel/auth/verify-staff — phone_last4 검증 (5자리 → 400 기대)"

    http_call "POST" "${BASE_URL}/api/hotel/auth/verify-staff" \
        '{"complex_code":"ht-lamada","staff_no":"EMP999","phone_last4":"12345"}'

    if [[ "${HTTP_CODE}" == "400" ]]; then
        log_pass "HTTP 400 — phone_last4 5자리 입력 시 거부 (정규식 /^\\d{4}$/ 동작)"
    elif [[ "${HTTP_CODE}" == "403" ]]; then
        log_pass "HTTP 403 — ENABLE_HOTEL_STAFF_AUTH=false (Flag 가드 우선)"
    else
        log_fail "HTTP ${HTTP_CODE} — 잘못된 phone_last4에 대한 검증 실패"
    fi
fi

# ── STEP-5: 리프레시 PT 트레이너 목록 ─────────────────────────────────────────

log_header "STEP-5 리프레시 PT API — Flag 상태 및 응답 형식 확인"
log_step "GET /api/hotel/refresh-pt/instructors?complex_code=${COMPLEX_CODE}"

http_call "GET" "${BASE_URL}/api/hotel/refresh-pt/instructors?complex_code=${COMPLEX_CODE}"

case "${HTTP_CODE}" in
    "404")
        log_pass "HTTP 404 — Flag OFF 상태. 라우트 미마운트 정상."
        ;;
    "200")
        log_pass "HTTP 200 — 트레이너 목록 조회 성공"
        SUCCESS=$(json_get "${BODY}" ".success")
        if [[ "${SUCCESS}" == "true" ]]; then
            log_pass "응답 success=true 확인"
        else
            log_fail "응답 success가 true가 아님"
        fi
        log_warn "※ ht-lamada에 트레이너 미등록 시 빈 배열([]) 반환이 정상입니다"
        ;;
    "403")
        log_pass "HTTP 403 — ENABLE_HOTEL_REFRESH_PT=false. Flag 가드 동작 정상."
        ;;
    "404" | "400")
        log_warn "HTTP ${HTTP_CODE} — complex_code 미조회 또는 파라미터 오류"
        log_warn "ht-lamada 단지 등록 여부를 확인하세요"
        ;;
    "000")
        log_fail "연결 실패 — 타임아웃 또는 네트워크 오류"
        ;;
    *)
        log_fail "HTTP ${HTTP_CODE} — 예상하지 못한 응답"
        log_warn "응답 본문: ${BODY}"
        ;;
esac

# ── 결과 요약 ─────────────────────────────────────────────────────────────────

log_header "테스트 결과 요약"

TOTAL=$((PASS + FAIL + SKIP))

echo ""
echo -e "  총 검사 항목  : ${BOLD}${TOTAL}${RESET}"
echo -e "  ${GREEN}✅ 통과${RESET}         : ${BOLD}${PASS}${RESET}"
echo -e "  ${RED}❌ 실패${RESET}         : ${BOLD}${FAIL}${RESET}"
echo -e "  ${YELLOW}⏭  건너뜀${RESET}      : ${BOLD}${SKIP}${RESET}"
echo ""
echo -e "  호텔 모드 상태 : ${BOLD}${HOTEL_MODE_STATUS:-unknown}${RESET}"
echo ""

if [[ ${FAIL} -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}  🎉 모든 필수 검사 통과${RESET}"
    echo ""

    if [[ "${HOTEL_MODE_STATUS}" == "off" ]]; then
        echo -e "  ${YELLOW}다음 단계 안내 (Flag OFF 상태):${RESET}"
        echo "    1. docs/ops/E1-INTEGRATION-TEST.md 섹션 1 (DB 사전 점검) 완료 확인"
        echo "    2. 섹션 2 (Flag 활성화 절차)에 따라 Vercel 환경변수 설정"
        echo "    3. 재배포 후 이 스크립트를 다시 실행하여 Flag ON 상태 검증"
    elif [[ "${HOTEL_MODE_STATUS}" == "on" ]]; then
        echo -e "  ${GREEN}다음 단계 안내 (Flag ON 상태):${RESET}"
        echo "    1. docs/ops/E1-INTEGRATION-TEST.md 섹션 3 (아파트 무영향 검증) 수행"
        echo "    2. 섹션 4 (4종 페르소나 시나리오) 수동 검증 수행"
        echo "    3. 섹션 7 (검증 완료 판단 기준) 체크리스트 작성"
    elif [[ "${HOTEL_MODE_STATUS}" == "partial" ]]; then
        echo -e "  ${YELLOW}다음 단계 안내 (부분 활성화 상태):${RESET}"
        echo "    1. Vercel에서 하위 Flag 5개 모두 true로 설정 확인"
        echo "    2. 재배포 후 이 스크립트를 다시 실행"
    fi
else
    echo -e "${RED}${BOLD}  ⛔ ${FAIL}개 검사 실패 — 조사 필요${RESET}"
    echo ""
    echo -e "  ${RED}조치 안내:${RESET}"
    echo "    1. 기존 아파트 서비스(apt-cjxi, apt-sclass) 수동 확인"
    echo "    2. 서버 로그 확인: Vercel Functions 탭 → 오류 로그"
    echo "    3. 필요 시 즉시 OFF: docs/ops/E1-INTEGRATION-TEST.md 섹션 6 참조"
    echo ""
    echo -e "  ${BOLD}즉시 OFF 명령 (긴급 시):${RESET}"
    echo "    Vercel 대시보드 → Settings → Env Vars → ENABLE_HOTEL_MODE=false → Redeploy"
    echo ""
    exit 1
fi

echo ""
echo -e "  실행 완료 시각 : $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
exit 0
