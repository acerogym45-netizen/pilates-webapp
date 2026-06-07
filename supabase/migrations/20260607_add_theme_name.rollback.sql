-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback: 20260607_add_theme_name.sql 롤백
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE complexes DROP CONSTRAINT IF EXISTS complexes_theme_name_check;
DROP INDEX  IF EXISTS idx_complexes_theme_name;
ALTER TABLE complexes DROP COLUMN  IF EXISTS theme_name;

COMMIT;
