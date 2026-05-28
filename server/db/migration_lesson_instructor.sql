-- ══════════════════════════════════════════════════════════════════
-- Phase 1: 개인/듀엣 레슨 강사 배정 + 상시접수 ON/OFF
-- ══════════════════════════════════════════════════════════════════

-- 1) programs: 상시 접수 ON/OFF (개인/듀엣 레슨 전용)
ALTER TABLE programs
ADD COLUMN IF NOT EXISTS always_open_lesson BOOLEAN DEFAULT FALSE;

-- 2) applications: 신청 시 희망 강사 ID 저장
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL;

-- 3) applications: 강사 일정조율 확인 토큰 (Phase 2 대비 미리 추가)
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS lesson_confirm_token TEXT DEFAULT NULL;

-- 4) applications: 강사 SMS 발송 여부 기록
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS instructor_sms_sent_at TIMESTAMPTZ DEFAULT NULL;

-- 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('programs', 'applications')
  AND column_name IN (
    'always_open_lesson',
    'instructor_id',
    'lesson_confirm_token',
    'instructor_sms_sent_at'
  )
ORDER BY table_name, column_name;
