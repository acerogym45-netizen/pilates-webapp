/**
 * 신청(Applications) API 라우터
 * - 자동 승인 / 정원 초과시 대기 등록
 * - 중복 신청 방지
 * - 페이지네이션 지원
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { v4: uuidv4 } = require('uuid');

// ── 목록 조회 ────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const { complexId, complexCode, status, programId, dong, ho, phone, page = 1, limit = 100 } = req.query;
        
        let query = `
            SELECT a.*, p.name as program_name_ref, c.code as complex_code 
            FROM applications a
            LEFT JOIN programs p ON a.program_id = p.id
            JOIN complexes c ON a.complex_id = c.id
            WHERE 1=1
        `;
        const params = [];
        
        if (complexId)   { query += ' AND a.complex_id = ?';   params.push(complexId); }
        if (complexCode) { query += ' AND c.code = ?';         params.push(complexCode); }
        if (status)      { query += ' AND a.status = ?';       params.push(status); }
        if (programId)   { query += ' AND a.program_id = ?';   params.push(programId); }
        if (dong)        { query += ' AND a.dong LIKE ?';      params.push(`%${dong}%`); }
        if (ho)          { query += ' AND a.ho LIKE ?';        params.push(`%${ho}%`); }
        if (phone)       { query += ' AND a.phone LIKE ?';     params.push(`%${phone}%`); }
        
        query += ' ORDER BY a.created_at DESC';
        
        const offset = (parseInt(page) - 1) * parseInt(limit);
        query += ` LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);
        
        const rows = db.prepare(query).all(...params);
        res.json({ success: true, data: rows, page: parseInt(page), limit: parseInt(limit) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 내 신청 조회 (입주민용 - 동/호수/전화번호 뒷4자리) ─────────────────────
router.get('/my', (req, res) => {
    try {
        const db = getDb();
        const { complexCode, dong, ho, phone4 } = req.query;
        if (!complexCode || !dong || !ho || !phone4) {
            return res.status(400).json({ success: false, error: '단지코드, 동, 호수, 전화번호 뒤 4자리 필수' });
        }
        
        const rows = db.prepare(`
            SELECT a.id, a.dong, a.ho, a.name, a.phone, a.program_name, a.preferred_time,
                   a.status, a.waiting_order, a.created_at, c.code as complex_code
            FROM applications a
            JOIN complexes c ON a.complex_id = c.id
            WHERE c.code = ? AND a.dong LIKE ? AND a.ho LIKE ? AND a.phone LIKE ?
            ORDER BY a.created_at DESC
        `).all(complexCode, `%${dong}%`, `%${ho}%`, `%${phone4}`);
        
        // 개인정보 마스킹
        const masked = rows.map(r => ({
            ...r,
            dong: maskText(r.dong),
            ho:   maskText(r.ho),
            name: maskName(r.name),
            phone: maskPhone(r.phone)
        }));
        
        res.json({ success: true, data: masked });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 단일 조회 ────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: '신청을 찾을 수 없습니다' });
        res.json({ success: true, data: row });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 신청 생성 (자동 승인 / 대기 처리) ───────────────────────────────────────
router.post('/', (req, res) => {
    try {
        const db = getDb();
        const { complex_id, dong, ho, name, phone, program_id, program_name, preferred_time,
                signature_name, signature_data, signature_date, agreement, terms_agreement, notes } = req.body;
        
        if (!complex_id || !dong || !ho || !name || !phone || !program_name) {
            return res.status(400).json({ success: false, error: '필수 항목이 누락되었습니다' });
        }
        
        // 중복 신청 체크 (같은 단지, 동호수, 프로그램)
        const duplicate = db.prepare(`
            SELECT id FROM applications 
            WHERE complex_id = ? AND dong = ? AND ho = ? AND program_name = ? 
            AND status IN ('approved','waiting')
        `).get(complex_id, dong, ho, program_name);
        
        if (duplicate) {
            return res.status(409).json({ 
                success: false, 
                error: '이미 해당 프로그램에 신청하셨습니다',
                existingId: duplicate.id
            });
        }
        
        // 정원 확인 (그룹 프로그램만)
        let status = 'approved';
        let waitingOrder = null;
        
        if (program_id && preferred_time) {
            const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(program_id);
            if (program && program.type === 'group') {
                const approvedCount = db.prepare(`
                    SELECT COUNT(*) as cnt FROM applications 
                    WHERE program_id = ? AND preferred_time = ? AND status = 'approved'
                `).get(program_id, preferred_time);
                
                if (approvedCount.cnt >= program.capacity) {
                    status = 'waiting';
                    // 대기 순번 부여
                    const lastWaiting = db.prepare(`
                        SELECT MAX(waiting_order) as maxOrder FROM applications
                        WHERE program_id = ? AND preferred_time = ? AND status = 'waiting'
                    `).get(program_id, preferred_time);
                    waitingOrder = (lastWaiting.maxOrder || 0) + 1;
                }
            }
        }
        
        const id = uuidv4();
        db.prepare(`
            INSERT INTO applications 
            (id, complex_id, dong, ho, name, phone, program_id, program_name, preferred_time,
             status, waiting_order, signature_name, signature_data, signature_date, agreement, terms_agreement, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, complex_id, dong, ho, name, phone, program_id || null, program_name, preferred_time || null,
               status, waitingOrder, signature_name || '', signature_data || '', signature_date || '',
               agreement ? 1 : 0, terms_agreement ? 1 : 0, notes || '');
        
        const created = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
        res.status(201).json({ success: true, data: created, status, waitingOrder });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 신청 수정 ────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
    try {
        const db = getDb();
        const { dong, ho, name, phone, program_name, preferred_time, status, notes, assigned_time } = req.body;
        
        const current = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
        if (!current) return res.status(404).json({ success: false, error: '신청을 찾을 수 없습니다' });
        
        db.prepare(`
            UPDATE applications 
            SET dong=?, ho=?, name=?, phone=?, program_name=?, preferred_time=?, status=?, notes=?, assigned_time=?,
                updated_at=datetime('now','localtime')
            WHERE id=?
        `).run(dong ?? current.dong, ho ?? current.ho, name ?? current.name, phone ?? current.phone,
               program_name ?? current.program_name, preferred_time ?? current.preferred_time,
               status ?? current.status, notes ?? current.notes, assigned_time ?? current.assigned_time,
               req.params.id);
        
        // 승인 상태로 변경 시 대기자 알림 처리 트리거 (옵션)
        if (status === 'cancelled' || status === 'expired' || status === 'transferred') {
            promoteWaitingApplicant(db, current.program_id, current.preferred_time);
        }
        
        const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
        res.json({ success: true, data: updated });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 신청 삭제 ────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: '삭제되었습니다' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 대기자 자동 승급 ─────────────────────────────────────────────────────────
function promoteWaitingApplicant(db, programId, preferredTime) {
    if (!programId || !preferredTime) return;
    
    const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(programId);
    if (!program) return;
    
    const approvedCount = db.prepare(`
        SELECT COUNT(*) as cnt FROM applications
        WHERE program_id = ? AND preferred_time = ? AND status = 'approved'
    `).get(programId, preferredTime);
    
    if (approvedCount.cnt < program.capacity) {
        const nextWaiting = db.prepare(`
            SELECT * FROM applications
            WHERE program_id = ? AND preferred_time = ? AND status = 'waiting'
            ORDER BY waiting_order ASC LIMIT 1
        `).get(programId, preferredTime);
        
        if (nextWaiting) {
            db.prepare(`
                UPDATE applications SET status = 'approved', waiting_order = NULL,
                updated_at = datetime('now','localtime')
                WHERE id = ?
            `).run(nextWaiting.id);
            console.log(`✅ Promoted waiting applicant: ${nextWaiting.name} (${nextWaiting.dong} ${nextWaiting.ho})`);
        }
    }
}

// 마스킹 유틸
function maskText(str) {
    if (!str || str.length <= 1) return str;
    return str.slice(0, -1) + 'x';
}
function maskName(str) {
    if (!str || str.length <= 1) return str;
    return str.slice(0, -1) + 'x';
}
function maskPhone(str) {
    if (!str) return str;
    return str.replace(/(\d{3})-(\d{4})-(\d{4})/, '$1-****-$2x');
}

module.exports = router;
