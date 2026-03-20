-- Supabase PostgreSQL Migration
-- Pilates Lesson Management System

-- Programs Table
CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER DEFAULT 0,
  max_capacity INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_personal_lesson BOOLEAN DEFAULT false,
  available_times TEXT,
  complex_code TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contracts Table
CREATE TABLE IF NOT EXISTS pilates_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dong TEXT,
  ho TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  lesson_type TEXT,
  preferred_time TEXT,
  agreement BOOLEAN DEFAULT false,
  terms_agreement BOOLEAN DEFAULT false,
  signature TEXT,
  signature_image TEXT,
  signature_date TEXT,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inquiries Table
CREATE TABLE IF NOT EXISTS pilates_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dong TEXT,
  ho TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_public BOOLEAN DEFAULT true,
  reply TEXT,
  reply_date TIMESTAMP,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notices Table
CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT,
  is_pinned BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  complex_code TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Instructors Table
CREATE TABLE IF NOT EXISTS instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  specialization TEXT,
  bio TEXT,
  photo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  complex_code TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Curriculums Table
CREATE TABLE IF NOT EXISTS curriculums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  level TEXT,
  duration_weeks INTEGER,
  sessions_per_week INTEGER,
  content TEXT,
  is_active BOOLEAN DEFAULT true,
  complex_code TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cancellations Table
CREATE TABLE IF NOT EXISTS pilates_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES pilates_contracts(id),
  reason TEXT NOT NULL,
  refund_amount INTEGER DEFAULT 0,
  refund_method TEXT,
  status TEXT DEFAULT 'pending',
  processed_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Complex Settings Table
CREATE TABLE IF NOT EXISTS complex_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_code TEXT UNIQUE NOT NULL,
  complex_name TEXT NOT NULL,
  address TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  settings JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Guestbook Table
CREATE TABLE IF NOT EXISTS guestbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author TEXT NOT NULL,
  message TEXT NOT NULL,
  replies JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_programs_complex ON programs(complex_code);
CREATE INDEX IF NOT EXISTS idx_programs_active ON programs(is_active);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON pilates_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_phone ON pilates_contracts(phone);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON pilates_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_notices_pinned ON notices(is_pinned);
CREATE INDEX IF NOT EXISTS idx_instructors_active ON instructors(is_active);
CREATE INDEX IF NOT EXISTS idx_cancellations_contract ON pilates_cancellations(contract_id);

-- Insert sample complex setting
INSERT INTO complex_settings (complex_code, complex_name, address, contact_phone, contact_email)
VALUES ('DEFAULT', '필라테스 관리 시스템', '서울시 강남구', '02-1234-5678', 'info@pilates.com')
ON CONFLICT (complex_code) DO NOTHING;
