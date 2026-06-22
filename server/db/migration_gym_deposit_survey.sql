-- 헬스장 모드: 프로그램별 예약금(보증금) 설정
ALTER TABLE programs
    ADD COLUMN IF NOT EXISTS deposit_enabled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS deposit_amount  INTEGER  DEFAULT 0;

-- 헬스장 모드: 신청서 설문 데이터 저장 (JSONB)
ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS survey_data JSONB DEFAULT '{}'::jsonb;

-- 코멘트
COMMENT ON COLUMN programs.deposit_enabled IS '헬스장 모드 예약금(보증금) 활성화 여부';
COMMENT ON COLUMN programs.deposit_amount  IS '헬스장 모드 예약금(보증금) 금액(원)';
COMMENT ON COLUMN applications.survey_data IS '헬스장 모드 신청 설문 (목적, 경력, 병력, 나이, 성별 등)';
