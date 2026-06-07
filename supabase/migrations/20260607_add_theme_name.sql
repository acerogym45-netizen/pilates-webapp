-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: complexes 테이블에 theme_name 컬럼 추가
-- 목적: 단지별 페이지 디자인 테마 선택 기능
-- 적용: Supabase Dashboard > SQL Editor 에서 실행
-- 롤백: 20260607_add_theme_name.rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 컬럼 추가 ─────────────────────────────────────────────────────────────
-- 기존 단지는 모두 'default' (기존 아파트 보라 테마) 로 초기화
ALTER TABLE complexes
    ADD COLUMN IF NOT EXISTS theme_name VARCHAR(32) NOT NULL DEFAULT 'default';

-- ── 2. 허용 값 제약 (CHECK) ───────────────────────────────────────────────────
-- 새 테마 추가 시 이 제약도 함께 수정할 것
ALTER TABLE complexes
    ADD CONSTRAINT complexes_theme_name_check
    CHECK (theme_name IN (
        'default',   -- 기존 아파트 (보라 + 흰색)
        'hotel',     -- 라마다 호텔 (네이비 + 골드)
        'modern',    -- 도시형 모던 (차콜 + 시안)
        'nature',    -- 자연 웰니스 (딥그린 + 베이지)
        'minimal',   -- 미니멀 화이트 (흰색 + 블랙)
        'ocean',     -- 오션 블루 (딥블루 + 아쿠아)
        'sunset',    -- 선셋 (다크브라운 + 오렌지)
        'cherry',    -- 체리블라섬 (로즈핑크 + 크림)
        'dark',      -- 다크모드 (거의 블랙 + 네온 민트)
        'royal',     -- 로열 클래식 (버건디 + 골드)
        'zen'        -- 젠 (오프화이트 + 인디고)
    ));

-- ── 3. 기존 호텔 단지 자동 세팅 ──────────────────────────────────────────────
-- venue_type='hotel' 인 단지는 theme_name='hotel' 로 초기화
UPDATE complexes
SET    theme_name = 'hotel'
WHERE  venue_type = 'hotel'
  AND  theme_name = 'default';

-- ── 4. 인덱스 (테마별 조회 최적화) ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_complexes_theme_name ON complexes (theme_name);

-- ── 5. 결과 확인 ─────────────────────────────────────────────────────────────
SELECT id, code, name, venue_type, theme_name
FROM   complexes
ORDER  BY theme_name, code;

COMMIT;
