-- cancellations 테이블에 request_type 컬럼 추가 (환불신청 구분용)
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE cancellations
  ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'cancel';

-- 기존 데이터는 모두 'cancel'로 설정
UPDATE cancellations
  SET request_type = 'cancel'
  WHERE request_type IS NULL;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_cancellations_request_type
  ON cancellations(request_type);
