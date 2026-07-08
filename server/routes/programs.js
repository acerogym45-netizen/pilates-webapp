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

        const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const result = (data || []).map(r => {
            const base = {
                ...r,
                complex_code: r.complexes?.code,
                time_slots: Array.isArray(r.time_slots) ? r.time_slots : (r.time_slots ? JSON.parse(r.time_slots) : [])
            };
            // 프로그램별 개별 신청기간 규칙이 있으면 openStatus 주입
            if (r.registration_open_rule) {
                const openStatus = _calcProgramOpenStatus(r, nowKst);
                base.program_open_status = openStatus;
            }
            return base;
        });

        res.json({ success: true, data: result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 현재 자동 스케줄 상태 조회 ───────────────────────────────────
// GET /api/programs/schedule-status?complexId=
// ※ 반드시 /:id 라우트보다 앞에 위치해야 함 (라우트 충돌 방지)
// ※ admin 프로그램 관리 패널에서는 더 이상 사용하지 않음 (신청 관리의 apply-settings 기반으로 교체됨)
router.get('/schedule-status', async (req, res) => {
    try {
        const nowUtc  = new Date();
        const nowKst  = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
        const dayKst  = nowKst.getUTCDate();
        const hourKst = nowKst.getUTCHours();
        const minKst  = nowKst.getUTCMinutes();
        const monKst  = nowKst.getUTCMonth() + 1;

        const sb = getSupabase();
        const { complexId } = req.query;

        // ── apply-period(global) 기반 isInPeriod 계산 ─────────────────
        // 단지 설정 조회: apply_period_enabled, apply_start, apply_end
        let isInPeriod = false;
        let scheduleMode = 'auto';
        let periodInfo = '매월 22일 09:00 ~ 26일 09:00 KST';

        if (complexId && /^[0-9a-f-]{36}$/i.test(complexId)) {
            const { data: cx } = await sb
                .from('complexes')
                .select('apply_period_enabled, apply_start, apply_end, schedule_mode')
                .eq('id', complexId)
                .single();
            if (cx) {
                if (cx.schedule_mode) scheduleMode = cx.schedule_mode;
                if (cx.apply_period_enabled && cx.apply_start && cx.apply_end) {
                    // custom 기간: apply_start ~ apply_end
                    isInPeriod = nowUtc >= new Date(cx.apply_start) && nowUtc <= new Date(cx.apply_end);
                    const fmtKst = (iso) => {
                        const d = new Date(iso);
                        const kd = new Date(d.getTime() + 9 * 60 * 60 * 1000);
                        return `${kd.getUTCMonth()+1}월 ${kd.getUTCDate()}일 ${String(kd.getUTCHours()).padStart(2,'0')}:${String(kd.getUTCMinutes()).padStart(2,'0')}`;
                    };
                    periodInfo = `${fmtKst(cx.apply_start)} ~ ${fmtKst(cx.apply_end)} KST`;
                } else if (cx.apply_period_enabled && !cx.apply_start && !cx.apply_end) {
                    // always_open: 상시 접수
                    isInPeriod = true;
                    periodInfo = '상시 접수';
                } else {
                    // auto: 매월 22일 09:00 ~ 26일 09:00 KST (기본값)
                    isInPeriod = (dayKst === 22 && hourKst >= 9) || (dayKst > 22 && dayKst < 26) || (dayKst === 26 && hourKst < 9);
                }
            } else {
                // 단지 조회 실패 → auto 기본값
                isInPeriod = (dayKst === 22 && hourKst >= 9) || (dayKst > 22 && dayKst < 26) || (dayKst === 26 && hourKst < 9);
            }
        } else {
            // complexId 없음 → auto 기본값
            isInPeriod = (dayKst === 22 && hourKst >= 9) || (dayKst > 22 && dayKst < 26) || (dayKst === 26 && hourKst < 9);
        }

        // 다음 전환 시각 계산 (auto 모드용 안내 — 실제 ON/OFF는 apply-settings 기반)
        let nextToggleKst, nextAction;
        if (isInPeriod) {
            nextToggleKst = '접수 기간 종료 시';
            nextAction = '비활성화';
        } else {
            nextToggleKst = '다음 접수 기간 시작 시';
            nextAction = '활성화';
        }

        res.json({
            success: true,
            kst: `${monKst}월 ${dayKst}일 ${String(hourKst).padStart(2,'0')}:${String(minKst).padStart(2,'0')} KST`,
            isInPeriod,
            scheduleMode,
            currentStatus: isInPeriod ? '접수 기간 (활성화)' : '비접수 기간 (비활성화)',
            nextToggleKst,
            nextAction,
            periodInfo
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
        const { complex_id, name, type, description, days, time_slots, price, capacity, display_order, show_on_inactive, duration_days, display_approved_count, always_open_lesson } = req.body;
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
        // duration_days: NULL이면 자동계산 미사용
        if (duration_days !== undefined) insertObj.duration_days = duration_days ? parseInt(duration_days) : null;
        // always_open_lesson: 개인/듀엣 상시 접수 ON/OFF
        if (always_open_lesson !== undefined) insertObj.always_open_lesson = Boolean(always_open_lesson);
        // display_approved_count: JSONB { "HH:MM": N, ... } — NULL이면 실제값 표시 (마케팅용)
        if (display_approved_count !== undefined) {
            if (display_approved_count === null) {
                insertObj.display_approved_count = null;
            } else if (typeof display_approved_count === 'object') {
                // JSONB 맵: 숫자값만 허용, 빈 객체이면 null
                const cleaned = {};
                for (const [k, v] of Object.entries(display_approved_count)) {
                    const n = parseInt(v, 10);
                    if (!isNaN(n) && n >= 0) cleaned[k] = n;
                }
                insertObj.display_approved_count = Object.keys(cleaned).length ? cleaned : null;
            }
        }

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
        const { name, type, description, days, time_slots, price, capacity, display_order, is_active, show_on_inactive, duration_days, display_approved_count, always_open_lesson, registration_open_rule } = req.body;
        const sb = getSupabase();

        // ── Partial Update 방식: undefined 필드는 DB에 반영하지 않음 ──────────
        const updateObj = {};
        if (name        !== undefined) updateObj.name         = name;
        if (type        !== undefined) updateObj.type         = type;
        if (description !== undefined) updateObj.description  = description;
        if (days        !== undefined) updateObj.days         = days;
        if (time_slots  !== undefined) updateObj.time_slots   = Array.isArray(time_slots) ? time_slots : [];
        if (price       !== undefined) updateObj.price        = price;
        if (capacity    !== undefined) updateObj.capacity     = capacity;
        if (display_order !== undefined) updateObj.display_order = display_order;
        if (is_active   !== undefined) updateObj.is_active    = Boolean(is_active);

        // show_on_inactive: 비활성 상태일 때도 입주민 페이지에 표시할지 여부
        if (show_on_inactive !== undefined) updateObj.show_on_inactive = Boolean(show_on_inactive);
        // duration_days: NULL이면 자동계산 미사용
        if (duration_days !== undefined) updateObj.duration_days = duration_days ? parseInt(duration_days) : null;
        // always_open_lesson: 개인/듀엣 상시 접수 ON/OFF
        if (always_open_lesson !== undefined) updateObj.always_open_lesson = Boolean(always_open_lesson);
        // registration_open_rule: JSONB — 보강 등 프로그램별 신청기간 규칙
        // { mode: 'makeup_auto' | 'custom', custom_start: 'ISO', custom_end: 'ISO' }
        if (registration_open_rule !== undefined) {
            updateObj.registration_open_rule = registration_open_rule === null ? null : registration_open_rule;
        }
        // display_approved_count: JSONB { "HH:MM": N, ... } — NULL이면 실제값 표시 (마케팅용)
        if (display_approved_count !== undefined) {
            if (display_approved_count === null) {
                updateObj.display_approved_count = null;
            } else if (typeof display_approved_count === 'object') {
                const cleaned = {};
                for (const [k, v] of Object.entries(display_approved_count)) {
                    const n = parseInt(v, 10);
                    if (!isNaN(n) && n >= 0) cleaned[k] = n;
                }
                updateObj.display_approved_count = Object.keys(cleaned).length ? cleaned : null;
            }
        }

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

// ── 보강 프로그램 월별 인원 현황 초기화 (Cron / 수동 호출용) ─────────────
// POST /api/programs/reset-makeup-monthly
// - type='makeup' 또는 이름에 '보강'이 포함된 프로그램의 display_approved_count를 null로 초기화
// - 매월 1일 KST 00:00에 Vercel Cron으로 자동 호출 (applications 이력은 보존)
// - Authorization: Bearer <CRON_SECRET> 또는 body.secret (마스터 비밀번호)
router.post('/reset-makeup-monthly', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'] || '';
        const cronSecret = process.env.CRON_SECRET || '';
        const masterPw   = process.env.MASTER_PASSWORD || 'master2026';
        const bodySecret = req.body?.secret || '';

        const validCron   = cronSecret && authHeader === `Bearer ${cronSecret}`;
        const validMaster = bodySecret && bodySecret === masterPw;
        if (!validCron && !validMaster) {
            return res.status(401).json({ success: false, error: '인증 실패' });
        }

        const sb = getSupabase();
        const { complexId } = req.body;

        // 보강 프로그램 조회 (type='makeup' OR name에 '보강' 포함)
        let query = sb.from('programs')
            .select('id, name, complex_id, display_approved_count')
            .or('type.eq.makeup,name.ilike.%보강%');
        if (complexId && /^[0-9a-f-]{36}$/i.test(complexId)) {
            query = query.eq('complex_id', complexId);
        }
        const { data: makeupProgs, error: mErr } = await query;
        if (mErr) throw sbErr(mErr, 'reset-makeup: fetch');

        const targets = (makeupProgs || []).filter(p => p.display_approved_count !== null);
        if (!targets.length) {
            return res.json({ success: true, reset: 0, message: '초기화할 프로그램 없음' });
        }

        const ids = targets.map(p => p.id);
        const { error: upErr } = await sb
            .from('programs')
            .update({ display_approved_count: null })
            .in('id', ids);
        if (upErr) throw sbErr(upErr, 'reset-makeup: update');

        const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
        console.log(`[reset-makeup] ${nowKst.toISOString()} — ${ids.length}개 보강 프로그램 display_approved_count 초기화`);

        res.json({
            success: true,
            reset: ids.length,
            programs: targets.map(p => p.name),
            message: `${ids.length}개 보강 프로그램 인원 현황 초기화 완료 (신청 이력은 보존됨)`
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 프로그램 신청기간 상태 조회 (프로그램 개별 isInPeriod) ─────────────────
// GET /api/programs/:id/open-status
router.get('/:id/open-status', async (req, res) => {
    try {
        const sb = getSupabase();
        const { data: prog, error } = await sb
            .from('programs')
            .select('id, name, type, registration_open_rule, complex_id')
            .eq('id', req.params.id)
            .single();
        if (error || !prog) return res.status(404).json({ success: false, error: '프로그램 없음' });

        const nowUtc = new Date();
        const nowKst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
        const result = _calcProgramOpenStatus(prog, nowKst);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * 프로그램별 신청기간 계산 헬퍼
 * rule.mode:
 *   'makeup_auto' — 매월 2,4번째 수요일 09:00 KST ~ 그다음 목요일 00:00 KST
 *   'custom'      — rule.custom_start ~ rule.custom_end (ISO UTC 문자열)
 *   없음(null)    — 단지 전역 설정 따름 (기존 동작)
 */
function _calcProgramOpenStatus(prog, nowKst) {
    const rule = prog.registration_open_rule;
    if (!rule || !rule.mode) {
        return { mode: 'global', isInPeriod: null, periodInfo: '단지 전역 설정' };
    }

    if (rule.mode === 'makeup_auto') {
        // 매월 N번째 수요일 계산 (1-indexed, 수요일 = 3)
        const year  = nowKst.getUTCFullYear();
        const month = nowKst.getUTCMonth(); // 0-indexed
        const nthWed = (n) => {
            const first = new Date(Date.UTC(year, month, 1));
            const dow   = first.getUTCDay(); // 0=Sun
            const offset = ((3 - dow + 7) % 7) + (n - 1) * 7; // 첫번째 수요일 + (n-1)주
            return new Date(Date.UTC(year, month, 1 + offset));
        };
        const wed2 = nthWed(2); // 2번째 수요일
        const wed4 = nthWed(4); // 4번째 수요일

        // 개방 구간: 수요일 09:00 KST ~ 그다음 목요일 00:00 KST (= 수요일 15:00 UTC ~ 목요일+1 15:00 UTC)
        const _openUTC  = (wed) => new Date(wed.getTime() +  9 * 60 * 60 * 1000); // 수요일 09:00 KST = 00:00 UTC
        const _closeUTC = (wed) => new Date(wed.getTime() + 24 * 60 * 60 * 1000); // 목요일 00:00 KST = 목요일 전날 15:00 UTC = wed + 24h (KST 기준 자정)
        // KST 수요일 09:00 = UTC 수요일 00:00
        // KST 목요일 00:00 = UTC 수요일 15:00
        const open2  = new Date(wed2.getTime()); // KST 09:00 = UTC 00:00 (same day for wed2)
        const close2 = new Date(wed2.getTime() + 15 * 60 * 60 * 1000); // UTC wed2 15:00 = KST 목요일 00:00
        const open4  = new Date(wed4.getTime());
        const close4 = new Date(wed4.getTime() + 15 * 60 * 60 * 1000);

        const nowUtc = new Date(nowKst.getTime() - 9 * 60 * 60 * 1000);
        const inPeriod2 = nowUtc >= open2 && nowUtc < close2;
        const inPeriod4 = nowUtc >= open4 && nowUtc < close4;
        const isInPeriod = inPeriod2 || inPeriod4;

        const fmtKst = (d) => {
            const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
            return `${k.getUTCMonth()+1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2,'0')}:${String(k.getUTCMinutes()).padStart(2,'0')}`;
        };
        return {
            mode: 'makeup_auto',
            isInPeriod,
            periodInfo: `2번째 수: ${fmtKst(open2)}~${fmtKst(close2)} / 4번째 수: ${fmtKst(open4)}~${fmtKst(close4)} KST`,
            nextOpen2: open2.toISOString(),
            nextClose2: close2.toISOString(),
            nextOpen4: open4.toISOString(),
            nextClose4: close4.toISOString()
        };
    }

    if (rule.mode === 'custom') {
        const nowUtc = new Date(nowKst.getTime() - 9 * 60 * 60 * 1000);
        const start  = rule.custom_start ? new Date(rule.custom_start) : null;
        const end    = rule.custom_end   ? new Date(rule.custom_end)   : null;
        const isInPeriod = (!start || nowUtc >= start) && (!end || nowUtc <= end);
        return { mode: 'custom', isInPeriod, periodInfo: `${rule.custom_start || '?'} ~ ${rule.custom_end || '?'}` };
    }

    return { mode: rule.mode, isInPeriod: null, periodInfo: '알 수 없는 모드' };
}

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

        // ── apply-period(global) 기반 isInPeriod 계산 ─────────────────
        // 단지 complexId가 있으면 해당 단지의 apply_period 설정으로 판단
        // 없으면 (Cron 호출 등) 매월 22~26일 기본값 사용
        let isInPeriod;
        const { complexId: bodyComplexId } = req.body;
        const targetComplexId = bodyComplexId && /^[0-9a-f-]{36}$/i.test(bodyComplexId) ? bodyComplexId : null;

        if (targetComplexId) {
            const sb2 = getSupabase();
            const { data: cx } = await sb2
                .from('complexes')
                .select('apply_period_enabled, apply_start, apply_end')
                .eq('id', targetComplexId)
                .single();
            if (cx && cx.apply_period_enabled && cx.apply_start && cx.apply_end) {
                // custom 기간: apply_start ~ apply_end
                isInPeriod = nowUtc >= new Date(cx.apply_start) && nowUtc <= new Date(cx.apply_end);
            } else if (cx && cx.apply_period_enabled && !cx.apply_start && !cx.apply_end) {
                // always_open: 항상 접수 중
                isInPeriod = true;
            } else {
                // auto 또는 설정 없음 → 22~26일 기본값
                isInPeriod = (dayKst === 22 && hourKst >= 9) || (dayKst > 22 && dayKst < 26) || (dayKst === 26 && hourKst < 9);
            }
        } else {
            // Cron 호출(complexId 없음) → 22~26일 기본값
            isInPeriod = (dayKst === 22 && hourKst >= 9) || (dayKst > 22 && dayKst < 26) || (dayKst === 26 && hourKst < 9);
        }

        const targetActive = isInPeriod;

        // ── 강제 지정 (body.force = true/false) ─────────────────────
        const forceValue = req.body?.force;
        const activateTarget = forceValue !== undefined ? Boolean(forceValue) : targetActive;

        const sb = getSupabase();

        // ── 단지 필터 + schedule_mode 업데이트 ───────────────────────
        // targetComplexId와 동일한 값 (위에서 이미 계산됨)
        const validComplexId = targetComplexId;

        // 즉시 활성화/비활성화 시 해당 단지의 schedule_mode도 함께 업데이트
        // force=true  → always_on  (Cron이 덮어쓰지 않음)
        // force=false → always_off (Cron이 덮어쓰지 않음)
        // forceValue가 undefined이면 auto 모드 (Cron 스케줄대로)
        if (validComplexId && forceValue !== undefined) {
            const newMode = forceValue ? 'always_on' : 'always_off';
            await sb.from('complexes').update({ schedule_mode: newMode }).eq('id', validComplexId);
        }

        let query = sb.from('programs').update({ is_active: activateTarget });
        if (validComplexId) {
            query = query.eq('complex_id', validComplexId);
        } else {
            query = query.not('id', 'is', null);
        }

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
        const capacity  = program.capacity || 6;
        const complexId = program.complex_id;

        // 단지 share_timeslot_capacity 설정 조회
        const { data: capCxData } = await sb
            .from('complexes')
            .select('share_timeslot_capacity')
            .eq('id', complexId)
            .single();
        const shareCapacity = capCxData?.share_timeslot_capacity || false;

        // share ON일 때 같은 days 프로그램 ID 목록 미리 조회
        let sameDayProgramIds = null;
        if (shareCapacity && program.days) {
            const { data: sameDayProgs } = await sb
                .from('programs')
                .select('id')
                .eq('complex_id', complexId)
                .eq('days', program.days);
            sameDayProgramIds = (sameDayProgs || []).map(p => p.id);
        }

        const capacityData = await Promise.all(timeSlots.map(async (slot) => {
            // share_timeslot_capacity ON: 같은 단지+같은 days+시간대 합산 / OFF: 프로그램별 독립
            let approvedQ = sb.from('applications')
                .select('*', { count: 'exact', head: true })
                .eq('complex_id', complexId)
                .eq('preferred_time', slot)
                .eq('status', 'approved');
            let waitingQ = sb.from('applications')
                .select('*', { count: 'exact', head: true })
                .eq('complex_id', complexId)
                .eq('preferred_time', slot)
                .eq('status', 'waiting');
            if (shareCapacity) {
                // ON: 같은 days 프로그램들끼리만 합산
                if (sameDayProgramIds && sameDayProgramIds.length > 0) {
                    approvedQ = approvedQ.in('program_id', sameDayProgramIds);
                    waitingQ  = waitingQ.in('program_id', sameDayProgramIds);
                }
            } else {
                approvedQ = approvedQ.eq('program_id', req.params.id);
                waitingQ  = waitingQ.eq('program_id', req.params.id);
            }
            const { count: approvedCnt } = await approvedQ;
            const { count: waitingCnt }  = await waitingQ;

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
