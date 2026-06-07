#!/usr/bin/env bash
# ================================================================
# backup-weekly.sh
# 목적: 아파트 단지 시스템 주간 정기 백업 스크립트 (샘플)
# 실행: bash scripts/bash/backup-weekly.sh
#
# 이 스크립트가 수행하는 작업:
#   1. Git 상태(최신 커밋) 기록
#   2. 핵심 서버 파일 SHA-256 체크섬 기록
#   3. Supabase REST API로 핵심 테이블 row count 조회
#   4. 모든 결과를 logs/backup-YYYYMMDD.log에 저장
#
# 사전 조건:
#   - 프로젝트 루트에서 실행 (cd /path/to/project && bash scripts/bash/backup-weekly.sh)
#   - SUPABASE_URL, SUPABASE_KEY 환경변수가 설정되어 있거나
#     .env.backup 파일(gitignore 대상)이 프로젝트 루트에 존재
#
# .env.backup 예시 형식 (Git에 커밋 금지 — .gitignore에 포함되어야 함):
#   SUPABASE_URL=https://____________.supabase.co
#   SUPABASE_KEY=eyJ...
#
# 작성일: 2026-06-07
# ================================================================

set -euo pipefail

# ── 0. 경로 설정 ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DATE_LABEL="$(date +%Y%m%d)"
LOG_FILE="${LOG_DIR}/backup-${DATE_LABEL}.log"

# ── 1. logs/ 디렉토리 생성 ─────────────────────────────────────
mkdir -p "${LOG_DIR}"

echo "================================================================" | tee -a "${LOG_FILE}"
echo "  주간 백업 시작: $(date '+%Y-%m-%d %H:%M:%S %Z')"              | tee -a "${LOG_FILE}"
echo "  로그 파일: ${LOG_FILE}"                                         | tee -a "${LOG_FILE}"
echo "================================================================" | tee -a "${LOG_FILE}"

# ── 2. 환경변수 로드 (.env.backup 파일이 있으면 사용) ──────────
ENV_BACKUP="${PROJECT_ROOT}/.env.backup"
if [[ -f "${ENV_BACKUP}" ]]; then
    echo "[INFO] .env.backup 파일 발견 → 환경변수 로드" | tee -a "${LOG_FILE}"
    # shellcheck disable=SC1090
    set -a; source "${ENV_BACKUP}"; set +a
else
    echo "[INFO] .env.backup 없음 → 기존 환경변수 사용" | tee -a "${LOG_FILE}"
fi

# ── 3. 필수 환경변수 확인 ──────────────────────────────────────
if [[ -z "${SUPABASE_URL:-}" ]] || [[ -z "${SUPABASE_KEY:-}" ]]; then
    echo "[ERROR] SUPABASE_URL 또는 SUPABASE_KEY가 설정되지 않았습니다." | tee -a "${LOG_FILE}"
    echo "        .env.backup 파일을 만들거나 환경변수를 직접 설정하세요." | tee -a "${LOG_FILE}"
    echo "        .env.backup 형식 → docs/ops/A1-BACKUP-SOP.md §4 참조"  | tee -a "${LOG_FILE}"
    exit 1
fi

# ── 4. Git 상태 기록 ───────────────────────────────────────────
echo ""                                                          | tee -a "${LOG_FILE}"
echo "── [1] Git 상태 ──────────────────────────────────────"   | tee -a "${LOG_FILE}"
cd "${PROJECT_ROOT}"
git log --oneline -5                                             | tee -a "${LOG_FILE}"
echo "현재 브랜치: $(git branch --show-current)"                | tee -a "${LOG_FILE}"
echo "미커밋 변경: $(git status --short | wc -l) 건"           | tee -a "${LOG_FILE}"

# ── 5. 핵심 파일 SHA-256 체크섬 ────────────────────────────────
echo ""                                                          | tee -a "${LOG_FILE}"
echo "── [2] 핵심 파일 체크섬 (SHA-256) ───────────────────"   | tee -a "${LOG_FILE}"

CORE_FILES=(
    "server/routes/applications.js"
    "server/routes/complexes.js"
    "server/routes/programs.js"
    "server/utils/waiting.js"
    "server/index.js"
    "js/main.js"
    "admin/js/pages/applications.js"
)

for f in "${CORE_FILES[@]}"; do
    FULL="${PROJECT_ROOT}/${f}"
    if [[ -f "${FULL}" ]]; then
        sha256sum "${FULL}" | awk -v fp="${f}" '{print $1, fp}' | tee -a "${LOG_FILE}"
    else
        echo "[WARN] 파일 없음: ${f}" | tee -a "${LOG_FILE}"
    fi
done

# ── 6. Supabase REST API로 테이블 row count 조회 ───────────────
echo ""                                                           | tee -a "${LOG_FILE}"
echo "── [3] Supabase 테이블 row count ─────────────────────"   | tee -a "${LOG_FILE}"

# 조회할 테이블 목록
TABLES=(
    "complexes"
    "programs"
    "instructors"
    "applications"
    "cancellations"
    "notices"
    "inquiries"
    "curricula"
    "complex_apply_settings"
)

for tbl in "${TABLES[@]}"; do
    # Supabase REST API: HEAD 요청으로 Content-Range 헤더에서 count 추출
    # Prefer: count=exact 헤더로 정확한 row 수 요청
    RESPONSE=$(curl -s -o /dev/null -D - \
        -H "apikey: ${SUPABASE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_KEY}" \
        -H "Prefer: count=exact" \
        -X GET "${SUPABASE_URL}/rest/v1/${tbl}?select=*&limit=1" \
        2>/dev/null)

    # Content-Range 헤더 파싱: "0-0/총개수" 형식
    ROW_COUNT=$(echo "${RESPONSE}" \
        | grep -i "content-range:" \
        | grep -oP '\d+$' \
        || echo "조회실패")

    printf "  %-30s : %s rows\n" "${tbl}" "${ROW_COUNT}" | tee -a "${LOG_FILE}"
done

# ── 7. 결과 요약 ───────────────────────────────────────────────
echo ""                                                          | tee -a "${LOG_FILE}"
echo "================================================================" | tee -a "${LOG_FILE}"
echo "  백업 완료: $(date '+%Y-%m-%d %H:%M:%S %Z')"            | tee -a "${LOG_FILE}"
echo "  로그 저장: ${LOG_FILE}"                                  | tee -a "${LOG_FILE}"
echo "================================================================" | tee -a "${LOG_FILE}"

# ── 8. 오래된 로그 정리 (4주 초과 삭제) ───────────────────────
echo ""
echo "[INFO] 28일 이전 백업 로그 삭제 중..."
find "${LOG_DIR}" -name "backup-*.log" -mtime +28 -delete 2>/dev/null && \
    echo "[INFO] 정리 완료" || \
    echo "[WARN] 오래된 로그 정리 실패 (로그 디렉토리 없거나 권한 문제)"

echo ""
echo "✅ 백업 완료. 로그: ${LOG_FILE}"
