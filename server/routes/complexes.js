/**
 * 단지(Complex) API 라우터 - Supabase 버전
 */
const express = require('express');
const router = express.Router();
const { getSupabase, sbErr } = require('../db-supabase');

// ── 전체 단지 목록 ────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('complexes')
            .select('*')
            .order('name');
        if (error) throw sbErr(error, 'GET /complexes');
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 단지 코드로 조회 ──────────────────────────────────────────
router.get('/by-code/:code', async (req, res) => {
    try {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('complexes')
            .select('*')
            .eq('code', req.params.code)
            .single();
        if (error) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 비밀번호 검증 (마스터 / 일반 관리자) ──────────────────────
router.post('/verify-password', async (req, res) => {
    try {
        const { complexCode, password } = req.body;
        if (!password) {
            return res.status(400).json({ success: false, error: '비밀번호를 입력하세요' });
        }

        // 마스터 비밀번호 처리
        if (password === process.env.MASTER_PASSWORD) {
            let complex = null;
            if (complexCode) {
                const sb = getSupabase();
                const { data } = await sb
                    .from('complexes')
                    .select('*')
                    .eq('code', complexCode)
                    .single();
                complex = data;
            }
            return res.json({
                success: true,
                role: 'master',
                complex: complex || { code: 'master', name: '마스터 관리자' }
            });
        }

        if (!complexCode) {
            return res.status(400).json({ success: false, error: '단지코드를 입력하세요' });
        }

        const sb = getSupabase();
        const { data: complex, error } = await sb
            .from('complexes')
            .select('*')
            .eq('code', complexCode)
            .single();

        if (error || !complex) {
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

// ── 단지 ID로 조회 ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('complexes')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error || !data) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 단지 생성 ─────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { masterPassword, code, name, address, primary_color, admin_password } = req.body;
        if (masterPassword !== process.env.MASTER_PASSWORD) {
            return res.status(403).json({ success: false, error: '마스터 비밀번호가 올바르지 않습니다' });
        }
        if (!code || !name) return res.status(400).json({ success: false, error: 'code, name 필수' });

        const sb = getSupabase();
        const { data, error } = await sb
            .from('complexes')
            .insert({
                code,
                name,
                address: address || '',
                primary_color: primary_color || '#667eea',
                admin_password: admin_password || 'admin1234'
            })
            .select()
            .single();

        if (error) {
            if (error.message.includes('unique') || error.code === '23505') {
                return res.status(409).json({ success: false, error: '이미 존재하는 단지 코드입니다' });
            }
            throw sbErr(error, 'POST /complexes');
        }
        res.status(201).json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 단지 수정 ─────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const { masterPassword, name, address, primary_color, admin_password, is_active } = req.body;
        if (masterPassword !== process.env.MASTER_PASSWORD) {
            return res.status(403).json({ success: false, error: '마스터 비밀번호가 올바르지 않습니다' });
        }

        const sb = getSupabase();
        const { data, error } = await sb
            .from('complexes')
            .update({ name, address, primary_color, admin_password, is_active: Boolean(is_active) })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw sbErr(error, 'PUT /complexes/:id');
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 단지 삭제 ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const { masterPassword } = req.body;
        if (masterPassword !== process.env.MASTER_PASSWORD) {
            return res.status(403).json({ success: false, error: '마스터 비밀번호가 올바르지 않습니다' });
        }

        const sb = getSupabase();
        const { error } = await sb
            .from('complexes')
            .delete()
            .eq('id', req.params.id);

        if (error) throw sbErr(error, 'DELETE /complexes/:id');
        res.json({ success: true, message: '삭제되었습니다' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 내 단지 설정 수정 (일반 관리자) ──────────────────────────
router.put('/:id/self', async (req, res) => {
    try {
        const { currentPassword, name, address, primary_color, new_password } = req.body;
        const sb = getSupabase();

        const { data: existing, error: fetchErr } = await sb
            .from('complexes')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (fetchErr || !existing) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });

        if (currentPassword !== existing.admin_password && currentPassword !== process.env.MASTER_PASSWORD) {
            return res.status(403).json({ success: false, error: '현재 비밀번호가 올바르지 않습니다' });
        }

        const { data, error } = await sb
            .from('complexes')
            .update({
                name: name || existing.name,
                address: address !== undefined ? address : existing.address,
                primary_color: primary_color || existing.primary_color,
                admin_password: new_password || existing.admin_password
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw sbErr(error, 'PUT /complexes/:id/self');
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
