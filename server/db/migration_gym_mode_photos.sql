-- 헬스장 모드 설정 (complexes)
ALTER TABLE complexes
ADD COLUMN IF NOT EXISTS gym_mode BOOLEAN DEFAULT false;

-- 강사 다중 사진 (instructors)
-- photo_urls: JSONB 배열, 예) ["url1", "url2", ...]
ALTER TABLE instructors
ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb;
