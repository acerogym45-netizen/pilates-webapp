/**
 * 파일 업로드 & CSV 가져오기 API - Supabase 버전
 */
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getSupabase, sbErr } = require('../db-supabase');
require('dotenv').config();

/* ── 이미지 업로드 ─────────────────────────────────────────────────────── */
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads';
try {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) {
    console.warn('UPLOAD_DIR 생성 실패 (무시):', e.message);
}

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
 * - UTF-8 BOM, UTF-8, EUC-KR(CP949) 자동 감지
 * - 큰따옴표 처리
 */
const iconv = require('iconv-lite');

function parseCsv(buffer) {
    let text;

    // 1) UTF-8 BOM (EF BB BF) → UTF-8로 확정
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        text = buffer.slice(3).toString('utf-8');
    }
    // 2) EUC-KR BOM 없음: UTF-8 디코드 후 FFFD replacement 비율로 판단
    else {
        const asUtf8 = buffer.toString('utf-8');
        const fffdCount = (asUtf8.match(/\uFFFD/g) || []).length;
        // FFFD 비율이 2% 초과면 EUC-KR(CP949)로 재디코드
        if (fffdCount / Math.max(asUtf8.length, 1) > 0.02) {
            text = iconv.decode(buffer, 'cp949');
        } else {
            text = asUtf8;
        }
    }

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

/** 신청 CSV 컬럼 → DB 컬럼 매핑 (한글/영문 모두 지원) */
const APP_COL_MAP = {
    '동':      'dong',
    '호수':    'ho',
    '이름':    'name',
    '전화번호':'phone',
    '프로그램':'program_name',
    '희망시간':'preferred_time',
    '상태':    'status',
    '메모':    'notes',
    dong:'dong', ho:'ho', name:'name', phone:'phone',
    program_name:'program_name', preferred_time:'preferred_time',
    status:'status', notes:'notes'
};

/** 상태값 정규화 - 내보내기(export) 한글 레이블도 역매핑 */
const STATUS_MAP = {
    // 한글 → 영문
    '승인':'approved', '대기':'waiting',  '거부':'rejected',
    '해지':'cancelled','만료':'expired',  '이관':'transferred',
    '접수':'received', '양도':'transferred','양수':'received',
    '대기중':'waiting',
    // 영문 → 영문 (패스스루)
    approved:'approved', waiting:'waiting', rejected:'rejected',
    cancelled:'cancelled', expired:'expired', transferred:'transferred',
    received:'received'
};

/**
 * POST /api/upload/csv/applications
 * Body (multipart): file=<CSV>, complex_id=<uuid>, overwrite=<'true'|'false'>
 *
 * overwrite=false (기본): 중복 체크 없이 무조건 insert
 * overwrite=true        : 동+호+이름+프로그램 일치 시 update, 없으면 insert
 */
router.post('/csv/applications', uploadCsv.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'CSV 파일이 없습니다' });
        const { complex_id, overwrite } = req.body;
        if (!complex_id) return res.status(400).json({ success: false, error: 'complex_id 필수' });

        const sb = getSupabase();

        // 단지 존재 확인
        const { data: cx, error: cxErr } = await sb
            .from('complexes').select('id').eq('id', complex_id).single();
        if (cxErr || !cx) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });

        const { headers, rows } = parseCsv(req.file.buffer);
        if (!rows.length) return res.status(400).json({ success: false, error: 'CSV에 데이터가 없습니다' });

        console.log('[CSV import] headers:', headers);
        console.log('[CSV import] row count:', rows.length, '| first row:', rows[0]);
        console.log('[CSV import] overwrite mode:', overwrite);

        let inserted = 0, updated = 0, skipped = 0;
        const skipReasons = [];

        for (const row of rows) {
            // 컬럼명 → DB 필드 매핑
            const mapped = {};
            for (const [k, v] of Object.entries(row)) {
                const dbCol = APP_COL_MAP[k.trim()];
                if (dbCol) mapped[dbCol] = v;
            }

            const dong           = mapped.dong          || '';
            const ho             = mapped.ho            || '';
            const name           = mapped.name          || '';
            const phone          = mapped.phone         || '';
            const program_name   = mapped.program_name  || '';
            const preferred_time = mapped.preferred_time|| '';
            const status         = mapped.status        || 'received';
            const notes          = mapped.notes         || '';

            // 필수 필드(동, 호수, 이름) 누락 시 skip
            if (!dong || !ho || !name) {
                const reason = `dong=${dong||'(없음)'}, ho=${ho||'(없음)'}, name=${name||'(없음)'} ← keys: [${Object.keys(row).join(', ')}]`;
                skipReasons.push(reason);
                console.warn('[CSV skip] 필수 필드 누락:', reason);
                skipped++;
                continue;
            }

            const normalStatus = STATUS_MAP[status] || STATUS_MAP[status?.toLowerCase()] || 'received';

            if (overwrite === 'true') {
                // ── 덮어쓰기 모드: 기존 항목 찾아서 update, 없으면 insert ──
                const { data: existing, error: findErr } = await sb
                    .from('applications')
                    .select('id')
                    .eq('complex_id', complex_id)
                    .eq('dong', dong)
                    .eq('ho', ho)
                    .eq('name', name)
                    .eq('program_name', program_name)
                    .maybeSingle();

                if (findErr) {
                    console.warn('[CSV overwrite] find error:', findErr.message, { dong, ho, name });
                    // 조회 실패해도 insert 시도
                }

                if (existing) {
                    await sb.from('applications')
                        .update({
                            phone, preferred_time,
                            status: normalStatus, notes,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existing.id);
                    updated++;
                } else {
                    await sb.from('applications').insert({
                        id: uuidv4(), complex_id, dong, ho, name,
                        phone, program_name, preferred_time,
                        status: normalStatus, notes
                    });
                    inserted++;
                }
            } else {
                // ── 기본 모드: 중복 체크 없이 무조건 insert ──
                await sb.from('applications').insert({
                    id: uuidv4(), complex_id, dong, ho, name,
                    phone, program_name, preferred_time,
                    status: normalStatus, notes
                });
                inserted++;
            }
        }

        console.log(`[CSV import] done — inserted:${inserted}, updated:${updated}, skipped:${skipped}`);

        res.json({
            success: true,
            message: `가져오기 완료: 신규 ${inserted}건, 업데이트 ${updated}건, 건너뜀 ${skipped}건`,
            inserted, updated, skipped,
            total: rows.length,
            debug: { headers, skipReasons: skipReasons.slice(0, 10) }
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
router.post('/csv/inquiries', uploadCsv.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'CSV 파일이 없습니다' });
        const { complex_id } = req.body;
        if (!complex_id) return res.status(400).json({ success: false, error: 'complex_id 필수' });

        const sb = getSupabase();

        const { data: cx, error: cxErr } = await sb
            .from('complexes').select('id').eq('id', complex_id).single();
        if (cxErr || !cx) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });

        const { rows } = parseCsv(req.file.buffer);
        if (!rows.length) return res.status(400).json({ success: false, error: 'CSV에 데이터가 없습니다' });

        const INQ_COL_MAP = {
            '이름':'name','제목':'title','내용':'content',
            '동':'dong','호수':'ho','전화번호':'phone','답변':'answer',
            name:'name', title:'title', content:'content',
            dong:'dong', ho:'ho', phone:'phone', answer:'answer'
        };

        let inserted = 0, skipped = 0;

        for (const row of rows) {
            const mapped = {};
            for (const [k, v] of Object.entries(row)) {
                const dbCol = INQ_COL_MAP[k.trim()];
                if (dbCol) mapped[dbCol] = v;
            }
            const { name, title, content, dong = '', ho = '',
                    phone = '', answer = '' } = mapped;
            if (!name || !title || !content) { skipped++; continue; }

            await sb.from('inquiries').insert({
                id: uuidv4(), complex_id, name, dong, ho, phone,
                title, content, answer, is_answered: answer ? true : false
            });
            inserted++;
        }

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
