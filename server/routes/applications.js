/**
 * 신청(Applications) API 라우터 - Supabase 버전
 * - 자동 승인 / 정원 초과시 대기 등록
 * - 중복 신청 방지
 * - 양도/양수 처리
 * - 관리비 계산
 */
const express = require('express');
const router = express.Router();
const { getSupabase, sbErr } = require('../db-supabase');

// ── 목록 조회 ────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { complexId, complexCode, status, programId, dong, ho, phone, page = 1, limit = 100 } = req.query;
        const sb = getSupabase();

        let query = sb
            .from('applications')
            .select('*, complexes!inner(code), programs(name)')
            .order('created_at', { ascending: false });

        if (complexId)   query = query.eq('complex_id', complexId);
        if (complexCode) query = query.eq('complexes.code', complexCode);
        if (status)      query = query.eq('status', status);
        if (programId)   query = query.eq('program_id', programId);
        if (dong)        query = query.ilike('dong', `%${dong}%`);
        if (ho)          query = query.ilike('ho', `%${ho}%`);
        if (phone)       query = query.ilike('phone', `%${phone}%`);

        const offset = (parseInt(page) - 1) * parseInt(limit);
        query = query.range(offset, offset + parseInt(limit) - 1);

        const { data, error } = await query;
        if (error) throw sbErr(error, 'GET /applications');

        const result = (data || []).map(r => ({
            ...r,
            complex_code: r.complexes?.code,
            program_name_ref: r.programs?.name
        }));

        res.json({ success: true, data: result, page: parseInt(page), limit: parseInt(limit) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 내 신청 조회 (입주민용) ──────────────────────────────────
router.get('/my', async (req, res) => {
    try {
        const { complexCode, dong, ho, phone4 } = req.query;
        if (!complexCode || !dong || !ho || !phone4) {
            return res.status(400).json({ success: false, error: '단지코드, 동, 호수, 전화번호 뒤 4자리 필수' });
        }

        const sb = getSupabase();
        const { data, error } = await sb
            .from('applications')
            .select('id, dong, ho, name, phone, program_name, preferred_time, status, waiting_order, created_at, complexes!inner(code)')
            .eq('complexes.code', complexCode)
            .ilike('dong', `%${dong}%`)
            .ilike('ho', `%${ho}%`)
            .like('phone', `%${phone4}`)
            .order('created_at', { ascending: false });

        if (error) throw sbErr(error, 'GET /applications/my');

        const masked = (data || []).map(r => ({
            ...r,
            complex_code: r.complexes?.code,
            dong: maskText(r.dong),
            ho: maskText(r.ho),
            name: maskName(r.name),
            phone: maskPhone(r.phone)
        }));

        res.json({ success: true, data: masked });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 프로그램별 현황 요약 (program-summary는 /:id보다 먼저 선언) ──
router.get('/program-summary', async (req, res) => {
    try {
        const { complexId, complexCode } = req.query;
        const sb = getSupabase();

        // 단지 ID 해석
        let cxId = complexId;
        if (!cxId && complexCode) {
            const { data: cx } = await sb.from('complexes').select('id').eq('code', complexCode).single();
            if (cx) cxId = cx.id;
        }

        // 활성 프로그램 목록 조회
        let progQuery = sb.from('programs').select('id, name, capacity, time_slots, price, display_order').eq('is_active', true);
        if (cxId) progQuery = progQuery.eq('complex_id', cxId);
        progQuery = progQuery.order('display_order').order('name');
        const { data: rawPrograms, error: progErr } = await progQuery;
        if (progErr) throw sbErr(progErr, 'program-summary: programs');

        // ─── 중복 프로그램명 dedup: 같은 이름이면 첫 번째 것만 대표로 사용 ───
        // (동일 이름 프로그램이 여러 개인 경우 ID 목록을 합쳐서 집계)
        const progMap = {}; // name → { representative, ids[], slots(Set) }
        (rawPrograms || []).forEach(p => {
            const slots = Array.isArray(p.time_slots) ? p.time_slots : [];
            if (!progMap[p.name]) {
                progMap[p.name] = {
                    representative: p,
                    ids: [p.id],
                    slots: new Set(slots)
                };
            } else {
                progMap[p.name].ids.push(p.id);
                slots.forEach(s => progMap[p.name].slots.add(s));
            }
        });
        const programs = Object.values(progMap);

        const allIds   = programs.flatMap(g => g.ids);
        const allNames = programs.map(g => g.representative.name);
        if (!allIds.length && !allNames.length) return res.json({ success: true, data: [] });

        // 신청 데이터 한 번에 조회
        // NOTE: 많은 신청 건이 program_id=NULL이므로 program_name으로도 매칭
        let appsById = [], appsByName = [];

        if (allIds.length) {
            const { data, error: e1 } = await sb
                .from('applications')
                .select('id, program_id, program_name, preferred_time, status')
                .in('program_id', allIds);
            if (e1) throw sbErr(e1, 'program-summary: applications by id');
            appsById = data || [];
        }

        if (allNames.length) {
            const { data, error: e2 } = await sb
                .from('applications')
                .select('id, program_id, program_name, preferred_time, status')
                .in('program_name', allNames)
                .is('program_id', null);   // program_id가 NULL인 것만 (중복 방지)
            if (e2) throw sbErr(e2, 'program-summary: applications by name');
            appsByName = data || [];
        }

        // 두 쿼리 결과 병합 (id 기준 중복 제거)
        const seen = new Set(appsById.map(a => a.id));
        const apps = [...appsById, ...appsByName.filter(a => !seen.has(a.id))];

        // 프로그램 그룹별 집계
        const result = programs.map(grp => {
            const prog     = grp.representative;
            const capacity = prog.capacity || 6;
            const slots    = [...grp.slots].sort();
            // program_id 일치 OR (program_id null이고 program_name 일치)
            const progApps = apps.filter(a =>
                grp.ids.includes(a.program_id) ||
                (a.program_id == null && a.program_name === prog.name)
            );

            const approved  = progApps.filter(a => a.status === 'approved');
            const waiting   = progApps.filter(a => a.status === 'waiting');
            const cancelled = progApps.filter(a => a.status === 'cancelled');

            // 시간대별 정원 현황 (여유 = capacity - 승인수)
            const slotSummary = slots.map(slot => {
                const slotApproved = approved.filter(a => a.preferred_time === slot).length;
                const slotWaiting  = waiting.filter(a => a.preferred_time === slot).length;
                const available    = Math.max(0, capacity - slotApproved);
                return {
                    slot,
                    approved: slotApproved,
                    waiting: slotWaiting,
                    capacity,
                    available,
                    isFull: slotApproved >= capacity
                };
            });

            return {
                program_id:   prog.id,
                program_name: prog.name,
                program_price: prog.price || 0,
                estimated_monthly_fee: prog.price || 0,
                capacity,
                total_approved:  approved.length,
                total_waiting:   waiting.length,
                total_cancelled: cancelled.length,
                slot_summary:    slotSummary
            };
        });

        res.json({ success: true, data: result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 수강료 정산 현황 (fee-settlement는 /:id보다 먼저 선언) ────
router.get('/fee-settlement', async (req, res) => {
    try {
        const { complexId, complexCode } = req.query;
        const sb = getSupabase();

        // 단지 ID 해석
        let cxId = complexId;
        if (!cxId && complexCode) {
            const { data: cx } = await sb.from('complexes').select('id').eq('code', complexCode).single();
            if (cx) cxId = cx.id;
        }

        // 프로그램 price 맵 (program_name → price)
        let priceMap = {};
        {
            let pq = sb.from('programs').select('name, price').eq('is_active', true);
            if (cxId) pq = pq.eq('complex_id', cxId);
            const { data: progs } = await pq;
            (progs || []).forEach(p => {
                if (p.price && !priceMap[p.name]) priceMap[p.name] = parseInt(p.price);
            });
        }

        // 승인된 수강생 조회
        let query = sb
            .from('applications')
            .select('id, program_id, dong, ho, name, phone, program_name, preferred_time, status, monthly_fee, total_sessions, remaining_sessions, created_at')
            .eq('status', 'approved');
        if (cxId) query = query.eq('complex_id', cxId);
        query = query.order('program_name').order('dong').order('ho');

        const { data, error } = await query;
        if (error) throw sbErr(error, 'fee-settlement');

        // 수강료 자동 매핑 + 부과금액 계산 (total_sessions - remaining_sessions = 수강횟수)
        const enriched = (data || []).map(a => {
            const effectiveFee = a.monthly_fee
                ? parseInt(a.monthly_fee)
                : (priceMap[a.program_name] || null);
            // 수강 횟수 = 총횟수 - 잔여횟수
            const total    = a.total_sessions   != null ? parseInt(a.total_sessions)   : null;
            const remaining = a.remaining_sessions != null ? parseInt(a.remaining_sessions) : null;
            const attended = (total != null && remaining != null) ? Math.max(0, total - remaining) : null;
            // 부과 금액: attended 기준, 없으면 전액
            let billingAmount = null;
            if (effectiveFee && total) {
                const perSession = Math.round(effectiveFee / total);
                billingAmount = attended != null ? attended * perSession : effectiveFee;
            } else if (effectiveFee) {
                billingAmount = effectiveFee;
            }
            return {
                ...a,
                attended_sessions: attended,           // 계산된 수강 횟수
                effective_fee: effectiveFee,
                fee_source: a.monthly_fee ? 'manual' : (priceMap[a.program_name] ? 'program' : 'none'),
                billing_amount: billingAmount
            };
        });

        const totalBilling = enriched.reduce((s, a) => s + (a.billing_amount || 0), 0);
        const hasFee       = enriched.filter(a => a.effective_fee).length;
        const noFee        = enriched.filter(a => !a.effective_fee).length;

        res.json({
            success: true,
            data: enriched,
            summary: {
                total_approved:     enriched.length,
                has_fee:            hasFee,
                no_fee:             noFee,
                total_billing:      totalBilling,
                price_map:          priceMap
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 출석/횟수 일괄 저장 (bulk-sessions는 /:id보다 먼저 선언) ──
// body: { rows: [{ id, total_sessions, remaining_sessions, monthly_fee }] }
router.put('/bulk-sessions', async (req, res) => {
    try {
        const { rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, error: 'rows 배열이 필요합니다' });
        }
        const sb = getSupabase();
        const results = [];
        const errors  = [];

        for (const row of rows) {
            const { id, total_sessions, remaining_sessions, monthly_fee } = row;
            if (!id) { errors.push({ id, msg: 'id 없음' }); continue; }

            const patch = {};
            if (total_sessions     !== undefined && total_sessions     !== '') patch.total_sessions     = parseInt(total_sessions)     || null;
            if (remaining_sessions !== undefined && remaining_sessions !== '') patch.remaining_sessions = parseInt(remaining_sessions) || null;
            if (monthly_fee        !== undefined && monthly_fee        !== '') patch.monthly_fee        = parseInt(monthly_fee)        || null;
            if (Object.keys(patch).length === 0) continue; // 변경 없음

            patch.updated_at = new Date().toISOString();
            const { error } = await sb.from('applications').update(patch).eq('id', id);
            if (error) errors.push({ id, msg: error.message });
            else results.push(id);
        }

        res.json({
            success: errors.length === 0,
            updated: results.length,
            errors
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 관리비 계산 (fee-calc는 /:id보다 먼저 선언) ──────────────
router.post('/fee-calc', (req, res) => {
    try {
        const {
            monthly_fee, total_sessions, attended_sessions,
            absent_sessions, is_transfer, remaining_sessions
        } = req.body;

        if (!monthly_fee || !total_sessions) {
            return res.status(400).json({ success: false, error: 'monthly_fee, total_sessions 필수' });
        }

        const fee       = parseInt(monthly_fee);
        const total     = parseInt(total_sessions);
        const perSession = Math.round(fee / total);

        const attended = parseInt(attended_sessions) || 0;
        const absent   = parseInt(absent_sessions)   || 0;
        const baseFee  = perSession * (attended + absent);
        const noshoPenalty = absent * 15000;

        let transferRefund = 0, transferFee = 0;
        if (is_transfer) {
            const remaining = parseInt(remaining_sessions) || 0;
            transferRefund = Math.max(0, remaining * perSession - Math.round(fee * 0.1));
            transferFee    = remaining * perSession;
        }

        res.json({
            success: true,
            data: {
                monthly_fee: fee, total_sessions: total, per_session_fee: perSession,
                attended_sessions: attended, absent_sessions: absent,
                base_fee: baseFee, nosho_penalty: noshoPenalty,
                total_fee: baseFee + noshoPenalty,
                transfer_refund: transferRefund, transfer_fee: transferFee,
                short_3_sessions: Math.round(fee * 3 / total),
                short_7_sessions: Math.round(fee * 7 / total)
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 단일 조회 ────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('applications')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error || !data) return res.status(404).json({ success: false, error: '신청을 찾을 수 없습니다' });
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 신청 생성 (자동 승인 / 대기 처리) ────────────────────────
router.post('/', async (req, res) => {
    try {
        const sb = getSupabase();
        const {
            complex_id, dong, ho, name, phone, program_id, program_name, preferred_time,
            signature_name, signature_data, signature_date, agreement, terms_agreement, notes,
            admin_bypass   // 관리자가 중복 차단을 우회하여 복수 프로그램 신청 시 true
        } = req.body;

        if (!complex_id || !dong || !ho || !name || !phone || !program_name) {
            return res.status(400).json({ success: false, error: '필수 항목이 누락되었습니다' });
        }

        // ── 중복 신청 체크 ─────────────────────────────────────────
        // admin_bypass=true 이면 관리자가 직접 추가하는 경우이므로 중복 체크 생략
        if (!admin_bypass) {
            // 신청하려는 프로그램의 타입을 먼저 파악
            // 개인 레슨(1:1) / 듀엣 레슨(2:1)은 그룹 레슨과 병행 수강이 가능하므로
            // 같은 카테고리(그룹끼리, 개인끼리, 듀엣끼리) 내에서만 중복 차단
            let targetProgramType = 'group'; // 기본값
            {
                let prog = null;
                if (program_id) {
                    const { data: p } = await sb.from('programs').select('type, name').eq('id', program_id).single();
                    prog = p;
                } else if (program_name && complex_id) {
                    const { data: ps } = await sb.from('programs').select('type, name')
                        .eq('complex_id', complex_id).ilike('name', program_name).limit(1);
                    prog = ps?.[0] || null;
                }
                // DB type 컬럼 외에 프로그램명으로도 개인/듀엣 여부 판별 (하위 호환)
                if (prog) {
                    if (prog.type === 'individual' || /1:1|개인/.test(prog.name)) targetProgramType = 'individual';
                    else if (prog.type === 'duet' || /2:1|듀엣/.test(prog.name)) targetProgramType = 'duet';
                    else targetProgramType = 'group';
                } else {
                    // program_name만으로 판별
                    if (/1:1|개인/.test(program_name)) targetProgramType = 'individual';
                    else if (/2:1|듀엣/.test(program_name)) targetProgramType = 'duet';
                }
            }

            // 동 + 호 + 이름 + 전화번호가 모두 일치하는 활성 신청 전체 조회
            const { data: existingApps } = await sb
                .from('applications')
                .select('id, program_name, program_id, status')
                .eq('complex_id', complex_id)
                .eq('dong', dong)
                .eq('ho', ho)
                .eq('name', name)
                .eq('phone', phone)
                .in('status', ['approved', 'waiting']);

            if (existingApps && existingApps.length > 0) {
                // 기존 신청들의 타입 분류 (이름 기반 heuristic)
                const isSameCategory = existingApps.some(app => {
                    let existType = 'group';
                    if (/1:1|개인/.test(app.program_name)) existType = 'individual';
                    else if (/2:1|듀엣/.test(app.program_name)) existType = 'duet';
                    return existType === targetProgramType;
                });

                if (isSameCategory) {
                    // 같은 카테고리의 신청이 이미 존재 → 중복 차단
                    const sameApp = existingApps.find(app => {
                        let existType = 'group';
                        if (/1:1|개인/.test(app.program_name)) existType = 'individual';
                        else if (/2:1|듀엣/.test(app.program_name)) existType = 'duet';
                        return existType === targetProgramType;
                    });
                    const categoryLabel = targetProgramType === 'individual' ? '개인 레슨'
                        : targetProgramType === 'duet' ? '듀엣 레슨' : '그룹 수업';
                    return res.status(409).json({
                        success: false,
                        duplicate: true,
                        error: `이미 ${categoryLabel} 신청 내역이 있습니다. 중복 수강 희망 시 관리자에게 별도 문의하세요.`,
                        existingProgram: sameApp.program_name,
                        existingStatus: sameApp.status,
                        existingId: sameApp.id
                    });
                }
                // 다른 카테고리(예: 그룹 신청이 있는데 개인/듀엣 신청) → 허용 (fall-through)
            }
        }

        // 정원 확인 (대기 시스템 폐기: 마감 시 차단)
        let status = 'approved';
        let waitingOrder = null;

        if (preferred_time && (program_id || program_name)) {
            // program_id 우선, 없으면 program_name으로 프로그램 조회
            let program = null;
            if (program_id) {
                const { data: prog } = await sb
                    .from('programs')
                    .select('*')
                    .eq('id', program_id)
                    .single();
                program = prog;
            } else if (program_name && complex_id) {
                const { data: progs } = await sb
                    .from('programs')
                    .select('*')
                    .eq('complex_id', complex_id)
                    .ilike('name', program_name)
                    .limit(1);
                program = progs?.[0] || null;
            }

            if (program && program.type === 'group') {
                // 반드시 같은 단지(complex_id) 내에서만 카운트 — 다른 단지 데이터 섞임 방지
                const countQuery = sb
                    .from('applications')
                    .select('*', { count: 'exact', head: true })
                    .eq('complex_id', program.complex_id)
                    .eq('preferred_time', preferred_time)
                    .eq('status', 'approved');

                const { count: approvedCnt } = program_id
                    ? await countQuery.eq('program_id', program.id)
                    : await countQuery.ilike('program_name', program_name);

                if ((approvedCnt || 0) >= program.capacity) {
                    // ── 대기 시스템 폐기: 정원 마감 시 신규 대기 등록 불가 ──
                    // 4월에 접수된 기존 대기자는 DB에 유지되나 신규 접수는 차단
                    return res.status(400).json({
                        success: false,
                        is_full: true,
                        error: `선택한 시간대(${preferred_time})는 정원이 마감되었습니다. 다른 시간대를 선택해 주세요.`
                    });
                }
            }
        }

        const { data: created, error } = await sb
            .from('applications')
            .insert({
                complex_id, dong, ho, name, phone,
                program_id: program_id || null, program_name,
                preferred_time: preferred_time || null,
                status, waiting_order: waitingOrder,
                signature_name: signature_name || '',
                signature_data: signature_data || '',
                signature_date: signature_date || '',
                agreement: Boolean(agreement),
                terms_agreement: Boolean(terms_agreement),
                notes: notes || ''
            })
            .select()
            .single();

        if (error) throw sbErr(error, 'POST /applications');
        res.status(201).json({ success: true, data: created, status, waitingOrder });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 신청 수정 ────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const sb = getSupabase();
        const {
            dong, ho, name, phone, program_name, preferred_time, status, notes, assigned_time,
            remaining_sessions, total_sessions, monthly_fee, transfer_memo, transfer_date
        } = req.body;

        const { data: current, error: fetchErr } = await sb
            .from('applications')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (fetchErr || !current) return res.status(404).json({ success: false, error: '신청을 찾을 수 없습니다' });

        const updates = {};
        if (dong !== undefined)               updates.dong = dong;
        if (ho !== undefined)                 updates.ho = ho;
        if (name !== undefined)               updates.name = name;
        if (phone !== undefined)              updates.phone = phone;
        if (program_name !== undefined)       updates.program_name = program_name;
        if (preferred_time !== undefined)     updates.preferred_time = preferred_time;
        if (status !== undefined)             updates.status = status;
        if (notes !== undefined)              updates.notes = notes;
        if (assigned_time !== undefined)      updates.assigned_time = assigned_time;
        if (remaining_sessions !== undefined) updates.remaining_sessions = remaining_sessions;
        if (total_sessions !== undefined)     updates.total_sessions = total_sessions;
        if (monthly_fee !== undefined)        updates.monthly_fee = monthly_fee;
        if (transfer_memo !== undefined)      updates.transfer_memo = transfer_memo;
        if (transfer_date !== undefined)      updates.transfer_date = transfer_date;

        // ── 관리자 편집 변경 이력 자동 기록 ──────────────────────────
        const editedAt = new Date().toISOString();
        const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const changedFields = [];

        if (program_name !== undefined && program_name !== current.program_name)
            changedFields.push(`프로그램: ${current.program_name} → ${program_name}`);
        if (preferred_time !== undefined && preferred_time !== current.preferred_time)
            changedFields.push(`시간대: ${current.preferred_time} → ${preferred_time}`);
        if (status !== undefined && status !== current.status)
            changedFields.push(`상태: ${current.status} → ${status}`);
        if (dong !== undefined && dong !== current.dong)
            changedFields.push(`동: ${current.dong} → ${dong}`);
        if (ho !== undefined && ho !== current.ho)
            changedFields.push(`호수: ${current.ho} → ${ho}`);
        if (monthly_fee !== undefined && monthly_fee !== current.monthly_fee)
            changedFields.push(`월수강료: ${current.monthly_fee} → ${monthly_fee}`);
        if (remaining_sessions !== undefined && remaining_sessions !== current.remaining_sessions)
            changedFields.push(`잔여횟수: ${current.remaining_sessions} → ${remaining_sessions}`);
        if (total_sessions !== undefined && total_sessions !== current.total_sessions)
            changedFields.push(`총횟수: ${current.total_sessions} → ${total_sessions}`);

        // 변경된 필드가 있으면 무조건 notes에 [수정] 이력 추가
        if (changedFields.length > 0) {
            const editMeta = JSON.stringify({
                edited_at: editedAt,
                edited_by: 'admin',
                ip: clientIp,
                user_agent: userAgent,
                changes: changedFields
            });
            const prevNotes = notes !== undefined ? notes : (current.notes || '');
            updates.notes = prevNotes ? `${prevNotes}\n[수정] ${editMeta}` : `[수정] ${editMeta}`;
        }

        const { data: updated, error } = await sb
            .from('applications')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw sbErr(error, 'PUT /applications/:id');

        // 취소/만료/양도 시 대기자 승급
        if (status === 'cancelled' || status === 'expired' || status === 'transferred') {
            await promoteWaitingApplicant(sb, current.program_id, current.preferred_time);
        }

        res.json({ success: true, data: updated });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 양도/양수 처리 ────────────────────────────────────────────
router.post('/:id/transfer', async (req, res) => {
    try {
        const sb = getSupabase();
        const { new_dong, new_ho, new_name, new_phone, remaining_sessions, transfer_memo, transfer_date } = req.body;

        const { data: original, error: origErr } = await sb
            .from('applications')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (origErr || !original) return res.status(404).json({ success: false, error: '원본 신청을 찾을 수 없습니다' });
        if (original.status !== 'approved') {
            return res.status(400).json({ success: false, error: '승인된 신청만 양도할 수 있습니다' });
        }
        if (!new_dong || !new_ho || !new_name || !new_phone) {
            return res.status(400).json({ success: false, error: '양수자 정보(동·호수·이름·전화번호) 필수' });
        }

        const today = transfer_date || new Date().toISOString().slice(0, 10);

        // 양수자 신청 먼저 생성
        const { data: received, error: insertErr } = await sb
            .from('applications')
            .insert({
                complex_id: original.complex_id,
                dong: new_dong, ho: new_ho, name: new_name, phone: new_phone,
                program_id: original.program_id,
                program_name: original.program_name,
                preferred_time: original.preferred_time,
                status: 'received',
                remaining_sessions: remaining_sessions ?? null,
                total_sessions: original.total_sessions,
                monthly_fee: original.monthly_fee,
                transfer_from: original.id,
                transfer_memo: transfer_memo || '',
                transfer_date: today,
                notes: `양도: ${original.dong} ${original.ho} ${original.name} → ${new_dong} ${new_ho} ${new_name} (잔여 ${remaining_sessions ?? '?'}회)`
            })
            .select()
            .single();

        if (insertErr) throw sbErr(insertErr, 'POST /applications/:id/transfer - insert received');

        // 원본 신청을 양도 상태로 변경
        const { data: transferred, error: updateErr } = await sb
            .from('applications')
            .update({
                status: 'transferred',
                remaining_sessions: remaining_sessions ?? null,
                transfer_to: received.id,
                transfer_memo: transfer_memo || '',
                transfer_date: today
            })
            .eq('id', original.id)
            .select()
            .single();

        if (updateErr) throw sbErr(updateErr, 'POST /applications/:id/transfer - update original');

        res.json({ success: true, transferred, received, message: '양도/양수 처리 완료' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 입주민 대기 취소 (본인 인증 포함) ─────────────────────────
// POST /api/applications/:id/cancel-waiting
// body: { phone4 }  ← 전화번호 뒷 4자리
router.post('/:id/cancel-waiting', async (req, res) => {
    try {
        const { id } = req.params;
        const { phone4 } = req.body;

        if (!phone4 || !/^\d{4}$/.test(phone4)) {
            return res.status(400).json({ success: false, error: '전화번호 뒷 4자리를 입력하세요' });
        }

        const sb = getSupabase();

        // 해당 신청 조회
        const { data: app, error: fetchErr } = await sb
            .from('applications')
            .select('id, phone, status, program_id, program_name, preferred_time, waiting_order, notes')
            .eq('id', id)
            .single();

        if (fetchErr || !app) {
            return res.status(404).json({ success: false, error: '신청 내역을 찾을 수 없습니다' });
        }

        // 전화번호 뒷 4자리 검증
        const storedPhone = (app.phone || '').replace(/\D/g, '');
        if (!storedPhone.endsWith(phone4)) {
            return res.status(403).json({ success: false, error: '전화번호가 일치하지 않습니다' });
        }

        // 대기 상태인지 확인
        if (app.status !== 'waiting') {
            return res.status(400).json({ success: false, error: '대기 중인 신청만 취소할 수 있습니다' });
        }

        // ── 삭제 대신 status='cancelled' 로 변경 (수강 기록 보존) ──
        const cancelledAt = new Date().toISOString();
        const cancelMeta = JSON.stringify({
            cancelled_at: cancelledAt,
            cancelled_by: 'user',
            cancel_type: 'waiting',
            cancel_reason: '입주민 대기 직접 취소'
        });
        const prevNotes = app.notes || '';
        const newNotes = prevNotes
            ? prevNotes + '\n[취소] ' + cancelMeta
            : '[취소] ' + cancelMeta;

        const { error: delErr } = await sb
            .from('applications')
            .update({
                status: 'cancelled',
                waiting_order: null,
                notes: newNotes,
                updated_at: cancelledAt
            })
            .eq('id', id);

        if (delErr) throw sbErr(delErr, 'cancel-waiting UPDATE→cancelled');

        // 뒤 순번 당기기 (대기 취소 시 waiting_order 재정렬)
        if (app.program_id && app.preferred_time && app.waiting_order) {
            // waiting_order 재정렬: 취소된 순번보다 큰 것들 -1
            const { data: laterWaiting } = await sb
                .from('applications')
                .select('id, waiting_order')
                .eq('program_id', app.program_id)
                .eq('preferred_time', app.preferred_time)
                .eq('status', 'waiting')
                .gt('waiting_order', app.waiting_order)
                .order('waiting_order', { ascending: true });

            if (laterWaiting && laterWaiting.length > 0) {
                for (const w of laterWaiting) {
                    await sb.from('applications')
                        .update({ waiting_order: w.waiting_order - 1 })
                        .eq('id', w.id);
                }
            }
        }

        res.json({ success: true, message: '대기 신청이 취소되었습니다' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 입주민 승인 신청 취소 (접수기간 20~27일, 본인 인증) ─────────
// POST /api/applications/:id/cancel-approved
// body: { phone4, complexCode }
router.post('/:id/cancel-approved', async (req, res) => {
    try {
        const { id } = req.params;
        const { phone4, complexCode } = req.body;

        if (!phone4 || !/^\d{4}$/.test(phone4)) {
            return res.status(400).json({ success: false, error: '전화번호 뒷 4자리를 입력하세요' });
        }

        // 접수기간(매월 20~27일) 체크
        const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        const dayKst = nowKst.getUTCDate();
        if (dayKst < 20 || dayKst > 27) {
            return res.status(400).json({ success: false, error: '신청 취소는 매월 20일~27일에만 가능합니다' });
        }

        const sb = getSupabase();
        const { data: app, error: fetchErr } = await sb
            .from('applications')
            .select('id, phone, status, program_id, program_name, preferred_time, dong, ho, name, notes')
            .eq('id', id)
            .single();

        if (fetchErr || !app) {
            return res.status(404).json({ success: false, error: '신청 내역을 찾을 수 없습니다' });
        }

        // 전화번호 뒷 4자리 검증
        const storedPhone = (app.phone || '').replace(/\D/g, '');
        if (!storedPhone.endsWith(phone4)) {
            return res.status(403).json({ success: false, error: '전화번호가 일치하지 않습니다' });
        }

        // 승인 상태만 취소 가능
        if (app.status !== 'approved') {
            return res.status(400).json({ success: false, error: '승인된 신청만 취소할 수 있습니다 (대기 신청은 대기 취소 기능 사용)' });
        }

        // ── 삭제 대신 status='cancelled' 로 변경 (수강 기록 보존) ──
        // 이유: 취소 전까지의 수강 이력이 관리비 부과 근거로 필요
        //       관리자 페이지 > 신청관리 > 해지 탭에서 cancelled 레코드 조회 가능
        const cancelledAt = new Date().toISOString();
        // notes 컬럼에 취소 메타데이터 기록 (DB 스키마 변경 없이 보존)
        const cancelMeta = JSON.stringify({
            cancelled_at: cancelledAt,
            cancelled_by: 'user',
            cancel_type: 'approved',
            cancel_reason: '입주민 직접 취소 (20~27일 접수기간)'
        });
        const prevNotes = app.notes || '';
        const newNotes = prevNotes
            ? prevNotes + '\n[취소] ' + cancelMeta
            : '[취소] ' + cancelMeta;

        const { error: delErr } = await sb
            .from('applications')
            .update({
                status: 'cancelled',
                notes: newNotes,
                updated_at: cancelledAt
            })
            .eq('id', id);
        if (delErr) throw sbErr(delErr, 'cancel-approved UPDATE→cancelled');

        // 대기자 자동 승급 (해당 슬롯에 대기자 있으면 승인으로 올림)
        await promoteWaitingApplicant(sb, app.program_id, app.preferred_time);

        res.json({ success: true, message: '신청이 취소되었습니다. 다음 달 수강은 종료됩니다.' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 변경 가능한 슬롯 조회 (입주민용) ─────────────────────────
// GET /api/applications/:id/available-slots
// 현재 신청자가 이동 가능한 (정원 여유 있는) 모든 프로그램+시간대 반환
router.get('/:id/available-slots', async (req, res) => {
    try {
        const { id } = req.params;
        const { phone4 } = req.query;

        if (!phone4 || !/^\d{4}$/.test(phone4)) {
            return res.status(400).json({ success: false, error: '전화번호 뒷 4자리를 입력하세요' });
        }

        const sb = getSupabase();

        // 현재 신청 조회 (program_name 포함 — null program_id 대비)
        const { data: app, error: fetchErr } = await sb
            .from('applications')
            .select('id, phone, status, program_id, program_name, preferred_time, complex_id')
            .eq('id', id)
            .single();

        if (fetchErr || !app) {
            return res.status(404).json({ success: false, error: '신청 내역을 찾을 수 없습니다' });
        }

        // 전화번호 검증
        const storedPhone = (app.phone || '').replace(/\D/g, '');
        if (!storedPhone.endsWith(phone4)) {
            return res.status(403).json({ success: false, error: '전화번호가 일치하지 않습니다' });
        }

        // 해당 단지의 모든 활성 프로그램 조회
        const { data: programs } = await sb
            .from('programs')
            .select('id, name, capacity, time_slots')
            .eq('complex_id', app.complex_id)
            .eq('is_active', true)
            .order('name');

        if (!programs || programs.length === 0) {
            return res.json({ success: true, data: [], current: app });
        }

        // 모든 프로그램의 시간대별 승인 인원 조회 (program_id + program_name 모두 가져옴)
        const { data: allApproved } = await sb
            .from('applications')
            .select('program_id, program_name, preferred_time')
            .eq('complex_id', app.complex_id)
            .eq('status', 'approved');

        // program name → id 역매핑 (null program_id 레코드를 name으로 연결하기 위함)
        const nameToId = {};
        for (const prog of programs) {
            nameToId[prog.name] = prog.id;
        }

        // 프로그램별·시간대별 승인 카운트 맵 구성
        // program_id가 null인 경우 program_name으로 실제 program_id를 추론
        const countMap = {};
        for (const a of (allApproved || [])) {
            const resolvedId = a.program_id || nameToId[a.program_name] || null;
            if (!resolvedId || !a.preferred_time) continue;
            const key = `${resolvedId}::${a.preferred_time}`;
            countMap[key] = (countMap[key] || 0) + 1;
        }

        // 현재 신청자가 점유하고 있는 슬롯 키 (본인 제외 카운트를 위해)
        const myProgramId = app.program_id || nameToId[app.program_name] || null;
        const myKey = myProgramId && app.preferred_time ? `${myProgramId}::${app.preferred_time}` : null;

        // 변경 가능 슬롯 구성
        const result = [];
        for (const prog of programs) {
            const slots = Array.isArray(prog.time_slots) ? prog.time_slots : [];
            for (const slot of slots) {
                // 현재 신청과 동일한 프로그램+시간대면 제외 (program_id 또는 name 기반 비교)
                const isSameProg = (prog.id === app.program_id) || (prog.id === myProgramId);
                if (isSameProg && slot === app.preferred_time) continue;

                const key = `${prog.id}::${slot}`;
                let approvedCnt = countMap[key] || 0;

                // 현재 슬롯 카운트에 본인이 포함되어 있는 경우 1 차감 (이미 위에서 제외했지만 안전장치)
                // (이 슬롯이 본인 슬롯이 아니므로 차감 불필요 — 위 continue로 처리됨)

                const isFull = approvedCnt >= (prog.capacity || 1);

                result.push({
                    program_id: prog.id,
                    program_name: prog.name,
                    time: slot,
                    capacity: prog.capacity,
                    approved_count: approvedCnt,
                    available: !isFull,
                    is_full: isFull
                });
            }
        }

        res.json({ success: true, data: result, current: { program_id: myProgramId || app.program_id, program_name: app.program_name, preferred_time: app.preferred_time } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 입주민 프로그램·시간대 변경 (접수기간 20~27일, 본인 인증) ────
// POST /api/applications/:id/change-time
// body: { phone4, new_program_id, new_preferred_time }
// ※ 대기 시스템 폐기: 정원 마감 슬롯은 변경 불가 (기존 대기자는 유지)
router.post('/:id/change-time', async (req, res) => {
    try {
        const { id } = req.params;
        const { phone4, new_program_id, new_preferred_time } = req.body;

        if (!phone4 || !/^\d{4}$/.test(phone4)) {
            return res.status(400).json({ success: false, error: '전화번호 뒷 4자리를 입력하세요' });
        }
        if (!new_preferred_time) {
            return res.status(400).json({ success: false, error: '변경할 시간대를 선택하세요' });
        }

        // 접수기간(매월 20~27일) 체크
        const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        const dayKst = nowKst.getUTCDate();
        if (dayKst < 20 || dayKst > 27) {
            return res.status(400).json({ success: false, error: '변경은 매월 20일~27일에만 가능합니다' });
        }

        const sb = getSupabase();
        const { data: app, error: fetchErr } = await sb
            .from('applications')
            .select('id, phone, status, program_id, program_name, preferred_time, dong, ho, name, complex_id, notes')
            .eq('id', id)
            .single();

        if (fetchErr || !app) {
            return res.status(404).json({ success: false, error: '신청 내역을 찾을 수 없습니다' });
        }

        // 전화번호 검증
        const storedPhone = (app.phone || '').replace(/\D/g, '');
        if (!storedPhone.endsWith(phone4)) {
            return res.status(403).json({ success: false, error: '전화번호가 일치하지 않습니다' });
        }

        // 승인 상태만 변경 가능 (대기자는 취소 후 재신청)
        if (app.status !== 'approved') {
            return res.status(400).json({ success: false, error: '승인된 신청만 변경할 수 있습니다. 대기 신청은 취소 후 재신청해 주세요.' });
        }

        // 변경할 프로그램 ID (없으면 현재 프로그램 유지, program_id가 null이면 name으로 조회)
        let targetProgramId = new_program_id || app.program_id;

        // 대상 프로그램 조회
        let targetProgram = null;
        if (targetProgramId) {
            const { data: prog } = await sb
                .from('programs')
                .select('id, name, capacity, time_slots, complex_id')
                .eq('id', targetProgramId)
                .single();
            targetProgram = prog;
        }

        // program_id가 없으면 현재 app의 program_name으로 조회
        if (!targetProgram && app.program_name) {
            const { data: progs } = await sb
                .from('programs')
                .select('id, name, capacity, time_slots, complex_id')
                .eq('complex_id', app.complex_id)
                .ilike('name', app.program_name)
                .limit(1);
            targetProgram = progs?.[0] || null;
            if (targetProgram) targetProgramId = targetProgram.id;
        }

        if (!targetProgram) {
            return res.status(404).json({ success: false, error: '선택한 프로그램을 찾을 수 없습니다' });
        }

        // 같은 프로그램+시간대면 불필요
        if (targetProgram.id === (app.program_id || targetProgramId) && app.preferred_time === new_preferred_time) {
            return res.status(400).json({ success: false, error: '현재와 동일한 프로그램·시간대입니다' });
        }

        // 같은 단지의 프로그램인지 확인
        if (targetProgram.complex_id !== app.complex_id) {
            return res.status(400).json({ success: false, error: '다른 단지 프로그램으로는 변경할 수 없습니다' });
        }

        // 대상 시간대가 해당 프로그램의 유효한 슬롯인지 확인 (슬롯이 있는 프로그램만)
        const validSlots = Array.isArray(targetProgram.time_slots) ? targetProgram.time_slots : [];
        if (validSlots.length > 0 && !validSlots.includes(new_preferred_time)) {
            return res.status(400).json({ success: false, error: '해당 프로그램에 없는 시간대입니다' });
        }

        // 정원 확인: program_id 기반 카운트 + program_name 기반 카운트 (null program_id 대비)
        // 같은 단지(complex_id) 내 정원 확인 — 다른 단지 데이터가 섞이지 않도록 반드시 complex_id 필터 포함
        const { count: cntById } = await sb
            .from('applications')
            .select('*', { count: 'exact', head: true })
            .eq('complex_id', targetProgram.complex_id)
            .eq('program_id', targetProgramId)
            .eq('preferred_time', new_preferred_time)
            .eq('status', 'approved');
        const { count: cntByName } = await sb
            .from('applications')
            .select('*', { count: 'exact', head: true })
            .eq('complex_id', targetProgram.complex_id)
            .is('program_id', null)
            .ilike('program_name', targetProgram.name)
            .eq('preferred_time', new_preferred_time)
            .eq('status', 'approved');
        const approvedCnt = (cntById || 0) + (cntByName || 0);

        const capacity = targetProgram.capacity || 1;
        if ((approvedCnt || 0) >= capacity) {
            return res.status(400).json({
                success: false,
                error: `선택한 시간대(${new_preferred_time})는 정원이 마감되었습니다. 다른 시간대를 선택해 주세요.`,
                is_full: true
            });
        }

        const oldProgramId   = app.program_id;
        const oldProgramName  = app.program_name;
        const oldTime         = app.preferred_time;
        const changedAt       = new Date().toISOString();

        // ── 변경 이력 notes 컬럼에 누적 저장 ───────────────────────────────
        const changed = [];
        if (targetProgram.name !== oldProgramName)   changed.push(`프로그램: ${oldProgramName} → ${targetProgram.name}`);
        if (new_preferred_time !== oldTime)           changed.push(`시간대: ${oldTime} → ${new_preferred_time}`);

        const changeMeta = JSON.stringify({
            changed_at:       changedAt,
            changed_by:       'user',
            from_program:     oldProgramName,
            from_time:        oldTime,
            to_program:       targetProgram.name,
            to_time:          new_preferred_time,
            change_summary:   changed.join(', ')
        });
        const prevNotes = app.notes || '';
        const newNotes  = prevNotes
            ? prevNotes + '\n[변경] ' + changeMeta
            : '[변경] ' + changeMeta;

        // 변경 실행 (notes에 이력 포함)
        const { error: updateErr } = await sb
            .from('applications')
            .update({
                program_id:    targetProgramId,
                program_name:  targetProgram.name,
                preferred_time: new_preferred_time,
                status:        'approved',
                waiting_order: null,
                notes:         newNotes,
                updated_at:    changedAt
            })
            .eq('id', id);

        if (updateErr) throw sbErr(updateErr, 'change-time UPDATE');

        // 이전 슬롯에서 대기자 승급 (기존 4월 대기자 처리용으로 유지)
        await promoteWaitingApplicant(sb, oldProgramId, oldTime);

        res.json({
            success: true,
            message: `${changed.join(', ')}(으)로 변경되었습니다.`,
            new_status: 'approved',
            new_program_name: targetProgram.name,
            new_preferred_time
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 신청 삭제 (관리자용) ─────────────────────────────────────
// ?force=true 파라미터가 있을 때만 물리 삭제, 없으면 status='deleted' 소프트 삭제
router.delete('/:id', async (req, res) => {
    try {
        const sb = getSupabase();
        const force = req.query.force === 'true';

        if (force) {
            // 물리 삭제 (완전히 지움 - 복구 불가)
            const { error } = await sb.from('applications').delete().eq('id', req.params.id);
            if (error) throw sbErr(error, 'DELETE /applications/:id (force)');
            res.json({ success: true, message: '완전히 삭제되었습니다' });
        } else {
            // 소프트 삭제: status='deleted' 로 마킹 (수강 기록 보존)
            const deletedAt = new Date().toISOString();
            const { data: app } = await sb
                .from('applications')
                .select('notes')
                .eq('id', req.params.id)
                .single();
            const prevNotes = (app && app.notes) || '';
            const deleteMeta = JSON.stringify({
                deleted_at: deletedAt,
                deleted_by: 'admin',
                delete_reason: '관리자 삭제'
            });
            const newNotes = prevNotes
                ? prevNotes + '\n[삭제] ' + deleteMeta
                : '[삭제] ' + deleteMeta;

            const { error } = await sb
                .from('applications')
                .update({ status: 'cancelled', notes: newNotes, updated_at: deletedAt })
                .eq('id', req.params.id);
            if (error) throw sbErr(error, 'DELETE /applications/:id (soft)');
            res.json({ success: true, message: '삭제되었습니다 (수강 기록은 해지 탭에서 확인 가능)' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── 대기자 자동 승급 ─────────────────────────────────────────
async function promoteWaitingApplicant(sb, programId, preferredTime) {
    if (!programId || !preferredTime) return;

    const { data: program } = await sb
        .from('programs')
        .select('capacity')
        .eq('id', programId)
        .single();

    if (!program) return;

    const { count: approvedCnt } = await sb
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .eq('program_id', programId)
        .eq('preferred_time', preferredTime)
        .eq('status', 'approved');

    if ((approvedCnt || 0) < program.capacity) {
        const { data: nextWaiting } = await sb
            .from('applications')
            .select('*')
            .eq('program_id', programId)
            .eq('preferred_time', preferredTime)
            .eq('status', 'waiting')
            .order('waiting_order', { ascending: true })
            .limit(1);

        if (nextWaiting && nextWaiting[0]) {
            await sb
                .from('applications')
                .update({ status: 'approved', waiting_order: null })
                .eq('id', nextWaiting[0].id);
            console.log(`✅ Promoted waiting: ${nextWaiting[0].name} (${nextWaiting[0].dong} ${nextWaiting[0].ho})`);
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
