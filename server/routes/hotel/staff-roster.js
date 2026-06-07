/**
 * server/routes/hotel/staff-roster.js
 * 라마다 임직원 명단 CRUD 라우터
 *
 * 엔드포인트 (5개):
 *   GET    /           — 명단 목록 조회 (complex_id 기준)
 *   POST   /           — 1건 등록
 *   POST   /bulk       — CSV 업로드용 일괄 등록
 *   PUT    /:id        — 필드 수정 (staff_no·phone_last4 변경 불가)
 *   DELETE /:id        — 1건 삭제
 *
 * 설계 원칙:
 *   - Feature Flag: 전 엔드포인트 flags.hotelStaffAuth 체크 (ENABLE_HOTEL_STAFF_AUTH)
 *   - venue_type='hotel' 검증: complex_id → complexes 조회 후 확인
 *   - ⚠️ phone_last4 서버 측 정규식 검증: /^\d{4}$/ — 전체 번호 입력 시 400
 *   - 출입 로그 / 혼잡도 / 인원카운트 엔드포인트 없음
 *   - VIP 등급 외 별도 등급 시스템 없음
 *   - 중복 (complex_id + staff_no): /bulk에서 SKIP, POST 단건에서 409 반환
 *
 * 연결 위치:
 *   server/index.js if(flags.hotelMode) 블록 내:
 *     app.use('/api/hotel/staff', require('./routes/hotel/staff-roster'));
 *
 * DB 패턴: 기존 routes와 동일하게 getSupabase() / sbErr() 사용
 * 단계: D-2.5 / 작성일: 2026-06-07
 */

'use strict';

const express = require('express');
const router  = express.Router();

const { getSupabase, sbErr } = require('../../db-supabase');
const flags                  = require('../../config/feature-flags');

// ── 상수 ────────────────────────────────────────────────────────
/** phone_last4 유효성: 정확히 숫자 4자리만 허용 */
const PHONE_LAST4_RE = /^\d{4}$/;

/** 1회 bulk INSERT 최대 허용 건수 */
const BULK_MAX = 500;


// ── 유틸 ────────────────────────────────────────────────────────

/**
 * Feature Flag 비활성화 응답 공통 핸들러
 * @param {import('express').Response} res
 * @param {string} flagName  환경변수명 (로그·안내용)
 */
function flagOff(res, flagName) {
    return res.status(403).json({
        success: false,
        error: `해당 기능이 현재 비활성화되어 있습니다 (${flagName})`,
    });
}

/**
 * complex_id로 단지 조회 + venue_type='hotel' 검증
 * 실패 시 res에 응답을 보내고 null 반환.
 *
 * @param {object}   sb          Supabase 클라이언트
 * @param {string}   complexId   UUID
 * @param {import('express').Response} res
 * @returns {Promise<object|null>}  complex row 또는 null
 */
async function resolveHotelComplexById(sb, complexId, res) {
    if (!complexId) {
        res.status(400).json({ success: false, error: 'complex_id가 필요합니다' });
        return null;
    }

    const { data: complex, error: cxErr } = await sb
        .from('complexes')
        .select('id, venue_type, name')
        .eq('id', complexId)
        .single();

    if (cxErr || !complex) {
        res.status(404).json({ success: false, error: '단지를 찾을 수 없습니다' });
        return null;
    }
    if (complex.venue_type !== 'hotel') {
        res.status(403).json({ success: false, error: '호텔 단지에서만 이용 가능합니다' });
        return null;
    }
    return complex;
}

/**
 * phone_last4 서버 측 유효성 검사
 * 4자리 숫자가 아니면 400 응답 후 false 반환.
 *
 * @param {string}   val
 * @param {import('express').Response} res
 * @returns {boolean}
 */
function validatePhoneLast4(val, res) {
    if (!PHONE_LAST4_RE.test(val)) {
        res.status(400).json({
            success: false,
            error:   'phone_last4는 숫자 4자리여야 합니다 (전체 번호 수집 금지)',
        });
        return false;
    }
    return true;
}


// ── GET / — 명단 조회 ────────────────────────────────────────────
/**
 * 임직원 명단 목록 조회
 *
 * Query:
 *   complex_id {string} UUID — 필수
 *   search     {string}     — 사번 또는 이름 부분 일치 (선택)
 *   limit      {number}     — 최대 반환 건수 (기본 500, 최대 1000)
 *
 * Response 200:
 *   { success: true, data: [{ id, staff_no, name, phone_last4,
 *                              department, is_vip, is_active, created_at }] }
 *
 * Feature Flag: hotelStaffAuth
 */
router.get('/', async (req, res) => {
    if (!flags.hotelStaffAuth) return flagOff(res, 'ENABLE_HOTEL_STAFF_AUTH');

    const { complex_id, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000);

    try {
        const sb = getSupabase();

        // venue_type='hotel' 검증
        const complex = await resolveHotelComplexById(sb, complex_id, res);
        if (!complex) return;

        // hotel_staff 조회
        let query = sb
            .from('hotel_staff')
            .select('id, staff_no, name, phone_last4, department, is_vip, is_active, created_at')
            .eq('complex_id', complex.id)
            .order('created_at', { ascending: true })
            .limit(limit);

        // 검색 필터: 사번 또는 이름 부분 일치
        if (search && search.trim()) {
            const term = search.trim();
            query = query.or(`staff_no.ilike.%${term}%,name.ilike.%${term}%`);
        }

        const { data: staff, error: staffErr } = await query;

        if (staffErr) {
            console.error('[hotel/staff-roster] GET /:', staffErr.message);
            return res.status(500).json({ success: false, error: sbErr(staffErr).message });
        }

        return res.json({ success: true, data: staff || [] });

    } catch (e) {
        console.error('[hotel/staff-roster] GET /:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST / — 1건 등록 ────────────────────────────────────────────
/**
 * 임직원 1건 신규 등록
 *
 * Body:
 *   { complex_id, staff_no, name, phone_last4, department?, is_vip? }
 *
 * Response 200: { success: true, id }
 * Response 400: phone_last4 형식 오류 또는 필수 필드 누락
 * Response 409: 중복 사번 (complex_id + staff_no UNIQUE 위반)
 *
 * Feature Flag: hotelStaffAuth
 */
router.post('/', async (req, res) => {
    if (!flags.hotelStaffAuth) return flagOff(res, 'ENABLE_HOTEL_STAFF_AUTH');

    const {
        complex_id,
        staff_no,
        name,
        phone_last4,
        department = null,
        is_vip     = false,
    } = req.body || {};

    // 필수 필드 검사
    if (!complex_id || !staff_no || !name || !phone_last4) {
        return res.status(400).json({
            success: false,
            error:   'complex_id, staff_no, name, phone_last4가 모두 필요합니다',
        });
    }

    // phone_last4 정규식 검증 (전체 번호 금지)
    if (!validatePhoneLast4(phone_last4, res)) return;

    try {
        const sb = getSupabase();

        // venue_type='hotel' 검증
        const complex = await resolveHotelComplexById(sb, complex_id, res);
        if (!complex) return;

        // 중복 사번 사전 확인
        const { data: existing } = await sb
            .from('hotel_staff')
            .select('id')
            .eq('complex_id', complex.id)
            .eq('staff_no', staff_no.trim())
            .maybeSingle();

        if (existing) {
            return res.status(409).json({
                success: false,
                error:   `이미 등록된 사번입니다: ${staff_no}`,
            });
        }

        // INSERT
        const { data: inserted, error: insErr } = await sb
            .from('hotel_staff')
            .insert({
                complex_id:  complex.id,
                staff_no:    staff_no.trim(),
                name:        name.trim(),
                phone_last4: phone_last4.trim(),
                department:  department?.trim() || null,
                is_vip:      Boolean(is_vip),
                is_active:   true,
            })
            .select('id')
            .single();

        if (insErr) {
            console.error('[hotel/staff-roster] POST /:', insErr.message);
            // Supabase unique constraint 코드: 23505
            if (insErr.code === '23505') {
                return res.status(409).json({
                    success: false,
                    error:   `이미 등록된 사번입니다: ${staff_no}`,
                });
            }
            return res.status(500).json({ success: false, error: sbErr(insErr).message });
        }

        return res.json({ success: true, id: inserted.id });

    } catch (e) {
        console.error('[hotel/staff-roster] POST /:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST /bulk — CSV 일괄 등록 ────────────────────────────────────
/**
 * CSV 업로드용 임직원 일괄 등록
 *
 * Body:
 *   {
 *     complex_id: string (UUID),
 *     records: [
 *       { staff_no, name, phone_last4, department?, is_vip? },
 *       ...
 *     ]
 *   }
 *
 * 동작:
 *   - 각 행 유효성 검사 (phone_last4 포함)
 *   - 단지 내 기존 사번 목록을 1회 조회 → 중복 행 SKIP
 *   - 유효 행 일괄 INSERT (Supabase upsert 미사용 — 덮어쓰기 방지)
 *
 * Response 200:
 *   { success: true, inserted: N, skipped: M, errors: [...], duplicates: [...] }
 *
 * Feature Flag: hotelStaffAuth
 */
router.post('/bulk', async (req, res) => {
    if (!flags.hotelStaffAuth) return flagOff(res, 'ENABLE_HOTEL_STAFF_AUTH');

    const { complex_id, records } = req.body || {};

    if (!complex_id) {
        return res.status(400).json({ success: false, error: 'complex_id가 필요합니다' });
    }
    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ success: false, error: 'records 배열이 비어 있습니다' });
    }
    if (records.length > BULK_MAX) {
        return res.status(400).json({
            success: false,
            error:   `한 번에 등록 가능한 최대 건수는 ${BULK_MAX}건입니다`,
        });
    }

    try {
        const sb = getSupabase();

        // venue_type='hotel' 검증
        const complex = await resolveHotelComplexById(sb, complex_id, res);
        if (!complex) return;

        // 기존 사번 Set 조회 (중복 체크용)
        const { data: existingRows, error: exErr } = await sb
            .from('hotel_staff')
            .select('staff_no')
            .eq('complex_id', complex.id);

        if (exErr) {
            console.error('[hotel/staff-roster] POST /bulk (existing):', exErr.message);
            return res.status(500).json({ success: false, error: sbErr(exErr).message });
        }

        const existingSet = new Set((existingRows || []).map(r => r.staff_no));

        // 행별 유효성 검사 + 중복 분류
        const toInsert   = [];
        const duplicates = [];
        const errors     = [];

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rowNum = i + 1;

            // 필수 필드
            if (!row.staff_no || !row.name || !row.phone_last4) {
                errors.push(`행 ${rowNum}: staff_no, name, phone_last4가 모두 필요합니다`);
                continue;
            }

            const staffNo    = String(row.staff_no).trim();
            const name       = String(row.name).trim();
            const phoneLast4 = String(row.phone_last4).trim();

            // phone_last4 정규식 검증 (전체 번호 금지)
            if (!PHONE_LAST4_RE.test(phoneLast4)) {
                errors.push(`행 ${rowNum} (${staffNo}): phone_last4가 숫자 4자리가 아닙니다 — "${phoneLast4}"`);
                continue;
            }

            // 중복 사번 체크
            if (existingSet.has(staffNo)) {
                duplicates.push({ staff_no: staffNo, name });
                continue;
            }

            // bulk 내 중복 방지 (같은 CSV 안에서 동일 사번 2회 등장)
            existingSet.add(staffNo);

            toInsert.push({
                complex_id:  complex.id,
                staff_no:    staffNo,
                name,
                phone_last4: phoneLast4,
                department:  row.department ? String(row.department).trim() || null : null,
                is_vip:      Boolean(row.is_vip),
                is_active:   true,
            });
        }

        // 일괄 INSERT
        let inserted = 0;
        if (toInsert.length > 0) {
            const { error: insErr } = await sb
                .from('hotel_staff')
                .insert(toInsert);

            if (insErr) {
                console.error('[hotel/staff-roster] POST /bulk (insert):', insErr.message);
                return res.status(500).json({ success: false, error: sbErr(insErr).message });
            }
            inserted = toInsert.length;
        }

        return res.json({
            success:    true,
            inserted,
            skipped:    duplicates.length,
            duplicates,
            errors,
        });

    } catch (e) {
        console.error('[hotel/staff-roster] POST /bulk:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── PUT /:id — 필드 수정 ─────────────────────────────────────────
/**
 * 임직원 레코드 수정
 *
 * Body (허용 필드만 — staff_no·phone_last4 변경 불가):
 *   { name?, department?, is_vip?, is_active? }
 *
 * Response 200: { success: true }
 * Response 400: 변경 금지 필드 포함 시 / 허용 필드 없을 때
 * Response 404: 해당 id 없음
 *
 * Feature Flag: hotelStaffAuth
 */
router.put('/:id', async (req, res) => {
    if (!flags.hotelStaffAuth) return flagOff(res, 'ENABLE_HOTEL_STAFF_AUTH');

    const { id } = req.params;
    const body   = req.body || {};

    // staff_no, phone_last4 변경 금지
    if ('staff_no' in body || 'phone_last4' in body) {
        return res.status(400).json({
            success: false,
            error:   'staff_no와 phone_last4는 등록 후 변경할 수 없습니다',
        });
    }

    // 허용 필드만 추출
    const patch = {};
    if ('name'        in body) patch.name        = String(body.name).trim();
    if ('department'  in body) patch.department  = body.department ? String(body.department).trim() || null : null;
    if ('is_vip'      in body) patch.is_vip      = Boolean(body.is_vip);
    if ('is_active'   in body) patch.is_active   = Boolean(body.is_active);

    if (Object.keys(patch).length === 0) {
        return res.status(400).json({
            success: false,
            error:   '수정할 필드가 없습니다 (name, department, is_vip, is_active 중 하나 이상 필요)',
        });
    }

    try {
        const sb = getSupabase();

        // 존재 확인 + complex_id 조회 (venue_type 검증용)
        const { data: existing, error: findErr } = await sb
            .from('hotel_staff')
            .select('id, complex_id')
            .eq('id', id)
            .single();

        if (findErr || !existing) {
            return res.status(404).json({ success: false, error: '임직원 레코드를 찾을 수 없습니다' });
        }

        // venue_type='hotel' 검증
        const complex = await resolveHotelComplexById(sb, existing.complex_id, res);
        if (!complex) return;

        // UPDATE
        const { error: updErr } = await sb
            .from('hotel_staff')
            .update(patch)
            .eq('id', id);

        if (updErr) {
            console.error('[hotel/staff-roster] PUT /:id:', updErr.message);
            return res.status(500).json({ success: false, error: sbErr(updErr).message });
        }

        return res.json({ success: true });

    } catch (e) {
        console.error('[hotel/staff-roster] PUT /:id:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── DELETE /:id — 1건 삭제 ───────────────────────────────────────
/**
 * 임직원 레코드 삭제
 *
 * Response 200: { success: true }
 * Response 404: 해당 id 없음
 *
 * Feature Flag: hotelStaffAuth
 */
router.delete('/:id', async (req, res) => {
    if (!flags.hotelStaffAuth) return flagOff(res, 'ENABLE_HOTEL_STAFF_AUTH');

    const { id } = req.params;

    try {
        const sb = getSupabase();

        // 존재 확인 + complex_id 조회
        const { data: existing, error: findErr } = await sb
            .from('hotel_staff')
            .select('id, complex_id')
            .eq('id', id)
            .single();

        if (findErr || !existing) {
            return res.status(404).json({ success: false, error: '임직원 레코드를 찾을 수 없습니다' });
        }

        // venue_type='hotel' 검증
        const complex = await resolveHotelComplexById(sb, existing.complex_id, res);
        if (!complex) return;

        // DELETE
        const { error: delErr } = await sb
            .from('hotel_staff')
            .delete()
            .eq('id', id);

        if (delErr) {
            console.error('[hotel/staff-roster] DELETE /:id:', delErr.message);
            return res.status(500).json({ success: false, error: sbErr(delErr).message });
        }

        return res.json({ success: true });

    } catch (e) {
        console.error('[hotel/staff-roster] DELETE /:id:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


module.exports = router;
