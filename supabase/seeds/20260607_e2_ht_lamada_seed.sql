-- =============================================================================
-- supabase/seeds/20260607_e2_ht_lamada_seed.sql
-- ht-lamada 단지 기본 시드 데이터 삽입
--
-- 목적: 호텔 모드 운영에 필요한 최소 초기 데이터를 등록한다.
--   - 트레이너 3명 (전민수, 이도현, 유기현)
--   - 프로그램 2개 (아세로 순환 운동 클래스, 리프레시 PT)
--
-- 전제 조건:
--   - ht-lamada 단지가 complexes 테이블에 venue_type='hotel'로 존재해야 한다.
--   - A-3 마이그레이션(20260607_a2_add_hotel_mode_columns.sql)이 적용된 상태여야 한다.
--
-- 안전 보장:
--   - 전체 DML을 하나의 트랜잭션으로 묶는다 (실패 시 ROLLBACK).
--   - 중복 방지: INSERT ... WHERE NOT EXISTS 패턴 사용
--     → 동일 이름의 트레이너/프로그램이 같은 단지에 이미 있으면 건너뜀.
--   - complex_id 가드: 모든 INSERT에 ht-lamada의 UUID를 명시
--     → 기존 아파트 단지(apt-cjxi, apt-sclass 등) 데이터에 절대 영향 없음.
--   - 출입 로그 / 혼잡도 / 인원카운트 관련 데이터 없음.
--
-- 적용 방법:
--   Supabase SQL Editor에서 이 파일 전체를 붙여넣고 실행.
--   (BLOCK별 순차 실행 가능 — docs/ops/E2-SEED-PROCEDURE.md 참조)
--
-- 롤백:
--   supabase/seeds/20260607_e2_ht_lamada_seed.rollback.sql 실행
--
-- 단계: E-2 / 작성일: 2026-06-07
-- =============================================================================

BEGIN;

-- ============================================================================
-- BLOCK 1: ht-lamada 단지 존재 및 venue_type 사전 확인
--
--   ht-lamada 단지가 없거나 venue_type이 'hotel'이 아니면
--   RAISE EXCEPTION으로 전체 트랜잭션을 ROLLBACK한다.
--   이후 BLOCK들은 이 검사가 통과한 경우에만 실행된다.
-- ============================================================================

DO $$
DECLARE
    v_complex_id  UUID;
    v_venue_type  TEXT;
BEGIN
    SELECT id, venue_type
      INTO v_complex_id, v_venue_type
      FROM complexes
     WHERE code = 'ht-lamada';

    IF v_complex_id IS NULL THEN
        RAISE EXCEPTION
            'BLOCK-1 실패: ht-lamada 단지를 찾을 수 없습니다. '
            'complexes 테이블에 code=''ht-lamada'' 행이 있는지 확인하세요.';
    END IF;

    IF v_venue_type <> 'hotel' THEN
        RAISE EXCEPTION
            'BLOCK-1 실패: ht-lamada 단지의 venue_type이 ''hotel''이 아닙니다 (현재: %). '
            'A-3 마이그레이션이 적용되었는지 확인하세요.', v_venue_type;
    END IF;

    RAISE NOTICE 'BLOCK-1 통과: ht-lamada (id=%) venue_type=hotel 확인', v_complex_id;
END $$;


-- ============================================================================
-- BLOCK 2: 트레이너 3명 INSERT
--
--   대상 테이블: instructors
--
--   트레이너 정보:
--     1. 전민수 (팀장) — 통증완화 / 재활 / 기능적 움직임 전문
--     2. 이도현 (매니저) — 움직임 교정 / FMS 평가 전문
--     3. 유기현 (트레이너) — 리프팅 / 체형 디자인 전문
--
--   중복 방지:
--     동일 complex_id + 동일 name 조합이 이미 존재하면 INSERT 건너뜀.
--     (ON CONFLICT 미사용 — instructors에 (complex_id, name) UNIQUE가 없으므로
--      EXISTS 체크로 대체)
--
--   photo_url:
--     실제 사진은 추후 Supabase Storage에 업로드 후 UPDATE로 교체.
--     현재는 placeholder URL 사용.
--
--   컬럼 기준: misc.js POST /instructors INSERT 필드 (D-2.5 이전 기존 코드)
--     complex_id, name, title, bio, photo_url, display_order,
--     hourly_rates (JSONB), assigned_programs (JSONB 배열),
--     is_active, phone, bank_account, rrn, contract_start, contract_end
-- ============================================================================

DO $$
DECLARE
    v_complex_id UUID;
    v_inserted   INTEGER := 0;
    v_skipped    INTEGER := 0;
BEGIN
    SELECT id INTO v_complex_id FROM complexes WHERE code = 'ht-lamada';

    -- ── 트레이너 1: 전민수 팀장 ──────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM instructors
         WHERE complex_id = v_complex_id
           AND name = '전민수'
    ) THEN
        INSERT INTO instructors (
            complex_id,
            name,
            title,
            bio,
            photo_url,
            display_order,
            hourly_rates,
            assigned_programs,
            is_active,
            phone,
            bank_account,
            rrn,
            contract_start,
            contract_end
        ) VALUES (
            v_complex_id,
            '전민수',
            '팀장',
            '통증완화·재활·기능적 움직임 전문 트레이너. FMS 레벨2 자격 보유. '
            '투숙객의 피로 회복과 부상 예방에 최적화된 프로그램을 제공합니다.',
            'https://placeholder.example.com/trainers/jeon-minsu.jpg',
            1,
            '{"group": 0, "private": 80000, "duet": 50000}'::JSONB,
            '[]'::JSONB,
            TRUE,
            '',
            '',
            '',
            NULL,
            NULL
        );
        v_inserted := v_inserted + 1;
        RAISE NOTICE 'BLOCK-2: 전민수 트레이너 INSERT 완료';
    ELSE
        v_skipped := v_skipped + 1;
        RAISE NOTICE 'BLOCK-2: 전민수 트레이너 이미 존재 — 건너뜀';
    END IF;

    -- ── 트레이너 2: 이도현 매니저 ────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM instructors
         WHERE complex_id = v_complex_id
           AND name = '이도현'
    ) THEN
        INSERT INTO instructors (
            complex_id,
            name,
            title,
            bio,
            photo_url,
            display_order,
            hourly_rates,
            assigned_programs,
            is_active,
            phone,
            bank_account,
            rrn,
            contract_start,
            contract_end
        ) VALUES (
            v_complex_id,
            '이도현',
            '매니저',
            '움직임 교정·FMS 평가 전문 트레이너. '
            '체계적인 동작 분석으로 회원 개개인의 움직임 패턴을 개선합니다. '
            '리프레시 PT 세션에서 FMS 7동작 평가 후 맞춤 운동을 처방합니다.',
            'https://placeholder.example.com/trainers/lee-dohyun.jpg',
            2,
            '{"group": 0, "private": 80000, "duet": 50000}'::JSONB,
            '[]'::JSONB,
            TRUE,
            '',
            '',
            '',
            NULL,
            NULL
        );
        v_inserted := v_inserted + 1;
        RAISE NOTICE 'BLOCK-2: 이도현 트레이너 INSERT 완료';
    ELSE
        v_skipped := v_skipped + 1;
        RAISE NOTICE 'BLOCK-2: 이도현 트레이너 이미 존재 — 건너뜀';
    END IF;

    -- ── 트레이너 3: 유기현 트레이너 ──────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM instructors
         WHERE complex_id = v_complex_id
           AND name = '유기현'
    ) THEN
        INSERT INTO instructors (
            complex_id,
            name,
            title,
            bio,
            photo_url,
            display_order,
            hourly_rates,
            assigned_programs,
            is_active,
            phone,
            bank_account,
            rrn,
            contract_start,
            contract_end
        ) VALUES (
            v_complex_id,
            '유기현',
            '트레이너',
            '리프팅·체형 디자인 전문 트레이너. '
            '근력 강화와 체형 교정을 통해 투숙객의 몸 상태를 최상으로 끌어올립니다. '
            '짧은 숙박 기간 내 최대 효과를 위한 집중 세션을 설계합니다.',
            'https://placeholder.example.com/trainers/yoo-gihyun.jpg',
            3,
            '{"group": 0, "private": 80000, "duet": 50000}'::JSONB,
            '[]'::JSONB,
            TRUE,
            '',
            '',
            '',
            NULL,
            NULL
        );
        v_inserted := v_inserted + 1;
        RAISE NOTICE 'BLOCK-2: 유기현 트레이너 INSERT 완료';
    ELSE
        v_skipped := v_skipped + 1;
        RAISE NOTICE 'BLOCK-2: 유기현 트레이너 이미 존재 — 건너뜀';
    END IF;

    RAISE NOTICE 'BLOCK-2 완료: 신규 등록 % 명, 건너뜀 % 명', v_inserted, v_skipped;
END $$;


-- ============================================================================
-- BLOCK 3: 프로그램 2개 INSERT
--
--   대상 테이블: programs
--
--   프로그램 정보:
--     1. 아세로 순환 운동 클래스
--        - type: 'group'
--        - price: 0 (무료 — quick-class API의 price=0 검증 통과 조건)
--        - capacity: 5 (정원 5명)
--        - time_slots: ['10:00'] (오전 10시 1회)
--        - days: '월, 수' (주 2회)
--        - duration_days: NULL (투숙 기간 종속, 별도 만료일 없음)
--
--     2. 리프레시 PT
--        - type: 'personal'
--        - price: 40000 (1회 40,000원)
--        - capacity: 1 (1:1 세션)
--        - time_slots: 09:00 ~ 20:15, 45분 간격 전체 슬롯
--          (refresh-pt.js buildAllSlots() 와 동일 — 서버가 이 슬롯을 기준으로 검증)
--        - days: '월, 화, 수, 목, 금, 토, 일' (매일 운영)
--        - duration_days: NULL
--
--   중복 방지:
--     동일 complex_id + 동일 name이 이미 존재하면 INSERT 건너뜀.
--
--   컬럼 기준: admin/js/pages/programs.js save() 함수 전송 필드
--     complex_id, name, type, days, time_slots, price, capacity,
--     description, display_order, duration_days, is_active
-- ============================================================================

DO $$
DECLARE
    v_complex_id UUID;
    v_inserted   INTEGER := 0;
    v_skipped    INTEGER := 0;

    -- 리프레시 PT 시간 슬롯 (09:00~20:15, 45분 간격)
    -- refresh-pt.js buildAllSlots() 와 동일 생성 로직
    v_refresh_slots JSONB;
    v_minute        INTEGER;
    v_slots_arr     TEXT[] := '{}';
    v_hh            TEXT;
    v_mm            TEXT;
BEGIN
    SELECT id INTO v_complex_id FROM complexes WHERE code = 'ht-lamada';

    -- ── 리프레시 PT 슬롯 동적 생성 (09:00 ~ 20:15, 45분 간격) ──────────────
    v_minute := 9 * 60;   -- 540분 = 09:00
    WHILE v_minute < 21 * 60 LOOP  -- 1260분 = 21:00 (마지막 슬롯 20:15)
        v_hh := LPAD((v_minute / 60)::TEXT, 2, '0');
        v_mm := LPAD((v_minute % 60)::TEXT, 2, '0');
        v_slots_arr := array_append(v_slots_arr, v_hh || ':' || v_mm);
        v_minute := v_minute + 45;
    END LOOP;
    v_refresh_slots := to_jsonb(v_slots_arr);

    RAISE NOTICE 'BLOCK-3: 리프레시 PT 슬롯 % 개 생성 (09:00 ~ %)',
        array_length(v_slots_arr, 1),
        v_slots_arr[array_length(v_slots_arr, 1)];

    -- ── 프로그램 1: 아세로 순환 운동 클래스 (무료 그룹) ────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM programs
         WHERE complex_id = v_complex_id
           AND name = '아세로 순환 운동 클래스'
    ) THEN
        INSERT INTO programs (
            complex_id,
            name,
            type,
            days,
            time_slots,
            price,
            capacity,
            description,
            display_order,
            duration_days,
            is_active
        ) VALUES (
            v_complex_id,
            '아세로 순환 운동 클래스',
            'group',
            '월, 수',
            '["10:00"]'::JSONB,
            0,
            5,
            '투숙객 무료 그룹 운동 클래스. '
            '전신 순환 운동을 통해 여행 피로를 풀고 활력을 되찾는 45분 세션입니다. '
            '별도 예약 없이 당일 현장 접수 가능합니다.',
            1,
            NULL,
            TRUE
        );
        v_inserted := v_inserted + 1;
        RAISE NOTICE 'BLOCK-3: [아세로 순환 운동 클래스] INSERT 완료 (price=0, capacity=5)';
    ELSE
        v_skipped := v_skipped + 1;
        RAISE NOTICE 'BLOCK-3: [아세로 순환 운동 클래스] 이미 존재 — 건너뜀';
    END IF;

    -- ── 프로그램 2: 리프레시 PT (유료 1:1) ──────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM programs
         WHERE complex_id = v_complex_id
           AND name = '리프레시 PT'
    ) THEN
        INSERT INTO programs (
            complex_id,
            name,
            type,
            days,
            time_slots,
            price,
            capacity,
            description,
            display_order,
            duration_days,
            is_active
        ) VALUES (
            v_complex_id,
            '리프레시 PT',
            'personal',
            '월, 화, 수, 목, 금, 토, 일',
            v_refresh_slots,
            40000,
            1,
            '1:1 맞춤 퍼스널 트레이닝 세션 (45분). '
            '트레이너가 FMS 평가 후 투숙객의 상태에 맞는 운동 프로그램을 제공합니다. '
            '숙박 기간 중 매일 09:00 ~ 20:15 사이 45분 단위로 예약 가능합니다.',
            2,
            NULL,
            TRUE
        );
        v_inserted := v_inserted + 1;
        RAISE NOTICE 'BLOCK-3: [리프레시 PT] INSERT 완료 (price=40000, capacity=1, slots=%개)',
            array_length(v_slots_arr, 1);
    ELSE
        v_skipped := v_skipped + 1;
        RAISE NOTICE 'BLOCK-3: [리프레시 PT] 이미 존재 — 건너뜀';
    END IF;

    RAISE NOTICE 'BLOCK-3 완료: 신규 등록 % 개, 건너뜀 % 개', v_inserted, v_skipped;
END $$;


-- ============================================================================
-- BLOCK 4: 적용 결과 확인 조회 (READ ONLY — 트랜잭션 영향 없음)
-- ============================================================================

-- 트레이너 등록 결과
SELECT
    '트레이너' AS category,
    i.name,
    i.title,
    i.display_order,
    i.is_active,
    LEFT(i.photo_url, 50) AS photo_url_preview
FROM instructors i
JOIN complexes  c ON c.id = i.complex_id
WHERE c.code = 'ht-lamada'
ORDER BY i.display_order;

-- 프로그램 등록 결과
SELECT
    '프로그램'                   AS category,
    p.name,
    p.type,
    p.price,
    p.capacity,
    p.days,
    jsonb_array_length(p.time_slots) AS slot_count,
    p.is_active
FROM programs  p
JOIN complexes c ON c.id = p.complex_id
WHERE c.code = 'ht-lamada'
ORDER BY p.display_order;

COMMIT;

-- =============================================================================
-- 적용 완료 메시지
-- 위 SELECT 결과에서 다음을 확인한다:
--   - 트레이너 3명 (전민수, 이도현, 유기현) 모두 is_active=true
--   - [아세로 순환 운동 클래스] price=0, capacity=5, slot_count=1
--   - [리프레시 PT] price=40000, capacity=1, slot_count=17 (09:00~20:15, 45분×17)
--
-- 다음 단계:
--   1. 트레이너 사진 실제 URL로 교체 (Supabase Storage 업로드 후 UPDATE)
--   2. ENABLE_HOTEL_MODE=true 활성화 (E1-INTEGRATION-TEST.md 섹션 2 참조)
--   3. scripts/sh/e1-smoke-test.sh 실행하여 최종 검증
-- =============================================================================
