/**
 * 프로그램 API 라우터
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { v4: uuidv4 } = require('uuid');

// 단지별 프로그램 목록
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const { complexId, complexCode, activeOnly } = req.query;
        
        let query = 'SELECT p.*, c.code as complex_code FROM programs p JOIN complexes c ON p.complex_id = c.id WHERE 1=1';
        const params = [];
        
        if (complexId) { query += ' AND p.complex_id = ?'; params.push(complexId); }
        if (complexCode) { query += ' AND c.code = ?'; params.push(complexCode); }
        if (activeOnly === 'true') { query += ' AND p.is_active = 1'; }
        
        query += ' ORDER BY p.display_order, p.name';
        
        const rows = db.prepare(query).all(...params);
        // time_slots JSON 파싱
        const data = rows.map(r => ({
            ...r,
            time_slots: r.time_slots ? JSON.parse(r.time_slots) : []
        }));
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 프로그램 단일 조회
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        const row = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: '프로그램을 찾을 수 없습니다' });
        res.json({ success: true, data: { ...row, time_slots: row.time_slots ? JSON.parse(row.time_slots) : [] } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 프로그램 생성
router.post('/', (req, res) => {
    try {
        const db = getDb();
        const id = uuidv4();
        const { complex_id, name, type, description, days, time_slots, price, capacity, display_order } = req.body;
        if (!complex_id || !name || !type) return res.status(400).json({ success: false, error: 'complex_id, name, type 필수' });
        
        db.prepare(`
            INSERT INTO programs (id, complex_id, name, type, description, days, time_slots, price, capacity, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, complex_id, name, type, description || '', days || '', 
               JSON.stringify(Array.isArray(time_slots) ? time_slots : []), 
               price || 0, capacity || 6, display_order || 0);
        
        const created = db.prepare('SELECT * FROM programs WHERE id = ?').get(id);
        res.status(201).json({ success: true, data: { ...created, time_slots: JSON.parse(created.time_slots) } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 프로그램 수정
router.put('/:id', (req, res) => {
    try {
        const db = getDb();
        const { name, type, description, days, time_slots, price, capacity, display_order, is_active } = req.body;
        db.prepare(`
            UPDATE programs SET name=?, type=?, description=?, days=?, time_slots=?, price=?, capacity=?, display_order=?, is_active=?, updated_at=datetime('now','localtime')
            WHERE id=?
        `).run(name, type, description, days, JSON.stringify(Array.isArray(time_slots) ? time_slots : []), 
               price, capacity, display_order, is_active !== undefined ? (is_active ? 1 : 0) : 1, req.params.id);
        
        const updated = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
        res.json({ success: true, data: { ...updated, time_slots: JSON.parse(updated.time_slots) } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 프로그램 삭제
router.delete('/:id', (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM programs WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: '삭제되었습니다' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 시간대별 정원 현황 조회
router.get('/:id/capacity', (req, res) => {
    try {
        const db = getDb();
        const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
        if (!program) return res.status(404).json({ success: false, error: '프로그램 없음' });
        
        const timeSlots = program.time_slots ? JSON.parse(program.time_slots) : [];
        const capacity = program.capacity || 6;
        
        // 각 시간대별 승인된 신청 수 집계
        const capacityData = timeSlots.map(slot => {
            const count = db.prepare(`
                SELECT COUNT(*) as cnt FROM applications 
                WHERE program_id = ? AND preferred_time = ? AND status = 'approved'
            `).get(req.params.id, slot);
            
            const waitingCount = db.prepare(`
                SELECT COUNT(*) as cnt FROM applications
                WHERE program_id = ? AND preferred_time = ? AND status = 'waiting'
            `).get(req.params.id, slot);
            
            return {
                slot,
                approved: count.cnt,
                capacity,
                available: Math.max(0, capacity - count.cnt),
                isFull: count.cnt >= capacity,
                waiting: waitingCount.cnt
            };
        });
        
        res.json({ success: true, data: capacityData });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
