/**
 * server/routes/hotel/auth.js
 * 호텔 모드 인증 라우터
 *
 * 엔드포인트 (4개):
 *   POST /issue-member-token   — 회원 토큰 발급
 *   POST /verify-member-token  — 회원 토큰 검증
 *   POST /verify-staff         — 임직원 인증
 *   POST /verify-guest         — 투숙객 인증 (PMS 미연동 임시 토큰)
 *
 * 연결 위치: B-5에서 server/index.js에 일괄 연결 예정
 *   (현재 이 파일은 단독으로 require되지 않음 — 기존 단지 무영향)
 *
 * Feature Flag 의존:
 *   flags.hotelMemberPage  → /issue-member-token, /verify-member-token
 *   flags.hotelStaffAuth   → /verify-staff
 *   flags.hotelMode        → /verify-guest
 *
 * DB 패턴: 기존 routes와 동일하게 getSupabase() / sbErr() 사용
 * 단계: B-1 / 작성일: 2026-06-07
 */

'use strict';

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

const { getSupabase, sbErr } = require('../../db-supabase');
const flags                  = require('../../config/feature-flags');

// ── 상수 ────────────────────────────────────────────────────────
const TOKEN_BYTES        = 16;          // randomBytes → hex → 32자리
const MEMBER_TOKEN_DAYS  = 30;          // 회원 토큰 유효 기간
const GUEST_TOKEN_HOURS  = 24;          // 투숙객 임시 토큰 유효 기간
const STAFF_DISCOUNT_RATE = 30;         // 임직원 기본 할인율 (%)


// ── 유틸 ────────────────────────────────────────────────────────

/**
 * 암호학적으로 안전한 16진수 토큰 32자리 생성
 * @returns {string} 32자 hex 문자열
 */
function generateToken() {
    return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Feature Flag 비활성화 응답 공통 핸들러
 * @param {import('express').Response} res
 * @param {string} flagName
 */
function flagOff(res, flagName) {
    return res.status(403).json({
        success: false,
        error: `해당 기능이 현재 비활성화되어 있습니다 (${flagName})`,
    });
}


// ── POST /issue-member-token ────────────────────────────────────
/**
 * 회원 토큰 발급
 *
 * Request body:
 *   { application_id: string (UUID) }
 *
 * Response 200:
 *   { success: true, token, expires_at, url }
 *
 * Feature Flag: hotelMemberPage
 */
router.post('/issue-member-token', async (req, res) => {
    if (!flags.hotelMemberPage) return flagOff(res, 'ENABLE_HOTEL_MEMBER_PAGE');

    try {
        const { application_id } = req.body;

        if (!application_id) {
            return res.status(400).json({
                success: false,
                error: 'application_id가 필요합니다',
            });
        }

        const sb = getSupabase();

        // application 존재 및 단지 타입 확인
        const { data: app, error: appErr } = await sb
            .from('applications')
            .select('id, complex_id, complexes!inner(venue_type)')
            .eq('id', application_id)
            .single();

        if (appErr || !app) {
            return res.status(404).json({
                success: false,
                error: '신청 내역을 찾을 수 없습니다',
            });
        }

        if (app.complexes?.venue_type !== 'hotel') {
            return res.status(403).json({
                success: false,
                error: '호텔 단지의 신청에만 토큰을 발급할 수 있습니다',
            });
        }

        const token      = generateToken();
        const now        = new Date();
        const expires_at = new Date(now.getTime() + MEMBER_TOKEN_DAYS * 24 * 60 * 60 * 1000);

        const { error: insertErr } = await sb
            .from('member_tokens')
            .insert({
                token,
                application_id,
                complex_id:       app.complex_id,
                expires_at:       expires_at.toISOString(),
                last_accessed_at: null,
            });

        if (insertErr) throw sbErr(insertErr, 'POST /issue-member-token INSERT');

        const base = (process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || '').replace(/\/$/, '');
        const url  = base ? `${base}/m?t=${token}` : `/m?t=${token}`;

        return res.json({
            success:    true,
            token,
            expires_at: expires_at.toISOString(),
            url,
        });

    } catch (e) {
        console.error('[hotel/auth] issue-member-token:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST /verify-member-token ───────────────────────────────────
/**
 * 회원 토큰 검증
 *
 * Request body:
 *   { token: string }
 *
 * Response 200 (유효):
 *   { success: true, valid: true, application_id, complex_id }
 *
 * Response 401 (만료/미존재):
 *   { success: false, valid: false, error }
 *
 * Feature Flag: hotelMemberPage
 */
router.post('/verify-member-token', async (req, res) => {
    if (!flags.hotelMemberPage) return flagOff(res, 'ENABLE_HOTEL_MEMBER_PAGE');

    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                valid:   false,
                error:   'token이 필요합니다',
            });
        }

        const sb = getSupabase();

        const { data: row, error: fetchErr } = await sb
            .from('member_tokens')
            .select('token, application_id, complex_id, expires_at')
            .eq('token', token)
            .single();

        if (fetchErr || !row) {
            return res.status(401).json({
                success: false,
                valid:   false,
                error:   '유효하지 않은 토큰입니다',
            });
        }

        if (new Date(row.expires_at) < new Date()) {
            return res.status(401).json({
                success: false,
                valid:   false,
                error:   '만료된 토큰입니다',
            });
        }

        // last_accessed_at 업데이트 (검증 실패 시에도 메인 응답에 영향 없도록 fire-and-forget)
        sb.from('member_tokens')
            .update({ last_accessed_at: new Date().toISOString() })
            .eq('token', token)
            .then(({ error: updateErr }) => {
                if (updateErr) {
                    console.warn('[hotel/auth] last_accessed_at 업데이트 실패:', updateErr.message);
                }
            });

        return res.json({
            success:        true,
            valid:          true,
            application_id: row.application_id,
            complex_id:     row.complex_id,
        });

    } catch (e) {
        console.error('[hotel/auth] verify-member-token:', e.message);
        return res.status(500).json({ success: false, valid: false, error: e.message });
    }
});


// ── POST /verify-staff ──────────────────────────────────────────
/**
 * 임직원 인증
 *
 * Request body:
 *   { complex_code: string, staff_no: string, phone_last4: string }
 *
 * Response 200:
 *   { success: true, discount_rate: 30, is_vip: boolean, complex_id }
 *
 * Feature Flag: hotelStaffAuth
 */
router.post('/verify-staff', async (req, res) => {
    if (!flags.hotelStaffAuth) return flagOff(res, 'ENABLE_HOTEL_STAFF_AUTH');

    try {
        const { complex_code, staff_no, phone_last4 } = req.body;

        if (!complex_code || !staff_no || !phone_last4) {
            return res.status(400).json({
                success: false,
                error:   'complex_code, staff_no, phone_last4가 모두 필요합니다',
            });
        }

        if (!/^\d{4}$/.test(phone_last4)) {
            return res.status(400).json({
                success: false,
                error:   'phone_last4는 숫자 4자리여야 합니다',
            });
        }

        const sb = getSupabase();

        // 단지 조회 및 venue_type 확인
        const { data: complex, error: cxErr } = await sb
            .from('complexes')
            .select('id, venue_type')
            .eq('code', complex_code)
            .single();

        if (cxErr || !complex) {
            return res.status(404).json({
                success: false,
                error:   '단지를 찾을 수 없습니다',
            });
        }

        if (complex.venue_type !== 'hotel') {
            return res.status(403).json({
                success: false,
                error:   '호텔 단지에서만 임직원 인증이 가능합니다',
            });
        }

        // 임직원 조회 (staff_no + phone_last4 + is_active 복합 확인)
        const { data: staff, error: staffErr } = await sb
            .from('hotel_staff')
            .select('id, is_vip, is_active')
            .eq('complex_id', complex.id)
            .eq('staff_no', staff_no)
            .eq('phone_last4', phone_last4)
            .single();

        if (staffErr || !staff) {
            return res.status(401).json({
                success: false,
                error:   '임직원 정보가 일치하지 않습니다',
            });
        }

        if (!staff.is_active) {
            return res.status(403).json({
                success: false,
                error:   '비활성 상태의 임직원 계정입니다',
            });
        }

        return res.json({
            success:       true,
            discount_rate: STAFF_DISCOUNT_RATE,
            is_vip:        staff.is_vip,
            complex_id:    complex.id,
        });

    } catch (e) {
        console.error('[hotel/auth] verify-staff:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST /verify-guest ──────────────────────────────────────────
/**
 * 투숙객 인증 (PMS 미연동 임시 토큰 발급)
 *
 * Request body:
 *   { complex_code: string, room_number: string, checkin_date: string (YYYY-MM-DD) }
 *
 * Response 200:
 *   { success: true, temp_token: string, valid_until: string (ISO) }
 *
 * Feature Flag: hotelMode (마스터 스위치)
 *
 * 현 단계 동작:
 *   PMS 연동 없이 입력값만 받아 임시 토큰 발급.
 *   실제 PMS 연동은 이후 단계에서 pms_integration 컬럼 값에 따라 분기.
 */
router.post('/verify-guest', async (req, res) => {
    if (!flags.hotelMode) return flagOff(res, 'ENABLE_HOTEL_MODE');

    try {
        const { complex_code, room_number, checkin_date } = req.body;

        if (!complex_code || !room_number || !checkin_date) {
            return res.status(400).json({
                success: false,
                error:   'complex_code, room_number, checkin_date가 모두 필요합니다',
            });
        }

        // checkin_date 형식 검증 (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin_date)) {
            return res.status(400).json({
                success: false,
                error:   'checkin_date 형식은 YYYY-MM-DD 이어야 합니다',
            });
        }

        const sb = getSupabase();

        // 단지 조회 및 venue_type 확인
        const { data: complex, error: cxErr } = await sb
            .from('complexes')
            .select('id, venue_type')
            .eq('code', complex_code)
            .single();

        if (cxErr || !complex) {
            return res.status(404).json({
                success: false,
                error:   '단지를 찾을 수 없습니다',
            });
        }

        if (complex.venue_type !== 'hotel') {
            return res.status(403).json({
                success: false,
                error:   '호텔 단지에서만 투숙객 인증이 가능합니다',
            });
        }

        // 임시 토큰 생성 및 유효 기간 산출
        const temp_token  = generateToken();
        const valid_until = new Date(Date.now() + GUEST_TOKEN_HOURS * 60 * 60 * 1000);

        // 현 단계: PMS 연동 없이 토큰만 반환
        // TODO (이후 단계): complex.pms_integration 값에 따라 PMS API 호출 분기
        return res.json({
            success:     true,
            temp_token,
            valid_until: valid_until.toISOString(),
        });

    } catch (e) {
        console.error('[hotel/auth] verify-guest:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


module.exports = router;
