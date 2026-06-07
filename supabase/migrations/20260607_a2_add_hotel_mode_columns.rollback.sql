-- ================================================================
-- 20260607_a2_add_hotel_mode_columns.rollback.sql
-- 단계: A-2 롤백 (호텔 모드 DB 마이그레이션 역순 되돌리기)
-- 목적: 20260607_a2_add_hotel_mode_columns.sql 적용을 완전히 되돌린다.
--
-- 실행 조건:
--   - 마이그레이션 적용 후 문제가 발생한 경우에만 실행
--   - 반드시 A1-ROLLBACK-RUNBOOK.md §3 DB 복구 판단 기준 확인 후 실행
--   - 호텔 모드 신규 테이블에 실제 데이터가 쌓인 후 실행 시 데이터 소실 주의
--
-- 역순 구성 (마이그레이션의 정확히 역순):
--   BLOCK 4 롤백 → BLOCK 3 롤백 → BLOCK 2 롤백 → BLOCK 1 롤백
--
-- 안전 보장:
--   - DROP COLUMN IF EXISTS 사용 (컬럼이 없어도 오류 없음)
--   - DROP TABLE IF EXISTS 사용 (테이블이 없어도 오류 없음)
--   - 기존 아파트 단지 컬럼/테이블에 영향 없음
--
-- 작성일: 2026-06-07
-- ================================================================


-- ================================================================
-- ROLLBACK BLOCK 4: ht-lamada 단지 venue_type 원상복구
-- (마이그레이션 BLOCK 4의 역순)
-- ================================================================

BEGIN;

    UPDATE complexes
    SET
        venue_type            = 'apartment',
        hotel_billing_enabled = FALSE
    WHERE
        code = 'ht-lamada';

    -- 복구 검증: 1건이 변경되어야 정상
    DO $$
    DECLARE
        v_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count
        FROM complexes
        WHERE code = 'ht-lamada' AND venue_type = 'apartment';

        IF v_count <> 1 THEN
            RAISE EXCEPTION
                'ht-lamada 롤백 검증 실패: venue_type=apartment 행이 % 건 (기대값: 1)', v_count;
        END IF;
    END $$;

COMMIT;


-- ================================================================
-- ROLLBACK BLOCK 3-5: meal_orders 테이블 삭제
-- (마이그레이션 BLOCK 3-5의 역순)
-- ================================================================
-- ⚠️  주의: 실제 주문 데이터가 존재하면 영구 소실. 실행 전 확인 필수.
--   SELECT COUNT(*) FROM meal_orders;
-- ================================================================

DROP TABLE IF EXISTS meal_orders;


-- ================================================================
-- ROLLBACK BLOCK 3-4: discount_codes 테이블 삭제
-- (마이그레이션 BLOCK 3-4의 역순)
-- ================================================================
-- ⚠️  주의: 발급된 할인 코드 데이터가 영구 소실.
--   SELECT COUNT(*) FROM discount_codes;
-- ================================================================

DROP TABLE IF EXISTS discount_codes;


-- ================================================================
-- ROLLBACK BLOCK 3-3: workout_reports 테이블 삭제
-- (마이그레이션 BLOCK 3-3의 역순)
-- ================================================================
-- ⚠️  주의: 운동 측정 리포트 데이터가 영구 소실.
--   SELECT COUNT(*) FROM workout_reports;
-- ================================================================

DROP TABLE IF EXISTS workout_reports;


-- ================================================================
-- ROLLBACK BLOCK 3-2: hotel_staff 테이블 삭제
-- (마이그레이션 BLOCK 3-2의 역순)
-- ================================================================
-- ⚠️  주의: 등록된 직원 데이터가 영구 소실.
--   SELECT COUNT(*) FROM hotel_staff;
-- ================================================================

DROP TABLE IF EXISTS hotel_staff;


-- ================================================================
-- ROLLBACK BLOCK 3-1: member_tokens 테이블 삭제
-- (마이그레이션 BLOCK 3-1의 역순)
-- ================================================================
-- ⚠️  주의: 발급된 토큰 데이터가 영구 소실 (만료 토큰 포함).
--   SELECT COUNT(*) FROM member_tokens;
-- ================================================================

DROP TABLE IF EXISTS member_tokens;


-- ================================================================
-- ROLLBACK BLOCK 2: applications 테이블 — 추가 컬럼 제거
-- (마이그레이션 BLOCK 2의 역순)
-- ================================================================
-- ⚠️  주의: 아파트 단지 기존 296건 row에는 이 컬럼들이 DEFAULT값으로
--     채워져 있으므로, DROP 후에도 기존 데이터에 영향 없음.
--     단, 호텔 단지에서 이 컬럼에 실제 데이터를 입력한 경우 소실.
-- ================================================================

ALTER TABLE applications
    DROP COLUMN IF EXISTS converted_from;

ALTER TABLE applications
    DROP COLUMN IF EXISTS discount_rate;

ALTER TABLE applications
    DROP COLUMN IF EXISTS checkout_date;

ALTER TABLE applications
    DROP COLUMN IF EXISTS checkin_date;

ALTER TABLE applications
    DROP COLUMN IF EXISTS room_number;

ALTER TABLE applications
    DROP COLUMN IF EXISTS user_type;


-- ================================================================
-- ROLLBACK BLOCK 1: complexes 테이블 — 추가 컬럼 제거
-- (마이그레이션 BLOCK 1의 역순)
-- ================================================================
-- ⚠️  주의: 아파트 단지 행들은 venue_type='apartment'(DEFAULT)이므로
--     DROP 후에도 기존 데이터에 영향 없음.
--     단, hotel_billing_enabled / pms_integration에 설정값이
--     있는 경우 소실.
-- ================================================================

ALTER TABLE complexes
    DROP COLUMN IF EXISTS hotel_billing_enabled;

ALTER TABLE complexes
    DROP COLUMN IF EXISTS pms_integration;

ALTER TABLE complexes
    DROP COLUMN IF EXISTS venue_type;


-- ================================================================
-- 롤백 완료 검증 쿼리 (실행 후 결과 확인용)
-- ================================================================
-- 아래 쿼리를 실행하여 컬럼이 제거되었는지 확인한다.
-- 결과가 0건이면 롤백 성공.
--
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('complexes', 'applications')
--   AND column_name IN (
--       'venue_type', 'pms_integration', 'hotel_billing_enabled',
--       'user_type', 'room_number', 'checkin_date', 'checkout_date',
--       'discount_rate', 'converted_from'
--   );
--
-- 신규 테이블이 제거되었는지 확인 (결과가 0건이면 롤백 성공):
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN (
--       'member_tokens', 'hotel_staff', 'workout_reports',
--       'discount_codes', 'meal_orders'
--   );
-- ================================================================
