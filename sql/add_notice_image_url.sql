-- notices 테이블에 image_url 컬럼 추가
-- 공지사항 이미지 첨부 기능 지원
-- 실행: Supabase SQL Editor에서 실행하세요

ALTER TABLE notices ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- 컬럼 추가 확인
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'notices' AND column_name = 'image_url';
