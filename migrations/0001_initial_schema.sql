-- 필라테스 신청 시스템 데이터베이스 스키마
-- 생성일: 2026-03-20

-- 1. 방명록 테이블
DROP TABLE IF EXISTS guestbook;
CREATE TABLE guestbook (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  message TEXT NOT NULL,
  replies TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 문의사항 테이블
DROP TABLE IF EXISTS pilates_inquiries;
CREATE TABLE pilates_inquiries (
  id TEXT PRIMARY KEY,
  dong TEXT NOT NULL,
  ho TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_public BOOLEAN DEFAULT 0,
  reply TEXT,
  reply_date DATETIME,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 신청서/계약서 테이블
DROP TABLE IF EXISTS pilates_contracts;
CREATE TABLE pilates_contracts (
  id TEXT PRIMARY KEY,
  dong TEXT NOT NULL,
  ho TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  lesson_type TEXT NOT NULL,
  preferred_time TEXT NOT NULL,
  start_date TEXT,
  agreement BOOLEAN DEFAULT 0,
  terms_agreement BOOLEAN DEFAULT 0,
  signature TEXT,
  signature_image TEXT,
  signature_date TEXT,
  status TEXT DEFAULT 'approved',
  complex_code TEXT DEFAULT 'cheongju-sk',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. 취소/환불 신청 테이블
DROP TABLE IF EXISTS pilates_cancellations;
CREATE TABLE pilates_cancellations (
  id TEXT PRIMARY KEY,
  contract_id TEXT,
  dong TEXT NOT NULL,
  ho TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  lesson_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  refund_bank TEXT,
  refund_account TEXT,
  refund_holder TEXT,
  status TEXT DEFAULT 'pending',
  admin_note TEXT,
  processed_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contract_id) REFERENCES pilates_contracts(id)
);

-- 5. 프로그램 테이블
DROP TABLE IF EXISTS programs;
CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER,
  max_capacity INTEGER DEFAULT 6,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  is_personal_lesson BOOLEAN DEFAULT 0,
  available_times TEXT,
  complex_code TEXT DEFAULT 'cheongju-sk',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. 공지사항 테이블
DROP TABLE IF EXISTS notices;
CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT DEFAULT 'admin',
  is_active BOOLEAN DEFAULT 1,
  pinned BOOLEAN DEFAULT 0,
  views INTEGER DEFAULT 0,
  complex_code TEXT DEFAULT 'cheongju-sk',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. 강사 테이블
DROP TABLE IF EXISTS instructors;
CREATE TABLE instructors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bio TEXT,
  profile_image TEXT,
  certifications TEXT,
  specialties TEXT,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  complex_code TEXT DEFAULT 'cheongju-sk',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. 커리큘럼 테이블
DROP TABLE IF EXISTS curriculums;
CREATE TABLE curriculums (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  month TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  content TEXT,
  is_active BOOLEAN DEFAULT 1,
  complex_code TEXT DEFAULT 'cheongju-sk',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. 단지 설정 테이블
DROP TABLE IF EXISTS complex_settings;
CREATE TABLE complex_settings (
  id TEXT PRIMARY KEY,
  complex_code TEXT UNIQUE NOT NULL,
  complex_name TEXT NOT NULL,
  address TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  admin_password TEXT DEFAULT 'admin1234',
  master_password TEXT,
  is_active BOOLEAN DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  settings_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON pilates_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON pilates_inquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON pilates_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_created ON pilates_contracts(created_at);
CREATE INDEX IF NOT EXISTS idx_contracts_lesson ON pilates_contracts(lesson_type);
CREATE INDEX IF NOT EXISTS idx_cancellations_status ON pilates_cancellations(status);
CREATE INDEX IF NOT EXISTS idx_programs_active ON programs(is_active);
CREATE INDEX IF NOT EXISTS idx_notices_active ON notices(is_active);
CREATE INDEX IF NOT EXISTS idx_instructors_active ON instructors(is_active);
CREATE INDEX IF NOT EXISTS idx_curriculums_active ON curriculums(is_active);

-- 기본 단지 설정 데이터 삽입
INSERT INTO complex_settings (
  id, 
  complex_code, 
  complex_name, 
  address,
  admin_password, 
  master_password,
  display_order
) VALUES (
  '1',
  'cheongju-sk',
  '청주SK뷰자이',
  '충청북도 청주시',
  'admin1234',
  'master1234',
  1
);
