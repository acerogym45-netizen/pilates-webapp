-- 단지별 시간대 정원 공유 설정
-- ON: 같은 단지+시간대라면 프로그램명 무관하게 정원 합산 (프로모션 여러 개 공유)
-- OFF: 기존 방식 — 프로그램별 독립 정원
ALTER TABLE complexes
ADD COLUMN IF NOT EXISTS share_timeslot_capacity BOOLEAN DEFAULT false;
