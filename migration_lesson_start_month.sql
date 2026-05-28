-- migration_lesson_start_month.sql
-- applications 테이블에 lesson_start_month 컬럼 추가
-- 실행 위치: Supabase Dashboard > SQL Editor

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS lesson_start_month TEXT;

COMMENT ON COLUMN applications.lesson_start_month
  IS '레슨 수강 시작월 (YYYY-MM). 개인/듀엣 레슨 강사 일정조율 시 설정. 해당 월과 동일하면 금월신규로 분류';

-- 최윤서(105동 2304호) 금월신규 패치 (2026-05 수강 시작)
UPDATE applications
SET lesson_start_month = '2026-05'
WHERE dong = '105'
  AND ho = '2304'
  AND name = '최윤서'
  AND status = 'approved';
