# A-1 백업 표준 절차 (Backup SOP)
## 아세로짐 라마다호텔점 QR 시스템 — 기존 시스템 보호 절차

> **목적**: 호텔 모드 개발 기간 중 기존 아파트 단지 데이터와 코드를
> 언제든 복구 가능한 상태로 유지하기 위한 표준 절차.
>
> **단계**: A-1 / **작성일**: 2026-06-07
> **원칙**: 백업은 작업 전 반드시 실행. "백업 없는 배포"는 없다.

---

## 1. 백업 종류 및 주기

| 백업 종류 | 시점 | 방법 | 보관 기간 |
|---|---|---|---|
| **작업 전 스냅샷** | 코드 변경 착수 직전 | Git tag + Supabase CSV export | 해당 단계 종료 후 30일 |
| **주간 정기 백업** | 매주 월요일 | `backup-weekly.sh` 실행 | 4주 (4세대 롤링) |
| **배포 직전 백업** | 각 단계 PR merge 전 | Git tag + 수동 DB 백업 | 해당 단계 종료 후 30일 |

---

## 2. 작업 전 백업 절차 (필수)

### Step 1 — Git 상태 확인 및 태그 생성

```bash
# 1) 현재 브랜치·커밋 확인
git status
git log --oneline -5

# 2) 작업 착수 태그 생성 (단계명 포함)
# 형식: pre-<단계코드>-YYYYMMDD
git tag pre-hotel-A1-$(date +%Y%m%d)
git push origin --tags

# 3) 태그 확인
git tag -l "pre-hotel-*"
```

### Step 2 — Supabase 주요 테이블 CSV 내보내기

Supabase 대시보드 → Table Editor → 각 테이블 → Export CSV

내보낼 테이블 순서 (중요도 순):
1. `applications`  ← 가장 중요. 실제 계약 데이터
2. `cancellations`
3. `complexes`
4. `programs`
5. `complex_apply_settings`
6. `notices`
7. `instructors`
8. `curricula`
9. `inquiries`

저장 파일명 규칙:
```
backup_<테이블명>_YYYYMMDD.csv
예: backup_applications_20260607.csv
```

### Step 3 — 환경변수 Key 목록 검토

```
확인 위치: Vercel 대시보드 → Settings → Environment Variables
확인 항목: A1-INVENTORY-CHECKLIST.md §4 목록과 일치하는지 확인
기록 방법: Key 이름만 체크리스트에 체크 표시 (값은 기록하지 않음)
```

> ⚠️ `.env` 파일이나 실제 키 값을 Git에 커밋하지 말 것.
> `.gitignore`에 `.env*` 패턴이 포함되어 있는지 확인: `cat .gitignore | grep env`

---

## 3. 주간 정기 백업 절차

```bash
# 매주 월요일 실행
# 상세 절차는 scripts/bash/backup-weekly.sh 참조
bash scripts/bash/backup-weekly.sh
```

백업 스크립트가 수행하는 작업:
1. Git log 최신 커밋 해시 기록
2. 핵심 파일 SHA-256 체크섬 기록
3. Supabase HTTP API로 row count 조회 및 기록
4. 결과를 `logs/backup-YYYYMMDD.log`에 저장

---

## 4. 환경변수 백업 가이드

> **규칙**: `.env.backup` 파일을 실제로 만들지 말 것.
> Git에 절대 포함하면 안 된다. 이 섹션은 문서 목적으로만 존재한다.

### .env.backup 예시 형식 (실제 파일 생성 금지)

```
# ===============================================================
# 이 파일은 예시입니다. 실제 .env.backup 파일을 만들지 마십시오.
# 환경변수는 Vercel 대시보드에서만 관리합니다.
# ===============================================================

# [필수] Supabase
SUPABASE_URL=https://____________.supabase.co
SUPABASE_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# [필수] 인증
MASTER_PASSWORD=____________
CRON_SECRET=____________

# [필수] URL
APP_BASE_URL=https://____________.vercel.app

# [SMS] Solapi
SMS_ENABLED=true
SOLAPI_API_KEY=____________
SOLAPI_API_SECRET=____________
SOLAPI_SENDER=0____________

# [선택] 기타
TZ=Asia/Seoul
```

### 안전한 환경변수 보관 방법

| 방법 | 권장 여부 | 이유 |
|---|---|---|
| Vercel 대시보드 | ✅ 권장 | 암호화 저장, Git과 분리 |
| 1Password / Bitwarden | ✅ 권장 | 팀 공유 가능, 접근 로그 있음 |
| 카카오톡/이메일 전송 | ❌ 금지 | 유출 위험 |
| Git 커밋 | ❌ 절대 금지 | 영구 기록에 남음 |
| `.env.backup` 파일 생성 후 로컬 보관 | ⚠️ 비권장 | 분실·유출 위험 |

---

## 5. 백업 검증 절차

백업 완료 후 아래 항목을 반드시 확인한다.

### 5-1. Git 태그 검증
```bash
# 태그가 원격 저장소에 올라갔는지 확인
git ls-remote --tags origin | grep "pre-hotel"
```

### 5-2. CSV 백업 검증
```bash
# 백업 CSV 파일이 비어있지 않은지 확인
wc -l backup_applications_*.csv
# → 헤더 포함 최소 2줄 이상이어야 정상

# 컬럼 헤더 확인 (첫 줄)
head -1 backup_applications_*.csv
```

### 5-3. Row Count 대조
```sql
-- scripts/sql/inventory_row_counts.sql 실행 결과와
-- 백업 CSV 파일의 줄 수(헤더 제외)가 일치하는지 확인
-- 불일치 시: 백업 시점과 count 조회 시점 사이에 신청이 발생한 것일 수 있음
```

### 5-4. 핵심 파일 체크섬 검증
```bash
sha256sum \
  server/routes/applications.js \
  server/routes/complexes.js \
  server/routes/programs.js \
  server/utils/waiting.js \
  server/index.js \
  js/main.js \
  admin/js/pages/applications.js
# 결과를 A1-INVENTORY-CHECKLIST.md §5에 기록
```

---

## 6. 백업 이력 기록

| 날짜 | 백업 종류 | Git 태그 | 백업한 사람 | 검증 완료 |
|---|---|---|---|---|
| 2026-06-07 | 작업 전 스냅샷 (A-1) | `pre-hotel-A1-20260607` | | ☐ |
| | | | | |

---

*이 SOP는 새로운 개발 단계 착수 시마다 §6 이력 표를 갱신한다.*
