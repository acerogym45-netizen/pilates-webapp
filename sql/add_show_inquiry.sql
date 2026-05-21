-- complexes 테이블에 문의하기 퀵액션 표시 여부 컬럼 추가
-- show_inquiry: true(기본값) → 문의하기 버튼 표시 / false → 숨김 (전화응대 전용)

ALTER TABLE complexes
  ADD COLUMN IF NOT EXISTS show_inquiry BOOLEAN DEFAULT TRUE;

-- 기존 단지 모두 true(표시)로 초기화 (하위 호환)
UPDATE complexes SET show_inquiry = TRUE WHERE show_inquiry IS NULL;

-- 확인 쿼리
-- SELECT id, name, show_inquiry FROM complexes ORDER BY name;
