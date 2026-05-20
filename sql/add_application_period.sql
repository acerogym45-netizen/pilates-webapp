-- complexes 테이블에 신청기간 커스텀 설정 컬럼 추가
-- apply_start : 신청 시작 일시 (TIMESTAMPTZ, KST 기준 입력 → UTC 저장)
-- apply_end   : 신청 종료 일시 (TIMESTAMPTZ, KST 기준 입력 → UTC 저장)
-- apply_period_enabled : true → 커스텀 기간 적용 / false(기본값) → 기존 22~26일 자동 로직 유지

ALTER TABLE complexes ADD COLUMN IF NOT EXISTS apply_start      TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS apply_end        TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS apply_period_enabled BOOLEAN DEFAULT FALSE;

-- 확인 쿼리
-- SELECT id, name, apply_period_enabled, apply_start, apply_end FROM complexes;
