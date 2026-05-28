-- 공지사항 다중 이미지 지원
-- images: JSONB 배열 ["url1","url2",...] (최대 5장)
-- image_url 컬럼은 하위호환 유지 (images[0] 로 대체 표시)
ALTER TABLE notices
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT NULL;
