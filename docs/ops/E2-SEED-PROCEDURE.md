# E2-SEED-PROCEDURE: ht-lamada 시드 데이터 적용 절차

> **단계**: E-2  
> **작성일**: 2026-06-07  
> **대상 파일**:
> - `supabase/seeds/20260607_e2_ht_lamada_seed.sql` — 시드 삽입
> - `supabase/seeds/20260607_e2_ht_lamada_seed.rollback.sql` — 시드 롤백

---

## 1. 개요

ht-lamada 단지에 호텔 모드 운영에 필요한 초기 데이터를 등록한다.

| 항목 | 내용 |
|------|------|
| 대상 단지 | `code = 'ht-lamada'`, `venue_type = 'hotel'` |
| 삽입 데이터 | 트레이너 3명 + 프로그램 2개 |
| 기존 데이터 영향 | **없음** — `complex_id` 가드로 아파트 단지 완전 격리 |
| DB 직접 적용 여부 | **사용자가 결정** — 이 파일은 SQL 파일만 제공 |
| Feature Flag 변경 | **없음** — 시드와 무관, Flag는 E-1 절차 참조 |

---

## 2. 사전 확인 쿼리

시드 적용 전에 아래 쿼리를 **Supabase SQL Editor**에서 실행하여 전제 조건을 확인한다.

### 2-1. ht-lamada 단지 존재 및 venue_type 확인

```sql
SELECT id, code, name, venue_type
FROM complexes
WHERE code = 'ht-lamada';
```

**기대 결과**: 1행, `venue_type = 'hotel'`  
미충족 시 → A-3 마이그레이션(`20260607_a2_add_hotel_mode_columns.sql`) 적용 여부 점검

---

### 2-2. 기존 트레이너/프로그램 중복 확인

```sql
-- 이미 동일 이름의 트레이너가 등록되어 있는지 확인
SELECT i.name, i.title, i.is_active
FROM instructors i
JOIN complexes c ON c.id = i.complex_id
WHERE c.code = 'ht-lamada'
  AND i.name IN ('전민수', '이도현', '유기현');

-- 이미 동일 이름의 프로그램이 등록되어 있는지 확인
SELECT p.name, p.type, p.price, p.is_active
FROM programs p
JOIN complexes c ON c.id = p.complex_id
WHERE c.code = 'ht-lamada'
  AND p.name IN ('아세로 순환 운동 클래스', '리프레시 PT');
```

**기대 결과**: 0행 (미등록 상태)  
이미 행이 있다면 → 시드 SQL의 `IF NOT EXISTS` 가드가 건너뛰므로 안전하지만, 내용 불일치 여부를 수동 확인 권고

---

### 2-3. 아파트 단지 데이터 격리 확인 (선택)

```sql
-- 시드 적용이 아파트 단지에 영향 없음을 사전 베이스라인으로 기록
SELECT c.code, c.venue_type, COUNT(i.id) AS trainer_count
FROM complexes c
LEFT JOIN instructors i ON i.complex_id = c.id
WHERE c.code IN ('apt-cjxi', 'apt-sclass', 'test-sk')
GROUP BY c.code, c.venue_type;
```

시드 적용 후 동일 쿼리 재실행하여 COUNT 변화 없음을 확인.

---

## 3. 시드 적용 절차

### 방법 A — 전체 실행 (권장)

1. **Supabase Dashboard** → **SQL Editor** 진입
2. `supabase/seeds/20260607_e2_ht_lamada_seed.sql` 전체 내용 복사 → 붙여넣기
3. **Run** 클릭
4. `NOTICE` 메시지에서 BLOCK 1~3 통과 여부 확인
5. BLOCK 4 SELECT 결과로 최종 등록 내용 검증 (섹션 4 참조)

> **중요**: 전체가 하나의 `BEGIN ~ COMMIT` 트랜잭션이므로  
> 어느 BLOCK에서 오류가 발생해도 전체 자동 ROLLBACK된다.

---

### 방법 B — BLOCK별 순차 실행 (디버깅용)

BLOCK 1~4를 각각 분리하여 독립 실행할 수 있다.  
단, 각 DO $$...$$; 블록 안에서 v_complex_id를 자체 조회하므로 단독 실행이 가능하다.

| 순서 | 내용 | 실패 시 |
|------|------|---------|
| BLOCK 1 | ht-lamada 존재 + venue_type 검증 | `RAISE EXCEPTION` 출력 → A-3 마이그레이션 확인 |
| BLOCK 2 | 트레이너 3명 INSERT (NOT EXISTS 가드) | FK / 타입 오류 → 컬럼 DDL 확인 |
| BLOCK 3 | 프로그램 2개 INSERT (NOT EXISTS 가드) | FK / 타입 오류 → programs DDL 확인 |
| BLOCK 4 | 결과 조회 SELECT | 읽기 전용, 오류 없음 |

> 방법 B 사용 시 BEGIN/COMMIT 없이 각 DO 블록만 실행하면  
> 자동커밋(DDL 기본값)으로 동작하므로 부분 적용 상태가 생길 수 있다.  
> **운영 환경에서는 방법 A(전체 트랜잭션)를 사용할 것.**

---

## 4. 적용 후 검증 쿼리

시드 적용이 완료되면 아래 쿼리로 등록 결과를 확인한다.

### 4-1. 트레이너 등록 확인

```sql
SELECT
    i.name,
    i.title,
    i.display_order,
    i.is_active,
    i.hourly_rates
FROM instructors i
JOIN complexes c ON c.id = i.complex_id
WHERE c.code = 'ht-lamada'
ORDER BY i.display_order;
```

**기대 결과**:

| name | title | display_order | is_active |
|------|-------|---------------|-----------|
| 전민수 | 팀장 | 1 | true |
| 이도현 | 매니저 | 2 | true |
| 유기현 | 트레이너 | 3 | true |

---

### 4-2. 프로그램 등록 확인

```sql
SELECT
    p.name,
    p.type,
    p.price,
    p.capacity,
    p.days,
    jsonb_array_length(p.time_slots) AS slot_count,
    p.is_active
FROM programs p
JOIN complexes c ON c.id = p.complex_id
WHERE c.code = 'ht-lamada'
ORDER BY p.display_order;
```

**기대 결과**:

| name | type | price | capacity | days | slot_count | is_active |
|------|------|-------|----------|------|-----------|-----------|
| 아세로 순환 운동 클래스 | group | 0 | 5 | 월, 수 | 1 | true |
| 리프레시 PT | personal | 40000 | 1 | 월, 화, 수, 목, 금, 토, 일 | **17** | true |

> `slot_count = 17` 확인 필수 — `refresh-pt.js`의 `buildAllSlots()` 와 동기화된 값.  
> 서버가 슬롯 유효성 검증 시 이 배열을 사용하므로 불일치 시 예약 오류 발생.

---

### 4-3. 리프레시 PT 슬롯 전체 목록 확인 (선택)

```sql
SELECT jsonb_array_elements_text(p.time_slots) AS slot
FROM programs p
JOIN complexes c ON c.id = p.complex_id
WHERE c.code = 'ht-lamada'
  AND p.name = '리프레시 PT'
ORDER BY slot;
```

**기대 결과**: `09:00`, `09:45`, `10:30`, `11:15`, `12:00`, `12:45`, `13:30`, `14:15`, `15:00`, `15:45`, `16:30`, `17:15`, `18:00`, `18:45`, `19:30`, `20:15` … 총 17개

> 마지막 슬롯은 `20:15` (시작 기준, 45분 세션이므로 20:15~21:00 진행)

---

### 4-4. 아파트 단지 격리 검증 (사후 확인)

```sql
-- 시드 적용 후에도 아파트 단지 데이터 변화 없음을 확인
SELECT c.code, c.venue_type, COUNT(i.id) AS trainer_count
FROM complexes c
LEFT JOIN instructors i ON i.complex_id = c.id
WHERE c.code IN ('apt-cjxi', 'apt-sclass', 'test-sk')
GROUP BY c.code, c.venue_type;
```

**기대 결과**: 섹션 2-3의 사전 COUNT와 동일

---

## 5. 롤백 절차

시드 데이터를 제거해야 하는 경우 다음 순서로 진행한다.

### 5-1. 롤백 전 의존성 확인

```sql
-- ht-lamada 신청 건수 확인 (있으면 applications 먼저 정리 필요)
SELECT COUNT(*) AS application_count
FROM applications a
JOIN complexes c ON c.id = a.complex_id
WHERE c.code = 'ht-lamada';

-- ht-lamada 운동 리포트 건수 확인
SELECT COUNT(*) AS report_count
FROM workout_reports wr
JOIN applications a ON a.id = wr.application_id
JOIN complexes c ON c.id = a.complex_id
WHERE c.code = 'ht-lamada';
```

> 위 쿼리 결과가 모두 0이어야 롤백이 FK 오류 없이 진행된다.  
> 0이 아닌 경우 → 해당 데이터를 먼저 삭제하거나 담당자와 협의 후 진행.

---

### 5-2. Feature Flag 확인 (운영 중 롤백 시)

호텔 모드 Flag가 ON 상태에서 트레이너/프로그램을 삭제하면  
투숙객 API가 빈 응답을 반환하게 된다.

**운영 중 롤백 순서**:
1. `ENABLE_HOTEL_MODE=false` 설정 후 Vercel 재배포 (→ `E1-INTEGRATION-TEST.md` 섹션 6)
2. 서버 `/api/hotel/*` 전체 404 반환 확인
3. 롤백 SQL 실행

---

### 5-3. 롤백 SQL 실행

1. **Supabase Dashboard** → **SQL Editor** 진입
2. `supabase/seeds/20260607_e2_ht_lamada_seed.rollback.sql` 전체 내용 복사 → 붙여넣기
3. **Run** 클릭
4. `NOTICE` 메시지에서 각 BLOCK 삭제 건수 확인
5. BLOCK 4 SELECT 결과에서 `remaining_count = 0` 확인

---

### 5-4. 롤백 후 검증

```sql
-- 롤백 완료 후 ht-lamada 데이터 잔여 없음 확인
SELECT
    'instructors' AS tbl,
    COUNT(*) AS cnt
FROM instructors i
JOIN complexes c ON c.id = i.complex_id
WHERE c.code = 'ht-lamada'
UNION ALL
SELECT
    'programs' AS tbl,
    COUNT(*) AS cnt
FROM programs p
JOIN complexes c ON c.id = p.complex_id
WHERE c.code = 'ht-lamada';
```

**기대 결과**: 두 행 모두 `cnt = 0`

---

## 6. 트레이너 사진 교체 방법 (시드 적용 후)

시드에 삽입된 `photo_url`은 placeholder URL이다.  
실제 사진 등록 절차:

1. **Supabase Storage** → `trainer-photos` 버킷에 이미지 업로드
2. 공개 URL 복사
3. 아래 UPDATE 쿼리로 교체:

```sql
UPDATE instructors
   SET photo_url = '실제_Supabase_Storage_URL'
 WHERE complex_id = (SELECT id FROM complexes WHERE code = 'ht-lamada')
   AND name = '전민수';  -- 각 트레이너별 반복
```

---

## 7. 관련 문서

| 문서 | 설명 |
|------|------|
| `docs/ops/A4-FEATURE-FLAGS.md` | Feature Flag 활성화 절차 (Vercel 환경 변수) |
| `docs/ops/E1-INTEGRATION-TEST.md` | 호텔 모드 통합 테스트 시나리오 (Flag ON 절차 포함) |
| `docs/ops/D3-HOTEL-WORKOUT-REPORTS.md` | 운동 리포트 관리 페이지 운영 절차 |
| `scripts/sh/e1-smoke-test.sh` | 호텔 모드 스모크 테스트 (시드 적용 후 검증 자동화) |
| `supabase/migrations/20260607_a2_add_hotel_mode_columns.sql` | 호텔 모드 컬럼 마이그레이션 (시드의 전제 조건) |
