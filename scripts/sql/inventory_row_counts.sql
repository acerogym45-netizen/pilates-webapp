-- ================================================================
-- inventory_row_counts.sql
-- 목적: 주요 테이블 row 수를 한 번에 확인하는 인벤토리 쿼리
-- 용도: A1-INVENTORY-CHECKLIST.md §3 기록용, 백업 검증, 이상 감지
--
-- 실행 방법:
--   Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 후 실행
--
-- 작성일: 2026-06-07
-- ================================================================

-- ──────────────────────────────────────────────────────────────
-- [1] 테이블별 row 수 요약 (핵심 테이블만)
-- ──────────────────────────────────────────────────────────────
SELECT
    relname                          AS table_name,
    n_live_tup                       AS estimated_row_count
FROM
    pg_stat_user_tables
WHERE
    schemaname = 'public'
    AND relname IN (
        'complexes',
        'programs',
        'instructors',
        'applications',
        'cancellations',
        'notices',
        'inquiries',
        'curricula',
        'complex_apply_settings'
    )
ORDER BY
    estimated_row_count DESC;


-- ──────────────────────────────────────────────────────────────
-- [2] 정확한 COUNT (pg_stat 추정치가 아닌 실제 값)
--     ※ 데이터량이 많으면 느릴 수 있음 — applications는 주의
-- ──────────────────────────────────────────────────────────────
SELECT 'complexes'             AS table_name, COUNT(*) AS exact_count FROM complexes
UNION ALL
SELECT 'programs',                            COUNT(*) FROM programs
UNION ALL
SELECT 'instructors',                         COUNT(*) FROM instructors
UNION ALL
SELECT 'applications',                        COUNT(*) FROM applications
UNION ALL
SELECT 'cancellations',                       COUNT(*) FROM cancellations
UNION ALL
SELECT 'notices',                             COUNT(*) FROM notices
UNION ALL
SELECT 'inquiries',                           COUNT(*) FROM inquiries
UNION ALL
SELECT 'curricula',                           COUNT(*) FROM curricula
UNION ALL
SELECT 'complex_apply_settings',              COUNT(*) FROM complex_apply_settings
ORDER BY table_name;


-- ──────────────────────────────────────────────────────────────
-- [3] applications 상태별 집계 (단지별)
--     → 기존 단지 데이터가 의도치 않게 변경되지 않았는지 확인
-- ──────────────────────────────────────────────────────────────
SELECT
    c.name                           AS complex_name,
    c.code                           AS complex_code,
    a.status,
    COUNT(*)                         AS cnt
FROM
    applications a
    JOIN complexes c ON c.id = a.complex_id
GROUP BY
    c.name, c.code, a.status
ORDER BY
    c.code, a.status;


-- ──────────────────────────────────────────────────────────────
-- [4] 단지별 활성/비활성 프로그램 수
-- ──────────────────────────────────────────────────────────────
SELECT
    c.name                           AS complex_name,
    c.code                           AS complex_code,
    SUM(CASE WHEN p.is_active THEN 1 ELSE 0 END)   AS active_programs,
    SUM(CASE WHEN NOT p.is_active THEN 1 ELSE 0 END) AS inactive_programs,
    COUNT(*)                         AS total_programs
FROM
    programs p
    JOIN complexes c ON c.id = p.complex_id
GROUP BY
    c.name, c.code
ORDER BY
    c.code;


-- ──────────────────────────────────────────────────────────────
-- [5] program_id = NULL 인 applications 수 (구형 데이터 현황)
--     → 이 수치가 갑자기 늘면 신규 null 레코드 생성 버그 의심
-- ──────────────────────────────────────────────────────────────
SELECT
    c.name                           AS complex_name,
    c.code                           AS complex_code,
    COUNT(*)                         AS null_program_id_count
FROM
    applications a
    JOIN complexes c ON c.id = a.complex_id
WHERE
    a.program_id IS NULL
GROUP BY
    c.name, c.code
ORDER BY
    null_program_id_count DESC;


-- ──────────────────────────────────────────────────────────────
-- [6] 최근 24시간 내 신청 건수 (활성도 확인)
-- ──────────────────────────────────────────────────────────────
SELECT
    c.name                           AS complex_name,
    COUNT(*)                         AS recent_applications
FROM
    applications a
    JOIN complexes c ON c.id = a.complex_id
WHERE
    a.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY
    c.name
ORDER BY
    recent_applications DESC;
