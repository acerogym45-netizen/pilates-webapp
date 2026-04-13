/**
 * 단지(Complex) API 라우터
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { v4: uuidv4 } = require('uuid');

// 전체 단지 목록
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare('SELECT * FROM complexes ORDER BY name').all();
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 단지 코드로 조회
router.get('/by-code/:code', (req, res) => {
    try {
        const db = getDb();
        const row = db.prepare('SELECT * FROM complexes WHERE code = ?').get(req.params.code);
        if (!row) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });
        res.json({ success: true, data: row });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 단지 ID로 조회
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        const row = db.prepare('SELECT * FROM complexes WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });
        res.json({ success: true, data: row });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 단지 생성
router.post('/', (req, res) => {
    try {
        const { masterPassword } = req.body;
        if (masterPassword !== process.env.MASTER_PASSWORD) {
            return res.status(403).json({ success: false, error: '마스터 비밀번호가 올바르지 않습니다' });
        }
        const db = getDb();
        const id = uuidv4();
        const { code, name, address, primary_color, admin_password } = req.body;
        if (!code || !name) return res.status(400).json({ success: false, error: 'code, name 필수' });

        db.prepare(`
            INSERT INTO complexes (id, code, name, address, primary_color, admin_password)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, code, name, address || '', primary_color || '#667eea', admin_password || 'admin1234');

        const created = db.prepare('SELECT * FROM complexes WHERE id = ?').get(id);
        res.status(201).json({ success: true, data: created });
    } catch (e) {
        if (e.message.includes('UNIQUE')) {
            return res.status(409).json({ success: false, error: '이미 존재하는 단지 코드입니다' });
        }
        res.status(500).json({ success: false, error: e.message });
    }
});

// 단지 수정
router.put('/:id', (req, res) => {
    try {
        const { masterPassword } = req.body;
        if (masterPassword !== process.env.MASTER_PASSWORD) {
            return res.status(403).json({ success: false, error: '마스터 비밀번호가 올바르지 않습니다' });
        }
        const db = getDb();
        const { name, address, primary_color, admin_password, is_active } = req.body;
        db.prepare(`
            UPDATE complexes 
            SET name=?, address=?, primary_color=?, admin_password=?, is_active=?, updated_at=datetime('now','localtime')
            WHERE id=?
        `).run(name, address, primary_color, admin_password, is_active ? 1 : 0, req.params.id);

        const updated = db.prepare('SELECT * FROM complexes WHERE id = ?').get(req.params.id);
        res.json({ success: true, data: updated });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 단지 삭제
router.delete('/:id', (req, res) => {
    try {
        const { masterPassword } = req.body;
        if (masterPassword !== process.env.MASTER_PASSWORD) {
            return res.status(403).json({ success: false, error: '마스터 비밀번호가 올바르지 않습니다' });
        }
        const db = getDb();
        db.prepare('DELETE FROM complexes WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: '삭제되었습니다' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 비밀번호 검증
router.post('/verify-password', (req, res) => {
    try {
        const { complexCode, password } = req.body;
        if (!password) {
            return res.status(400).json({ success: false, error: '비밀번호를 입력하세요' });
        }
        const db = getDb();

        // 마스터 비밀번호 처리 (단지코드 없어도 OK)
        if (password === process.env.MASTER_PASSWORD) {
            const complex = complexCode
                ? db.prepare('SELECT * FROM complexes WHERE code = ?').get(complexCode)
                : null;
            return res.json({
                success: true,
                role: 'master',
                complex: complex || { code: 'master', name: '마스터 관리자' }
            });
        }

        if (!complexCode) {
            return res.status(400).json({ success: false, error: '단지코드를 입력하세요' });
        }

        const complex = db.prepare('SELECT * FROM complexes WHERE code = ?').get(complexCode);
        if (!complex) {
            return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });
        }
        if (complex.admin_password !== password) {
            return res.status(401).json({ success: false, error: '비밀번호가 올바르지 않습니다' });
        }

        res.json({ success: true, role: 'admin', complex });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 내 단지 설정 수정 (일반 관리자 - admin_password로 인증)
router.put('/:id/self', (req, res) => {
    try {
        const db = getDb();
        const existing = db.prepare('SELECT * FROM complexes WHERE id = ?').get(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });

        const { currentPassword, name, address, primary_color, new_password } = req.body;

        // 현재 비밀번호 or 마스터 비밀번호로 인증
        if (currentPassword !== existing.admin_password && currentPassword !== process.env.MASTER_PASSWORD) {
            return res.status(403).json({ success: false, error: '현재 비밀번호가 올바르지 않습니다' });
        }

        const updatedName    = name    || existing.name;
        const updatedAddr    = address !== undefined ? address : existing.address;
        const updatedColor   = primary_color || existing.primary_color;
        const updatedPw      = new_password || existing.admin_password;

        db.prepare(`
            UPDATE complexes
            SET name=?, address=?, primary_color=?, admin_password=?, updated_at=datetime('now','localtime')
            WHERE id=?
        `).run(updatedName, updatedAddr, updatedColor, updatedPw, req.params.id);

        const updated = db.prepare('SELECT * FROM complexes WHERE id = ?').get(req.params.id);
        res.json({ success: true, data: updated });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
