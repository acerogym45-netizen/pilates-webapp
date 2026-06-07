-- =============================================================================
-- supabase/seeds/20260607_e2_ht_lamada_seed.rollback.sql
-- ht-lamada 단지 기본 시드 데이터 롤백 (삭제)
--
-- 목적: 20260607_e2_ht_lamada_seed.sql 에서 삽입한 데이터를 제거한다.
--   - 트레이너 3명 삭제 (전민수, 이도현, 유기현)
--   - 프로그램 2개 삭제 (아세로 순환 운동 클래스, 리프레시 PT)
--
-- 안전 보장 (이중 가드):
--   1. complex_id 가드: ht-lamada 의 UUID를 직접 조회하여 WHERE complex_id = v_complex_id
--      → 다른 아파트 단지(apt-cjxi, apt-sclass 등) 행은 절대 영향 없음
--   2. name 가드: 시드에서 삽입한 정확한 이름만 대상
--
-- 실행 전 확인:
--   - ht-lamada 단지가 아직 활성 운영 중이 아닌지 점검
--   - 해당 트레이너/프로그램에 연결된 applications, workout_reports 가 없는지 확인
--   (있다면 먼저 해당 데이터를 정리한 후 롤백 실행)
--
-- 적용 방법:
--   Supabase SQL Editor에서 이 파일 전체를 붙여넣고 실행.
--   상세 절차 → docs/ops/E2-SEED-PROCEDURE.md 섹션 4 참조
--
-- 단계: E-2 / 작성일: 2026-06-07
-- =============================================================================

BEGIN;

-- ============================================================================
-- BLOCK 1: ht-lamada complex_id 조회 및 검증
--
--   단지가 없으면 롤백 대상 자체가 없으므로 안전하게 RAISE EXCEPTION으로 종료.
--   이후 BLOCK들은 v_complex_id 에 의존한다.
-- ============================================================================

DO $$
DECLARE
    v_complex_id UUID;
    v_venue_type TEXT;
BEGIN
    SELECT id, venue_type
      INTO v_complex_id, v_venue_type
      FROM complexes
     WHERE code = 'ht-lamada';

    IF v_complex_id IS NULL THEN
        RAISE EXCEPTION
            'ROLLBACK BLOCK-1 실패: ht-lamada 단지를 찾을 수 없습니다. '
            '이미 단지가 삭제되었거나 code가 변경된 경우 수동으로 확인하세요.';
    END IF;

    RAISE NOTICE 'ROLLBACK BLOCK-1 통과: ht-lamada (id=%) venue_type=% 확인',
        v_complex_id, v_venue_type;
END $$;


-- ============================================================================
-- BLOCK 2: 트레이너 3명 DELETE
--
--   조건: complex_id = v_complex_id (ht-lamada UUID)
--         AND name IN ('전민수', '이도현', '유기현')
--
--   ※ 다른 단지의 동명 트레이너는 complex_id 가드로 보호됨.
--   ※ 해당 트레이너에 연결된 workout_reports가 있으면
--      FK 제약 위반으로 실패할 수 있으므로 사전 확인 필수.
-- ============================================================================

DO $$
DECLARE
    v_complex_id UUID;
    v_deleted    INTEGER;
BEGIN
    SELECT id INTO v_complex_id FROM complexes WHERE code = 'ht-lamada';

    DELETE FROM instructors
     WHERE complex_id = v_complex_id
       AND name IN ('전민수', '이도현', '유기현');

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RAISE NOTICE 'ROLLBACK BLOCK-2: 트레이너 % 명 삭제 완료 (complex_id=%, 대상: 전민수/이도현/유기현)',
        v_deleted, v_complex_id;

    IF v_deleted = 0 THEN
        RAISE NOTICE 'ROLLBACK BLOCK-2: 삭제 대상 트레이너 없음 — 이미 롤백되었거나 미적용 상태';
    END IF;
END $$;


-- ============================================================================
-- BLOCK 3: 프로그램 2개 DELETE
--
--   조건: complex_id = v_complex_id (ht-lamada UUID)
--         AND name IN ('아세로 순환 운동 클래스', '리프레시 PT')
--
--   ※ 다른 단지의 동명 프로그램은 complex_id 가드로 보호됨.
--   ※ 해당 프로그램에 연결된 applications / quick_class_reservations 가 있으면
--      FK 제약 위반으로 실패할 수 있으므로 사전 확인 필수.
-- ============================================================================

DO $$
DECLARE
    v_complex_id UUID;
    v_deleted    INTEGER;
BEGIN
    SELECT id INTO v_complex_id FROM complexes WHERE code = 'ht-lamada';

    DELETE FROM programs
     WHERE complex_id = v_complex_id
       AND name IN ('아세로 순환 운동 클래스', '리프레시 PT');

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RAISE NOTICE 'ROLLBACK BLOCK-3: 프로그램 % 개 삭제 완료 (complex_id=%, 대상: 아세로 순환 운동 클래스/리프레시 PT)',
        v_deleted, v_complex_id;

    IF v_deleted = 0 THEN
        RAISE NOTICE 'ROLLBACK BLOCK-3: 삭제 대상 프로그램 없음 — 이미 롤백되었거나 미적용 상태';
    END IF;
END $$;


-- ============================================================================
-- BLOCK 4: 롤백 후 잔여 데이터 확인 (READ ONLY)
--
--   아래 결과에서:
--   - ht-lamada 트레이너 COUNT = 0 이어야 정상 (전민수/이도현/유기현 삭제 확인)
--   - ht-lamada 프로그램 COUNT = 0 이어야 정상 (시드 데이터 삭제 확인)
--   - 다른 단지(apt-*)의 데이터는 이 쿼리 범위 밖이므로 영향 없음
-- ============================================================================

-- 롤백 후 ht-lamada 트레이너 잔여 확인
SELECT
    'ht-lamada 잔여 트레이너' AS check_target,
    COUNT(*) AS remaining_count
FROM instructors i
JOIN complexes c ON c.id = i.complex_id
WHERE c.code = 'ht-lamada';

-- 롤백 후 ht-lamada 프로그램 잔여 확인
SELECT
    'ht-lamada 잔여 프로그램' AS check_target,
    COUNT(*) AS remaining_count
FROM programs p
JOIN complexes c ON c.id = p.complex_id
WHERE c.code = 'ht-lamada';

COMMIT;

-- =============================================================================
-- 롤백 완료 메시지
-- 위 SELECT 결과에서 다음을 확인한다:
--   - ht-lamada 잔여 트레이너 remaining_count = 0
--   - ht-lamada 잔여 프로그램 remaining_count = 0
--
-- 주의:
--   롤백 후 ENABLE_HOTEL_MODE Flag가 ON 상태라면
--   /api/hotel/refresh-pt/instructors, /api/hotel/quick-class/availability
--   엔드포인트가 빈 데이터를 반환하게 된다.
--   운영 중 롤백이 필요하다면 반드시 Flag를 먼저 OFF한 후 실행할 것.
--   → docs/ops/E1-INTEGRATION-TEST.md 섹션 6 "Flag 즉시 OFF 절차" 참조
-- =============================================================================
