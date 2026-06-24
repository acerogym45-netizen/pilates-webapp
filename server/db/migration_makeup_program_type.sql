-- 보강 수업 프로그램 유형 추가
-- programs.type 컬럼의 CHECK 제약 조건에 'makeup' 값 허용

-- 기존 CHECK 제약 제거 후 재추가 (PostgreSQL 방식)
DO $$
BEGIN
    -- 기존 type 컬럼의 check 제약조건 이름을 찾아서 제거
    ALTER TABLE programs DROP CONSTRAINT IF EXISTS programs_type_check;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- makeup 포함한 새 CHECK 제약 추가
ALTER TABLE programs
    ADD CONSTRAINT programs_type_check
    CHECK (type IN ('group', 'duet', 'personal', 'individual', 'makeup'));

-- 주석: makeup(보강) 유형 특성
-- 1. 중복 수강 허용 (기존 그룹 수업과 별도 신청 가능)
-- 2. 신청 즉시 approved (자동 승인)
-- 3. 무료 (price=0) 권장 — 입금 안내 문자 없음
-- 4. 접수 완료 시 "정상 접수되었습니다" SMS 발송
