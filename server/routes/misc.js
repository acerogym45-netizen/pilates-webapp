/**
 * 공지사항 / 문의 / 강사 / 커리큘럼 / 해지 API 라우터
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════════════════════
// 공지사항 (Notices)
// ═══════════════════════════════════════════════════════
router.get('/notices', (req, res) => {
    try {
        const db = getDb();
        const { complexCode, complexId } = req.query;
        let q = 'SELECT n.*, c.code as complex_code, c.name as complex_name FROM notices n JOIN complexes c ON n.complex_id = c.id WHERE n.is_active = 1';
        const p = [];
        if (complexCode) { q += ' AND c.code = ?'; p.push(complexCode); }
        if (complexId)   { q += ' AND n.complex_id = ?'; p.push(complexId); }
        q += ' ORDER BY n.is_pinned DESC, n.created_at DESC';
        res.json({ success: true, data: db.prepare(q).all(...p) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/notices', (req, res) => {
    try {
        const db = getDb();
        const { complex_id, title, content, is_pinned } = req.body;
        if (!complex_id || !title || !content) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        const id = uuidv4();
        db.prepare('INSERT INTO notices (id,complex_id,title,content,is_pinned) VALUES (?,?,?,?,?)')
          .run(id, complex_id, title, content, is_pinned ? 1 : 0);
        res.status(201).json({ success: true, data: db.prepare('SELECT * FROM notices WHERE id=?').get(id) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/notices/:id', (req, res) => {
    try {
        const db = getDb();
        const { title, content, is_pinned, is_active } = req.body;
        db.prepare(`UPDATE notices SET title=?,content=?,is_pinned=?,is_active=?,updated_at=datetime('now','localtime') WHERE id=?`)
          .run(title, content, is_pinned ? 1 : 0, is_active !== undefined ? (is_active ? 1 : 0) : 1, req.params.id);
        res.json({ success: true, data: db.prepare('SELECT * FROM notices WHERE id=?').get(req.params.id) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/notices/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM notices WHERE id=?').run(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════
// 문의 (Inquiries)
// ═══════════════════════════════════════════════════════
router.get('/inquiries', (req, res) => {
    try {
        const db = getDb();
        const { complexCode, complexId, isAdmin } = req.query;
        let q = 'SELECT i.* FROM inquiries i JOIN complexes c ON i.complex_id = c.id WHERE 1=1';
        const p = [];
        if (complexCode) { q += ' AND c.code = ?'; p.push(complexCode); }
        if (complexId)   { q += ' AND i.complex_id = ?'; p.push(complexId); }
        if (isAdmin !== 'true') {
            q += ' AND i.is_public = 1 AND i.is_hidden = 0';
        }
        q += ' ORDER BY i.created_at DESC';
        res.json({ success: true, data: db.prepare(q).all(...p) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/inquiries', (req, res) => {
    try {
        const db = getDb();
        const { complex_id, dong, ho, name, phone, title, content, is_public } = req.body;
        if (!complex_id || !name || !title || !content) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        const id = uuidv4();
        db.prepare('INSERT INTO inquiries (id,complex_id,dong,ho,name,phone,title,content,is_public) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(id, complex_id, dong || '', ho || '', name, phone || '', title, content, is_public ? 1 : 0);
        res.status(201).json({ success: true, data: db.prepare('SELECT * FROM inquiries WHERE id=?').get(id) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/inquiries/:id', (req, res) => {
    try {
        const db = getDb();
        const { answer, is_hidden } = req.body;
        const answeredAt = answer ? "datetime('now','localtime')" : 'answered_at';
        db.prepare(`UPDATE inquiries SET answer=?, is_hidden=?, answered_at=CASE WHEN ? IS NOT NULL THEN datetime('now','localtime') ELSE answered_at END WHERE id=?`)
          .run(answer, is_hidden ? 1 : 0, answer, req.params.id);
        res.json({ success: true, data: db.prepare('SELECT * FROM inquiries WHERE id=?').get(req.params.id) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/inquiries/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM inquiries WHERE id=?').run(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════
// 강사 (Instructors)
// ═══════════════════════════════════════════════════════
router.get('/instructors', (req, res) => {
    try {
        const db = getDb();
        const { complexCode, complexId } = req.query;
        let q = 'SELECT i.* FROM instructors i JOIN complexes c ON i.complex_id = c.id WHERE i.is_active = 1';
        const p = [];
        if (complexCode) { q += ' AND c.code = ?'; p.push(complexCode); }
        if (complexId)   { q += ' AND i.complex_id = ?'; p.push(complexId); }
        q += ' ORDER BY i.display_order, i.name';
        res.json({ success: true, data: db.prepare(q).all(...p) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/instructors', (req, res) => {
    try {
        const db = getDb();
        const { complex_id, name, title, bio, photo_url, display_order } = req.body;
        if (!complex_id || !name) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        const id = uuidv4();
        db.prepare('INSERT INTO instructors (id,complex_id,name,title,bio,photo_url,display_order) VALUES (?,?,?,?,?,?,?)')
          .run(id, complex_id, name, title || '', bio || '', photo_url || '', display_order || 0);
        res.status(201).json({ success: true, data: db.prepare('SELECT * FROM instructors WHERE id=?').get(id) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/instructors/:id', (req, res) => {
    try {
        const db = getDb();
        const { name, title, bio, photo_url, display_order, is_active } = req.body;
        db.prepare('UPDATE instructors SET name=?,title=?,bio=?,photo_url=?,display_order=?,is_active=? WHERE id=?')
          .run(name, title, bio, photo_url, display_order || 0, is_active !== undefined ? (is_active ? 1 : 0) : 1, req.params.id);
        res.json({ success: true, data: db.prepare('SELECT * FROM instructors WHERE id=?').get(req.params.id) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/instructors/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM instructors WHERE id=?').run(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════
// 커리큘럼 (Curricula)
// ═══════════════════════════════════════════════════════
router.get('/curricula', (req, res) => {
    try {
        const db = getDb();
        const { complexCode, complexId, year, month } = req.query;
        let q = 'SELECT cu.* FROM curricula cu JOIN complexes c ON cu.complex_id = c.id WHERE 1=1';
        const p = [];
        if (complexCode) { q += ' AND c.code = ?'; p.push(complexCode); }
        if (complexId)   { q += ' AND cu.complex_id = ?'; p.push(complexId); }
        if (year)        { q += ' AND cu.year = ?'; p.push(parseInt(year)); }
        if (month)       { q += ' AND cu.month = ?'; p.push(parseInt(month)); }
        q += ' ORDER BY cu.year DESC, cu.month DESC';
        res.json({ success: true, data: db.prepare(q).all(...p) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/curricula', (req, res) => {
    try {
        const db = getDb();
        const { complex_id, year, month, title, content, image_url } = req.body;
        if (!complex_id || !year || !month) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        
        // 동일 월 존재 시 업데이트
        const existing = db.prepare('SELECT id FROM curricula WHERE complex_id=? AND year=? AND month=?').get(complex_id, year, month);
        let id;
        if (existing) {
            id = existing.id;
            db.prepare('UPDATE curricula SET title=?,content=?,image_url=? WHERE id=?').run(title || '', content || '', image_url || '', id);
        } else {
            id = uuidv4();
            db.prepare('INSERT INTO curricula (id,complex_id,year,month,title,content,image_url) VALUES (?,?,?,?,?,?,?)')
              .run(id, complex_id, year, month, title || '', content || '', image_url || '');
        }
        res.status(201).json({ success: true, data: db.prepare('SELECT * FROM curricula WHERE id=?').get(id) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/curricula/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM curricula WHERE id=?').run(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════
// 해지 신청 (Cancellations)
// ═══════════════════════════════════════════════════════
router.get('/cancellations', (req, res) => {
    try {
        const db = getDb();
        const { complexCode, complexId, status } = req.query;
        let q = 'SELECT ca.*, c.code as complex_code FROM cancellations ca JOIN complexes c ON ca.complex_id = c.id WHERE 1=1';
        const p = [];
        if (complexCode) { q += ' AND c.code = ?'; p.push(complexCode); }
        if (complexId)   { q += ' AND ca.complex_id = ?'; p.push(complexId); }
        if (status)      { q += ' AND ca.status = ?'; p.push(status); }
        q += ' ORDER BY ca.created_at DESC';
        res.json({ success: true, data: db.prepare(q).all(...p) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/cancellations', (req, res) => {
    try {
        const db = getDb();
        const { complex_id, application_id, dong, ho, name, phone, program_name, reason } = req.body;
        if (!complex_id || !dong || !ho || !name || !phone) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        const id = uuidv4();
        db.prepare('INSERT INTO cancellations (id,complex_id,application_id,dong,ho,name,phone,program_name,reason,status) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(id, complex_id, application_id || null, dong, ho, name, phone, program_name || '', reason || '', 'pending');
        res.status(201).json({ success: true, data: db.prepare('SELECT * FROM cancellations WHERE id=?').get(id) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/cancellations/:id', (req, res) => {
    try {
        const db = getDb();
        const { status, refund_amount } = req.body;
        const processedAt = (status === 'approved' || status === 'rejected') ? "datetime('now','localtime')" : null;
        db.prepare(`UPDATE cancellations SET status=?, refund_amount=?, processed_at=CASE WHEN ? IN ('approved','rejected') THEN datetime('now','localtime') ELSE processed_at END WHERE id=?`)
          .run(status, refund_amount || 0, status, req.params.id);
        res.json({ success: true, data: db.prepare('SELECT * FROM cancellations WHERE id=?').get(req.params.id) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════
// 통계 대시보드
// ═══════════════════════════════════════════════════════
router.get('/stats/dashboard', (req, res) => {
    try {
        const db = getDb();
        const { complexId, complexCode } = req.query;
        
        let complexFilter = '';
        let appFilter = '';
        const p = [];
        
        if (complexId) {
            complexFilter = ' AND complex_id = ?';
            appFilter = ' AND a.complex_id = ?';
            p.push(complexId);
        }
        
        const totalApps = db.prepare(`SELECT COUNT(*) as cnt FROM applications WHERE 1=1${complexFilter}`).get(...p).cnt;
        const approved  = db.prepare(`SELECT COUNT(*) as cnt FROM applications WHERE status='approved'${complexFilter}`).get(...p).cnt;
        const waiting   = db.prepare(`SELECT COUNT(*) as cnt FROM applications WHERE status='waiting'${complexFilter}`).get(...p).cnt;
        const rejected  = db.prepare(`SELECT COUNT(*) as cnt FROM applications WHERE status='rejected'${complexFilter}`).get(...p).cnt;
        const pendingCancel = db.prepare(`SELECT COUNT(*) as cnt FROM cancellations WHERE status='pending'${complexFilter}`).get(...p).cnt;
        const unanswered    = db.prepare(`SELECT COUNT(*) as cnt FROM inquiries WHERE answer IS NULL${complexFilter}`).get(...p).cnt;
        
        res.json({
            success: true,
            data: { totalApps, approved, waiting, rejected, pendingCancel, unanswered }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
