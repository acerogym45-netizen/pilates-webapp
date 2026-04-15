-- ============================================================
-- 필라테스 단지 관리 시스템 - Supabase PostgreSQL 스키마
-- Supabase SQL Editor에서 이 파일을 실행하세요
-- ============================================================

-- ─── 1. 단지(Complex) 테이블 ────────────────────────────────
CREATE TABLE IF NOT EXISTS complexes (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    address         TEXT DEFAULT '',
    logo_url        TEXT,
    primary_color   TEXT DEFAULT '#667eea',
    admin_password  TEXT DEFAULT 'admin1234',
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. 프로그램 테이블 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS programs (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    complex_id      UUID NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK(type IN ('group','duet','personal')),
    description     TEXT DEFAULT '',
    days            TEXT DEFAULT '',
    time_slots      JSONB DEFAULT '[]',
    price           INTEGER DEFAULT 0,
    capacity        INTEGER DEFAULT 6,
    is_active       BOOLEAN DEFAULT true,
    display_order   INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. 강사 테이블 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instructors (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    complex_id      UUID NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    title           TEXT DEFAULT '',
    bio             TEXT DEFAULT '',
    photo_url       TEXT DEFAULT '',
    display_order   INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. 신청(계약) 테이블 ───────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    complex_id          UUID NOT NULL REFERENCES complexes(id),
    dong                TEXT NOT NULL,
    ho                  TEXT NOT NULL,
    name                TEXT NOT NULL,
    phone               TEXT NOT NULL,
    program_id          UUID REFERENCES programs(id),
    program_name        TEXT NOT NULL,
    preferred_time      TEXT,
    status              TEXT DEFAULT 'approved' CHECK(status IN ('approved','waiting','rejected','cancelled','expired','transferred','received')),
    waiting_order       INTEGER,
    signature_name      TEXT DEFAULT '',
    signature_data      TEXT DEFAULT '',
    signature_date      TEXT DEFAULT '',
    agreement           BOOLEAN DEFAULT false,
    terms_agreement     BOOLEAN DEFAULT false,
    notes               TEXT DEFAULT '',
    assigned_time       TEXT,
    -- 양도/양수 관련
    transfer_from       UUID,   -- 양도 원본 신청 ID
    transfer_to         UUID,   -- 양수 신청 ID
    remaining_sessions  INTEGER,
    total_sessions      INTEGER,
    monthly_fee         INTEGER,
    transfer_memo       TEXT DEFAULT '',
    transfer_date       TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 5. 해지 신청 테이블 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS cancellations (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    complex_id      UUID NOT NULL REFERENCES complexes(id),
    application_id  UUID REFERENCES applications(id),
    dong            TEXT NOT NULL,
    ho              TEXT NOT NULL,
    name            TEXT NOT NULL,
    phone           TEXT NOT NULL,
    program_name    TEXT DEFAULT '',
    reason          TEXT DEFAULT '',
    status          TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    refund_amount   INTEGER DEFAULT 0,
    processed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 6. 공지사항 테이블 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS notices (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    complex_id  UUID NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    is_pinned   BOOLEAN DEFAULT false,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 7. 문의 테이블 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inquiries (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    complex_id  UUID NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
    dong        TEXT DEFAULT '',
    ho          TEXT DEFAULT '',
    name        TEXT NOT NULL,
    phone       TEXT DEFAULT '',
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    is_public   BOOLEAN DEFAULT true,
    is_hidden   BOOLEAN DEFAULT false,
    answer      TEXT DEFAULT '',
    answered_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 8. 커리큘럼 테이블 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS curricula (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    complex_id  UUID NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
    year        INTEGER NOT NULL,
    month       INTEGER NOT NULL,
    title       TEXT DEFAULT '',
    content     TEXT DEFAULT '',
    image_url   TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 인덱스 생성 ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_applications_complex ON applications(complex_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_phone ON applications(phone);
CREATE INDEX IF NOT EXISTS idx_applications_dong_ho ON applications(dong, ho);
CREATE INDEX IF NOT EXISTS idx_programs_complex ON programs(complex_id);
CREATE INDEX IF NOT EXISTS idx_notices_complex ON notices(complex_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_complex ON inquiries(complex_id);
CREATE INDEX IF NOT EXISTS idx_cancellations_complex ON cancellations(complex_id);

-- ─── Row Level Security (RLS) ────────────────────────────────
-- 개발 환경: anon key로 모든 CRUD 허용
ALTER TABLE complexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE curricula ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON complexes FOR ALL USING (true);
CREATE POLICY "Allow all" ON programs FOR ALL USING (true);
CREATE POLICY "Allow all" ON instructors FOR ALL USING (true);
CREATE POLICY "Allow all" ON applications FOR ALL USING (true);
CREATE POLICY "Allow all" ON cancellations FOR ALL USING (true);
CREATE POLICY "Allow all" ON notices FOR ALL USING (true);
CREATE POLICY "Allow all" ON inquiries FOR ALL USING (true);
CREATE POLICY "Allow all" ON curricula FOR ALL USING (true);

-- ─── updated_at 자동 갱신 함수 ──────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_complexes_updated_at BEFORE UPDATE ON complexes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_programs_updated_at BEFORE UPDATE ON programs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notices_updated_at BEFORE UPDATE ON notices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 기본 데이터 삽입 ────────────────────────────────────────
-- 기본 단지
INSERT INTO complexes (code, name, address, primary_color, admin_password)
VALUES ('apt-demo', '청주SK뷰자이', '충청북도 청주시 흥덕구', '#667eea', 'admin1234')
ON CONFLICT (code) DO NOTHING;

-- 기본 공지사항
WITH c AS (SELECT id FROM complexes WHERE code = 'apt-demo' LIMIT 1)
INSERT INTO notices (complex_id, title, content, is_pinned)
SELECT c.id,
       '필라테스 센터 이용 안내',
       E'안녕하세요! 커뮤니티 피트니스센터 필라테스 클래스를 이용해주셔서 감사합니다.\n\n■ 운영시간: 평일 09:00 ~ 21:00\n■ 첫 수업일: 접수 후 다음 달 1일부터 시작\n■ 문의: 관리사무소 내선 123',
       true
FROM c
ON CONFLICT DO NOTHING;
