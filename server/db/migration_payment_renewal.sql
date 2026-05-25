-- ============================================================
-- Migration: 계좌/현금 결제 자동화 시스템 - Phase 1 & 2
-- 실행 위치: Supabase Dashboard > SQL Editor
-- ============================================================

-- [1] complexes 테이블에 payment_mode 추가
ALTER TABLE complexes
ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'management_fee'
CHECK (payment_mode IN ('management_fee', 'direct'));

COMMENT ON COLUMN complexes.payment_mode IS
  '수강료 결제 방식: management_fee=관리비청구(기본), direct=계좌/현금 직접납부';

-- [2] applications 테이블에 수강기간 + 연장 관련 필드 추가
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS start_date       DATE,
ADD COLUMN IF NOT EXISTS expiry_date      DATE,
ADD COLUMN IF NOT EXISTS renewal_status   TEXT
  CHECK (renewal_status IN ('pending', 'confirmed', 'declined', 'expired')),
ADD COLUMN IF NOT EXISTS renewal_token    TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS renewal_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS renewal_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN applications.start_date IS '수강 시작일 (direct 결제 단지: 승인 시 당월 1일 자동 기입)';
COMMENT ON COLUMN applications.expiry_date IS '수강 만료일 (direct 결제 단지: 승인 시 당월 말일 자동 기입)';
COMMENT ON COLUMN applications.renewal_status IS
  '연장 상태: pending=TM발송됨, confirmed=연장희망, declined=비희망, expired=무반응만료';
COMMENT ON COLUMN applications.renewal_token IS '연장 링크 URL용 일회용 토큰 (UUID)';
COMMENT ON COLUMN applications.renewal_deadline IS 'TM 발송 후 3일 데드라인 (이후 자동 해지)';
COMMENT ON COLUMN applications.renewal_notified_at IS '연장 TM 최초 발송 시각';

-- [3] 인덱스 추가 (만료일 기준 스캔 성능용)
CREATE INDEX IF NOT EXISTS idx_applications_expiry_date
  ON applications (expiry_date)
  WHERE expiry_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_renewal_status
  ON applications (renewal_status)
  WHERE renewal_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_renewal_token
  ON applications (renewal_token)
  WHERE renewal_token IS NOT NULL;

-- 확인 쿼리
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'complexes' AND column_name = 'payment_mode';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'applications'
  AND column_name IN ('start_date','expiry_date','renewal_status','renewal_token','renewal_deadline','renewal_notified_at')
ORDER BY column_name;

-- ============================================================
-- Phase 3 추가 마이그레이션
-- ============================================================

-- [4] complexes 테이블에 계좌 안내 정보 추가
ALTER TABLE complexes
ADD COLUMN IF NOT EXISTS renewal_account_bank   TEXT,
ADD COLUMN IF NOT EXISTS renewal_account_number TEXT,
ADD COLUMN IF NOT EXISTS renewal_account_holder TEXT;

COMMENT ON COLUMN complexes.renewal_account_bank   IS '연장 결제 안내 계좌 - 은행명';
COMMENT ON COLUMN complexes.renewal_account_number IS '연장 결제 안내 계좌 - 계좌번호';
COMMENT ON COLUMN complexes.renewal_account_holder IS '연장 결제 안내 계좌 - 예금주';

-- [5] renewal_payments 결제 확인 기록 테이블
CREATE TABLE IF NOT EXISTS renewal_payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    amount         INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT CHECK (payment_method IN ('transfer', 'cash')),
    confirmed_by   TEXT DEFAULT 'admin',
    confirmed_at   TIMESTAMPTZ DEFAULT NOW(),
    memo           TEXT
);

COMMENT ON TABLE renewal_payments IS '수강 연장 결제 확인 기록';
