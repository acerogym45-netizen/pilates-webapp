-- ============================================================
-- Migration: programs 테이블에 duration_days 컬럼 추가
-- 목적: 프로그램별 수강 기간(일수) 설정 → 수강 기간 자동 계산
-- 실행 위치: Supabase Dashboard > SQL Editor
-- ============================================================

-- [1] programs 테이블에 duration_days 컬럼 추가
ALTER TABLE programs
ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT NULL;

COMMENT ON COLUMN programs.duration_days IS
  '수강 기간(일수). NULL이면 자동계산 미사용.
   예시: 4회(주1회)=28일, 4회(주2회)=28일, 8회(주2회)=28일(4주),
         8회(주2회)=56일(8주), 16회(주2회)=56일, 24회(주2회)=84일';

-- [2] 확인 쿼리
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'programs' AND column_name = 'duration_days';
