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
        // '113동', '113' 등 접미사 유무 무관하게 숫자 부분만 추출하여 비교하기 위해
        // DB에서 범위를 넓게 가져온 후 클라이언트 필터링 적용
        const dongNum = dong.replace(/[^0-9]/g, '');   // '113동' → '113'
        const hoNum   = ho.replace(/[^0-9]/g, '');     // '1303호' → '1303'

        let query = sb
            .from('inquiries')
            .select('id, dong, ho, name, phone, title, content, answer, is_public, is_hidden, created_at, answered_at')
            .order('created_at', { ascending: false });

        if (resolvedComplexId) query = query.eq('complex_id', resolvedComplexId);

        const { data, error } = await query;
        if (error) throw sbErr(error, 'GET /inquiries/my');

        // 전화번호 끝 4자리 + 동·호수 숫자 부분으로 필터링 (접미사 '동','호' 무관)
        const normalizedPhone4 = phoneLast4.replace(/\D/g, '');
        const result = (data || []).filter(r => {
            const rDong = (r.dong || '').replace(/[^0-9]/g, '');
            const rHo   = (r.ho   || '').replace(/[^0-9]/g, '');
            const phone4Match = r.phone && r.phone.replace(/\D/g, '').slice(-4) === normalizedPhone4;
            return rDong === dongNum && rHo === hoNum && phone4Match;
        });

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
        const { complex_id, name, title, bio, photo_url, display_order, hourly_rates, assigned_programs } = req.body;
        if (!complex_id || !name) return res.status(400).json({ success: false, error: '필수 항목 누락' });
        const sb = getSupabase();
        const { data, error } = await sb
            .from('instructors')
            .insert({
                complex_id, name,
                title: title || '', bio: bio || '', photo_url: photo_url || '',
                display_order: display_order || 0,
                hourly_rates:      hourly_rates      || { group: 0, private: 0, duet: 0 },
                assigned_programs: assigned_programs || [],
            })
            .select()
            .single();
        if (error) throw sbErr(error);
        res.status(201).json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/instructors/:id', async (req, res) => {
    try {
        const { name, title, bio, photo_url, display_order, is_active, hourly_rates, assigned_programs } = req.body;
        const sb = getSupabase();
        const updatePayload = {
            name, title, bio, photo_url,
            display_order: display_order || 0,
            is_active: is_active !== undefined ? Boolean(is_active) : true,
        };
        // 컬럼이 존재할 때만 반영 (DB 마이그레이션 미완시 무시)
        if (hourly_rates      !== undefined) updatePayload.hourly_rates      = hourly_rates;
        if (assigned_programs !== undefined) updatePayload.assigned_programs = assigned_programs;

        const { data, error } = await sb
            .from('instructors')
            .update(updatePayload)
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

// ═══════════════════════════════════════════════════════
// GET /api/cancellations/lookup-programs
// 동 + 호수 + 전화번호로 현재 수강 중인 프로그램 목록 조회
// query: complexId | complexCode, dong, ho, phone
// ═══════════════════════════════════════════════════════
router.get('/cancellations/lookup-programs', async (req, res) => {
    try {
        const { complexId, complexCode, dong, ho, phone } = req.query;
        if (!dong || !ho) {
            return res.status(400).json({ success: false, error: 'dong, ho 필수' });
        }

        const sb = getSupabase();

        // 단지 ID 확정
        let cid = complexId;
        if (!cid && complexCode) {
            const { data: cx } = await sb.from('complexes').select('id').eq('code', complexCode).single();
            if (cx) cid = cx.id;
        }
        if (!cid) return res.status(400).json({ success: false, error: 'complexId 또는 complexCode 필수' });

        // 전화번호 정규화 (하이픈 제거)
        const normalizePhone = (p) => (p || '').replace(/[^0-9]/g, '');
        const phoneNorm = normalizePhone(phone);

        // 동/호수 정규화 (숫자만 추출 → 한글 포함 여부 무관하게 매칭)
        const normDong = dong.replace(/[^0-9]/g, '');
        const normHo   = ho.replace(/[^0-9]/g, '');

        // approved 상태인 수강신청 전체 조회
        const { data: apps, error: appErr } = await sb
            .from('applications')
            .select('id, dong, ho, name, phone, program_name, preferred_time, monthly_fee, status, created_at, updated_at')
            .eq('complex_id', cid)
            .eq('status', 'approved');
        if (appErr) throw appErr;

        // ── 동/호수 매칭 (숫자 기준, 한글 포함 여부 무관) ─────────────
        const byDongHo = (apps || []).filter(a => {
            const aDong = (a.dong || '').replace(/[^0-9]/g, '');
            const aHo   = (a.ho   || '').replace(/[^0-9]/g, '');
            return aDong === normDong && aHo === normHo;
        });

        // ── 전화번호 매칭 (3단계 전략) ─────────────────────────────────
        // 1단계: 전체 번호 완전 일치
        // 2단계: 끝 4자리 일치 (같은 세대 다른 회선 허용)
        // 3단계: 동/호수만으로 조회 (번호 오입력 또는 미입력 → phone_mismatch 플래그 반환)
        let matched = [];
        let phoneMismatch = false;   // 전화번호 불일치 여부 (UI에 힌트 안내용)
        let registeredPhoneHint = ''; // DB에 등록된 번호 마스킹 힌트 (보안)

        if (!phoneNorm) {
            // 전화번호 미입력 → 동/호수만으로 조회
            matched = byDongHo;
        } else {
            // 1단계: 완전 일치
            const exactMatch = byDongHo.filter(a =>
                normalizePhone(a.phone) === phoneNorm
            );
            if (exactMatch.length > 0) {
                matched = exactMatch;
            } else {
                // 2단계: 끝 4자리 일치
                const last4input = phoneNorm.slice(-4);
                const last4Match = byDongHo.filter(a =>
                    normalizePhone(a.phone).slice(-4) === last4input
                );
                if (last4Match.length > 0) {
                    matched = last4Match;
                } else {
                    // 3단계: 전화번호 불일치
                    // - 해당 동/호수에 수강자가 있으면 → phone_mismatch=true + 마스킹 힌트
                    // - 해당 동/호수에 수강자 자체가 없으면 → 그냥 빈 결과 (mismatch 아님)
                    if (byDongHo.length > 0) {
                        // 수강자는 있는데 번호가 다른 경우
                        matched = [];          // 보안: 번호 불일치 시 데이터 반환 안 함
                        phoneMismatch = true;
                        // 등록된 번호 마스킹 힌트 (예: 010-****-4490)
                        const dbPhone = normalizePhone(byDongHo[0].phone);
                        if (dbPhone.length >= 4) {
                            const last4  = dbPhone.slice(-4);
                            const prefix = dbPhone.slice(0, 3);  // 010
                            registeredPhoneHint = `${prefix}-****-${last4}`;
                        }
                    } else {
                        // 해당 동/호수 자체에 수강자가 없는 경우 → 그냥 빈 결과
                        matched = [];
                    }
                }
            }
        }

        // ── 이미 해지 접수된 프로그램 확인 (중복 해지 방지) ──────────
        const pendingCancelKeys    = new Set();
        const pendingCancelAppIds  = new Set();
        if (matched.length > 0) {
            const { data: existingCancels } = await sb
                .from('cancellations')
                .select('application_id, dong, ho, program_name, status')
                .eq('complex_id', cid)
                .in('status', ['pending', 'approved']);
            (existingCancels || []).forEach(c => {
                const cd = (c.dong || '').replace(/[^0-9]/g, '');
                const ch = (c.ho   || '').replace(/[^0-9]/g, '');
                if (cd === normDong && ch === normHo) {
                    pendingCancelKeys.add(c.program_name);
                }
                if (c.application_id) pendingCancelAppIds.add(c.application_id);
            });
        }

        const programs = matched.map(a => ({
            application_id:    a.id,
            name:              a.name,
            phone:             a.phone,
            program_name:      a.program_name,
            preferred_time:    a.preferred_time,
            monthly_fee:       a.monthly_fee,
            already_cancelled: pendingCancelAppIds.has(a.id) || pendingCancelKeys.has(a.program_name),
        }));

        res.json({
            success:               true,
            data:                  programs,
            count:                 programs.length,
            // 전화번호 불일치 안내 (UI에서 사용)
            phone_mismatch:        phoneMismatch,
            registered_phone_hint: registeredPhoneHint || null,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/cancellations', async (req, res) => {
    try {
        const {
            complex_id, application_id, dong, ho, name, phone,
            program_name, preferred_time,
            reason, request_type, source,
            refund_reason, refund_detail, reason_detail
        } = req.body;
        if (!complex_id || !dong || !ho || !name || !phone) return res.status(400).json({ success: false, error: '필수 항목 누락' });

        // ── 입주민 해지신청 기간 체크 (매월 22일 09:00 ~ 26일 09:00 KST만 허용) ──
        // source='admin' 이 아닌 입주민 직접 신청 건에만 적용
        const isResident = source === 'resident' || ((request_type === 'cancel' || !request_type) && source !== 'admin');
        if (isResident && request_type !== 'refund') {
            const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
            const dayKst  = nowKst.getUTCDate();
            const hourKst = nowKst.getUTCHours();
            // 22일 09:00 이상 AND 26일 09:00 미만 → 허용
            const afterOpen  = dayKst > 22 || (dayKst === 22 && hourKst >= 9);
            const beforeClose = dayKst < 26 || (dayKst === 26 && hourKst < 9);
            if (!(afterOpen && beforeClose)) {
                // 다음 접수 시작일 계산 (26일 이후면 다음달 22일)
                const monKst = nowKst.getUTCMonth() + 1;
                const yearKst = nowKst.getUTCFullYear();
                const isAfterClose = dayKst > 26 || (dayKst === 26 && hourKst >= 9);
                const nextMon = isAfterClose ? (monKst === 12 ? 1 : monKst + 1) : monKst;
                const nextYear = (isAfterClose && monKst === 12) ? yearKst + 1 : yearKst;
                return res.status(400).json({
                    success: false,
                    error: `해지 신청은 매월 22일 09시 ~ 26일 09시에만 가능합니다.\n다음 접수 기간: ${nextYear}년 ${nextMon}월 22일 09:00 ~ ${nextMon}월 26일 09:00`
                });
            }
        }

        const sb = getSupabase();

        // ── 중복 해지 신청 방지 ───────────────────────────────────────
        // 동일 application_id로 이미 pending/approved 해지 신청이 있으면 차단
        if (application_id) {
            const { data: dupCheck } = await sb
                .from('cancellations')
                .select('id')
                .eq('complex_id', complex_id)
                .eq('application_id', application_id)
                .in('status', ['pending', 'approved'])
                .limit(1);
            if (dupCheck && dupCheck.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: '이미 해지 신청이 접수된 수강 건입니다.'
                });
            }
        }

        // reason 필드 구성
        let reasonText = reason || '';
        if (request_type === 'refund') {
            // 환불 신청: [환불사유: ...] 형식으로 저장
            reasonText = `[환불사유: ${refund_reason || '-'}]\n${refund_detail || ''}`;
        } else if (reason_detail) {
            // 해지 신청: 상세 사유가 있으면 reason에 합침
            reasonText = reason ? `${reason}\n${reason_detail}` : reason_detail;
        }

        // ── 해지 신청 시 즉시 자동 승인 처리 (번복 불가) ───────────────
        const nowForInsert = new Date();
        const insertData = {
            complex_id, application_id: application_id || null,
            dong, ho, name, phone,
            program_name: program_name || '',
            preferred_time: preferred_time || null,
            reason: reasonText,
            request_type: request_type || 'cancel',
            status: 'approved',                          // 즉시 자동 승인
            processed_at: nowForInsert.toISOString(),    // 처리 일시 자동 기록
        };

        // termination_month 자동 설정 (신청월 기준 다음달)
        const kstNow = new Date(nowForInsert.getTime() + 9 * 60 * 60 * 1000);
        const kstY = kstNow.getUTCFullYear();
        const kstM = kstNow.getUTCMonth() + 1; // 1~12
        const termY = kstM === 12 ? kstY + 1 : kstY;
        const termM = kstM === 12 ? 1 : kstM + 1;
        insertData.termination_month = `${termY}-${String(termM).padStart(2, '0')}`;

        let result;
        // request_type / preferred_time / processed_at / termination_month 컬럼 없을 수 있으므로 fallback
        let { data, error } = await sb.from('cancellations').insert(insertData).select().single();
        if (error && error.message && (
            error.message.includes('request_type') ||
            error.message.includes('preferred_time') ||
            error.message.includes('processed_at') ||
            error.message.includes('termination_month')
        )) {
            const { request_type: _rt, preferred_time: _pt, processed_at: _pa, termination_month: _tm, ...fallbackData } = insertData;
            const retry = await sb.from('cancellations').insert(fallbackData).select().single();
            if (retry.error) throw sbErr(retry.error);
            result = retry.data;
        } else {
            if (error) throw sbErr(error);
            result = data;
        }

        // ── 해지 승인 시 applications 테이블도 자동 cancelled 처리 ────
        if (result && result.application_id) {
            try {
                await sb.from('applications')
                    .update({ status: 'cancelled' })
                    .eq('id', result.application_id);
                console.log(`[cancellations POST] 자동 승인 → applications(${result.application_id}) cancelled 처리`);
            } catch (appEx) {
                console.warn(`[cancellations POST] applications 자동 처리 실패: ${appEx.message}`);
            }
        }

        res.status(201).json({ success: true, data: result, auto_approved: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── 해지자 일괄 등록 ─────────────────────────────────────────────────────────
// POST /api/cancellations/bulk
// body: { complex_id, items: [{ dong, ho, name, phone, program_name, termination_type, termination_date, termination_month }] }
router.post('/cancellations/bulk', async (req, res) => {
    try {
        const { complex_id, items } = req.body;
        if (!complex_id) return res.status(400).json({ success: false, error: 'complex_id 누락' });
        if (!Array.isArray(items) || items.length === 0)
            return res.status(400).json({ success: false, error: 'items 배열 필요' });

        const sb = getSupabase();
        const results = [];
        const errors  = [];

        for (const item of items) {
            const { dong, ho, name, phone, program_name, termination_type, termination_date, termination_month } = item;
            if (!dong || !ho || !name || !phone) {
                errors.push({ item, reason: '필수 항목 누락 (dong/ho/name/phone)' });
                continue;
            }

            // 이미 같은 월에 해지 등록된 건이 있으면 스킵
            if (termination_month) {
                const { data: existing } = await sb.from('cancellations')
                    .select('id')
                    .eq('complex_id', complex_id)
                    .eq('dong', dong).eq('ho', ho).eq('name', name)
                    .eq('termination_month', termination_month)
                    .limit(1);
                if (existing && existing.length > 0) {
                    errors.push({ item, reason: '이미 해당 월에 해지 등록됨 (스킵)' });
                    continue;
                }
            }

            const isMid = termination_type === 'mid';   // 중도해지 vs 차월해지
            const insertData = {
                complex_id,
                application_id: null,
                dong, ho, name, phone,
                program_name: program_name || '',
                reason: isMid ? '중도해지 (일괄등록)' : '차월해지 (일괄등록)',
                request_type: 'cancel',
                status: 'approved',
                processed_at: new Date().toISOString(),
                termination_month: termination_month || null,
                termination_date:  termination_date  || null,
            };

            let { data, error } = await sb.from('cancellations').insert(insertData).select().single();
            if (error && error.message && error.message.includes('request_type')) {
                const { request_type: _rt, ...fallback } = insertData;
                const retry = await sb.from('cancellations').insert(fallback).select().single();
                if (retry.error) { errors.push({ item, reason: retry.error.message }); continue; }
                data = retry.data;
            } else if (error) {
                errors.push({ item, reason: error.message });
                continue;
            }
            results.push(data);
        }

        res.status(201).json({
            success: true,
            inserted: results.length,
            skipped:  errors.length,
            errors,
            data: results,
        });
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

        // ── 해지 승인 시 신청 목록(applications) 자동 해지 처리 ─────────────
        // cancellations 레코드에 application_id가 있으면 해당 신청의 status를 'cancelled'로 변경
        let appCancelResult = null;
        if (status === 'approved' && data && data.application_id) {
            try {
                const { data: appData, error: appErr } = await sb
                    .from('applications')
                    .update({
                        status: 'cancelled',
                        // notes 필드에 해지 처리 정보 기록 (컬럼이 있을 경우)
                    })
                    .eq('id', data.application_id)
                    .select('id, status, name, program_name')
                    .single();

                if (appErr) {
                    // notes 컬럼 없음 등 부가 컬럼 오류는 무시, status 업데이트만 재시도
                    const { data: retryApp, error: retryAppErr } = await sb
                        .from('applications')
                        .update({ status: 'cancelled' })
                        .eq('id', data.application_id)
                        .select('id, status')
                        .single();
                    if (!retryAppErr) {
                        appCancelResult = { success: true, application_id: data.application_id, new_status: 'cancelled' };
                        console.log(`[cancellations PUT] 해지 승인 → applications(${data.application_id}) status='cancelled' 자동 처리 완료`);
                    } else {
                        appCancelResult = { success: false, error: retryAppErr.message };
                        console.warn(`[cancellations PUT] applications 자동 해지 처리 실패: ${retryAppErr.message}`);
                    }
                } else {
                    appCancelResult = { success: true, application_id: data.application_id, new_status: 'cancelled', name: appData?.name };
                    console.log(`[cancellations PUT] 해지 승인 → applications(${data.application_id}) status='cancelled' 자동 처리 완료`);
                }
            } catch (appEx) {
                // applications 자동 처리 실패는 cancellation 승인 자체를 막지 않음
                appCancelResult = { success: false, error: appEx.message };
                console.warn(`[cancellations PUT] applications 자동 해지 처리 예외: ${appEx.message}`);
            }
        }

        res.json({ success: true, data, app_cancel: appCancelResult });
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
// 월별 정산 리포트 API
// ═══════════════════════════════════════════════════════

/**
 * GET /api/settlement-report
 * 월별 정산 분류 (v3 - 최종 정의)
 *
 * ── 분류 기준 ──────────────────────────────────────────
 *  [현재수강자]  applications.status='approved' 전체
 *               → 조회월 말일 기준으로 수강 중인 사람 전부
 *               → 동호수별 부과금액 집계 대상 (시트1)
 *
 *  [기존수강자]  현재수강자 중 approved_at(또는 created_at) < monthStart
 *               → 이번달 이전부터 수강 중이던 사람
 *
 *  [차월신규접수] 현재수강자 - 기존수강자
 *               = approved_at(또는 created_at)이 해당월(monthStart~monthEnd) 이내
 *               → 이번달에 새로 승인된 사람 → 다음달부터 부과 대상
 *
 *  [중도해지]    cancellations.status='approved'
 *               + termination_month = monthKey (해당 월에 처리된 해지)
 *               + termination_date가 말일(monthEnd)이 아닌 경우
 *               → 월 중간 해지 → 관리비 후청구 방식 (금액 별도 협의)
 *
 *  [차월해지]    cancellations.status='approved' 중 중도해지 제외
 *               = termination_month = monthKey 이고 termination_date = monthEnd
 *                 또는 termination_date 미상인 경우
 *               → 다음달 미부과 대상
 *
 *  [취소(excluded)] applications.status='cancelled'
 *               → 수강 시작 전 신청 철회 (20~27일 접수기간 취소)
 *               → notes 에 cancel_type='pre_start' 기록됨
 *               → 부과 없음, 해지 아님 → 완전 집계 제외
 *               ※ cancellations 테이블의 해지(3~10일)와 완전히 별개
 */
router.get('/settlement-report', async (req, res) => {
    try {
        const { complexId, complexCode, year, month } = req.query;
        if (!year || !month) return res.status(400).json({ success: false, error: 'year, month 필수' });

        const sb = getSupabase();
        const yr = parseInt(year), mo = parseInt(month);

        // 단지 ID 확정
        let cid = complexId;
        if (!cid && complexCode) {
            const { data: cx } = await sb.from('complexes').select('id').eq('code', complexCode).single();
            if (cx) cid = cx.id;
        }
        if (!cid) return res.status(400).json({ success: false, error: 'complexId 또는 complexCode 필수' });

        // 날짜 계산
        const lastDay    = new Date(yr, mo, 0).getDate();
        const monthStart = `${yr}-${String(mo).padStart(2,'0')}-01`;
        const monthEnd   = `${yr}-${String(mo).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
        const monthKey   = `${yr}-${String(mo).padStart(2,'0')}`;
        const nextMo  = mo === 12 ? 1 : mo + 1;
        const nextYr  = mo === 12 ? yr + 1 : yr;
        const nextKey = `${nextYr}-${String(nextMo).padStart(2,'0')}`;

        // ────────────────────────────────────────────────
        // 0. 프로그램 가격 매핑 + 월별 수업횟수 매핑
        // ────────────────────────────────────────────────
        const progPriceMap   = {}; // { program_name: price }
        const progIdMap      = {}; // { program_name: program_id }
        const progSessionMap     = {}; // { program_name: session_count } ← 이번 달 실제 수업횟수
        const nextProgSessionMap = {}; // { program_name: session_count } ← 다음 달 수업횟수 (수강신청 내역 시트용)
        {
            const { data: progs } = await sb
                .from('programs')
                .select('id, name, price, description')
                .eq('complex_id', cid);
            (progs || []).forEach(p => {
                if (p.name) {
                    progPriceMap[p.name] = p.price || 0;
                    progIdMap[p.name]    = p.id;
                    // programs.description JSON에서 당월 + 차월 수업횟수 동시 추출
                    try {
                        const raw = p.description;
                        const desc = raw && typeof raw === 'string' && raw.trim().startsWith('{')
                            ? JSON.parse(raw) : (raw || {});
                        const cnt     = desc?.sessions?.[monthKey];
                        const cntNext = desc?.sessions?.[nextKey];
                        if (cnt     != null) progSessionMap[p.name]     = Number(cnt);
                        if (cntNext != null) nextProgSessionMap[p.name] = Number(cntNext);
                    } catch { /* description 파싱 실패 무시 */ }
                }
            });
        }

        // 수업횟수 기반 요금 계산 (session_count × 15,000)
        // session_count 미설정 시 → 정액(monthly_fee or program.price) 그대로 사용
        const SESSION_UNIT = 15000;

        // 당월 수업횟수 기반 요금 (정산 내역 시트 / 동호수계 시트용)
        const getSessionFee = (programName) => {
            const cnt = progSessionMap[programName];
            if (cnt != null && cnt > 0) return cnt * SESSION_UNIT;
            return null; // 미설정
        };
        const getFee = (app) => {
            // 1순위: 당월 수업횟수 기반 계산
            const sessionFee = getSessionFee(app.program_name);
            if (sessionFee !== null) return sessionFee;
            // 2순위: applications 테이블 monthly_fee
            const f = app.monthly_fee;
            if (f !== null && f !== undefined && Number(f) > 0) return Number(f);
            // 3순위: programs.price
            return progPriceMap[app.program_name] || 0;
        };

        // 차월 수업횟수 기반 요금 (수강신청 내역 시트용)
        // 차월 수업횟수 미설정 시 → 당월 수업횟수 → 정액 순으로 fallback
        const getNextFee = (app) => {
            const cntNext = nextProgSessionMap[app.program_name];
            if (cntNext != null && cntNext > 0) return cntNext * SESSION_UNIT;
            // 차월 미설정 → 당월 수업횟수로 fallback
            const cntCur = progSessionMap[app.program_name];
            if (cntCur != null && cntCur > 0) return cntCur * SESSION_UNIT;
            // 정액 fallback
            const f = app.monthly_fee;
            if (f !== null && f !== undefined && Number(f) > 0) return Number(f);
            return progPriceMap[app.program_name] || 0;
        };

        // ────────────────────────────────────────────────
        // A. 현재 수강자 전체 (applications.status='approved')
        //    ※ status='cancelled'는 수강 시작 전 취소 → 완전 제외
        // ────────────────────────────────────────────────
        const { data: allApproved, error: appErr } = await sb
            .from('applications')
            .select('*')
            .eq('complex_id', cid)
            .eq('status', 'approved')
            .order('dong', { ascending: true });
        if (appErr) throw appErr;

        const approvedList = allApproved || [];

        // 기존수강자: 해당월 이전부터 수강 중이던 사람
        const existingList = approvedList.filter(a => {
            const dt = (a.approved_at || a.created_at || '').slice(0, 10);
            return dt < monthStart;
        });

        // 차월신규접수: 해당월 내 승인된 것 = 전체 - 기존
        const nextNewList = approvedList.filter(a => {
            const dt = (a.approved_at || a.created_at || '').slice(0, 10);
            return dt >= monthStart && dt <= monthEnd;
        });

        // ────────────────────────────────────────────────
        // B. 해지 전체 (cancellations.status='approved', request_type='cancel')
        //    termination_month = monthKey 기준 우선
        //    없으면 processed_at(승인일) 기준 fallback
        //    ※ request_type='refund'(환불)는 해지 인원에서 제외
        //    ※ request_type 컬럼이 없는 구버전 데이터는 기본값 'cancel' 로 취급
        // ────────────────────────────────────────────────
        let cancels = [];
        {
            // 1차: termination_month 컬럼으로 조회
            const { data: c1, error: e1 } = await sb
                .from('cancellations')
                .select('*')
                .eq('complex_id', cid)
                .eq('status', 'approved')
                .eq('termination_month', monthKey)
                .order('termination_date', { ascending: true });

            if (!e1) {
                cancels = c1 || [];
            } else {
                // 2차 fallback: processed_at(승인 처리일) 기준
                const { data: c2, error: e2 } = await sb
                    .from('cancellations')
                    .select('*')
                    .eq('complex_id', cid)
                    .eq('status', 'approved')
                    .gte('processed_at', monthStart + 'T00:00:00')
                    .lte('processed_at', monthEnd   + 'T23:59:59')
                    .order('created_at', { ascending: true });

                if (!e2) {
                    cancels = c2 || [];
                } else {
                    // 3차 fallback: created_at 기준
                    const { data: c3, error: e3 } = await sb
                        .from('cancellations')
                        .select('*')
                        .eq('complex_id', cid)
                        .eq('status', 'approved')
                        .gte('created_at', monthStart + 'T00:00:00')
                        .lte('created_at', monthEnd   + 'T23:59:59')
                        .order('created_at', { ascending: true });
                    if (e3) throw e3;
                    cancels = c3 || [];
                }
            }
        }
        // request_type='refund'(환불) 는 해지 인원 집계에서 제외
        // request_type 컬럼이 없는 구버전 레코드는 'cancel'로 간주
        cancels = cancels.filter(c => {
            const rt = c.request_type || 'cancel';
            return rt === 'cancel';
        });

        // ────────────────────────────────────────────────
        // C. 중도해지 / 차월해지 분류
        //
        //  중도해지: termination_date가 있고, monthStart <= date < monthEnd
        //           (월 중간에 해지 → 당월 후청구 방식)
        //  차월해지: termination_date = monthEnd 이거나 날짜 미상
        //           (말일 해지 또는 미상 → 다음달부터 미부과)
        // ────────────────────────────────────────────────
        const midCancel = [];
        const endCancel = [];

        (cancels || []).forEach(c => {
            const tDate = c.termination_date ? c.termination_date.slice(0, 10) : null;

            // 말일 해지이거나 날짜 미상 → 차월해지
            const isEndDay = !tDate || tDate >= monthEnd;

            const row = {
                id:               c.id,
                dong:             c.dong,
                ho:               c.ho,
                name:             c.name,
                phone:            c.phone,
                program_name:     c.program_name,
                termination_date: tDate,
                // 수강 횟수 / 청구 관련 (DB에 이미 저장된 값 전달)
                attended_sessions: c.attended_sessions ?? null,
                // monthly_fee: programs 테이블 매핑 우선
                //   → 없으면 session_fee(DB) 역산 시도
                //   → 그것도 없으면 billing_amount / attended_sessions 역산 시도
                monthly_fee: (() => {
                    const fromProg = progPriceMap[c.program_name];
                    if (fromProg) return fromProg;
                    if (c.session_fee && Number(c.session_fee) > 0) {
                        // session_fee는 회당 단가이므로 monthly_fee와 다름 — 사용 안 함
                    }
                    // billing_amount 역산: billing = penalty + courseFee
                    //   billing = fee*0.1 + att*15000  →  fee = (billing - att*15000) / 0.1
                    const att = Number(c.attended_sessions);
                    const bil = Number(c.billing_amount);
                    if (att > 0 && bil > 0) {
                        const derived = Math.round((bil - att * 15000) / 0.1);
                        if (derived > 0) return derived;
                    }
                    return null;
                })(),
                billing_amount: c.billing_amount ?? null,
                note:             ''
            };

            if (isEndDay) {
                endCancel.push({ ...row, note: tDate ? `${tDate} 해지` : '해지(날짜미상)' });
            } else {
                // 월 중간 해지 → 중도해지
                midCancel.push({ ...row, note: `${tDate} 중도해지` });
            }
        });

        // ────────────────────────────────────────────────
        // D. 동호수 파싱 헬퍼 (숫자 기준 정렬용)
        // ────────────────────────────────────────────────
        const parseDong = d => parseInt((d || '').replace(/[^0-9]/g, '')) || 0;
        const parseHo   = h => parseInt((h || '').replace(/[^0-9]/g, '')) || 0;

        // ────────────────────────────────────────────────
        // E. 시트1: 동호수별 부과 금액 집계
        //    현재 수강자 전체 기준 (기존 + 차월신규 포함)
        //    중도해지자는 별도 표시 (금액은 후청구 방식이므로 참고용)
        //    정렬: 동(숫자) 오름차순 → 호(숫자) 오름차순
        // ────────────────────────────────────────────────
        const midCancelKey = new Set(midCancel.map(r => `${r.dong}_${r.ho}_${r.name}`));

        const donghoMap = new Map();
        approvedList.forEach(a => {
            const key = `${a.dong}_${a.ho}`;
            if (!donghoMap.has(key)) {
                donghoMap.set(key, {
                    dong:  a.dong,
                    ho:    a.ho,
                    phone: a.phone || '',   // 세대 전화번호 (첫 번째 수강자 기준)
                    items: []
                });
            }
            const entry = donghoMap.get(key);
            // 전화번호 보완 (첫 번째로 발견된 번호 사용)
            if (!entry.phone && a.phone) entry.phone = a.phone;

            const isMid     = midCancelKey.has(`${a.dong}_${a.ho}_${a.name}`);
            const isNextNew = nextNewList.some(n => n.id === a.id);
            const fee       = getFee(a);

            entry.items.push({
                name:           a.name,
                phone:          a.phone,
                program_name:   a.program_name,
                preferred_time: a.preferred_time,
                monthly_fee:    fee || null,
                is_mid_cancel:  isMid,
                is_next_new:    isNextNew,
            });
        });

        // 정렬: 동 오름차순 → 호 오름차순
        const donghoRows = Array.from(donghoMap.values()).sort((a, b) => {
            const da = parseDong(a.dong), db = parseDong(b.dong);
            if (da !== db) return da - db;
            return parseHo(a.ho) - parseHo(b.ho);
        });

        // 총 부과 금액 계산 (중도해지자 제외 — 후청구이므로 정액 아님)
        let totalCharge = 0;
        donghoRows.forEach(row => {
            row.total_fee = row.items.reduce((sum, it) => {
                // 중도해지자는 부과금액 합산에서 제외 (후청구 별도 처리)
                if (it.is_mid_cancel) return sum;
                return sum + (Number(it.monthly_fee) || 0);
            }, 0);
            totalCharge += row.total_fee;
        });

        // ────────────────────────────────────────────────
        // F. attendance_records 조회 (월별 출석횟수 저장용)
        // ────────────────────────────────────────────────
        let attendanceMap = {}; // { application_id: { attended, charge_amount } }
        {
            const { data: attData, error: attErr } = await sb
                .from('attendance_records')
                .select('application_id, attended, charge_amount')
                .eq('complex_id', cid)
                .eq('month', monthKey);
            // 테이블 미존재(PGRST205/42P01) 시 빈 맵으로 graceful 처리
            if (!attErr) {
                (attData || []).forEach(r => {
                    attendanceMap[r.application_id] = {
                        attended: r.attended ?? null,
                        charge_amount: r.charge_amount ?? null,
                    };
                });
            }
        }

        // ────────────────────────────────────────────────
        // G. 정산 내역 상단 분류 (당월 수강생)
        //    - 자동연장: 이전달부터 approved 상태 유지 + 해지 아님
        //    - 5월수강해지(차월해지): endCancel 목록에 있는 사람
        //    - 중도해지: midCancel 목록에 있는 사람
        //    - 중도합류: 해당월 내 approved_at
        //    정렬: 프로그램 → 시간대 → 동 → 호수 오름차순
        // ────────────────────────────────────────────────
        const SESSION_FEE = 15000;

        // endCancel 키셋 (dong_ho_name 기준으로 approved 목록에서 구분)
        const endCancelKeySet = new Set(endCancel.map(r => `${r.dong}_${r.ho}_${r.name}`));
        const midCancelKeySet = new Set(midCancel.map(r => `${r.dong}_${r.ho}_${r.name}`));

        // 당월 수강생 행 생성 (approved + 해지자 포함)
        const settlementRows = [];

        // approved 목록: 자동연장 / 중도합류 / 차월해지 구분
        approvedList.forEach(a => {
            const approvedDate = (a.approved_at || a.created_at || '').slice(0, 10);
            const isMidJoin = approvedDate >= monthStart && approvedDate <= monthEnd;
            const isEndCancel = endCancelKeySet.has(`${a.dong}_${a.ho}_${a.name}`);
            const isMidCancel = midCancelKeySet.has(`${a.dong}_${a.ho}_${a.name}`);

            let category = '';
            if (isMidCancel) category = '중도해지';
            else if (isEndCancel) {
                const nextLabel = `${nextYr}년 ${nextMo}월`;
                category = `${nextLabel} 수강 해지`;
            }
            else if (isMidJoin) category = '중도합류';
            // else: 빈칸 (자동연장)

            const fee = getFee(a);
            const att = attendanceMap[a.id];
            const attendedSessions = att?.attended ?? null;
            // 최종부과액: 출석횟수 × 15,000 (중도해지는 별도)
            let finalCharge = null;
            if (!isMidCancel && attendedSessions !== null) {
                finalCharge = attendedSessions * SESSION_FEE;
            }

            settlementRows.push({
                id:               a.id,
                dong:             a.dong,
                ho:               a.ho,
                name:             a.name,
                phone:            a.phone,
                program_name:     a.program_name,
                preferred_time:   a.preferred_time,
                monthly_fee:      fee || null,
                category,
                attended_sessions: attendedSessions,
                final_charge:     finalCharge,
                approved_at:      approvedDate,
                is_mid_cancel:    isMidCancel,
                is_end_cancel:    isEndCancel,
                is_mid_join:      isMidJoin && !isEndCancel && !isMidCancel,
            });
        });

        // 중도해지자는 cancellations 테이블 데이터로 별도 행 추가
        // (approved 목록에 없는 경우 대비)
        midCancel.forEach(c => {
            const alreadyIn = settlementRows.some(r => r.dong === c.dong && r.ho === c.ho && r.name === c.name);
            if (!alreadyIn) {
                settlementRows.push({
                    id:               c.id,
                    dong:             c.dong,
                    ho:               c.ho,
                    name:             c.name,
                    phone:            c.phone,
                    program_name:     c.program_name,
                    preferred_time:   '',
                    monthly_fee:      c.monthly_fee || null,
                    category:         '중도해지',
                    attended_sessions: null,
                    final_charge:     c.billing_amount || null,
                    approved_at:      '',
                    is_mid_cancel:    true,
                    is_end_cancel:    false,
                    is_mid_join:      false,
                });
            }
        });

        // 정렬: 프로그램 → 시간대 → 동(숫자) → 호수(숫자)
        const parseTime = t => {
            if (!t) return 9999;
            const m = t.match(/(\d+)/);
            return m ? parseInt(m[1]) : 9999;
        };
        settlementRows.sort((a, b) => {
            if ((a.program_name || '') < (b.program_name || '')) return -1;
            if ((a.program_name || '') > (b.program_name || '')) return 1;
            const ta = parseTime(a.preferred_time), tb = parseTime(b.preferred_time);
            if (ta !== tb) return ta - tb;
            const da = parseDong(a.dong), db = parseDong(b.dong);
            if (da !== db) return da - db;
            return parseHo(a.ho) - parseHo(b.ho);
        });

        // ────────────────────────────────────────────────
        // H. 차월신규 행 (신규 섹션)
        //    중복수강 여부: 같은 dong+ho+name+phone의 approved가 2개 이상
        // ────────────────────────────────────────────────
        // 동호+이름+전화 키 → approved 건수 맵
        const personKeyCount = {};
        approvedList.forEach(a => {
            const k = `${a.dong}_${a.ho}_${a.name}_${a.phone}`;
            personKeyCount[k] = (personKeyCount[k] || 0) + 1;
        });

        const newSectionRows = nextNewList.map(a => {
            const k = `${a.dong}_${a.ho}_${a.name}_${a.phone}`;
            const isDuplicate = (personKeyCount[k] || 0) >= 2;
            return {
                id:             a.id,
                dong:           a.dong,
                ho:             a.ho,
                name:           a.name,
                phone:          a.phone,
                program_name:   a.program_name,
                preferred_time: a.preferred_time,
                monthly_fee:    getFee(a) || null,
                category:       isDuplicate ? '신규 / 중복 수강 희망' : '신규',
                is_duplicate:   isDuplicate,
                approved_at:    (a.approved_at || a.created_at || '').slice(0, 10),
            };
        }).sort((a, b) => {
            if ((a.program_name || '') < (b.program_name || '')) return -1;
            if ((a.program_name || '') > (b.program_name || '')) return 1;
            const ta = parseTime(a.preferred_time), tb = parseTime(b.preferred_time);
            if (ta !== tb) return ta - tb;
            const da = parseDong(a.dong), db = parseDong(b.dong);
            if (da !== db) return da - db;
            return parseHo(a.ho) - parseHo(b.ho);
        });

        // ────────────────────────────────────────────────
        // I. 동호수계 시트용 데이터
        //    대상: 당월 수강생 (신규 섹션 제외, 최종부과액 0원 제외)
        //    정렬: 동 → 호수 오름차순
        // ────────────────────────────────────────────────
        // 동호수별 그룹핑
        const donghoSettlementMap = new Map();
        settlementRows.forEach(r => {
            // 최종부과액이 null인 경우 일단 포함 (출석미입력), 0원은 제외
            if (r.final_charge === 0) return;
            // 중도해지는 billing_amount가 있으면 final_charge로 사용
            let fc = r.final_charge;
            if (r.is_mid_cancel && !fc) {
                const mc = midCancel.find(c => c.dong === r.dong && c.ho === r.ho && c.name === r.name);
                if (mc) fc = mc.billing_amount || null;
            }
            if (fc === 0) return;

            const key = `${parseDong(r.dong)}_${parseHo(r.ho)}`;
            if (!donghoSettlementMap.has(key)) {
                donghoSettlementMap.set(key, { dong: r.dong, ho: r.ho, items: [] });
            }
            donghoSettlementMap.get(key).items.push({
                name:           r.name,
                phone:          r.phone,
                program_name:   r.program_name,
                preferred_time: r.preferred_time,
                monthly_fee:    r.monthly_fee,
                final_charge:   fc,
            });
        });

        const donghoSettlementRows = Array.from(donghoSettlementMap.values())
            .sort((a, b) => {
                const da = parseDong(a.dong), db = parseDong(b.dong);
                if (da !== db) return da - db;
                return parseHo(a.ho) - parseHo(b.ho);
            });

        // ────────────────────────────────────────────────
        // J. 수강신청 내역 시트용 데이터
        //    대상: 해당 월 승인된 수강생 (해지자·미승인 제외)
        //    정렬: 프로그램 → 시간대 → 동 → 호수
        // ────────────────────────────────────────────────
        const endCancelAppKeys = new Set(endCancel.map(r => `${r.dong}_${r.ho}_${r.name}`));
        const midCancelAppKeys = new Set(midCancel.map(r => `${r.dong}_${r.ho}_${r.name}`));

        const enrollmentRows = approvedList
            .filter(a => {
                const k = `${a.dong}_${a.ho}_${a.name}`;
                return !endCancelAppKeys.has(k) && !midCancelAppKeys.has(k);
            })
            .map(a => ({
                dong:           a.dong,
                ho:             a.ho,
                name:           a.name,
                phone:          a.phone,
                program_name:   a.program_name,
                preferred_time: a.preferred_time,
                monthly_fee:    getNextFee(a) || null,  // ← 차월 수업횟수 기반 요금
            }))
            .sort((a, b) => {
                if ((a.program_name || '') < (b.program_name || '')) return -1;
                if ((a.program_name || '') > (b.program_name || '')) return 1;
                const ta = parseTime(a.preferred_time), tb = parseTime(b.preferred_time);
                if (ta !== tb) return ta - tb;
                const da = parseDong(a.dong), db = parseDong(b.dong);
                if (da !== db) return da - db;
                return parseHo(a.ho) - parseHo(b.ho);
            });

        // ────────────────────────────────────────────────
        // 요약 계산 (새 기준)
        // ────────────────────────────────────────────────
        const totalFeeSum    = settlementRows.reduce((s, r) => s + (Number(r.monthly_fee) || 0), 0);
        const totalFinalSum  = settlementRows.reduce((s, r) => {
            const fc = r.is_mid_cancel
                ? (midCancel.find(c => c.dong === r.dong && c.ho === r.ho && c.name === r.name)?.billing_amount || 0)
                : (r.final_charge || 0);
            return s + fc;
        }, 0);
        const cancelCount = settlementRows.filter(r => r.is_end_cancel || r.is_mid_cancel).length;

        res.json({
            success:  true,
            year: yr, month: mo,
            monthKey, nextKey,
            summary: {
                approved_count:   approvedList.length,
                existing_count:   existingList.length,
                next_new_count:   nextNewList.length,
                mid_cancel_count: midCancel.length,
                end_cancel_count: endCancel.length,
                total_charge:     totalCharge,
                // 새 정산 요약
                settlement_total_rows:  settlementRows.length,
                settlement_cancel_rows: cancelCount,
                settlement_fee_sum:     totalFeeSum,
                settlement_final_sum:   totalFinalSum,
            },
            // ── 기존 호환 유지 ──
            dongho_rows: donghoRows,
            approved: approvedList.map(a => ({
                id:             a.id,
                dong:           a.dong,
                ho:             a.ho,
                name:           a.name,
                phone:          a.phone,
                program_name:   a.program_name,
                preferred_time: a.preferred_time,
                monthly_fee:    getFee(a) || null,
                approved_at:    (a.approved_at || a.created_at || '').slice(0, 10),
                attended_sessions: attendanceMap[a.id]?.attended ?? null,
                final_charge:   attendanceMap[a.id]?.attended != null
                    ? attendanceMap[a.id].attended * SESSION_FEE : null,
            })),
            mid_cancel: midCancel,
            end_cancel: endCancel,
            next_new:   nextNewList.map(a => ({
                dong:           a.dong,
                ho:             a.ho,
                name:           a.name,
                phone:          a.phone,
                program_name:   a.program_name,
                preferred_time: a.preferred_time,
                monthly_fee:    getFee(a) || null,
                approved_at:    (a.approved_at || a.created_at || '').slice(0, 10),
                note:           `${nextKey}부터 수강`,
            })),
            // ── 새 3시트용 데이터 ──
            settlement_rows:        settlementRows,       // 정산 내역 시트 (상단)
            new_section_rows:       newSectionRows,       // 정산 내역 시트 (하단 신규)
            dongho_settlement_rows: donghoSettlementRows, // 동호수계 시트
            enrollment_rows:        enrollmentRows,       // 수강신청 내역 시트
            // ── 월별 수업횟수 정보 (UI 표시용) ──
            prog_session_map:      progSessionMap,         // { program_name: session_count } 당월
            next_prog_session_map: nextProgSessionMap,     // { program_name: session_count } 차월 (수강신청 내역용)
            prog_id_map:           progIdMap,              // { program_name: program_id }
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

// ═══════════════════════════════════════════════════════
// 프로그램 월별 수업횟수 관리
// ─────────────────────────────────────────────────────
// 전용 테이블(program_monthly_sessions) 대신
// programs.description 컬럼에 JSON으로 저장:
//   { "sessions": { "2026-04": 4, "2026-05": 8 } }
// → Supabase 신규 테이블 없이 즉시 동작
// ═══════════════════════════════════════════════════════

/**
 * GET /api/program-monthly-sessions?complexId=&yearMonth=YYYY-MM
 */
router.get('/program-monthly-sessions', async (req, res) => {
    try {
        const { complexId, complexCode, yearMonth } = req.query;
        if (!yearMonth) return res.status(400).json({ success: false, error: 'yearMonth 필수 (YYYY-MM)' });

        const sb = getSupabase();
        let cid = complexId;
        if (!cid && complexCode) {
            const { data: cx } = await sb.from('complexes').select('id').eq('code', complexCode).single();
            if (cx) cid = cx.id;
        }
        if (!cid) return res.status(400).json({ success: false, error: 'complexId 또는 complexCode 필수' });

        const { data: programs, error: progErr } = await sb
            .from('programs')
            .select('id, name, price, description')
            .eq('complex_id', cid)
            .order('display_order', { ascending: true });
        if (progErr) throw progErr;

        const result = (programs || []).map(p => {
            let sessionCount = null;
            try {
                const raw = p.description;
                const desc = raw && typeof raw === 'string' && raw.trim().startsWith('{')
                    ? JSON.parse(raw) : (raw || {});
                const v = desc?.sessions?.[yearMonth];
                if (v != null) sessionCount = Number(v);
            } catch { /* ignore parse error */ }
            return {
                program_id:    p.id,
                program_name:  p.name,
                price:         p.price || 0,
                session_count: sessionCount,
                expected_fee:  sessionCount != null ? sessionCount * 15000 : null,
            };
        });

        res.json({ success: true, data: result, yearMonth });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/program-monthly-sessions
 * body: { complex_id, yearMonth, sessions: [{ program_id, session_count }] }
 */
router.post('/program-monthly-sessions', async (req, res) => {
    try {
        const { complex_id, complexCode, yearMonth, sessions } = req.body;
        if (!yearMonth || !Array.isArray(sessions) || !sessions.length) {
            return res.status(400).json({ success: false, error: 'yearMonth, sessions 필수' });
        }

        const sb = getSupabase();
        let cid = complex_id;
        if (!cid && complexCode) {
            const { data: cx } = await sb.from('complexes').select('id').eq('code', complexCode).single();
            if (cx) cid = cx.id;
        }
        if (!cid) return res.status(400).json({ success: false, error: 'complex_id 필수' });

        const progIds = sessions.map(s => s.program_id);
        const { data: programs, error: fetchErr } = await sb
            .from('programs')
            .select('id, description')
            .eq('complex_id', cid)
            .in('id', progIds);
        if (fetchErr) throw fetchErr;

        let savedCount = 0;
        for (const prog of (programs || [])) {
            const sessEntry = sessions.find(s => s.program_id === prog.id);
            if (!sessEntry) continue;

            let descObj = {};
            try {
                const raw = prog.description;
                if (raw && typeof raw === 'string' && raw.trim().startsWith('{')) {
                    descObj = JSON.parse(raw);
                }
            } catch { /* start fresh */ }

            if (!descObj.sessions) descObj.sessions = {};
            descObj.sessions[yearMonth] = parseInt(sessEntry.session_count) || 0;

            const { error: upErr } = await sb
                .from('programs')
                .update({ description: JSON.stringify(descObj), updated_at: new Date().toISOString() })
                .eq('id', prog.id)
                .eq('complex_id', cid);
            if (upErr) throw upErr;
            savedCount++;
        }

        res.json({ success: true, saved: savedCount, yearMonth });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// DB 마이그레이션 (누락 테이블 자동 생성)
// ═══════════════════════════════════════════════════════

/**
 * POST /api/db-migrate
 * 누락된 테이블을 Supabase에 생성
 * body: { tables: ['attendance_records', 'program_monthly_sessions'] }
 *
 * ※ Supabase anon key로는 DDL 실행 불가 → pg 직접 연결 시도
 *    SUPABASE_DB_PASSWORD 환경변수가 있을 때만 동작
 */
router.post('/db-migrate', async (req, res) => {
    const { tables = [] } = req.body || {};

    const url   = process.env.SUPABASE_URL || '';
    const ref   = (url.match(/https:\/\/([^.]+)\.supabase\.co/) || [])[1];
    const pass  = process.env.SUPABASE_DB_PASSWORD;

    if (!ref) return res.status(400).json({ success: false, error: 'SUPABASE_URL 환경변수가 없습니다' });
    if (!pass) {
        // 패스워드 없으면 SQL만 반환 (사용자가 직접 Supabase Dashboard에서 실행)
        return res.json({
            success: false,
            need_manual: true,
            message: 'SUPABASE_DB_PASSWORD 환경변수가 설정되지 않아 자동 생성 불가. 아래 SQL을 Supabase SQL Editor에서 실행하세요.',
            sql: _getMigrationSQL(tables),
        });
    }

    // pg 직접 연결로 DDL 실행
    try {
        const { Client } = require('pg');
        const client = new Client({
            host:     `db.${ref}.supabase.co`,
            port:     5432,
            database: 'postgres',
            user:     'postgres',
            password: pass,
            ssl:      { rejectUnauthorized: false },
        });
        await client.connect();
        const sql = _getMigrationSQL(tables);
        await client.query(sql);
        await client.end();
        res.json({ success: true, message: '테이블 생성 완료', tables });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

function _getMigrationSQL(tables = []) {
    const sqls = [];
    const all  = tables.length === 0;

    if (all || tables.includes('attendance_records')) {
        sqls.push(`
CREATE TABLE IF NOT EXISTS attendance_records (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  complex_id       uuid NOT NULL,
  application_id   uuid NOT NULL,
  month            text NOT NULL,
  dates            jsonb DEFAULT '{}',
  attended         integer DEFAULT 0,
  absent_noshow    integer DEFAULT 0,
  absent_excused   integer DEFAULT 0,
  charge_amount    integer DEFAULT 0,
  auto_cancel      boolean DEFAULT false,
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(application_id, month)
);`);
    }

    if (all || tables.includes('program_monthly_sessions')) {
        sqls.push(`
CREATE TABLE IF NOT EXISTS program_monthly_sessions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  complex_id    uuid NOT NULL,
  program_id    uuid NOT NULL,
  year_month    text NOT NULL,
  session_count integer NOT NULL DEFAULT 0,
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(complex_id, program_id, year_month)
);`);
    }

    return sqls.join('\n\n');
}

module.exports = router;
