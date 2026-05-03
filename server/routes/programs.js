/**
 * 프로그램 API 라우터 - Supabase 버전
 */
const express = require('express');
const router = express.Router();
const { getSupabase, sbErr } = require('../db-supabase');

// ── 단지별 프로그램 목록 ──────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { complexId, complexCode, activeOnly, includeInactive } = req.query;
        const sb = getSupabase();

        let query = sb.from('programs').select('*, complexes!inner(code)');

        if (complexId)           query = query.eq('complex_id', complexId);
        if (complexCode)         query = query.eq('complexes.code', complexCode);
        // activeOnly=true  → 활성만 (신규 접수용)
        // includeInactive=true → 비활성 포함 전체 (입주민 해지 드롭다운 / 관리자 현황용)
        // 둘 다 없으면 → 전체 반환
        if (activeOnly === 'true' && includeInactive !== 'true') {
            query = query.eq('is_active', true);
        }

        query = query.order('display_order').order('name');

        const { data, error } = await query;
        if (error) throw sbErr(error, 'GET /programs');

        const result = (data || []).map(r => ({
            ...r,
            complex_code: r.complexes?.code,
            time_slots: Array.isArray(r.time_slots) ? r.time_slots : (r.time_slots ? JSON.parse(r.time_slots) : [])
        }));

        res.json({ success: true, data: result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 프로그램 단일 조회 ────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('programs')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error || !data) return res.status(404).json({ success: false, error: '프로그램을 찾을 수 없습니다' });
        const result = { ...data, time_slots: Array.isArray(data.time_slots) ? data.time_slots : (data.time_slots ? JSON.parse(data.time_slots) : []) };
        res.json({ success: true, data: result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 프로그램 생성 ─────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { complex_id, name, type, description, days, time_slots, price, capacity, display_order, show_on_inactive } = req.body;
        if (!complex_id || !name || !type) return res.status(400).json({ success: false, error: 'complex_id, name, type 필수' });

        const sb = getSupabase();
        const insertObj = {
            complex_id, name, type,
            description: description || '',
            days: days || '',
            time_slots: Array.isArray(time_slots) ? time_slots : [],
            price: price || 0,
            capacity: capacity || 6,
            display_order: display_order || 0
        };
        // show_on_inactive 컬럼이 있으면 포함
        if (show_on_inactive !== undefined) insertObj.show_on_inactive = Boolean(show_on_inactive);

        let { data, error } = await sb.from('programs').insert(insertObj).select().single();

        // 컬럼 없으면 제거 후 재시도
        if (error && error.message && error.message.includes('show_on_inactive')) {
            delete insertObj.show_on_inactive;
            const fallback = await sb.from('programs').insert(insertObj).select().single();
            data  = fallback.data;
            error = fallback.error;
        }

        if (error) throw sbErr(error, 'POST /programs');
        const result = { ...data, time_slots: Array.isArray(data.time_slots) ? data.time_slots : [], show_on_inactive: data.show_on_inactive !== undefined ? data.show_on_inactive : true };
        res.status(201).json({ success: true, data: result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 프로그램 수정 ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const { name, type, description, days, time_slots, price, capacity, display_order, is_active, show_on_inactive } = req.body;
        const sb = getSupabase();
        const updateObj = {
            name, type, description, days,
            time_slots: Array.isArray(time_slots) ? time_slots : [],
            price, capacity, display_order,
            is_active: is_active !== undefined ? Boolean(is_active) : true
        };

        // show_on_inactive: 비활성 상태일 때도 입주민 페이지에 표시할지 여부
        // 컬럼이 DB에 없으면 무시 (에러 방지)
        if (show_on_inactive !== undefined) updateObj.show_on_inactive = Boolean(show_on_inactive);

        // 1차 시도: show_on_inactive 포함
        let { data, error } = await sb
            .from('programs')
            .update(updateObj)
            .eq('id', req.params.id)
            .select()
            .single();

        // show_on_inactive 컬럼이 DB에 없으면 해당 필드 제거 후 재시도
        if (error && error.message && error.message.includes('show_on_inactive')) {
            const fallbackObj = { ...updateObj };
            delete fallbackObj.show_on_inactive;
            const fallback = await sb
                .from('programs')
                .update(fallbackObj)
                .eq('id', req.params.id)
                .select()
                .single();
            data  = fallback.data;
            error = fallback.error;
        }

        if (error) throw sbErr(error, 'PUT /programs/:id');
        const result = {
            ...data,
            time_slots: Array.isArray(data.time_slots) ? data.time_slots : [],
            // 컬럼이 없을 경우 요청값을 그대로 반환해 UI 상태 유지
            show_on_inactive: data.show_on_inactive !== undefined ? data.show_on_inactive : (show_on_inactive !== undefined ? Boolean(show_on_inactive) : true)
        };
        res.json({ success: true, data: result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 프로그램 삭제 ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const sb = getSupabase();
        const { error } = await sb.from('programs').delete().eq('id', req.params.id);
        if (error) throw sbErr(error, 'DELETE /programs/:id');
        res.json({ success: true, message: '삭제되었습니다' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 시간대별 정원 현황 조회 ───────────────────────────────────
router.get('/:id/capacity', async (req, res) => {
    try {
        const sb = getSupabase();
        const { data: program, error: progErr } = await sb
            .from('programs')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (progErr || !program) return res.status(404).json({ success: false, error: '프로그램 없음' });

        const timeSlots = Array.isArray(program.time_slots) ? program.time_slots
            : (program.time_slots ? JSON.parse(program.time_slots) : []);
        const capacity = program.capacity || 6;

        const capacityData = await Promise.all(timeSlots.map(async (slot) => {
            const { count: approvedCnt } = await sb
                .from('applications')
                .select('*', { count: 'exact', head: true })
                .eq('program_id', req.params.id)
                .eq('preferred_time', slot)
                .eq('status', 'approved');

            const { count: waitingCnt } = await sb
                .from('applications')
                .select('*', { count: 'exact', head: true })
                .eq('program_id', req.params.id)
                .eq('preferred_time', slot)
                .eq('status', 'waiting');

            return {
                slot,
                approved: approvedCnt || 0,
                capacity,
                available: Math.max(0, capacity - (approvedCnt || 0)),
                isFull: (approvedCnt || 0) >= capacity,
                waiting: waitingCnt || 0
            };
        }));

        res.json({ success: true, data: capacityData });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
