-- 프로그램별 마케팅용 표시 신청자 수 (NULL = 실제값 그대로 표시)
ALTER TABLE programs
ADD COLUMN IF NOT EXISTS display_approved_count INTEGER DEFAULT NULL;
