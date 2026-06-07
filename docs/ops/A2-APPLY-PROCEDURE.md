# A-2 마이그레이션 적용 절차
## 호텔 모드 DB 마이그레이션 — dev → staging → prod 단계별 적용

> **목적**: `20260607_a2_add_hotel_mode_columns.sql`을 안전하게 prod에 반영하기 위한
> 단계별 절차. 각 단계는 이전 단계가 완전히 통과된 후에만 진행한다.
>
> **단계**: A-2 / **작성일**: 2026-06-07
> **원칙**: 되돌릴 수 없는 작업 전에는 반드시 백업. prod는 새벽 시간대에만 적용.

---

## 0. 전제 조건

- [ ] `A2-MIGRATION-TEST-CHECKLIST.md` 모든 항목 통과 완료
- [ ] `A1-BACKUP-SOP.md §2` 절차로 prod 백업 완료 (Git 태그 + CSV export)
- [ ] Git 태그 생성: `git tag pre-hotel-A2-$(date +%Y%m%d) && git push origin --tags`
- [ ] 담당자: __________________ / 승인자: __________________

---

## 1. dev 적용

> `A2-MIGRATION-TEST-CHECKLIST.md`의 전체 절차가 곧 dev 적용 절차다.
> 아래 체크는 해당 문서 완료 후 이 문서에 최종 기록용으로 체크한다.

- [ ] BLOCK 1~3 적용 완료 및 검증 A~E 통과
- [ ] BLOCK 4 (ht-lamada UPDATE) 적용 및 확인
- [ ] 롤백 테스트 1회 완료
- [ ] 마이그레이션 재적용 확인
- [ ] **dev 적용 완료 시각**: __________________

---

## 2. staging 적용

> staging 환경이 없으면 이 단계를 건너뛰고 §3 prod 적용으로 진행한다.
> (건너뛰는 경우 아래에 이유 기록: __________________)

### Step 2-1. staging DB에 마이그레이션 적용

```
1. staging Supabase 대시보드 → SQL Editor
2. 20260607_a2_add_hotel_mode_columns.sql 전체 실행
   (BLOCK 1~3 먼저, BLOCK 4 별도 실행)
3. A2-MIGRATION-TEST-CHECKLIST.md 검증 A~D 반복 실행
```
- [ ] BLOCK 1~3 적용 완료
- [ ] BLOCK 4 적용 완료
- [ ] 검증 통과
- [ ] **staging 적용 완료 시각**: __________________

---

## 3. prod 적용

> ⚠️ **반드시 새벽 시간대(한국 기준 00:00~06:00)에 진행한다.**
> 실사용 단지(apt-cjxi 212건, apt-sclass 82건) 이용자 영향 최소화.

### Step 3-1. prod 적용 직전 최종 백업 (필수)

```bash
# Git 태그 재확인
git tag -l "pre-hotel-*"

# prod Supabase 주요 테이블 CSV 내보내기 (직전 최신본)
# 순서: applications → complexes → programs
# 저장 파일명 예: backup_applications_YYYYMMDD_prod_pre_a2.csv
```
- [ ] Git 태그 확인: `pre-hotel-A2-YYYYMMDD`
- [ ] `applications` CSV 백업 완료
- [ ] `complexes` CSV 백업 완료
- [ ] `programs` CSV 백업 완료
- [ ] **최종 백업 완료 시각**: __________________

### Step 3-2. prod row 수 사전 기록

```sql
-- prod SQL Editor에서 실행 후 결과 아래에 기록
SELECT
    c.code,
    COUNT(a.id) AS cnt
FROM complexes c
LEFT JOIN applications a ON a.complex_id = c.id
GROUP BY c.code;
```

| code | 적용 전 건수 | 적용 후 건수 | 일치 여부 |
|---|---|---|---|
| `apt-cjxi` | 212 | | ☐ |
| `apt-sclass` | 82 | | ☐ |
| `ht-lamada` | 0 | | ☐ |
| `test-sk` | 2 | | ☐ |

### Step 3-3. BLOCK 1~3 prod 적용

```
1. prod Supabase 대시보드 → SQL Editor
2. 20260607_a2_add_hotel_mode_columns.sql 파일 열기
3. BLOCK 4(BEGIN; UPDATE ... COMMIT;) 부분 주석 처리 또는 제외
4. BLOCK 1~3만 선택하여 실행
```

- [ ] BLOCK 1 (complexes 컬럼 3개) — 오류 없음
- [ ] BLOCK 2 (applications 컬럼 6개) — 오류 없음
- [ ] BLOCK 3 (신규 테이블 5개) — 오류 없음

### Step 3-4. BLOCK 1~3 즉시 검증

```sql
-- prod에서 A2-MIGRATION-TEST-CHECKLIST.md 검증 B, C, D 실행
-- 검증 B: row 수 유지
SELECT c.code, COUNT(a.id) AS cnt
FROM complexes c LEFT JOIN applications a ON a.complex_id = c.id
GROUP BY c.code;

-- 검증 C-1: complexes DEFAULT
SELECT COUNT(*) FILTER (WHERE venue_type IS NULL) AS null_check FROM complexes;

-- 검증 C-2: applications DEFAULT
SELECT COUNT(*) FILTER (WHERE user_type IS NULL) AS null_check FROM applications;

-- 검증 D: 신규 테이블 존재
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('member_tokens','hotel_staff','workout_reports','discount_codes','meal_orders');
```

- [ ] row 수 296건 유지
- [ ] `null_check = 0` (complexes, applications 모두)
- [ ] 신규 테이블 5개 확인
- [ ] **BLOCK 1~3 검증 완료 시각**: __________________

### Step 3-5. BLOCK 4 prod 적용 (ht-lamada UPDATE)

> BLOCK 1~3 검증이 완전히 통과된 후에만 진행.

```sql
BEGIN;

    UPDATE complexes
    SET
        venue_type            = 'hotel',
        hotel_billing_enabled = FALSE
    WHERE
        code = 'ht-lamada';

    DO $$
    DECLARE v_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count
        FROM complexes
        WHERE code = 'ht-lamada' AND venue_type = 'hotel';
        IF v_count <> 1 THEN
            RAISE EXCEPTION 'ht-lamada UPDATE 검증 실패: % 건', v_count;
        END IF;
    END $$;

COMMIT;
```

- [ ] COMMIT 완료
- [ ] `SELECT code, venue_type FROM complexes WHERE code = 'ht-lamada';` → `hotel` 확인
- [ ] **BLOCK 4 완료 시각**: __________________

### Step 3-6. prod 최종 검증

```sql
-- 기존 단지 정상 동작 최종 확인
SELECT id, dong, ho, name, status
FROM applications
WHERE complex_id = (SELECT id FROM complexes WHERE code = 'apt-cjxi')
  AND status = 'approved'
ORDER BY created_at DESC
LIMIT 3;
```

- [ ] 기존 단지 데이터 정상 조회
- [ ] 관리자 페이지 접속 정상 확인 (브라우저)
- [ ] 입주민 페이지 접속 정상 확인 (브라우저)
- [ ] **prod 전체 적용 완료 시각**: __________________

---

## 4. 적용 실패 시 즉시 롤백 절차

> 위 Step 중 어느 단계에서든 오류 발생 시, 즉시 아래 절차를 따른다.

### 판단 기준
- Step 3-3 (BLOCK 1~3) 실행 중 오류 → 즉시 ROLLBACK BLOCK 1~3 실행
- Step 3-5 (BLOCK 4) 실행 중 오류 → BEGIN 블록이 자동 rollback됨. BLOCK 1~3은 유지.
- 적용 후 검증 실패 → 실패 원인에 따라 선택적 롤백 또는 핫픽스

### 즉시 롤백 실행

```
1. prod SQL Editor
2. 20260607_a2_add_hotel_mode_columns.rollback.sql 전체 실행
   ⚠️  주의: 호텔 신규 테이블에 데이터가 있으면 소실됨
             실행 전 반드시 현재 상태 확인
3. 롤백 완료 후 A1-ROLLBACK-RUNBOOK.md §2 코드 롤백과 병행 검토
```

```sql
-- 롤백 전 데이터 존재 여부 확인 (데이터 있으면 별도 백업 후 롤백)
SELECT
    (SELECT COUNT(*) FROM member_tokens)   AS tokens,
    (SELECT COUNT(*) FROM hotel_staff)     AS staff,
    (SELECT COUNT(*) FROM workout_reports) AS reports,
    (SELECT COUNT(*) FROM discount_codes)  AS codes,
    (SELECT COUNT(*) FROM meal_orders)     AS orders;
```

- [ ] 롤백 실행 전 데이터 존재 여부 확인
- [ ] 롤백 완료
- [ ] 기존 단지(apt-cjxi, apt-sclass) 정상 동작 재확인
- [ ] A1-ROLLBACK-RUNBOOK.md §5 이력 기록

---

## 5. 적용 이력 기록

| 단계 | 완료 시각 | 담당자 | 특이 사항 |
|---|---|---|---|
| dev 적용 | | | |
| staging 적용 | | | |
| prod BLOCK 1~3 | | | |
| prod BLOCK 4 | | | |
| 최종 검증 | | | |

---

*적용 완료 후 `A1-INVENTORY-CHECKLIST.md §3` row 수 및 `§6` 체크섬을 갱신한다.*
