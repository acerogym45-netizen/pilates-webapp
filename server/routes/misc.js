/**
 * 공지사항 / 문의 / 강사 / 커리큘럼 / 해지 API 라우터 - Supabase 버전
 */
const express = require('express');
const router = express.Router();
const { getSupabase, sbErr } = require('../db-supabase');

// ═══════════════════════════════════════════════════════
// 공지사항 (Notices)
// ═══════════════════════════════════════════════════════
router.get('/notices', async (req, res) => {
    try {
        const { complexCode, complexId } = req.query;
        const sb = getSupabase();

        let query = sb
            .from('notices')
            .select('*, complexes!inner(code, name)')
            .eq('is_active', true)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false });

        if (complexCode) query = query.eq('complexes.code', complexCode);
        if (complexId)   query = query.eq('complex_id', complexId);

        const { data, error } = await query;
        if (error) throw sbErr(error, 'GET /notices');

        const result = (data || []).map(r => ({
            ...r, complex_code: r.complexes?.code, complex_name: r.complexes?.name
        }));
        res.json({ success: true, data: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/notices', async (req, res) => {
    try {
        const { complex_id, title, content, is_pinned } = req.body;
        if (!complex_id || !title || !content) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        const sb = getSupabase();
        const { data, error } = await sb
            .from('notices')
            .insert({ complex_id, title, content, is_pinned: Boolean(is_pinned) })
            .select()
            .single();
        if (error) throw sbErr(error, 'POST /notices');
        res.status(201).json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/notices/:id', async (req, res) => {
    try {
        const { title, content, is_pinned, is_active } = req.body;
        const sb = getSupabase();
        const { data, error } = await sb
            .from('notices')
            .update({
                title, content,
                is_pinned: Boolean(is_pinned),
                is_active: is_active !== undefined ? Boolean(is_active) : true
            })
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) throw sbErr(error, 'PUT /notices/:id');
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/notices/:id', async (req, res) => {
    try {
        const sb = getSupabase();
        const { error } = await sb.from('notices').delete().eq('id', req.params.id);
        if (error) throw sbErr(error);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════
// 문의 (Inquiries)
// ═══════════════════════════════════════════════════════
router.get('/inquiries', async (req, res) => {
    try {
        const { complexCode, complexId, isAdmin } = req.query;
        const sb = getSupabase();

        let query = sb
            .from('inquiries')
            .select('*, complexes!inner(code)')
            .order('created_at', { ascending: false });

        if (complexCode) query = query.eq('complexes.code', complexCode);
        if (complexId)   query = query.eq('complex_id', complexId);
        if (isAdmin !== 'true') {
            query = query.eq('is_public', true).eq('is_hidden', false);
        }

        const { data, error } = await query;
        if (error) throw sbErr(error, 'GET /inquiries');
        res.json({ success: true, data: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/inquiries', async (req, res) => {
    try {
        const { complex_id, dong, ho, name, phone, title, content, is_public } = req.body;
        if (!complex_id || !name || !title || !content) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        const sb = getSupabase();
        const { data, error } = await sb
            .from('inquiries')
            .insert({
                complex_id, dong: dong || '', ho: ho || '', name, phone: phone || '',
                title, content, is_public: Boolean(is_public)
            })
            .select()
            .single();
        if (error) throw sbErr(error, 'POST /inquiries');
        res.status(201).json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/inquiries/:id', async (req, res) => {
    try {
        const { answer, is_hidden } = req.body;
        const sb = getSupabase();
        const updates = { is_hidden: Boolean(is_hidden) };
        if (answer !== undefined) {
            updates.answer = answer;
            updates.answered_at = answer ? new Date().toISOString() : null;
        }
        const { data, error } = await sb
            .from('inquiries')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) throw sbErr(error);
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/inquiries/:id', async (req, res) => {
    try {
        const sb = getSupabase();
        const { error } = await sb.from('inquiries').delete().eq('id', req.params.id);
        if (error) throw sbErr(error);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════
// 강사 (Instructors)
// ═══════════════════════════════════════════════════════
router.get('/instructors', async (req, res) => {
    try {
        const { complexCode, complexId } = req.query;
        const sb = getSupabase();

        let query = sb
            .from('instructors')
            .select('*, complexes!inner(code)')
            .eq('is_active', true)
            .order('display_order')
            .order('name');

        if (complexCode) query = query.eq('complexes.code', complexCode);
        if (complexId)   query = query.eq('complex_id', complexId);

        const { data, error } = await query;
        if (error) throw sbErr(error, 'GET /instructors');
        res.json({ success: true, data: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/instructors', async (req, res) => {
    try {
        const { complex_id, name, title, bio, photo_url, display_order } = req.body;
        if (!complex_id || !name) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        const sb = getSupabase();
        const { data, error } = await sb
            .from('instructors')
            .insert({
                complex_id, name,
                title: title || '', bio: bio || '', photo_url: photo_url || '',
                display_order: display_order || 0
            })
            .select()
            .single();
        if (error) throw sbErr(error);
        res.status(201).json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/instructors/:id', async (req, res) => {
    try {
        const { name, title, bio, photo_url, display_order, is_active } = req.body;
        const sb = getSupabase();
        const { data, error } = await sb
            .from('instructors')
            .update({
                name, title, bio, photo_url,
                display_order: display_order || 0,
                is_active: is_active !== undefined ? Boolean(is_active) : true
            })
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) throw sbErr(error);
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/instructors/:id', async (req, res) => {
    try {
        const sb = getSupabase();
        const { error } = await sb.from('instructors').delete().eq('id', req.params.id);
        if (error) throw sbErr(error);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════
// 커리큘럼 (Curricula)
// ═══════════════════════════════════════════════════════
router.get('/curricula', async (req, res) => {
    try {
        const { complexCode, complexId, year, month } = req.query;
        const sb = getSupabase();

        let query = sb
            .from('curricula')
            .select('*, complexes!inner(code)')
            .order('year', { ascending: false })
            .order('month', { ascending: false });

        if (complexCode) query = query.eq('complexes.code', complexCode);
        if (complexId)   query = query.eq('complex_id', complexId);
        if (year)        query = query.eq('year', parseInt(year));
        if (month)       query = query.eq('month', parseInt(month));

        const { data, error } = await query;
        if (error) throw sbErr(error, 'GET /curricula');
        res.json({ success: true, data: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/curricula', async (req, res) => {
    try {
        const { complex_id, year, month, title, content, image_url } = req.body;
        if (!complex_id || !year || !month) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        const sb = getSupabase();

        // 동일 월 존재 시 업데이트 (upsert)
        const { data, error } = await sb
            .from('curricula')
            .upsert(
                { complex_id, year: parseInt(year), month: parseInt(month), title: title || '', content: content || '', image_url: image_url || '' },
                { onConflict: 'complex_id,year,month', ignoreDuplicates: false }
            )
            .select()
            .single();
        if (error) throw sbErr(error, 'POST /curricula');
        res.status(201).json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/curricula/:id', async (req, res) => {
    try {
        const sb = getSupabase();
        const { error } = await sb.from('curricula').delete().eq('id', req.params.id);
        if (error) throw sbErr(error);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════
// 해지 신청 (Cancellations)
// ═══════════════════════════════════════════════════════
router.get('/cancellations', async (req, res) => {
    try {
        const { complexCode, complexId, status, request_type } = req.query;
        const sb = getSupabase();

        let query = sb
            .from('cancellations')
            .select('*, complexes!inner(code)')
            .order('created_at', { ascending: false });

        if (complexCode)   query = query.eq('complexes.code', complexCode);
        if (complexId)     query = query.eq('complex_id', complexId);
        if (status)        query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw sbErr(error, 'GET /cancellations');

        let result = (data || []).map(r => ({
            ...r,
            complex_code: r.complexes?.code,
            // request_type 컬럼이 없는 기존 레코드는 'cancel'로 기본값 설정
            request_type: r.request_type || 'cancel'
        }));

        // request_type 필터 (DB 컬럼 유무에 관계없이 JS 레벨에서도 처리)
        if (request_type) {
            result = result.filter(r => r.request_type === request_type);
        }

        res.json({ success: true, data: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/cancellations', async (req, res) => {
    try {
        const { complex_id, application_id, dong, ho, name, phone, program_name, reason, request_type, refund_reason, refund_detail } = req.body;
        if (!complex_id || !dong || !ho || !name || !phone) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        const sb = getSupabase();

        // reason 필드 구성
        let reasonText = reason || '';
        if (request_type === 'refund') {
            reasonText = `[환불사유: ${refund_reason || '-'}]\n${refund_detail || ''}`;
        }

        const insertData = {
            complex_id, application_id: application_id || null,
            dong, ho, name, phone,
            program_name: program_name || '',
            reason: reasonText,
            request_type: request_type || 'cancel',
            status: 'pending'
        };

        let result;
        // request_type 컬럼이 없을 수 있으므로 실패 시 해당 필드 제외 후 재시도
        let { data, error } = await sb.from('cancellations').insert(insertData).select().single();
        if (error && error.message && error.message.includes('request_type')) {
            // 컬럼 없으면 request_type 제외하고 재시도
            const { request_type: _rt, ...fallbackData } = insertData;
            const retry = await sb.from('cancellations').insert(fallbackData).select().single();
            if (retry.error) throw sbErr(retry.error);
            result = retry.data;
        } else {
            if (error) throw sbErr(error);
            result = data;
        }

        res.status(201).json({ success: true, data: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/cancellations/:id', async (req, res) => {
    try {
        const { status, refund_amount } = req.body;
        const sb = getSupabase();
        const updates = { status, refund_amount: refund_amount || 0 };
        if (status === 'approved' || status === 'rejected') {
            updates.processed_at = new Date().toISOString();
        }
        const { data, error } = await sb
            .from('cancellations')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) throw sbErr(error);
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════
// 통계 대시보드
// ═══════════════════════════════════════════════════════
router.get('/stats/dashboard', async (req, res) => {
    try {
        const { complexId, complexCode } = req.query;
        const sb = getSupabase();

        // Supabase에서는 각 카운트를 개별 쿼리로 가져오기
        const buildQuery = (table, filters = {}) => {
            let q = sb.from(table).select('*', { count: 'exact', head: true });
            if (complexId) q = q.eq('complex_id', complexId);
            Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
            return q;
        };

        const [
            { count: totalApps },
            { count: approved },
            { count: waiting },
            { count: rejected },
            { count: pendingCancel },
            { count: unanswered }
        ] = await Promise.all([
            buildQuery('applications'),
            buildQuery('applications', { status: 'approved' }),
            buildQuery('applications', { status: 'waiting' }),
            buildQuery('applications', { status: 'rejected' }),
            buildQuery('cancellations', { status: 'pending' }),
            sb.from('inquiries').select('*', { count: 'exact', head: true })
                .is('answer', null)
                .then(r => r)
        ]);

        res.json({
            success: true,
            data: {
                totalApps: totalApps || 0,
                approved: approved || 0,
                waiting: waiting || 0,
                rejected: rejected || 0,
                pendingCancel: pendingCancel || 0,
                unanswered: unanswered || 0
            }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
