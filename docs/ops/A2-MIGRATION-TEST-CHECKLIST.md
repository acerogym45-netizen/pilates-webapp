# A-2 마이그레이션 테스트 체크리스트
## 호텔 모드 DB 마이그레이션 — dev 검증 절차

> **목적**: `20260607_a2_add_hotel_mode_columns.sql`을 dev Supabase에 적용하고,
> 기존 아파트 단지와 신규 호텔 컬럼이 모두 정상임을 검증한 뒤 prod 적용을 결정한다.
>
> **단계**: A-2 / **작성일**: 2026-06-07
> **원칙**: prod 적용 전 dev에서 마이그레이션 + 검증 + 롤백 + 재적용을 1회 이상 완료해야 한다.

---

## 0. 사전 확인 (테스트 시작 전 필수)

- [ ] dev Supabase 프로젝트가 준비되어 있음
- [ ] dev DB가 prod 스키마와 동일한 상태임 (최소한 주요 테이블 구조 일치)
- [ ] `A1-BACKUP-SOP.md §2` 절차로 dev 현재 상태 백업 완료
- [ ] 테스트 담당자 확인: __________________
- [ ] 테스트 시작 시각: __________________

---

## 1. 마이그레이션 적용 (BLOCK 1~3)

### Step 1-1. 적용 전 스키마 스냅샷
```sql
-- dev SQL Editor에서 실행 후 결과 저장
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('complexes', 'applications')
ORDER BY table_name, ordinal_position;
```
- [ ] 실행 완료. 결과 저장 위치: __________________

### Step 1-2. BLOCK 1~3 일괄 적용
```
1. dev Supabase 대시보드 → SQL Editor
2. 20260607_a2_add_hotel_mode_columns.sql 전체 내용 붙여넣기
3. BLOCK 4 (BEGIN; UPDATE ... COMMIT;) 부분만 선택 해제 또는 주석 처리
4. BLOCK 1~3만 실행
```
- [ ] BLOCK 1 (complexes 컬럼 추가) 실행 완료, 오류 없음
- [ ] BLOCK 2 (applications 컬럼 추가) 실행 완료, 오류 없음
- [ ] BLOCK 3 (신규 테이블 5개 생성) 실행 완료, 오류 없음

---

## 2. BLOCK 1~3 적용 후 검증

### 검증 A — 기존 단지 신청 조회 정상 여부 ⭐ 핵심

```sql
-- 기존 아파트 단지 applications 조회 (기존 컬럼 정상 동작 확인)
SELECT id, dong, ho, name, status, program_name, preferred_time
FROM applications
WHERE complex_id = (SELECT id FROM complexes WHERE code = 'apt-cjxi')
ORDER BY created_at DESC
LIMIT 5;
```
- [ ] 결과 5건 이내 정상 반환
- [ ] 반환 컬럼 값 이상 없음 (NULL 오염 없음)

```sql
SELECT id, dong, ho, name, status, program_name, preferred_time
FROM applications
WHERE complex_id = (SELECT id FROM complexes WHERE code = 'apt-sclass')
ORDER BY created_at DESC
LIMIT 5;
```
- [ ] 결과 5건 이내 정상 반환

### 검증 B — 기존 단지 전체 row 수 유지 여부

```sql
SELECT
    c.code,
    COUNT(a.id) AS application_count
FROM complexes c
LEFT JOIN applications a ON a.complex_id = c.id
GROUP BY c.code
ORDER BY c.code;
```

| code | 기대 건수 | 실제 건수 | 일치 여부 |
|---|---|---|---|
| `apt-cjxi` | 212 | | ☐ |
| `apt-sclass` | 82 | | ☐ |
| `ht-lamada` | 0 | | ☐ |
| `test-sk` | 2 | | ☐ |

- [ ] 전체 합계 296건 일치

### 검증 C — 신규 컬럼 DEFAULT 값 정상 여부

```sql
-- 기존 아파트 단지 row에 DEFAULT 값이 올바르게 적용되었는지 확인
SELECT
    COUNT(*) FILTER (WHERE venue_type = 'apartment')  AS cx_apartment,
    COUNT(*) FILTER (WHERE venue_type = 'hotel')      AS cx_hotel,
    COUNT(*) FILTER (WHERE venue_type IS NULL)        AS cx_null,
    COUNT(*) FILTER (WHERE hotel_billing_enabled = FALSE) AS cx_billing_false
FROM complexes;
```
- [ ] `cx_null = 0` (DEFAULT 미적용 행 없음)
- [ ] `cx_apartment = 3` (apt-cjxi, apt-sclass, test-sk)
- [ ] `cx_hotel = 1` (ht-lamada — BLOCK 4 이전이므로 아직 'apartment')
  > ※ BLOCK 4 실행 전이면 `cx_apartment = 4`, `cx_hotel = 0` 이 정상

```sql
-- applications 테이블 신규 컬럼 DEFAULT 확인
SELECT
    COUNT(*) FILTER (WHERE user_type = 'member')  AS app_member,
    COUNT(*) FILTER (WHERE user_type IS NULL)      AS app_null,
    COUNT(*) FILTER (WHERE discount_rate = 0)     AS app_discount_zero,
    COUNT(*) FILTER (WHERE room_number IS NULL)   AS app_no_room
FROM applications;
```
- [ ] `app_null = 0` (user_type DEFAULT 미적용 없음)
- [ ] `app_member = 296` (기존 전체 행 모두 'member')
- [ ] `app_discount_zero = 296`

### 검증 D — 신규 테이블 5개 생성 확인

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'member_tokens', 'hotel_staff', 'workout_reports',
      'discount_codes', 'meal_orders'
  )
ORDER BY table_name;
```
- [ ] 5개 테이블 모두 반환됨
- [ ] 각 테이블 row 수 = 0 확인

### 검증 E — 관리자 API 정상 동작 (서버 연결 환경에서 확인)

```
GET /api/applications?complex_id=<apt-cjxi의 UUID>
→ 200 OK, applications 배열 반환
```
- [ ] 기존 단지 API 정상 응답
- [ ] 응답 JSON에 예상치 못한 필드 오염 없음

---

## 3. BLOCK 4 적용 (ht-lamada UPDATE)

### Step 3-1. BLOCK 4만 별도 실행

```sql
-- BLOCK 4 트랜잭션 블록만 선택 후 실행
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
- [ ] COMMIT 완료, 오류 없음

### Step 3-2. ht-lamada venue_type 확인

```sql
SELECT code, name, venue_type, hotel_billing_enabled
FROM complexes
WHERE code = 'ht-lamada';
```
- [ ] `venue_type = 'hotel'` 확인
- [ ] `hotel_billing_enabled = FALSE` 확인

---

## 4. 롤백 테스트 (전체 사이클 완성용)

> **목적**: 롤백 파일이 실제로 작동하는지 dev에서 반드시 1회 검증한다.

### Step 4-1. 롤백 실행

```
1. dev SQL Editor
2. 20260607_a2_add_hotel_mode_columns.rollback.sql 전체 실행
3. 오류 없이 완료되는지 확인
```
- [ ] ROLLBACK BLOCK 4 (ht-lamada → apartment) 완료
- [ ] ROLLBACK BLOCK 3 (신규 테이블 5개 DROP) 완료
- [ ] ROLLBACK BLOCK 2 (applications 컬럼 6개 DROP) 완료
- [ ] ROLLBACK BLOCK 1 (complexes 컬럼 3개 DROP) 완료

### Step 4-2. 롤백 후 검증

```sql
-- 컬럼이 제거되었는지 확인 (결과 0건이어야 정상)
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('complexes', 'applications')
  AND column_name IN (
      'venue_type', 'pms_integration', 'hotel_billing_enabled',
      'user_type', 'room_number', 'checkin_date', 'checkout_date',
      'discount_rate', 'converted_from'
  );
```
- [ ] 결과 0건 (컬럼 완전 제거 확인)

```sql
-- 신규 테이블이 제거되었는지 확인 (결과 0건이어야 정상)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'member_tokens', 'hotel_staff', 'workout_reports',
      'discount_codes', 'meal_orders'
  );
```
- [ ] 결과 0건 (테이블 완전 제거 확인)

```sql
-- 기존 단지 데이터 정상 유지 확인 (롤백 후에도 296건 유지)
SELECT COUNT(*) FROM applications;
```
- [ ] `296` 확인

### Step 4-3. 마이그레이션 재적용 (재실행 안전성 검증)

```
롤백 직후 마이그레이션 파일을 다시 실행하여 IF NOT EXISTS 가 정상 작동하는지 확인
```
- [ ] 재실행 오류 없음
- [ ] 검증 A~E 재확인 통과

---

## 5. 테스트 결과 기록

| 검증 항목 | 결과 | 비고 |
|---|---|---|
| 검증 A — 기존 단지 조회 정상 | ☐ 통과 / ☐ 실패 | |
| 검증 B — row 수 유지 296건 | ☐ 통과 / ☐ 실패 | |
| 검증 C — DEFAULT 값 정상 | ☐ 통과 / ☐ 실패 | |
| 검증 D — 신규 테이블 5개 생성 | ☐ 통과 / ☐ 실패 | |
| 검증 E — 관리자 API 정상 | ☐ 통과 / ☐ 실패 | |
| ht-lamada venue_type='hotel' | ☐ 통과 / ☐ 실패 | |
| 롤백 성공 | ☐ 통과 / ☐ 실패 | |
| 재적용 성공 | ☐ 통과 / ☐ 실패 | |

- **테스트 완료 시각**: __________________
- **테스트 담당자**: __________________
- **prod 적용 승인 여부**: ☐ 승인 / ☐ 보류 (사유: __________________)

---

*모든 항목이 통과(☐ 없음)된 후에만 `A2-APPLY-PROCEDURE.md` §3 prod 적용 단계로 진입한다.*
