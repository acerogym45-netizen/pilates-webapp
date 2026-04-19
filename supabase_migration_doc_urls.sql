-- cancellations 테이블에 doc_urls 컬럼 추가 (환불 증빙서류 URL 배열)
-- Supabase 대시보드 > SQL Editor > New Query 에서 실행하세요

ALTER TABLE cancellations
  ADD COLUMN IF NOT EXISTS doc_urls JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN cancellations.doc_urls
  IS '환불 증빙서류 Supabase Storage URL 배열 (JSON array of strings)';

-- refund-docs Storage 버킷 생성 (Storage > New bucket 에서도 가능)
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'refund-docs',
--   'refund-docs',
--   false,
--   10485760,
--   ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf']
-- )
-- ON CONFLICT (id) DO NOTHING;

-- Storage 정책: 인증 없이 업로드 허용 (anon key 사용)
-- Supabase Dashboard > Storage > refund-docs > Policies 에서 설정:
--   INSERT: true (공개 업로드)
--   SELECT: true (공개 읽기) 또는 signed URL 사용
