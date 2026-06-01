-- show_cancel_tab: 입주민 페이지 해지 신청 버튼 표시 여부
-- true(기본값) → 해지 신청 버튼 표시 / false → 숨김
ALTER TABLE complexes
  ADD COLUMN IF NOT EXISTS show_cancel_tab BOOLEAN DEFAULT TRUE;

-- 기존 단지는 모두 true(표시) 기본값 설정
UPDATE complexes SET show_cancel_tab = TRUE WHERE show_cancel_tab IS NULL;

-- 확인용
-- SELECT id, name, show_cancel_tab FROM complexes ORDER BY name;
