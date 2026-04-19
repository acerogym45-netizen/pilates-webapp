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
            signature_name, signature_data, signature_date, agreement, terms_agreement, notes
        } = req.body;

        if (!complex_id || !dong || !ho || !name || !phone || !program_name) {
            return res.status(400).json({ success: false, error: '필수 항목이 누락되었습니다' });
        }

        // ── 중복 신청 체크 ─────────────────────────────────────────
        // 동 + 호 + 이름 + 전화번호가 모두 일치하는 활성 신청이 있으면 차단
        const { data: dupCheck } = await sb
            .from('applications')
            .select('id, program_name, status')
            .eq('complex_id', complex_id)
            .eq('dong', dong)
            .eq('ho', ho)
            .eq('name', name)
            .eq('phone', phone)
            .in('status', ['approved', 'waiting'])
            .limit(1);

        if (dupCheck && dupCheck.length > 0) {
            return res.status(409).json({
                success: false,
                duplicate: true,
                error: '이미 수강 신청 내역이 있습니다. 중복 수강 희망 시 관리자에게 별도 문의하세요.',
                existingProgram: dupCheck[0].program_name,
                existingStatus: dupCheck[0].status,
                existingId: dupCheck[0].id
            });
        }

        // 정원 확인
        let status = 'approved';
        let waitingOrder = null;

        if (program_id && preferred_time) {
            const { data: program } = await sb
                .from('programs')
                .select('*')
                .eq('id', program_id)
                .single();

            if (program && program.type === 'group') {
                const { count: approvedCnt } = await sb
                    .from('applications')
                    .select('*', { count: 'exact', head: true })
                    .eq('program_id', program_id)
                    .eq('preferred_time', preferred_time)
                    .eq('status', 'approved');

                if ((approvedCnt || 0) >= program.capacity) {
                    status = 'waiting';
                    const { data: lastWaiting } = await sb
                        .from('applications')
                        .select('waiting_order')
                        .eq('program_id', program_id)
                        .eq('preferred_time', preferred_time)
                        .eq('status', 'waiting')
                        .order('waiting_order', { ascending: false })
                        .limit(1);
                    waitingOrder = ((lastWaiting?.[0]?.waiting_order) || 0) + 1;
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

// ── 신청 삭제 ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const sb = getSupabase();
        const { error } = await sb.from('applications').delete().eq('id', req.params.id);
        if (error) throw sbErr(error, 'DELETE /applications/:id');
        res.json({ success: true, message: '삭제되었습니다' });
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
