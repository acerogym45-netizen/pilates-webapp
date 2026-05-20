-- 시간표 이미지/PDF URL 컬럼 추가
-- complexes 테이블에 timetable_url 컬럼 추가
-- 실행: Supabase Dashboard → SQL Editor에서 실행

ALTER TABLE complexes
  ADD COLUMN IF NOT EXISTS timetable_url TEXT DEFAULT NULL;

COMMENT ON COLUMN complexes.timetable_url
  IS '시간표 이미지 또는 PDF의 URL 또는 Base64 data URL. 관리자가 업로드하며 입주민 퀵액션 "시간표" 탭에 표시됩니다.';
