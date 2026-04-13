/**
 * Database Module
 * SQLite 기반 데이터베이스 초기화 및 관리
 * 오류 발생 시 개별 테이블만 재생성 가능 (서버 전체 초기화 불필요)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './data/apartment.db';
const dbDir = path.dirname(path.resolve(DB_PATH));

// 디렉토리 없으면 생성
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

let db;

function getDb() {
    if (!db) {
        db = new Database(path.resolve(DB_PATH));
        db.pragma('journal_mode = WAL');  // 성능 향상
        db.pragma('foreign_keys = ON');   // 외래키 활성화
    }
    return db;
}

/**
 * 전체 스키마 초기화
 * 각 테이블을 독립적으로 생성하므로, 특정 테이블만 수정해도 나머지에 영향 없음
 */
function initializeSchema() {
    const database = getDb();

    // ─── 1. 단지(Complex) 테이블 ────────────────────────────────────────────
    database.exec(`
        CREATE TABLE IF NOT EXISTS complexes (
            id          TEXT PRIMARY KEY,
            code        TEXT UNIQUE NOT NULL,
            name        TEXT NOT NULL,
            address     TEXT,
            logo_url    TEXT,
            primary_color TEXT DEFAULT '#667eea',
            admin_password TEXT DEFAULT 'admin1234',
            is_active   INTEGER DEFAULT 1,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            updated_at  TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // ─── 2. 프로그램 테이블 ─────────────────────────────────────────────────
    database.exec(`
        CREATE TABLE IF NOT EXISTS programs (
            id              TEXT PRIMARY KEY,
            complex_id      TEXT NOT NULL,
            name            TEXT NOT NULL,
            type            TEXT NOT NULL CHECK(type IN ('group','duet','personal')),
            description     TEXT,
            days            TEXT,
            time_slots      TEXT,    -- JSON 배열 ["오전 09시","오전 10시"]
            price           INTEGER DEFAULT 0,
            capacity        INTEGER DEFAULT 6,
            is_active       INTEGER DEFAULT 1,
            display_order   INTEGER DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now','localtime')),
            updated_at      TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (complex_id) REFERENCES complexes(id) ON DELETE CASCADE
        )
    `);

    // ─── 3. 강사 테이블 ─────────────────────────────────────────────────────
    database.exec(`
        CREATE TABLE IF NOT EXISTS instructors (
            id          TEXT PRIMARY KEY,
            complex_id  TEXT NOT NULL,
            name        TEXT NOT NULL,
            title       TEXT,
            bio         TEXT,
            photo_url   TEXT,
            display_order INTEGER DEFAULT 0,
            is_active   INTEGER DEFAULT 1,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (complex_id) REFERENCES complexes(id) ON DELETE CASCADE
        )
    `);

    // ─── 4. 신청(계약) 테이블 ───────────────────────────────────────────────
    database.exec(`
        CREATE TABLE IF NOT EXISTS applications (
            id              TEXT PRIMARY KEY,
            complex_id      TEXT NOT NULL,
            dong            TEXT NOT NULL,
            ho              TEXT NOT NULL,
            name            TEXT NOT NULL,
            phone           TEXT NOT NULL,
            program_id      TEXT,
            program_name    TEXT NOT NULL,
            preferred_time  TEXT,
            status          TEXT DEFAULT 'approved' CHECK(status IN ('approved','waiting','rejected','cancelled','expired','transferred','received')),
            waiting_order   INTEGER,
            signature_name  TEXT,
            signature_data  TEXT,
            signature_date  TEXT,
            agreement       INTEGER DEFAULT 0,
            terms_agreement INTEGER DEFAULT 0,
            notes           TEXT,
            assigned_time   TEXT,
            transfer_from   TEXT,   -- 양도 원본 신청 ID
            transfer_to     TEXT,   -- 양수 신청 ID
            created_at      TEXT DEFAULT (datetime('now','localtime')),
            updated_at      TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (complex_id) REFERENCES complexes(id),
            FOREIGN KEY (program_id) REFERENCES programs(id)
        )
    `);

    // ─── 5. 해지 신청 테이블 ────────────────────────────────────────────────
    database.exec(`
        CREATE TABLE IF NOT EXISTS cancellations (
            id              TEXT PRIMARY KEY,
            complex_id      TEXT NOT NULL,
            application_id  TEXT,
            dong            TEXT NOT NULL,
            ho              TEXT NOT NULL,
            name            TEXT NOT NULL,
            phone           TEXT NOT NULL,
            program_name    TEXT,
            reason          TEXT,
            status          TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
            refund_amount   INTEGER DEFAULT 0,
            processed_at    TEXT,
            created_at      TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (complex_id) REFERENCES complexes(id),
            FOREIGN KEY (application_id) REFERENCES applications(id)
        )
    `);

    // ─── 6. 공지사항 테이블 ─────────────────────────────────────────────────
    database.exec(`
        CREATE TABLE IF NOT EXISTS notices (
            id          TEXT PRIMARY KEY,
            complex_id  TEXT NOT NULL,
            title       TEXT NOT NULL,
            content     TEXT NOT NULL,
            is_pinned   INTEGER DEFAULT 0,
            is_active   INTEGER DEFAULT 1,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            updated_at  TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (complex_id) REFERENCES complexes(id) ON DELETE CASCADE
        )
    `);

    // ─── 7. 문의 테이블 ─────────────────────────────────────────────────────
    database.exec(`
        CREATE TABLE IF NOT EXISTS inquiries (
            id          TEXT PRIMARY KEY,
            complex_id  TEXT NOT NULL,
            dong        TEXT,
            ho          TEXT,
            name        TEXT NOT NULL,
            phone       TEXT,
            title       TEXT NOT NULL,
            content     TEXT NOT NULL,
            is_public   INTEGER DEFAULT 1,
            is_hidden   INTEGER DEFAULT 0,
            answer      TEXT,
            answered_at TEXT,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (complex_id) REFERENCES complexes(id) ON DELETE CASCADE
        )
    `);

    // ─── 8. 커리큘럼 테이블 ─────────────────────────────────────────────────
    database.exec(`
        CREATE TABLE IF NOT EXISTS curricula (
            id          TEXT PRIMARY KEY,
            complex_id  TEXT NOT NULL,
            year        INTEGER NOT NULL,
            month       INTEGER NOT NULL,
            title       TEXT,
            content     TEXT,
            image_url   TEXT,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (complex_id) REFERENCES complexes(id) ON DELETE CASCADE
        )
    `);

    // ─── 인덱스 생성 (성능 최적화) ──────────────────────────────────────────
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_applications_complex ON applications(complex_id);
        CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
        CREATE INDEX IF NOT EXISTS idx_applications_phone ON applications(phone);
        CREATE INDEX IF NOT EXISTS idx_applications_dong_ho ON applications(dong, ho);
        CREATE INDEX IF NOT EXISTS idx_programs_complex ON programs(complex_id);
        CREATE INDEX IF NOT EXISTS idx_notices_complex ON notices(complex_id);
        CREATE INDEX IF NOT EXISTS idx_inquiries_complex ON inquiries(complex_id);
        CREATE INDEX IF NOT EXISTS idx_cancellations_complex ON cancellations(complex_id);
    `);

    // ─── 마이그레이션: applications 테이블에 잔여횟수/관리비 컬럼 추가 ──────
    const appCols = database.prepare("PRAGMA table_info(applications)").all().map(c => c.name);
    if (!appCols.includes('remaining_sessions')) {
        database.exec(`ALTER TABLE applications ADD COLUMN remaining_sessions INTEGER DEFAULT NULL`);
    }
    if (!appCols.includes('total_sessions')) {
        database.exec(`ALTER TABLE applications ADD COLUMN total_sessions INTEGER DEFAULT NULL`);
    }
    if (!appCols.includes('monthly_fee')) {
        database.exec(`ALTER TABLE applications ADD COLUMN monthly_fee INTEGER DEFAULT NULL`);
    }
    if (!appCols.includes('transfer_memo')) {
        database.exec(`ALTER TABLE applications ADD COLUMN transfer_memo TEXT DEFAULT NULL`);
    }
    if (!appCols.includes('transfer_date')) {
        database.exec(`ALTER TABLE applications ADD COLUMN transfer_date TEXT DEFAULT NULL`);
    }

    console.log('✅ Database schema initialized');
}

/**
 * 샘플 데이터 삽입 (최초 1회)
 */
function seedDefaultData() {
    const database = getDb();

    const existing = database.prepare('SELECT id FROM complexes LIMIT 1').get();
    if (existing) return; // 이미 데이터 있으면 스킵

    const { v4: uuidv4 } = require('uuid');

    // 기본 단지 생성
    const complexId = uuidv4();
    database.prepare(`
        INSERT INTO complexes (id, code, name, address, primary_color, admin_password)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(complexId, 'apt-demo', '청주SK뷰자이', '충청북도 청주시 흥덕구', '#667eea', 'admin1234');

    // 기본 프로그램 생성
    const programs = [
        {
            name: '화&목 6:1 그룹수업',
            type: 'group',
            days: '화, 목',
            time_slots: JSON.stringify(['오전 09시', '오전 10시', '오전 11시', '오후 12시', '저녁 18시', '저녁 19시', '저녁 20시']),
            price: 180000,
            capacity: 6,
            display_order: 1
        },
        {
            name: '월수금 6:1 그룹수업',
            type: 'group',
            days: '월, 수, 금',
            time_slots: JSON.stringify(['오전 09시', '오전 10시', '오전 11시', '저녁 19시', '저녁 20시']),
            price: 200000,
            capacity: 6,
            display_order: 2
        },
        {
            name: '1:1 개인 레슨',
            type: 'personal',
            days: '월~금',
            time_slots: JSON.stringify([]),
            price: 350000,
            capacity: 1,
            display_order: 3
        },
        {
            name: '1:2 듀엣 레슨',
            type: 'duet',
            days: '월~금',
            time_slots: JSON.stringify([]),
            price: 250000,
            capacity: 2,
            display_order: 4
        }
    ];

    const insertProgram = database.prepare(`
        INSERT INTO programs (id, complex_id, name, type, days, time_slots, price, capacity, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of programs) {
        insertProgram.run(uuidv4(), complexId, p.name, p.type, p.days, p.time_slots, p.price, p.capacity, p.display_order);
    }

    // 기본 공지사항
    const noticeContent = '안녕하세요! 커뮤니티 피트니스센터 필라테스 클래스를 이용해주셔서 감사합니다.\n\n■ 운영시간: 평일 09:00 ~ 21:00\n■ 첫 수업일: 접수 후 다음 달 1일부터 시작\n■ 문의: 관리사무소 내선 123';
    database.prepare(`
        INSERT INTO notices (id, complex_id, title, content, is_pinned)
        VALUES (?, ?, ?, ?, 1)
    `).run(uuidv4(), complexId, '필라테스 센터 이용 안내', noticeContent);

    console.log('✅ Default data seeded - Complex ID:', complexId, '| Code: apt-demo');
}

module.exports = { getDb, initializeSchema, seedDefaultData };
