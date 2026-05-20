-- ══════════════════════════════════════════════════════════════════
-- 신청 종류 분류 체계 + 대기 자동 SMS 시스템
-- 실행 순서: Supabase SQL Editor에서 전체 복사 후 실행
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- [1] applications 테이블 — 신청 타입 + 대기 SMS 추적 컬럼
-- ─────────────────────────────────────────────────────────────────

-- apply_type: 신청 성격 구분
--   'new'     → 신규 수강 신청 (기존 기본값, 하위 호환)
--   'waiting' → 대기 신청 (대기 시스템 활성 단지에서만 사용)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS apply_type TEXT DEFAULT 'new';

-- 대기 SMS 발송 시각 (발송 완료 후 NOW() 기록)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS waiting_sms_sent_at TIMESTAMPTZ DEFAULT NULL;

-- 대기 응답 만료 시각 (SMS 발송 후 + waiting_timeout_hours)
-- 이 시각을 넘기면 Cron이 다음 순번으로 자동 이동
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS waiting_expires_at TIMESTAMPTZ DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────────
-- [2] complexes 테이블 — 단지별 신청 종류 설정
-- ─────────────────────────────────────────────────────────────────

-- 대기 시스템 활성화 여부
--   false (기본) → 정원 마감 시 차단 (기존 동작)
--   true         → 대기 접수 허용 + 자동 SMS 플로우 활성
ALTER TABLE complexes
  ADD COLUMN IF NOT EXISTS waiting_enabled BOOLEAN DEFAULT FALSE;

-- 대기 응답 제한 시간 (시간 단위, 기본 3시간)
ALTER TABLE complexes
  ADD COLUMN IF NOT EXISTS waiting_timeout_hours INT DEFAULT 3;

-- 신규 신청 자동 승인 여부
--   true (기본)  → 정원 이내면 즉시 approved
--   false        → 관리자 수동 승인 필요 (status='received')
ALTER TABLE complexes
  ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN DEFAULT TRUE;

-- ─────────────────────────────────────────────────────────────────
-- [3] complex_apply_settings 테이블 — 신청 종류별 on/off + 기간 설정
-- ─────────────────────────────────────────────────────────────────
-- 신청 종류(apply_type_key)별로 활성화 여부와 기간을 단지별로 독립 관리
--
-- apply_type_key 값:
--   'new'        → 신규 수강 신청
--   'waiting'    → 대기 신청
--   'cancel'     → 해지 신청 (차월 해지)
--   'mid_cancel' → 중도 해지
--   'refund'     → 환불 신청
--
-- period_mode:
--   'auto'   → 단지 기본 기간(apply_period_enabled 설정) 따름
--   'custom' → 이 테이블의 period_start/period_end 사용
--   'always' → 상시 개방
--   'closed' → 항상 닫힘 (is_enabled=false와 동일 효과, UI에서 off 시 사용)

CREATE TABLE IF NOT EXISTS complex_apply_settings (
  id              BIGSERIAL PRIMARY KEY,
  complex_id      UUID NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
  apply_type_key  TEXT NOT NULL,          -- 'new' | 'waiting' | 'cancel' | 'mid_cancel' | 'refund'
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  period_mode     TEXT NOT NULL DEFAULT 'auto',  -- 'auto' | 'custom' | 'always' | 'closed'
  period_start    TIMESTAMPTZ DEFAULT NULL,       -- custom 모드일 때 사용 (UTC 저장)
  period_end      TIMESTAMPTZ DEFAULT NULL,       -- custom 모드일 때 사용 (UTC 저장)
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(complex_id, apply_type_key)
);

-- RLS 비활성화 (서버 사이드에서만 접근)
ALTER TABLE complex_apply_settings DISABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- [4] cancellations 테이블 — mid_cancel 타입 지원 확인
-- ─────────────────────────────────────────────────────────────────
-- request_type에 'mid_cancel' 값이 이미 허용되는지 확인
-- (TEXT 타입이므로 별도 ALTER 불필요, 기존 'cancel'/'refund'와 함께 사용 가능)

-- ─────────────────────────────────────────────────────────────────
-- [5] 인덱스
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_applications_apply_type
  ON applications(apply_type);

CREATE INDEX IF NOT EXISTS idx_applications_waiting_expires
  ON applications(waiting_expires_at)
  WHERE waiting_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_complex_apply_settings_complex
  ON complex_apply_settings(complex_id);

-- ─────────────────────────────────────────────────────────────────
-- [6] 기존 데이터 마이그레이션
-- ─────────────────────────────────────────────────────────────────
-- 기존 applications 레코드: apply_type = 'new' 기본값으로 설정
UPDATE applications
  SET apply_type = 'new'
  WHERE apply_type IS NULL;

-- 기존 waiting 상태 레코드도 apply_type = 'waiting'으로 정리
UPDATE applications
  SET apply_type = 'waiting'
  WHERE status = 'waiting' AND apply_type = 'new';

-- ─────────────────────────────────────────────────────────────────
-- [7] 확인 쿼리
-- ─────────────────────────────────────────────────────────────────
-- SELECT id, name, waiting_enabled, waiting_timeout_hours, auto_approve
--   FROM complexes;
--
-- SELECT * FROM complex_apply_settings ORDER BY complex_id, apply_type_key;
--
-- SELECT apply_type, count(*) FROM applications GROUP BY apply_type;
