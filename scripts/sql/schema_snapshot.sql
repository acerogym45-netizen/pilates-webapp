-- ================================================================
-- schema_snapshot.sql
-- 목적: public 스키마의 테이블·컬럼 구조를 확인하는 스냅샷 쿼리
-- 용도: 개발 전후 스키마 변경 여부 교차검증, 호텔 모드 개발 가드
--
-- 실행 방법:
--   Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 후 실행
--
-- 결과 활용:
--   개발 착수 전 실행 → 결과 복사 저장
--   개발 완료 후 재실행 → diff 비교하여 의도치 않은 스키마 변경 확인
--
-- 작성일: 2026-06-07
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- [1] 테이블 목록 (public 스키마 전체)
-- ──────────────────────────────────────────────────────────────
SELECT
    table_name,
    table_type
FROM
    information_schema.tables
WHERE
    table_schema = 'public'
ORDER BY
    table_name;


-- ──────────────────────────────────────────────────────────────
-- [2] 컬럼 구조 스냅샷 (핵심 테이블)
--     테이블명, 컬럼명, 데이터타입, NULL 허용, 기본값
-- ──────────────────────────────────────────────────────────────
SELECT
    c.table_name,
    c.ordinal_position                               AS col_order,
    c.column_name,
    c.data_type,
    c.udt_name                                       AS udt,
    c.is_nullable,
    c.column_default
FROM
    information_schema.columns c
WHERE
    c.table_schema = 'public'
    AND c.table_name IN (
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
    c.table_name,
    c.ordinal_position;


-- ──────────────────────────────────────────────────────────────
-- [3] 인덱스 목록
-- ──────────────────────────────────────────────────────────────
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM
    pg_indexes
WHERE
    schemaname = 'public'
ORDER BY
    tablename, indexname;


-- ──────────────────────────────────────────────────────────────
-- [4] 외래 키(FK) 관계
-- ──────────────────────────────────────────────────────────────
SELECT
    tc.table_name                    AS source_table,
    kcu.column_name                  AS source_column,
    ccu.table_name                   AS target_table,
    ccu.column_name                  AS target_column,
    tc.constraint_name
FROM
    information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
WHERE
    tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY
    source_table, source_column;


-- ──────────────────────────────────────────────────────────────
-- [5] CHECK 제약 조건 (status 값 등)
-- ──────────────────────────────────────────────────────────────
SELECT
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM
    information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
        AND tc.constraint_schema = cc.constraint_schema
WHERE
    tc.constraint_type = 'CHECK'
    AND tc.table_schema = 'public'
ORDER BY
    tc.table_name, tc.constraint_name;


-- ──────────────────────────────────────────────────────────────
-- [6] complexes 테이블 전체 컬럼 (share_timeslot_capacity 등 포함)
--     → 호텔 모드 개발 시 새 컬럼이 추가됐는지 확인하는 기준
-- ──────────────────────────────────────────────────────────────
SELECT
    ordinal_position AS col_order,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM
    information_schema.columns
WHERE
    table_schema = 'public'
    AND table_name = 'complexes'
ORDER BY
    ordinal_position;


-- ──────────────────────────────────────────────────────────────
-- [7] RLS(Row Level Security) 활성화 현황
-- ──────────────────────────────────────────────────────────────
SELECT
    schemaname,
    tablename,
    rowsecurity                      AS rls_enabled
FROM
    pg_tables
WHERE
    schemaname = 'public'
ORDER BY
    tablename;
