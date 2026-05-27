-- 프로그램별 타임대별 마케팅용 표시 신청자 수 (NULL = 실제값 그대로 표시)
-- 타입: JSONB { "09:00": 3, "10:00": 5, ... }
-- 슬롯이 없으면 NULL → 실제값 표시

-- 기존에 INTEGER로 추가한 경우 JSONB로 재생성
ALTER TABLE programs
DROP COLUMN IF EXISTS display_approved_count;

ALTER TABLE programs
ADD COLUMN display_approved_count JSONB DEFAULT NULL;
