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

// ── 현재 자동 스케줄 상태 조회 ───────────────────────────────────
// GET /api/programs/schedule-status
// ※ 반드시 /:id 라우트보다 앞에 위치해야 함 (라우트 충돌 방지)
router.get('/schedule-status', async (req, res) => {
    try {
        const nowUtc  = new Date();
        const nowKst  = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
        const dayKst  = nowKst.getUTCDate();
        const hourKst = nowKst.getUTCHours();
        const minKst  = nowKst.getUTCMinutes();
        const monKst  = nowKst.getUTCMonth() + 1;

        const isInPeriod =
            (dayKst === 22 && hourKst >= 9) ||
            (dayKst > 22 && dayKst < 26)   ||
            (dayKst === 26 && hourKst < 9);

        // 다음 전환 시각 계산
        let nextToggleKst, nextAction;
        if (isInPeriod) {
            // 현재 활성화 기간 → 다음 전환: 26일 09:00 비활성화
            const nextDate = new Date(nowKst);
            nextDate.setUTCDate(26); nextDate.setUTCHours(9); nextDate.setUTCMinutes(0); nextDate.setUTCSeconds(0);
            if (nextDate <= nowKst) { nextDate.setUTCMonth(nextDate.getUTCMonth() + 1); }
            nextToggleKst = `${nextDate.getUTCMonth()+1}월 26일 09:00`;
            nextAction = '비활성화';
        } else {
            // 현재 비활성화 기간 → 다음 전환: 22일 09:00 활성화
            const nextDate = new Date(nowKst);
            nextDate.setUTCDate(22); nextDate.setUTCHours(9); nextDate.setUTCMinutes(0); nextDate.setUTCSeconds(0);
            if (nextDate <= nowKst) { nextDate.setUTCMonth(nextDate.getUTCMonth() + 1); }
            nextToggleKst = `${nextDate.getUTCMonth()+1}월 22일 09:00`;
            nextAction = '활성화';
        }

        res.json({
            success: true,
            kst: `${monKst}월 ${dayKst}일 ${String(hourKst).padStart(2,'0')}:${String(minKst).padStart(2,'0')} KST`,
            isInPeriod,
            currentStatus: isInPeriod ? '접수 기간 (활성화)' : '비접수 기간 (비활성화)',
            nextToggleKst,
            nextAction,
            periodInfo: '매월 22일 09:00 ~ 26일 09:00 KST'
        });
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

// ── 프로그램 자동 활성화/비활성화 (Cron Job 호출용) ──────────────
// POST /api/programs/auto-toggle
// - KST 22일 00:00 ~ 26일 08:59 → 전 단지 프로그램 is_active = true
// - KST 26일 09:00 이후(~다음 22일 전) → 전 단지 프로그램 is_active = false
// - 헤더 Authorization: Bearer <CRON_SECRET> 필요 (Vercel Cron 자동 전달)
router.post('/auto-toggle', async (req, res) => {
    try {
        // ── 보안 인증 ──────────────────────────────────────────────────────────
        // 우선순위: ① Cron 시크릿  ② 마스터 비밀번호  ③ 단지 complexId 존재(단지관리자)
        const authHeader = req.headers['authorization'] || '';
        const cronSecret = process.env.CRON_SECRET || '';
        const masterPw   = process.env.MASTER_PASSWORD || 'master2026';
        const bodySecret = req.body?.secret || '';
        const { complexId: authComplexId } = req.body;

        const validCron    = cronSecret && authHeader === `Bearer ${cronSecret}`;
        const validMaster  = bodySecret && bodySecret === masterPw;
        // 단지 관리자: complexId가 유효한 UUID 형식이면 이미 로그인된 것으로 신뢰
        const validAdmin   = !validCron && !validMaster
            && authComplexId && /^[0-9a-f-]{36}$/i.test(authComplexId);

        if (!validCron && !validMaster && !validAdmin) {
            return res.status(401).json({ success: false, error: '인증 실패: 마스터 비밀번호 또는 단지 ID가 필요합니다' });
        }

        // ── KST 현재 시각 계산 ────────────────────────────────────────
        const nowUtc  = new Date();
        const nowKst  = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
        const dayKst  = nowKst.getUTCDate();
        const hourKst = nowKst.getUTCHours();
        const monKst  = nowKst.getUTCMonth() + 1;

        // 22일 09:00 ~ 26일 09:00 → 활성화, 그 외 → 비활성화
        const isInPeriod =
            (dayKst === 22 && hourKst >= 9) ||
            (dayKst > 22 && dayKst < 26)   ||
            (dayKst === 26 && hourKst < 9);

        const targetActive = isInPeriod;

        // ── 강제 지정 (body.force = true/false) ─────────────────────
        const forceValue = req.body?.force;
        const activateTarget = forceValue !== undefined ? Boolean(forceValue) : targetActive;

        const sb = getSupabase();

        // ── 단지 필터 (유효한 UUID 형식 complexId 지정 시 해당 단지만, 없으면 전체) ──
        const { complexId } = req.body;
        // 빈 문자열이나 비UUID 값이 들어오면 무시 (UUID 타입 오류 방지)
        const validComplexId = complexId && /^[0-9a-f-]{36}$/i.test(complexId) ? complexId : null;
        let query = sb.from('programs').update({ is_active: activateTarget }).neq('id', '');
        if (validComplexId) query = query.eq('complex_id', validComplexId);

        const { data, error } = await query.select('id, name, is_active, complex_id');
        if (error) throw error;

        const action = activateTarget ? '활성화' : '비활성화';
        console.log(`[auto-toggle] ${monKst}월 ${dayKst}일 ${String(hourKst).padStart(2,'0')}시 KST → ${action} (${(data||[]).length}개 프로그램)`);

        return res.json({
            success: true,
            action,
            is_active: activateTarget,
            kst: `${monKst}월 ${dayKst}일 ${String(hourKst).padStart(2,'0')}:${String(nowKst.getUTCMinutes()).padStart(2,'0')} KST`,
            isInPeriod,
            count: (data || []).length,
            forced: forceValue !== undefined,
            programs: (data || []).map(p => ({ id: p.id, name: p.name, is_active: p.is_active }))
        });
    } catch (e) {
        console.error('[auto-toggle] 오류:', e.message);
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
