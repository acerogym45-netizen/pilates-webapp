/**
 * 공지사항 / 문의 / 강사 / 커리큘럼 / 해지 API 라우터 - Supabase 버전
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getSupabase, sbErr } = require('../db-supabase');
const { sendInquiryAnswerSms, getSmsStatus, isSmsConfigured } = require('../utils/sms');

// ── 로컬 doc_urls 스토어 (DB에 doc_urls 컬럼이 없을 때 파일 기반 대체 저장소) ──
const DOC_META_FILE = path.join(__dirname, '../../data/refund_doc_meta.json');
try {
    const dataDir = path.dirname(DOC_META_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(DOC_META_FILE)) fs.writeFileSync(DOC_META_FILE, '{}', 'utf8');
} catch(e) { console.warn('doc_meta store init 실패:', e.message); }

function readDocMeta() {
    try { return JSON.parse(fs.readFileSync(DOC_META_FILE, 'utf8') || '{}'); }
    catch(e) { return {}; }
}
function writeDocMeta(store) {
    try { fs.writeFileSync(DOC_META_FILE, JSON.stringify(store, null, 2), 'utf8'); }
    catch(e) { console.warn('doc_meta write 실패:', e.message); }
}
function saveDocMetaLocal(cancellationId, docUrls) {
    const store = readDocMeta();
    store[cancellationId] = docUrls;
    writeDocMeta(store);
}
function getDocMetaLocal(cancellationId) {
    const store = readDocMeta();
    return store[cancellationId] || null;
}

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

/**
 * GET /api/inquiries/my
 * 본인 문의 조회 (비공개 포함) — 동·호수·전화번호 끝 4자리로 인증 (이름 불필요)
 * query: complexId, complexCode, dong, ho, phoneLast4
 */
router.get('/inquiries/my', async (req, res) => {
    try {
        const { complexId: rawComplexId, complexCode, dong, ho, phoneLast4 } = req.query;
        if (!dong || !ho || !phoneLast4) {
            return res.status(400).json({ success: false, error: '동·호수·전화번호 끝 4자리를 모두 입력하세요' });
        }
        if (!/^\d{4}$/.test(phoneLast4.replace(/\D/g, ''))) {
            return res.status(400).json({ success: false, error: '전화번호 끝 4자리를 숫자 4개로 입력하세요' });
        }
        const sb = getSupabase();

        // complexCode → complex_id 변환
        let resolvedComplexId = rawComplexId || null;
        if (!resolvedComplexId && complexCode) {
            const { data: cx } = await sb
                .from('complexes')
                .select('id')
                .eq('code', complexCode)
                .single();
            if (cx) resolvedComplexId = cx.id;
        }

        // 동·호수로 모든 문의 조회 (phone은 별도 필터링)
        let query = sb
            .from('inquiries')
            .select('id, dong, ho, name, phone, title, content, answer, is_public, is_hidden, created_at, answered_at')
            .eq('dong', dong)
            .eq('ho', ho)
            .order('created_at', { ascending: false });

        if (resolvedComplexId) query = query.eq('complex_id', resolvedComplexId);

        const { data, error } = await query;
        if (error) throw sbErr(error, 'GET /inquiries/my');

        // 전화번호 끝 4자리로 필터링 (클라이언트 측)
        const normalizedPhone4 = phoneLast4.replace(/\D/g, '');
        const result = (data || []).filter(r =>
            r.phone && r.phone.replace(/\D/g, '').slice(-4) === normalizedPhone4
        );

        if (result.length === 0) {
            return res.status(404).json({
                success: false,
                error: '일치하는 문의 내역이 없습니다.\n동·호수·전화번호를 다시 확인해주세요.'
            });
        }

        // 응답에서 phone 필드 제거 (개인정보 보호)
        const safeResult = result.map(({ phone: _p, ...rest }) => rest);
        res.json({ success: true, data: safeResult });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/inquiries/:id', async (req, res) => {
    try {
        const { answer, is_hidden } = req.body;
        const sb = getSupabase();

        // 기존 문의 정보 조회 (SMS 발송에 필요한 phone, name, title + 이전 답변 여부 확인)
        const { data: prevInquiry } = await sb
            .from('inquiries')
            .select('id, name, phone, title, answer, complex_id')
            .eq('id', req.params.id)
            .single();

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

        // ── SMS 자동 발송 ────────────────────────────────────────────
        // 답변이 새로 등록되었고(이전에 답변이 없었거나 답변이 변경됨), 전화번호가 있을 때
        let smsResult = null;
        if (answer && prevInquiry?.phone) {
            const wasAnsweredBefore = Boolean(prevInquiry.answer);

            // 단지명 조회
            let complexName = '';
            try {
                const { data: cx } = await sb
                    .from('complexes')
                    .select('name')
                    .eq('id', prevInquiry.complex_id)
                    .single();
                if (cx) complexName = cx.name;
            } catch (_) { /* 무시 */ }

            // 신규 답변 등록 시에만 SMS 발송 (답변 수정은 발송 안 함)
            if (!wasAnsweredBefore) {
                smsResult = await sendInquiryAnswerSms({
                    phone: prevInquiry.phone,
                    name:  prevInquiry.name,
                    title: prevInquiry.title,
                    answer: answer,
                    complexName,
                });
                console.log('[inquiries] SMS 발송 결과:', smsResult);
            }
        }
        // ─────────────────────────────────────────────────────────────

        res.json({ success: true, data, sms: smsResult });
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

router.put('/curricula/:id', async (req, res) => {
    try {
        const { year, month, title, content, image_url } = req.body;
        const sb = getSupabase();
        const updates = {};
        if (year !== undefined)       updates.year       = parseInt(year);
        if (month !== undefined)      updates.month      = parseInt(month);
        if (title !== undefined)      updates.title      = title;
        if (content !== undefined)    updates.content    = content;
        if (image_url !== undefined)  updates.image_url  = image_url;
        const { data, error } = await sb
            .from('curricula')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) throw sbErr(error, 'PUT /curricula/:id');
        res.json({ success: true, data });
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

        // 로컬 doc_meta 스토어 로드 (DB에 doc_urls 없을 때 보완)
        const docMetaStore = readDocMeta();

        let result = (data || []).map(r => ({
            ...r,
            complex_code: r.complexes?.code,
            // request_type 컬럼이 없는 기존 레코드는 'cancel'로 기본값 설정
            request_type: r.request_type || 'cancel',
            // doc_urls: DB 컬럼 없거나 빈 배열이면 로컬 스토어에서 병합
            doc_urls: (r.doc_urls && r.doc_urls.length > 0) ? r.doc_urls : (docMetaStore[r.id] || r.doc_urls || null)
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
        const { complex_id, application_id, dong, ho, name, phone, program_name, reason, request_type, refund_reason, refund_detail, reason_detail } = req.body;
        if (!complex_id || !dong || !ho || !name || !phone) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        const sb = getSupabase();

        // reason 필드 구성
        let reasonText = reason || '';
        if (request_type === 'refund') {
            // 환불 신청: [환불사유: ...] 형식으로 저장
            reasonText = `[환불사유: ${refund_reason || '-'}]\n${refund_detail || ''}`;
        } else if (reason_detail) {
            // 해지 신청: 상세 사유가 있으면 reason에 합침
            reasonText = reason ? `${reason}\n${reason_detail}` : reason_detail;
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
        const {
            status, refund_amount, doc_urls,
            // ── 해지 관리비 부과 필드 ──────────────────────────
            termination_date,        // 실제 해지 처리 날짜 (YYYY-MM-DD)
            termination_month,       // 해지 처리 월 (YYYY-MM)
            attended_sessions,       // 해지 월 실제 수강 횟수
            total_sessions_in_month, // 해지 월 총 수강 가능 횟수
            session_fee,             // 1회당 수강료 단가
            billing_amount,          // 청구 금액 (수강횟수 × 단가, 자동계산 or 수동)
            billing_memo,            // 청구 메모
            billing_processed,       // 청구 처리 여부
        } = req.body;
        const sb = getSupabase();
        const updates = {};
        if (status !== undefined)       updates.status       = status;
        if (refund_amount !== undefined) updates.refund_amount = refund_amount || 0;
        if (status === 'approved' || status === 'rejected') {
            updates.processed_at = new Date().toISOString();
            // 승인 시 해지 처리 월 자동 설정 (미입력 시)
            if (status === 'approved' && !termination_month) {
                const now = new Date();
                const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                const y = kst.getUTCFullYear();
                const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
                updates.termination_month = `${y}-${m}`;
            }
        }

        // ── 해지 관리비 필드 업데이트 ─────────────────────────
        if (termination_date    !== undefined) updates.termination_date        = termination_date || null;
        if (termination_month   !== undefined) updates.termination_month       = termination_month || null;
        if (attended_sessions   !== undefined) updates.attended_sessions       = parseInt(attended_sessions) || 0;
        if (total_sessions_in_month !== undefined) updates.total_sessions_in_month = parseInt(total_sessions_in_month) || 0;
        if (session_fee         !== undefined) updates.session_fee             = parseInt(session_fee) || 0;
        if (billing_memo        !== undefined) updates.billing_memo            = billing_memo || null;
        if (billing_processed   !== undefined) {
            updates.billing_processed    = !!billing_processed;
            updates.billing_processed_at = billing_processed ? new Date().toISOString() : null;
        }
        // billing_amount: 자동 계산 (attended_sessions × session_fee) 또는 수동 입력
        if (billing_amount !== undefined) {
            updates.billing_amount = parseInt(billing_amount) || 0;
        } else if (attended_sessions !== undefined && session_fee !== undefined) {
            updates.billing_amount = (parseInt(attended_sessions) || 0) * (parseInt(session_fee) || 0);
        }

        // doc_urls: DB 컬럼 있으면 저장, 없으면 로컬에 저장
        if (doc_urls !== undefined) {
            updates.doc_urls = doc_urls;
        }

        // doc_urls를 포함한 전체 DB 업데이트 객체 구성
        const updatesForDb = { ...updates }; // doc_urls 포함
        const hasDocUrls = doc_urls !== undefined;

        let data = null;
        let error = null;

        if (Object.keys(updatesForDb).length === 0) {
            // 아무 필드도 없으면 현재 레코드 조회만
            const { data: existing, error: fetchErr } = await sb
                .from('cancellations').select('*').eq('id', req.params.id).single();
            if (fetchErr) throw sbErr(fetchErr);
            data = existing;
        } else {
            // doc_urls 포함해서 DB 업데이트 시도
            const result = await sb.from('cancellations').update(updatesForDb).eq('id', req.params.id).select().single();
            error = result.error;
            data  = result.data;

            // 컬럼 없음 오류 시 해당 컬럼 제거 후 재시도 (점진적 fallback)
            const OPTIONAL_COLS = [
                'billing_processed_at', 'billing_processed', 'billing_amount', 'billing_memo',
                'session_fee', 'total_sessions_in_month', 'attended_sessions',
                'termination_month', 'termination_date', 'doc_urls'
            ];
            let retryCount = 0;
            while (error && retryCount < OPTIONAL_COLS.length) {
                const errMsg = error.message || '';
                // 오류 메시지에서 정확한 컬럼명 추출 시도
                const exactMatch = errMsg.match(/column[s]? '?([a-z_]+)'? (of|in)/i);
                const exactCol = exactMatch ? exactMatch[1] : null;
                // 정확 매칭 우선, 없으면 오류 메시지에 포함된 컬럼 찾기
                const badCol = (exactCol && OPTIONAL_COLS.includes(exactCol))
                    ? exactCol
                    : OPTIONAL_COLS.find(col => errMsg.includes(col));
                if (!badCol) break;
                delete updatesForDb[badCol];
                console.warn(`[cancellations PUT] 컬럼 '${badCol}' 없음 - 제외 후 재시도 (${retryCount+1}차)`);
                if (Object.keys(updatesForDb).length === 0) {
                    const { data: existing, error: fetchErr } = await sb
                        .from('cancellations').select('*').eq('id', req.params.id).single();
                    if (fetchErr) throw sbErr(fetchErr);
                    data = existing; error = null; break;
                }
                const retry = await sb.from('cancellations').update(updatesForDb).eq('id', req.params.id).select().single();
                error = retry.error; data = retry.data;
                retryCount++;
            }
            if (error) throw sbErr(error);
        }

        // doc_urls 로컬 저장 (항상 백업 + DB 컬럼 없을 때 유일한 저장소)
        if (hasDocUrls && Array.isArray(updates.doc_urls) && updates.doc_urls.length > 0) {
            saveDocMetaLocal(req.params.id, updates.doc_urls);
            data = { ...data, doc_urls: updates.doc_urls };
        } else if (hasDocUrls && data) {
            // doc_urls가 빈 배열이면 로컬에서도 삭제
            const store = readDocMeta();
            delete store[req.params.id];
            writeDocMeta(store);
        }

        // 로컬 스토어에서 doc_urls 병합 (DB에 없는 경우 대비)
        if (data && !data.doc_urls) {
            const localDocs = getDocMetaLocal(req.params.id);
            if (localDocs) data = { ...data, doc_urls: localDocs };
        }

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
            (() => {
                // 미답변(대기중) 문의 수 — complex_id 필터 포함
                let q = sb.from('inquiries')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', '대기중');
                if (complexId) q = q.eq('complex_id', complexId);
                return q;
            })()
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

// ═══════════════════════════════════════════════════════
// SMS 설정 관리
// ═══════════════════════════════════════════════════════

/**
 * GET /api/sms/status
 * SMS 설정 상태 조회 (관리자용)
 */
router.get('/sms/status', (req, res) => {
    res.json({ success: true, ...getSmsStatus() });
});

/**
 * POST /api/sms/settings
 * SMS 설정 저장 (런타임 환경변수 업데이트)
 * body: { apiKey, apiSecret, sender, enabled }
 *
 * ※ 이 설정은 현재 프로세스의 환경변수를 덮어쓰며,
 *    서버 재시작 시 .env 파일이 우선합니다.
 *    Vercel 환경에서는 Vercel 대시보드 > Environment Variables에서 설정하세요.
 */
router.post('/sms/settings', (req, res) => {
    try {
        const { apiKey, apiSecret, sender, enabled } = req.body;

        if (apiKey    !== undefined && apiKey    !== '') process.env.SOLAPI_API_KEY    = apiKey;
        if (apiSecret !== undefined && apiSecret !== '') process.env.SOLAPI_API_SECRET = apiSecret;
        if (sender    !== undefined && sender    !== '') process.env.SOLAPI_SENDER     = sender;
        if (enabled   !== undefined) process.env.SMS_ENABLED = String(enabled);

        // 솔라피 서비스 인스턴스 재생성 (키가 바뀌었을 수 있으므로)
        // sms.js 모듈의 캐시 초기화는 require 캐시 삭제로 처리
        try {
            const smsModulePath = require.resolve('../utils/sms');
            if (require.cache[smsModulePath]) {
                delete require.cache[smsModulePath];
            }
        } catch(_) {}

        console.log('[SMS] 설정 업데이트:', { sender: process.env.SOLAPI_SENDER, enabled: process.env.SMS_ENABLED });
        res.json({ success: true, message: 'SMS 설정이 저장되었습니다', ...getSmsStatus() });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/sms/test
 * SMS 테스트 발송 (관리자용)
 * body: { phone, name }
 */
router.post('/sms/test', async (req, res) => {
    try {
        const { phone, name } = req.body;
        if (!phone) return res.status(400).json({ success: false, error: '전화번호를 입력하세요' });

        const { sendInquiryAnswerSms: sendSms } = require('../utils/sms');
        const result = await sendSms({
            phone,
            name: name || '테스트',
            title: '테스트 문의 제목',
            answer: '테스트 답변입니다. SMS 연동이 정상적으로 작동합니다.',
            complexName: '테스트 단지',
        });

        if (result.skipped) {
            return res.status(400).json({ success: false, error: 'SMS가 비활성화되어 있습니다. 설정을 먼저 완료하세요.' });
        }

        res.json({
            success: result.success,
            message: result.success ? `${phone}으로 테스트 SMS를 발송했습니다` : `발송 실패: ${result.error}`,
            result,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
