-- instructors 테이블: 자격증 이미지 배열 + 회원 리뷰 JSONB 추가
-- 실행 방법: Supabase SQL Editor에서 실행

-- 자격증 이미지 URL 배열
ALTER TABLE instructors
    ADD COLUMN IF NOT EXISTS cert_images JSONB DEFAULT '[]'::jsonb;

-- 회원 리뷰 배열
-- 형식: [{ "rating": 5, "text": "리뷰 내용", "author": "홍*동", "photos": ["url1","url2"] }]
ALTER TABLE instructors
    ADD COLUMN IF NOT EXISTS reviews JSONB DEFAULT '[]'::jsonb;

-- 인덱스 (선택)
CREATE INDEX IF NOT EXISTS idx_instructors_cert_images ON instructors USING gin(cert_images);
CREATE INDEX IF NOT EXISTS idx_instructors_reviews     ON instructors USING gin(reviews);
