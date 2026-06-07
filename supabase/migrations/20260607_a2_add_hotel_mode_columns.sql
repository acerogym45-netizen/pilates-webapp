-- ================================================================
-- 20260607_a2_add_hotel_mode_columns.sql
-- 단계: A-2 (호텔 모드 DB 마이그레이션)
-- 목적: 기존 아파트 단지 데이터를 유지하면서 호텔 모드 지원에
--       필요한 컬럼·테이블을 추가 전용(additive only)으로 추가한다.
--
-- 적용 대상: Supabase PostgreSQL (public 스키마)
-- 적용 방법: A2-APPLY-PROCEDURE.md 절차에 따라 단계적으로 적용
--            (dev → staging → prod 순서. 이 파일 단독 직접 실행 금지)
--
-- 안전 보장:
--   - 기존 컬럼 DROP/RENAME/TYPE 변경 없음
--   - 기존 테이블 RENAME 없음
--   - 모든 ADD COLUMN은 DEFAULT 값 보유 (기존 row null 없음)
--   - 모든 CREATE TABLE은 IF NOT EXISTS
--   - check-in / 혼잡도 / 인원카운트 관련 없음
--
-- 역순 롤백: 20260607_a2_add_hotel_mode_columns.rollback.sql
-- 작성일: 2026-06-07
-- ================================================================


-- ================================================================
-- BLOCK 1: complexes 테이블 — 호텔 모드 플래그 컬럼 추가
-- ================================================================
-- 기존 행(apt-cjxi, apt-sclass, test-sk)은 모두 DEFAULT 적용 —
-- venue_type='apartment', hotel_billing_enabled=FALSE 로 자동 세팅됨.
-- 기존 단지 쿼리·인덱스·RLS에 영향 없음.
-- ================================================================

ALTER TABLE complexes
    ADD COLUMN IF NOT EXISTS venue_type TEXT NOT NULL DEFAULT 'apartment'
        CHECK (venue_type IN ('apartment', 'hotel'));

ALTER TABLE complexes
    ADD COLUMN IF NOT EXISTS pms_integration TEXT DEFAULT NULL;

ALTER TABLE complexes
    ADD COLUMN IF NOT EXISTS hotel_billing_enabled BOOLEAN NOT NULL DEFAULT FALSE;


-- ================================================================
-- BLOCK 2: applications 테이블 — 호텔 투숙객·회원 컬럼 추가
-- ================================================================
-- 기존 296건 row 모두 DEFAULT 유지 — user_type='member',
-- room_number=NULL, checkin_date=NULL, checkout_date=NULL,
-- discount_rate=0, converted_from=NULL.
-- 기존 아파트 단지 신청 처리 로직에 영향 없음.
-- ================================================================

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'member'
        CHECK (user_type IN ('guest', 'member', 'pt_member', 'staff', 'vip'));

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS room_number TEXT DEFAULT NULL;

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS checkin_date DATE DEFAULT NULL;

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS checkout_date DATE DEFAULT NULL;

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS discount_rate INTEGER NOT NULL DEFAULT 0;

ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS converted_from UUID DEFAULT NULL;


-- ================================================================
-- BLOCK 3: 신규 테이블 생성 (IF NOT EXISTS — 재실행 안전)
-- ================================================================


-- ----------------------------------------------------------------
-- 3-1. member_tokens
-- 목적: 입주민/회원 인증 토큰 관리 (QR 코드 발급 등)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS member_tokens (
    token               TEXT        PRIMARY KEY,
    application_id      UUID        NOT NULL,
    complex_id          UUID        NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at    TIMESTAMPTZ
);

COMMENT ON TABLE  member_tokens IS '회원 인증 토큰. QR 코드 등 단기 접근 토큰 관리용.';
COMMENT ON COLUMN member_tokens.token            IS '토큰 문자열 (PK). UUID 또는 랜덤 문자열.';
COMMENT ON COLUMN member_tokens.application_id   IS 'applications.id 참조 (FK 제약 미설정 — 유연성 확보).';
COMMENT ON COLUMN member_tokens.complex_id       IS 'complexes.id 참조.';
COMMENT ON COLUMN member_tokens.expires_at       IS '토큰 만료 시각. 이후 토큰 무효화.';
COMMENT ON COLUMN member_tokens.last_accessed_at IS '마지막 접근 시각. NULL이면 미사용.';


-- ----------------------------------------------------------------
-- 3-2. hotel_staff
-- 목적: 호텔 직원 등록 및 이용 자격 관리
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hotel_staff (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    complex_id      UUID        NOT NULL,
    staff_no        TEXT        NOT NULL,
    name            TEXT        NOT NULL,
    phone_last4     TEXT        NOT NULL,
    department      TEXT,
    is_vip          BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (complex_id, staff_no)
);

COMMENT ON TABLE  hotel_staff IS '호텔 직원 등록 테이블. 직원 이용 자격 관리용.';
COMMENT ON COLUMN hotel_staff.staff_no    IS '직원 번호 (단지 내 고유). complex_id와 복합 UNIQUE.';
COMMENT ON COLUMN hotel_staff.phone_last4 IS '전화번호 뒷 4자리 (본인 인증용).';
COMMENT ON COLUMN hotel_staff.is_vip      IS 'VIP 직원 여부. TRUE이면 applications.user_type=vip 연동 가능.';


-- ----------------------------------------------------------------
-- 3-3. workout_reports
-- 목적: 회원별 운동 능력 측정 리포트 (FMS, InBody 등)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_reports (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      UUID        NOT NULL,
    phase               INTEGER     NOT NULL,
    fms_scores          JSONB,
    inbody_data         JSONB,
    trainer_comment     TEXT,
    pdf_url             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  workout_reports IS '회원 운동 능력 측정 리포트 (FMS 점수, InBody 데이터 등).';
COMMENT ON COLUMN workout_reports.phase          IS '측정 회차 (1=초기, 2=중간, 3=최종 등).';
COMMENT ON COLUMN workout_reports.fms_scores     IS 'FMS 7개 동작 점수 JSON. ex: {"deep_squat":2,"hurdle_step":3,...}';
COMMENT ON COLUMN workout_reports.inbody_data    IS 'InBody 측정 데이터 JSON.';
COMMENT ON COLUMN workout_reports.pdf_url        IS '생성된 PDF 리포트 URL (Storage 경로).';


-- ----------------------------------------------------------------
-- 3-4. discount_codes
-- 목적: 투숙객·직원 할인 코드 발급 및 사용 추적
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discount_codes (
    code                TEXT        PRIMARY KEY,
    application_id      UUID        NOT NULL,
    discount_type       TEXT,
    used_at             TIMESTAMPTZ DEFAULT NULL,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  discount_codes IS '투숙객·직원 할인 코드. 1회 사용 추적 포함.';
COMMENT ON COLUMN discount_codes.code           IS '할인 코드 문자열 (PK).';
COMMENT ON COLUMN discount_codes.discount_type  IS '할인 종류. ex: guest_stay, staff_benefit, vip_package';
COMMENT ON COLUMN discount_codes.used_at        IS '사용 시각. NULL이면 미사용 유효 코드.';
COMMENT ON COLUMN discount_codes.expires_at     IS '코드 만료 시각.';


-- ----------------------------------------------------------------
-- 3-5. meal_orders
-- 목적: 호텔 룸서비스 / 식사 주문 연동 (헬스 패키지 포함)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_orders (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    complex_id              UUID        NOT NULL,
    room_number             TEXT        NOT NULL,
    member_application_id   UUID,
    menu_items              JSONB       NOT NULL,
    total_amount            INTEGER     NOT NULL,
    hotel_share             INTEGER,
    gym_share               INTEGER,
    status                  TEXT        NOT NULL DEFAULT 'received'
                                CHECK (status IN ('received', 'preparing', 'delivered', 'cancelled')),
    ordered_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at            TIMESTAMPTZ
);

COMMENT ON TABLE  meal_orders IS '호텔 룸서비스 / 식사 주문. 헬스 패키지 연동 포함.';
COMMENT ON COLUMN meal_orders.room_number           IS '주문 객실 번호.';
COMMENT ON COLUMN meal_orders.member_application_id IS '연결된 applications.id (회원이 주문한 경우). NULL 허용.';
COMMENT ON COLUMN meal_orders.menu_items            IS '주문 메뉴 목록 JSON. ex: [{"name":"샐러드","qty":1,"price":12000}]';
COMMENT ON COLUMN meal_orders.hotel_share           IS '호텔 수익 분배액 (원). NULL이면 분배 미설정.';
COMMENT ON COLUMN meal_orders.gym_share             IS '헬스장 수익 분배액 (원). NULL이면 분배 미설정.';
COMMENT ON COLUMN meal_orders.status                IS 'received→preparing→delivered 또는 cancelled.';
COMMENT ON COLUMN meal_orders.delivered_at          IS '배달 완료 시각. status=delivered 시 기록.';


-- ================================================================
-- BLOCK 4: ht-lamada 단지 venue_type 업데이트
-- ================================================================
-- 이미 DB에 존재하는 ht-lamada 단지를 hotel로 설정한다.
-- 기존 아파트 단지(apt-cjxi, apt-sclass, test-sk)는 BLOCK 1에서
-- DEFAULT 'apartment'가 이미 적용되므로 이 트랜잭션에서 건드리지 않는다.
--
-- ⚠️  주의: 이 UPDATE는 BLOCK 1~3과 별도 트랜잭션으로 실행한다.
--     BLOCK 1~3 성공 검증 후에만 이 블록을 실행할 것.
--     (A2-APPLY-PROCEDURE.md §3 Step 4 참조)
-- ================================================================

-- BEGIN; / COMMIT; 는 적용 절차 문서(A2-APPLY-PROCEDURE.md)에서 지시.
-- Supabase SQL Editor 직접 실행 시에는 아래 트랜잭션 블록 전체를 선택 후 실행.

BEGIN;

    UPDATE complexes
    SET
        venue_type             = 'hotel',
        hotel_billing_enabled  = FALSE
    WHERE
        code = 'ht-lamada';

    -- 적용 검증: 1건이 변경되어야 정상
    DO $$
    DECLARE
        v_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count
        FROM complexes
        WHERE code = 'ht-lamada' AND venue_type = 'hotel';

        IF v_count <> 1 THEN
            RAISE EXCEPTION
                'ht-lamada UPDATE 검증 실패: venue_type=hotel 행이 % 건 (기대값: 1)', v_count;
        END IF;
    END $$;

COMMIT;
