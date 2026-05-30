-- ============================================================
--  DB 백업 스냅샷 테이블
--  매일 KST 06:00 (UTC 21:00) Vercel Cron이 자동 실행
--  30일 이상 된 스냅샷은 자동 삭제
-- ============================================================

-- 1) 백업 스냅샷 메인 테이블
CREATE TABLE IF NOT EXISTS db_backups (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date   DATE        NOT NULL,                    -- KST 기준 날짜 (YYYY-MM-DD)
    snapshot_time   TIMESTAMPTZ NOT NULL DEFAULT now(),      -- 실제 스냅샷 시각
    label           TEXT        NOT NULL DEFAULT 'auto',     -- 'auto' | 'manual' | 커스텀 메모
    tables_included TEXT[]      NOT NULL DEFAULT '{}',       -- 백업된 테이블 목록
    row_counts      JSONB       NOT NULL DEFAULT '{}',       -- { "applications": 123, ... }
    data            JSONB       NOT NULL DEFAULT '{}',       -- 전체 데이터 { "applications": [...], ... }
    size_bytes      BIGINT      GENERATED ALWAYS AS (
                        octet_length(data::text)
                    ) STORED,                                -- 자동 계산 (bytes)
    created_by      TEXT        NOT NULL DEFAULT 'cron',     -- 'cron' | 'admin'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) 날짜 + label 유니크 (같은 날 같은 label은 UPSERT로 덮어씀)
CREATE UNIQUE INDEX IF NOT EXISTS uq_db_backups_date_label
    ON db_backups (snapshot_date, label);

-- 3) 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_db_backups_snapshot_date
    ON db_backups (snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_db_backups_created_at
    ON db_backups (created_at DESC);

-- 4) RLS 비활성화 (서버사이드 service_role로만 접근)
ALTER TABLE db_backups DISABLE ROW LEVEL SECURITY;

-- 5) 30일 초과 스냅샷 자동 삭제 함수
CREATE OR REPLACE FUNCTION cleanup_old_backups()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM db_backups
    WHERE snapshot_date < CURRENT_DATE - INTERVAL '30 days'
      AND label = 'auto';  -- 수동 백업은 삭제하지 않음
END;
$$;

-- 완료 메시지
SELECT 'db_backups 테이블 생성 완료' AS result;
