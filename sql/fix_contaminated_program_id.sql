-- ============================================================
-- 오염된 program_id 데이터 수정
-- 발견일: 2026-05-21
-- 원인: 신청 등록 시 program_id가 다른 프로그램의 ID로 잘못 저장됨
-- 영향: program-summary에서 프로그램 현황 카운트 오류 발생
-- ============================================================

-- ① 윤다영 (102동 1504호) — 화&목 신청인데 수&금 program_id(5ea9de5e)로 저장됨
--    올바른 화&목 program_id: d1a6b30f-60b6-4866-bdfc-34651f1d3511
UPDATE applications
SET program_id = 'd1a6b30f-60b6-4866-bdfc-34651f1d3511'
WHERE id = '28f24799-1bdc-486e-adaa-0e7da4d844aa'
  AND program_name = '화&목 6:1 그룹수업'
  AND program_id   = '5ea9de5e-0dac-4e93-801d-b604a7f40ffe';

-- ② 윤다연 (105동 906호) — 수&금 신청인데 화&목 program_id(d1a6b30f)로 저장됨
--    올바른 수&금 program_id: 5ea9de5e-0dac-4e93-801d-b604a7f40ffe
UPDATE applications
SET program_id = '5ea9de5e-0dac-4e93-801d-b604a7f40ffe'
WHERE id = 'faf7ec8f-73c0-4dca-b900-1e7a5ee00b4d'
  AND program_name = '수&금 6:1 그룹수업'
  AND program_id   = 'd1a6b30f-60b6-4866-bdfc-34651f1d3511';

-- 실행 후 검증:
-- SELECT id, dong, ho, name, program_name, program_id FROM applications
-- WHERE id IN ('28f24799-1bdc-486e-adaa-0e7da4d844aa','faf7ec8f-73c0-4dca-b900-1e7a5ee00b4d');
