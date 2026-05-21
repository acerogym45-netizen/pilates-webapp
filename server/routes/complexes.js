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


// ── 시간표 조회 (입주민용) ─────────────────────────────────────────────
// GET /api/complexes/timetable?code=<complex_code>
// GET /api/complexes/timetable?id=<complex_id>
// ※ /:id 핸들러보다 반드시 앞에 위치해야 함
router.get('/timetable', async (req, res) => {
    try {
        const { code, id } = req.query;
        if (!code && !id) return res.status(400).json({ success: false, error: 'code 또는 id 필수' });
        const sb = getSupabase();
        let query = sb.from('complexes').select('id, code, name, timetable_url');
        if (id)   query = query.eq('id', id);
        else      query = query.eq('code', code);
        const { data, error } = await query.single();
        if (error || !data) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });
        res.json({
            success: true,
            timetable_url: data.timetable_url || null,
            complex_name: data.name
        });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// 신청기간 설정 (단지별 커스텀)
// ─────────────────────────────────────────────────────
// GET  /api/complexes/:id/apply-period   → 현재 설정 조회
// PUT  /api/complexes/:id/apply-period   → 설정 저장
// DELETE /api/complexes/:id/apply-period → 커스텀 기간 초기화 (22~26일 기본값 복귀)
// ═══════════════════════════════════════════════════════

router.get('/:id/apply-period', async (req, res) => {
    try {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('complexes')
            .select('id, name, apply_period_enabled, apply_start, apply_end')
            .eq('id', req.params.id)
            .single();
        if (error) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });

        const now = new Date();
        let isOpen = false;
        let mode = 'auto';

        if (data.apply_period_enabled && data.apply_start && data.apply_end) {
            const start = new Date(data.apply_start);
            const end   = new Date(data.apply_end);
            isOpen = now >= start && now <= end;
            mode = 'custom';
        } else if (data.apply_period_enabled && !data.apply_start && !data.apply_end) {
            isOpen = true;
            mode = 'always_open';
        } else {
            const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
            const d = kst.getUTCDate(), h = kst.getUTCHours();
            isOpen = (d === 22 && h >= 9) || (d > 22 && d < 26) || (d === 26 && h < 9);
            mode = 'auto';
        }

        res.json({ success: true, data: { ...data, is_open: isOpen, mode } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id/apply-period', async (req, res) => {
    try {
        const { apply_period_enabled, apply_start, apply_end } = req.body;
        const sb = getSupabase();
        const updateData = {
            apply_period_enabled: Boolean(apply_period_enabled),
            apply_start: apply_start ? new Date(apply_start).toISOString() : null,
            apply_end:   apply_end   ? new Date(apply_end).toISOString()   : null,
        };
        const { data, error } = await sb
            .from('complexes')
            .update(updateData)
            .eq('id', req.params.id)
            .select('id, name, apply_period_enabled, apply_start, apply_end')
            .single();
        if (error) throw sbErr(error, 'PUT /complexes/:id/apply-period');
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id/apply-period', async (req, res) => {
    try {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('complexes')
            .update({ apply_period_enabled: false, apply_start: null, apply_end: null })
            .eq('id', req.params.id)
            .select('id, name, apply_period_enabled, apply_start, apply_end')
            .single();
        if (error) throw sbErr(error, 'DELETE /complexes/:id/apply-period');
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════
// 신청 종류별 설정 (complex_apply_settings)
// ─────────────────────────────────────────────────────
// GET  /api/complexes/:id/apply-settings   → 모든 신청 종류 설정 조회
// PUT  /api/complexes/:id/apply-settings   → 신청 종류별 설정 일괄 저장
// ═══════════════════════════════════════════════════════

router.get('/:id/apply-settings', async (req, res) => {
    try {
        const sb  = getSupabase();
        const cxId = req.params.id;

        const { data: cx, error: cxErr } = await sb
            .from('complexes')
            .select('id, name, apply_period_enabled, apply_start, apply_end, waiting_enabled, waiting_timeout_hours, auto_approve')
            .eq('id', cxId)
            .single();
        if (cxErr) return res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });

        const { data: rows } = await sb
            .from('complex_apply_settings')
            .select('*')
            .eq('complex_id', cxId);

        const rowMap = {};
        (rows || []).forEach(r => { rowMap[r.apply_type_key] = r; });

        const now = new Date();
        const nowKst  = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const dayKst  = nowKst.getUTCDate();
        const hourKst = nowKst.getUTCHours();
        const autoIsOpen =
            (dayKst === 22 && hourKst >= 9) ||
            (dayKst > 22 && dayKst < 26)   ||
            (dayKst === 26 && hourKst < 9);

        let complexCustomOpen = false;
        if (cx.apply_period_enabled) {
            if (cx.apply_start && cx.apply_end) {
                complexCustomOpen = now >= new Date(cx.apply_start) && now <= new Date(cx.apply_end);
            } else {
                complexCustomOpen = true;
            }
        }

        const DEFAULT_APPLY_TYPES_LOCAL = [
            { key: 'new',        label: '신규 수강 신청' },
            { key: 'waiting',    label: '대기 신청'      },
            { key: 'cancel',     label: '해지 신청 (차월)' },
            { key: 'mid_cancel', label: '중도 해지'       },
            { key: 'refund',     label: '환불 신청'       },
        ];

        const settings = DEFAULT_APPLY_TYPES_LOCAL.map(type => {
            const saved = rowMap[type.key] || {};
            const isEnabled   = saved.is_enabled   !== undefined ? saved.is_enabled   : (type.key !== 'waiting');
            const periodMode  = saved.period_mode  || 'auto';
            const periodStart = saved.period_start || null;
            const periodEnd   = saved.period_end   || null;

            let isOpen = false;
            if (!isEnabled) {
                isOpen = false;
            } else if (periodMode === 'always') {
                isOpen = true;
            } else if (periodMode === 'closed') {
                isOpen = false;
            } else if (periodMode === 'custom' && periodStart && periodEnd) {
                isOpen = now >= new Date(periodStart) && now <= new Date(periodEnd);
            } else {
                isOpen = cx.apply_period_enabled ? complexCustomOpen : autoIsOpen;
            }

            return { apply_type_key: type.key, label: type.label, is_enabled: isEnabled,
                     period_mode: periodMode, period_start: periodStart, period_end: periodEnd, is_open: isOpen };
        });

        res.json({
            success: true,
            data: settings,
            complex: {
                waiting_enabled:       cx.waiting_enabled       || false,
                waiting_timeout_hours: cx.waiting_timeout_hours || 3,
                auto_approve:          cx.auto_approve !== false,
            }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id/apply-settings', async (req, res) => {
    try {
        const sb   = getSupabase();
        const cxId = req.params.id;
        const { settings, waiting_enabled, waiting_timeout_hours, auto_approve } = req.body;

        const cxPatch = {};
        if (waiting_enabled       !== undefined) cxPatch.waiting_enabled       = Boolean(waiting_enabled);
        if (waiting_timeout_hours !== undefined) cxPatch.waiting_timeout_hours = parseInt(waiting_timeout_hours) || 3;
        if (auto_approve          !== undefined) cxPatch.auto_approve          = Boolean(auto_approve);

        if (Object.keys(cxPatch).length > 0) {
            const { error: cxErr } = await sb.from('complexes').update(cxPatch).eq('id', cxId);
            if (cxErr) throw sbErr(cxErr, 'PUT /apply-settings: complexes update');
        }

        if (Array.isArray(settings) && settings.length > 0) {
            const upsertRows = settings.map(s => ({
                complex_id:     cxId,
                apply_type_key: s.apply_type_key,
                is_enabled:     Boolean(s.is_enabled),
                period_mode:    s.period_mode || 'auto',
                period_start:   s.period_start ? new Date(s.period_start).toISOString() : null,
                period_end:     s.period_end   ? new Date(s.period_end).toISOString()   : null,
                updated_at:     new Date().toISOString(),
            }));

            const { error: upsErr } = await sb
                .from('complex_apply_settings')
                .upsert(upsertRows, { onConflict: 'complex_id,apply_type_key' });
            if (upsErr) throw sbErr(upsErr, 'PUT /apply-settings: upsert');
        }

        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── 단지 ID로 조회 ── /:id/... 라우트들보다 반드시 아래에 위치 ──

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
        const { currentPassword, name, address, primary_color, new_password, show_inquiry } = req.body;
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

        const updatePayload = {
            name: name || existing.name,
            address: address !== undefined ? address : existing.address,
            primary_color: primary_color || existing.primary_color,
            admin_password: new_password || existing.admin_password,
        };
        // show_inquiry: 명시적으로 전달된 경우만 업데이트 (boolean)
        if (show_inquiry !== undefined) {
            updatePayload.show_inquiry = Boolean(show_inquiry);
        }

        const { data, error } = await sb
            .from('complexes')
            .update(updatePayload)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw sbErr(error, 'PUT /complexes/:id/self');
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 단지별 스케줄 모드 변경 ───────────────────────────────────────
// POST /api/complexes/schedule-mode
// body: { complexId, mode: 'auto' | 'always_on' | 'always_off' }
router.post('/schedule-mode', async (req, res) => {
    try {
        const { complexId, mode } = req.body;
        const validModes = ['auto', 'always_on', 'always_off'];
        if (!complexId || !validModes.includes(mode)) {
            return res.status(400).json({ success: false, error: 'complexId와 유효한 mode(auto|always_on|always_off)가 필요합니다' });
        }
        if (!/^[0-9a-f-]{36}$/i.test(complexId)) {
            return res.status(400).json({ success: false, error: '유효하지 않은 complexId 형식입니다' });
        }
        const sb = getSupabase();

        // schedule_mode 업데이트
        const { error: modeErr } = await sb
            .from('complexes')
            .update({ schedule_mode: mode })
            .eq('id', complexId);
        if (modeErr) throw sbErr(modeErr, 'POST /complexes/schedule-mode');

        // 모드별 프로그램 is_active 즉시 동기화
        let syncActive;
        if (mode === 'always_on') {
            syncActive = true;
        } else if (mode === 'always_off') {
            syncActive = false;
        } else {
            // auto 복귀: 현재 KST 시각 기준으로 22~26일 여부 계산해서 즉시 반영
            const nowKst  = new Date(Date.now() + 9 * 60 * 60 * 1000);
            const dayKst  = nowKst.getUTCDate();
            const hourKst = nowKst.getUTCHours();
            syncActive =
                (dayKst === 22 && hourKst >= 9) ||
                (dayKst > 22 && dayKst < 26)   ||
                (dayKst === 26 && hourKst < 9);
        }

        await sb.from('programs')
            .update({ is_active: syncActive })
            .eq('complex_id', complexId)
            .not('id', 'is', null);

        res.json({ success: true, mode, is_active: syncActive });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
