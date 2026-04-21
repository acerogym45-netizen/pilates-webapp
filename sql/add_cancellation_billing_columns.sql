-- ============================================================
-- 해지 관리비 부과 로직을 위한 컬럼 추가 마이그레이션
-- Supabase Dashboard > SQL Editor에서 실행하세요
-- ============================================================

-- 1. 실제 해지 처리 날짜 (관리자가 승인한 날짜 or 수동 입력)
ALTER TABLE cancellations 
ADD COLUMN IF NOT EXISTS termination_date DATE;

-- 2. 해지 처리 월 (YYYY-MM 형식, 예: '2026-04')
ALTER TABLE cancellations 
ADD COLUMN IF NOT EXISTS termination_month VARCHAR(7);

-- 3. 실제 수강 횟수 (해지 월 기준)
ALTER TABLE cancellations 
ADD COLUMN IF NOT EXISTS attended_sessions INTEGER DEFAULT 0;

-- 4. 총 수강 가능 횟수 (해당 월 기준)
ALTER TABLE cancellations 
ADD COLUMN IF NOT EXISTS total_sessions_in_month INTEGER DEFAULT 0;

-- 5. 1회당 수강료 (단가)
ALTER TABLE cancellations 
ADD COLUMN IF NOT EXISTS session_fee INTEGER DEFAULT 0;

-- 6. 계산된 청구 금액 (수강 횟수 × 단가)
ALTER TABLE cancellations 
ADD COLUMN IF NOT EXISTS billing_amount INTEGER DEFAULT 0;

-- 7. 관리비 청구 메모 (자유 입력)
ALTER TABLE cancellations 
ADD COLUMN IF NOT EXISTS billing_memo TEXT;

-- 8. 관리비 청구 처리 여부
ALTER TABLE cancellations 
ADD COLUMN IF NOT EXISTS billing_processed BOOLEAN DEFAULT FALSE;

-- 9. 관리비 청구 처리 일시
ALTER TABLE cancellations 
ADD COLUMN IF NOT EXISTS billing_processed_at TIMESTAMPTZ;

-- 완료 확인
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'cancellations' 
ORDER BY ordinal_position;
