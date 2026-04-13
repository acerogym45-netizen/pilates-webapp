/**
 * 파일 업로드 & CSV 가져오기 API
 */
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
require('dotenv').config();

/* ── 이미지 업로드 ─────────────────────────────────────────────────────── */
const UPLOAD_DIR = process.env.UPLOAD_DIR || './public/uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const imgStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename:    (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const imgFilter = (req, file, cb) => {
    /jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(new Error('이미지 파일만 허용됩니다'));
};
const uploadImage = multer({ storage: imgStorage, fileFilter: imgFilter, limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/image', uploadImage.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: '파일이 없습니다' });
    res.json({ success: true, url: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

router.delete('/image/:filename', (req, res) => {
    const filePath = path.join(UPLOAD_DIR, req.params.filename);
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return res.json({ success: true }); }
    res.status(404).json({ success: false, error: '파일을 찾을 수 없습니다' });
});

/* ── CSV 가져오기 (메모리 저장) ───────────────────────────────────────── */
const csvStorage  = multer.memoryStorage();
const csvFilter   = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    (ext === '.csv' || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel')
        ? cb(null, true)
        : cb(new Error('CSV 파일만 허용됩니다'));
};
const uploadCsv = multer({ storage: csvStorage, fileFilter: csvFilter, limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * CSV 파싱 헬퍼
 * - BOM 제거, 큰따옴표 처리
 */
function parseCsv(buffer) {
    let text = buffer.toString('utf-8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM 제거

    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };

    const parseRow = (line) => {
        const result = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                else inQ = !inQ;
            } else if (ch === ',' && !inQ) {
                result.push(cur.trim()); cur = '';
            } else {
                cur += ch;
            }
        }
        result.push(cur.trim());
        return result;
    };

    const headers = parseRow(lines[0]);
    const rows    = lines.slice(1).map(l => {
        const vals = parseRow(l);
        const obj  = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
    });
    return { headers, rows };
}

/** 신청 CSV 컬럼 → DB 컬럼 매핑 */
const APP_COL_MAP = {
    '동':      'dong',
    '호수':    'ho',
    '이름':    'name',
    '전화번호':'phone',
    '프로그램':'program_name',
    '희망시간':'preferred_time',
    '상태':    'status',
    '메모':    'notes',
    // 영문 헤더도 지원
    dong:'dong', ho:'ho', name:'name', phone:'phone',
    program_name:'program_name', preferred_time:'preferred_time',
    status:'status', notes:'notes'
};

const STATUS_MAP = {
    '승인':'approved','대기':'waiting','거부':'rejected',
    '해지':'cancelled','만료':'expired','이관':'transferred','접수':'received',
    approved:'approved', waiting:'waiting', rejected:'rejected',
    cancelled:'cancelled', expired:'expired', transferred:'transferred', received:'received'
};

/**
 * POST /api/upload/csv/applications
 * Body (multipart): file=<CSV>, complex_id=<uuid>, overwrite=<'true'|'false'>
 * overwrite=true 이면 동(dong)+호수(ho)+프로그램이 같은 기존 row를 업데이트
 */
router.post('/csv/applications', uploadCsv.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'CSV 파일이 없습니다' });
        const { complex_id, overwrite } = req.body;
        if (!complex_id) return res.status(400).json({ success: false, error: 'complex_id 필수' });

        const db = getDb();
        const cx = db.prepare('SELECT id FROM complexes WHERE id = ?').get(complex_id);
        if (!cx) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });

        const { rows } = parseCsv(req.file.buffer);
        if (!rows.length) return res.status(400).json({ success: false, error: 'CSV에 데이터가 없습니다' });

        let inserted = 0, updated = 0, skipped = 0;

        const insertStmt = db.prepare(`
            INSERT INTO applications
              (id, complex_id, dong, ho, name, phone, program_name, preferred_time, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const updateStmt = db.prepare(`
            UPDATE applications
            SET phone=?, preferred_time=?, status=?, notes=?, updated_at=datetime('now','localtime')
            WHERE complex_id=? AND dong=? AND ho=? AND program_name=?
        `);
        const findStmt = db.prepare(`
            SELECT id FROM applications
            WHERE complex_id=? AND dong=? AND ho=? AND program_name=?
            LIMIT 1
        `);

        const doImport = db.transaction(() => {
            for (const row of rows) {
                // 헤더 매핑
                const mapped = {};
                for (const [k, v] of Object.entries(row)) {
                    const dbCol = APP_COL_MAP[k.trim()];
                    if (dbCol) mapped[dbCol] = v;
                }

                const { dong, ho, name, phone, program_name,
                        preferred_time = '', status = 'received', notes = '' } = mapped;

                if (!dong || !ho || !name) { skipped++; continue; }

                const normalStatus = STATUS_MAP[status] || 'received';
                const existing = findStmt.get(complex_id, dong, ho, program_name || '');

                if (existing) {
                    if (overwrite === 'true') {
                        updateStmt.run(phone, preferred_time, normalStatus, notes,
                                       complex_id, dong, ho, program_name || '');
                        updated++;
                    } else {
                        skipped++;
                    }
                } else {
                    insertStmt.run(uuidv4(), complex_id, dong, ho, name, phone || '',
                                   program_name || '', preferred_time, normalStatus, notes);
                    inserted++;
                }
            }
        });

        doImport();

        res.json({
            success: true,
            message: `가져오기 완료: 신규 ${inserted}건, 업데이트 ${updated}건, 건너뜀 ${skipped}건`,
            inserted, updated, skipped,
            total: rows.length
        });
    } catch (e) {
        console.error('CSV import error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/upload/csv/inquiries
 * Body (multipart): file=<CSV>, complex_id=<uuid>
 */
router.post('/csv/inquiries', uploadCsv.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'CSV 파일이 없습니다' });
        const { complex_id } = req.body;
        if (!complex_id) return res.status(400).json({ success: false, error: 'complex_id 필수' });

        const db = getDb();
        const cx = db.prepare('SELECT id FROM complexes WHERE id = ?').get(complex_id);
        if (!cx) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });

        const { rows } = parseCsv(req.file.buffer);
        if (!rows.length) return res.status(400).json({ success: false, error: 'CSV에 데이터가 없습니다' });

        const INQ_COL_MAP = {
            '이름':'name','제목':'title','내용':'content',
            '동':'dong','호수':'ho','전화번호':'phone','답변':'answer',
            name:'name', title:'title', content:'content',
            dong:'dong', ho:'ho', phone:'phone', answer:'answer'
        };

        let inserted = 0, skipped = 0;

        const insertStmt = db.prepare(`
            INSERT INTO inquiries (id, complex_id, name, dong, ho, phone, title, content, answer, is_answered)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const doImport = db.transaction(() => {
            for (const row of rows) {
                const mapped = {};
                for (const [k, v] of Object.entries(row)) {
                    const dbCol = INQ_COL_MAP[k.trim()];
                    if (dbCol) mapped[dbCol] = v;
                }
                const { name, title, content, dong = '', ho = '',
                        phone = '', answer = '' } = mapped;
                if (!name || !title || !content) { skipped++; continue; }
                insertStmt.run(uuidv4(), complex_id, name, dong, ho, phone,
                               title, content, answer, answer ? 1 : 0);
                inserted++;
            }
        });

        doImport();

        res.json({
            success: true,
            message: `가져오기 완료: 신규 ${inserted}건, 건너뜀 ${skipped}건`,
            inserted, skipped, total: rows.length
        });
    } catch (e) {
        console.error('CSV inquiry import error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/upload/csv/template/applications
 * 신청 가져오기용 CSV 템플릿 다운로드
 */
router.get('/csv/template/applications', (req, res) => {
    const bom = '\uFEFF';
    const header = '동,호수,이름,전화번호,프로그램,희망시간,상태,메모';
    const example = '101동,1001호,홍길동,010-1234-5678,화&목 6:1 그룹수업,09:00,승인,전월이월';
    const statusNote = '# 상태값: 승인/대기/거부/해지/만료/이관/접수';
    const csv = bom + [header, example, statusNote].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="applications_template.csv"');
    res.send(csv);
});

/**
 * GET /api/upload/csv/template/inquiries
 * 문의 가져오기용 CSV 템플릿 다운로드
 */
router.get('/csv/template/inquiries', (req, res) => {
    const bom = '\uFEFF';
    const header = '이름,동,호수,전화번호,제목,내용,답변';
    const example = '홍길동,101동,1001호,010-1234-5678,수업 문의,수업 시간 변경 가능한가요?,네 가능합니다';
    const csv = bom + [header, example].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inquiries_template.csv"');
    res.send(csv);
});

module.exports = router;
