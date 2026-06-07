/**
 * server/routes/hotel/quick-class.js
 * 호텔 무료 클래스 원터치 신청 라우터
 *
 * 엔드포인트 (3개):
 *   GET  /availability  — 프로그램 정원 및 가용 여부 조회
 *   POST /apply         — 원터치 신청
 *   POST /cancel        — 본인 확인 후 취소
 *
 * 설계 원칙:
 *   - 고객 경험 최우선: 동/호 입력 없이 최소 정보로 신청
 *   - 대기열 없음: 정원 마감 시 즉시 안내, 다음 회차 선택 유도
 *   - 혼잡도·실시간 인원 노출 없음: 가용 여부(yes/no)와 잔여석 수만 반환
 *   - 노쇼 페널티 없음: 강제 인증 흐름 금지
 *
 * 연결 위치: B-5에서 server/index.js에 일괄 연결 예정
 *   (현재 이 파일은 단독으로 require되지 않음 — 기존 단지 무영향)
 *
 * Feature Flag: flags.hotelQuickClass (ENABLE_HOTEL_QUICK_CLASS)
 * DB 패턴: 기존 routes와 동일하게 getSupabase() / sbErr() 사용
 * 단계: B-2 / 작성일: 2026-06-07
 */

'use strict';

const express = require('express');
const router  = express.Router();

const { getSupabase, sbErr } = require('../../db-supabase');
const flags                  = require('../../config/feature-flags');

// ── 상수 ────────────────────────────────────────────────────────
/** 호텔 신청 시 dong/ho 대체값 (기존 NOT NULL 제약 준수) */
const HOTEL_DONG = '';
const HOTEL_HO   = '';

// ── 유틸 ────────────────────────────────────────────────────────

/**
 * Feature Flag 비활성화 응답 공통 핸들러
 * @param {import('express').Response} res
 */
function flagOff(res) {
    return res.status(403).json({
        success: false,
        error:   '해당 기능이 현재 비활성화되어 있습니다 (ENABLE_HOTEL_QUICK_CLASS)',
    });
}

/**
 * 단지 조회 + venue_type='hotel' 검증
 * 실패 시 res에 응답을 보내고 null 반환.
 *
 * @param {object} sb       Supabase 클라이언트
 * @param {string} code     complexes.code
 * @param {import('express').Response} res
 * @returns {Promise<object|null>} complex row 또는 null
 */
async function resolveHotelComplex(sb, code, res) {
    const { data: complex, error: cxErr } = await sb
        .from('complexes')
        .select('id, venue_type, name')
        .eq('code', code)
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
 * 프로그램 조회 + 가격=0(무료) 검증
 * 실패 시 res에 응답을 보내고 null 반환.
 *
 * @param {object} sb           Supabase 클라이언트
 * @param {string} programId    programs.id (UUID)
 * @param {string} complexId    programs.complex_id
 * @param {import('express').Response} res
 * @returns {Promise<object|null>} program row 또는 null
 */
async function resolveFreeProgram(sb, programId, complexId, res) {
    const { data: program, error: progErr } = await sb
        .from('programs')
        .select('id, name, capacity, price, is_active')
        .eq('id', programId)
        .eq('complex_id', complexId)
        .single();

    if (progErr || !program) {
        res.status(404).json({ success: false, error: '프로그램을 찾을 수 없습니다' });
        return null;
    }
    if (!program.is_active) {
        res.status(400).json({ success: false, error: '현재 운영 중이지 않은 프로그램입니다' });
        return null;
    }
    if (program.price !== 0) {
        res.status(400).json({ success: false, error: '무료 클래스만 원터치 신청 가능합니다' });
        return null;
    }
    return program;
}

/**
 * 해당 프로그램의 현재 approved 신청 수 조회
 *
 * @param {object} sb
 * @param {string} programId
 * @param {string} complexId
 * @returns {Promise<number>}
 */
async function getApprovedCount(sb, programId, complexId) {
    const { count, error } = await sb
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .eq('program_id', programId)
        .eq('complex_id', complexId)
        .eq('status', 'approved');

    if (error) throw sbErr(error, 'getApprovedCount');
    return count || 0;
}


// ── GET /availability ───────────────────────────────────────────
/**
 * 프로그램 가용 여부 조회
 *
 * Query params:
 *   complex_code, program_id
 *
 * Response 200:
 *   { success: true, capacity, current_count, available, is_full }
 *
 * ⚠️  응답 설계 원칙:
 *   - 잔여석(available) 숫자와 만석 여부(is_full)만 반환
 *   - 현재 신청자 명단, 혼잡도, 실시간 인원 정보는 포함하지 않음
 *   - 이용 고객이 타인의 예약 정보를 알 필요가 없음
 *
 * Feature Flag: hotelQuickClass
 */
router.get('/availability', async (req, res) => {
    if (!flags.hotelQuickClass) return flagOff(res);

    try {
        const { complex_code, program_id } = req.query;

        if (!complex_code || !program_id) {
            return res.status(400).json({
                success: false,
                error:   'complex_code, program_id가 필요합니다',
            });
        }

        const sb      = getSupabase();
        const complex = await resolveHotelComplex(sb, complex_code, res);
        if (!complex) return;

        const program = await resolveFreeProgram(sb, program_id, complex.id, res);
        if (!program) return;

        const currentCount = await getApprovedCount(sb, program.id, complex.id);
        const capacity     = program.capacity || 1;
        const available    = Math.max(0, capacity - currentCount);

        return res.json({
            success:       true,
            capacity,
            current_count: currentCount,
            available,
            is_full:       currentCount >= capacity,
        });

    } catch (e) {
        console.error('[hotel/quick-class] availability:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST /apply ─────────────────────────────────────────────────
/**
 * 원터치 신청
 *
 * Request body:
 *   {
 *     complex_code:  string,
 *     program_id:    string (UUID),
 *     name:          string,
 *     phone:         string,
 *     phone_last4:   string (4자리 숫자),
 *     member_token?: string  (기존 회원: 선택)
 *   }
 *
 * Response 200:
 *   { success: true, application_id, scheduled_info }
 *
 * Feature Flag: hotelQuickClass
 */
router.post('/apply', async (req, res) => {
    if (!flags.hotelQuickClass) return flagOff(res);

    try {
        const {
            complex_code,
            program_id,
            name,
            phone,
            phone_last4,
            member_token,
        } = req.body;

        // ── 입력값 검증 ────────────────────────────────────────
        if (!complex_code || !program_id || !name || !phone || !phone_last4) {
            return res.status(400).json({
                success: false,
                error:   'complex_code, program_id, name, phone, phone_last4가 모두 필요합니다',
            });
        }
        if (!/^\d{4}$/.test(phone_last4)) {
            return res.status(400).json({
                success: false,
                error:   'phone_last4는 숫자 4자리여야 합니다',
            });
        }
        // 전달된 phone 뒷 4자리가 phone_last4와 일치하는지 확인
        const cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone.endsWith(phone_last4)) {
            return res.status(400).json({
                success: false,
                error:   '전화번호와 뒷 4자리가 일치하지 않습니다',
            });
        }

        const sb = getSupabase();

        // ── 단지 / 프로그램 검증 ───────────────────────────────
        const complex = await resolveHotelComplex(sb, complex_code, res);
        if (!complex) return;

        const program = await resolveFreeProgram(sb, program_id, complex.id, res);
        if (!program) return;

        // ── 정원 확인 ──────────────────────────────────────────
        const currentCount = await getApprovedCount(sb, program.id, complex.id);
        const capacity     = program.capacity || 1;

        if (currentCount >= capacity) {
            // 대기열 없음: 정원 마감 시 즉시 안내 (다음 회차 선택 유도)
            return res.status(409).json({
                success:  false,
                is_full:  true,
                error:    '정원이 마감되었습니다. 다른 시간대를 선택해 주세요.',
            });
        }

        // ── member_token 처리 (선택) ───────────────────────────
        // 기존 회원 토큰이 있으면 application_id를 재사용 (중복 신청 방지)
        let existingApplicationId = null;
        if (member_token) {
            const { data: tokenRow } = await sb
                .from('member_tokens')
                .select('application_id, expires_at')
                .eq('token', member_token)
                .single();

            if (tokenRow && new Date(tokenRow.expires_at) >= new Date()) {
                existingApplicationId = tokenRow.application_id;
            }
            // 토큰이 유효하지 않거나 만료된 경우: 무시하고 신규 신청으로 진행
        }

        // ── 신청 생성 ──────────────────────────────────────────
        let applicationId;

        if (existingApplicationId) {
            // 기존 회원: 이미 이 프로그램에 approved 신청이 있으면 중복 차단
            const { count: dupCount } = await sb
                .from('applications')
                .select('*', { count: 'exact', head: true })
                .eq('id', existingApplicationId)
                .eq('program_id', program.id)
                .eq('status', 'approved');

            if (dupCount > 0) {
                return res.status(409).json({
                    success: false,
                    error:   '이미 신청된 클래스입니다',
                });
            }
            applicationId = existingApplicationId;
        } else {
            // 신규 신청 (투숙객 또는 토큰 없는 회원)
            const insertData = {
                complex_id:    complex.id,
                program_id:    program.id,
                program_name:  program.name,
                name:          name.trim(),
                phone,
                dong:          HOTEL_DONG,   // NOT NULL 제약 준수 — 호텔은 동/호 없음
                ho:            HOTEL_HO,
                user_type:     member_token ? 'member' : 'guest',
                status:        'approved',
                waiting_order: null,
            };

            const { data: inserted, error: insertErr } = await sb
                .from('applications')
                .insert(insertData)
                .select('id')
                .single();

            if (insertErr) throw sbErr(insertErr, 'POST /quick-class/apply INSERT');
            applicationId = inserted.id;
        }

        return res.json({
            success:        true,
            application_id: applicationId,
            scheduled_info: {
                program_name: program.name,
                complex_name: complex.name,
            },
        });

    } catch (e) {
        console.error('[hotel/quick-class] apply:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST /cancel ────────────────────────────────────────────────
/**
 * 신청 취소 (본인 확인 후)
 *
 * Request body:
 *   { application_id: string (UUID), phone_last4: string (4자리) }
 *
 * Response 200:
 *   { success: true }
 *
 * Feature Flag: hotelQuickClass
 */
router.post('/cancel', async (req, res) => {
    if (!flags.hotelQuickClass) return flagOff(res);

    try {
        const { application_id, phone_last4 } = req.body;

        if (!application_id || !phone_last4) {
            return res.status(400).json({
                success: false,
                error:   'application_id, phone_last4가 필요합니다',
            });
        }
        if (!/^\d{4}$/.test(phone_last4)) {
            return res.status(400).json({
                success: false,
                error:   'phone_last4는 숫자 4자리여야 합니다',
            });
        }

        const sb = getSupabase();

        // 신청 조회
        const { data: app, error: fetchErr } = await sb
            .from('applications')
            .select('id, phone, status, complex_id, complexes!inner(venue_type)')
            .eq('id', application_id)
            .single();

        if (fetchErr || !app) {
            return res.status(404).json({
                success: false,
                error:   '신청 내역을 찾을 수 없습니다',
            });
        }

        // 호텔 단지 신청만 이 라우트로 취소 가능
        if (app.complexes?.venue_type !== 'hotel') {
            return res.status(403).json({
                success: false,
                error:   '호텔 단지의 신청만 취소할 수 있습니다',
            });
        }

        // 전화번호 뒷 4자리 본인 확인 (노쇼 페널티 없음 — 단순 확인용)
        const storedPhone = (app.phone || '').replace(/\D/g, '');
        if (!storedPhone.endsWith(phone_last4)) {
            return res.status(403).json({
                success: false,
                error:   '전화번호가 일치하지 않습니다',
            });
        }

        // 이미 취소된 경우
        if (app.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                error:   '이미 취소된 신청입니다',
            });
        }

        // 취소 처리
        const { error: updateErr } = await sb
            .from('applications')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', application_id);

        if (updateErr) throw sbErr(updateErr, 'POST /quick-class/cancel UPDATE');

        return res.json({ success: true });

    } catch (e) {
        console.error('[hotel/quick-class] cancel:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


module.exports = router;
