/**
 * server/routes/hotel/members.js
 * 호텔 회원 마이페이지 라우터
 *
 * 엔드포인트 (5개):
 *   GET  /me                  — 회원 전체 현황 (멤버십·PT 잔여·혜택) 조회
 *   GET  /workout-reports     — 본인 운동 리포트 목록 조회
 *   POST /issue-room-discount — 라마다 객실 10% 할인 코드 발급
 *   GET  /next-reservations   — 다가오는 예약 전체 조회
 *   POST /refresh-token       — 만료 7일 이내 토큰 갱신
 *
 * 설계 원칙:
 *   - 토큰 한 번이면 모든 개인 정보 접근 — 추가 인증 강제 금지
 *   - 응답에 다른 회원 정보 절대 미포함 — 본인 데이터만 반환
 *   - 기존 아파트 단지 무영향 — Feature Flag 미활성화 시 진입 불가
 *
 * 연결 위치: B-5에서 server/index.js에 일괄 연결 예정
 *   (현재 이 파일은 단독으로 require되지 않음 — 기존 단지 무영향)
 *
 * Feature Flag: flags.hotelMemberPage (ENABLE_HOTEL_MEMBER_PAGE)
 * DB 패턴: 기존 routes와 동일하게 getSupabase() / sbErr() 사용
 * 단계: B-4 / 작성일: 2026-06-07
 */

'use strict';

const crypto  = require('crypto');
const express = require('express');
const router  = express.Router();

const { getSupabase, sbErr } = require('../../db-supabase');
const flags                  = require('../../config/feature-flags');

// ── 상수 ────────────────────────────────────────────────────────
/** 토큰 갱신 가능 기간 (ms) — 만료 7일 이내 */
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** 새 토큰 유효 기간 (일) */
const NEW_TOKEN_DAYS = 30;

/** 할인 코드 접두사 */
const DISCOUNT_CODE_PREFIX = 'ACRGYM-';

/** 할인 코드 유효 기간 (일) */
const DISCOUNT_CODE_DAYS = 30;

/** 할인 코드 타입 */
const DISCOUNT_TYPE_ROOM = 'ramada_room_10';

/** 리프레시 PT program_name 고정값 */
const PT_PROGRAM_NAME = '리프레시 PT';


// ── 공통 헬퍼 ───────────────────────────────────────────────────

/**
 * Feature Flag 비활성화 응답
 * @param {import('express').Response} res
 */
function flagOff(res) {
    return res.status(403).json({
        success: false,
        error:   '해당 기능이 현재 비활성화되어 있습니다 (ENABLE_HOTEL_MEMBER_PAGE)',
    });
}

/**
 * 회원 토큰 검증 공통 헬퍼
 *
 * member_tokens 테이블에서 token을 조회하고 만료 여부를 확인한다.
 * 실패 시 res에 직접 응답 후 null 반환 — 호출부에서 `if (!row) return;` 처리.
 *
 * @param {object} sb    Supabase 클라이언트
 * @param {string} token 검증할 토큰 문자열
 * @param {import('express').Response} res
 * @returns {Promise<{
 *   token: string,
 *   application_id: string,
 *   complex_id: string,
 *   expires_at: string,
 *   discount_rate: number
 * }|null>}
 */
async function verifyToken(sb, token, res) {
    if (!token) {
        res.status(400).json({ success: false, error: 'token이 필요합니다' });
        return null;
    }

    const { data: row, error } = await sb
        .from('member_tokens')
        .select('token, application_id, complex_id, expires_at, discount_rate')
        .eq('token', token)
        .single();

    if (error || !row) {
        res.status(401).json({ success: false, error: '유효하지 않은 토큰입니다' });
        return null;
    }
    if (new Date(row.expires_at) < new Date()) {
        res.status(401).json({ success: false, error: '만료된 토큰입니다. 재로그인이 필요합니다.' });
        return null;
    }

    return row;
}

/**
 * last_accessed_at을 현재 시각으로 업데이트 (fire-and-forget)
 * 메인 응답에 영향을 주지 않도록 await하지 않는다.
 *
 * @param {object} sb
 * @param {string} token
 */
function touchLastAccessed(sb, token) {
    sb.from('member_tokens')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('token', token)
        .then(({ error }) => {
            if (error) console.warn('[hotel/members] last_accessed_at 업데이트 실패:', error.message);
        });
}

/**
 * D-day 계산 (양수: 미래, 0: 오늘, 음수: 이미 만료)
 * @param {string|null} dateStr  ISO 날짜 문자열
 * @returns {number|null}
 */
function calcDday(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    if (isNaN(target.getTime())) return null;
    const today  = new Date();
    // 시각 정보 제거 후 날짜 단위 비교
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * 현재 KST 기준 날짜를 YYYY-MM-DD 형식으로 반환
 * @returns {string}
 */
function todayKST() {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const y   = kst.getUTCFullYear();
    const m   = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const d   = String(kst.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * 6자리 대문자 영숫자 랜덤 문자열 생성 (할인 코드용)
 * @returns {string}
 */
function generateDiscountSuffix() {
    return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}


// ── GET /me ─────────────────────────────────────────────────────
/**
 * 회원 전체 현황 조회
 *
 * Query params:
 *   token  string  필수
 *
 * Response 200:
 *   {
 *     success: true,
 *     member: {
 *       name,
 *       membership: { type, expires_at, d_day },
 *       pt_status:  { total, remaining, next_session },
 *       benefits:   { ramada_room_code_available, fnb_lounge_eligible }
 *     }
 *   }
 *
 * ⚠️  응답에 다른 회원 정보 절대 미포함
 * Feature Flag: hotelMemberPage
 */
router.get('/me', async (req, res) => {
    if (!flags.hotelMemberPage) return flagOff(res);

    try {
        const sb  = getSupabase();
        const row = await verifyToken(sb, req.query.token, res);
        if (!row) return;

        // ── 기본 신청 정보 조회 ────────────────────────────────
        const { data: app, error: appErr } = await sb
            .from('applications')
            .select('id, name, phone, program_name, total_sessions, remaining_sessions, expiry_date, status')
            .eq('id', row.application_id)
            .single();

        if (appErr || !app) {
            return res.status(404).json({ success: false, error: '회원 정보를 찾을 수 없습니다' });
        }

        // ── 다음 PT 예약 조회 ──────────────────────────────────
        // 본인 phone + 리프레시 PT + approved + 오늘 이후
        const today = todayKST();
        const { data: nextPtRows } = await sb
            .from('applications')
            .select('id, preferred_date, preferred_time, instructor_id')
            .eq('phone', app.phone)
            .eq('program_name', PT_PROGRAM_NAME)
            .eq('status', 'approved')
            .gte('preferred_date', today)
            .order('preferred_date', { ascending: true })
            .order('preferred_time', { ascending: true })
            .limit(1);

        let nextSession = null;
        if (nextPtRows && nextPtRows.length > 0) {
            const np = nextPtRows[0];
            nextSession = {
                scheduled_at: np.preferred_date && np.preferred_time
                    ? `${np.preferred_date}T${np.preferred_time}:00+09:00`
                    : null,
            };
        }

        // ── D-day 계산 ─────────────────────────────────────────
        const dDay = calcDday(app.expiry_date);

        // ── 혜택 판단 ──────────────────────────────────────────
        // ramada_room_code_available: 유효한 미사용 할인 코드가 없으면 발급 가능
        const { count: unusedCodeCount } = await sb
            .from('discount_codes')
            .select('*', { count: 'exact', head: true })
            .eq('application_id', row.application_id)
            .eq('discount_type', DISCOUNT_TYPE_ROOM)
            .eq('is_used', false)
            .gte('expires_at', new Date().toISOString());

        const ramadaCodeAvailable = (unusedCodeCount || 0) === 0;

        // fnb_lounge_eligible: remaining_sessions >= 5 이거나 멤버십 유효 상태
        const remaining = app.remaining_sessions != null ? parseInt(app.remaining_sessions) : null;
        const fnbEligible = (remaining != null && remaining >= 5) ||
                            (app.status === 'approved' && dDay != null && dDay >= 0);

        // ── last_accessed_at 업데이트 (fire-and-forget) ───────
        touchLastAccessed(sb, row.token);

        return res.json({
            success: true,
            member: {
                name:       app.name,
                membership: {
                    type:       app.program_name || null,
                    expires_at: app.expiry_date  || null,
                    d_day:      dDay,
                },
                pt_status: {
                    total:        app.total_sessions     != null ? parseInt(app.total_sessions)     : null,
                    remaining:    app.remaining_sessions != null ? parseInt(app.remaining_sessions) : null,
                    next_session: nextSession,
                },
                benefits: {
                    ramada_room_code_available: ramadaCodeAvailable,
                    fnb_lounge_eligible:        fnbEligible,
                },
            },
        });

    } catch (e) {
        console.error('[hotel/members] GET /me:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── GET /workout-reports ────────────────────────────────────────
/**
 * 본인 운동 리포트 목록 조회
 *
 * Query params:
 *   token  string  필수
 *
 * Response 200:
 *   { success: true, reports: [{ id, phase, created_at, pdf_url }] }
 *
 * ⚠️  본인 application_id에 연결된 리포트만 반환
 * Feature Flag: hotelMemberPage
 */
router.get('/workout-reports', async (req, res) => {
    if (!flags.hotelMemberPage) return flagOff(res);

    try {
        const sb  = getSupabase();
        const row = await verifyToken(sb, req.query.token, res);
        if (!row) return;

        const { data, error } = await sb
            .from('workout_reports')
            .select('id, phase, created_at, pdf_url')
            .eq('application_id', row.application_id)
            .order('phase', { ascending: true });

        if (error) throw sbErr(error, 'GET /hotel/members/workout-reports');

        touchLastAccessed(sb, row.token);

        return res.json({
            success: true,
            reports: data || [],
        });

    } catch (e) {
        console.error('[hotel/members] GET /workout-reports:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST /issue-room-discount ────────────────────────────────────
/**
 * 라마다 객실 10% 할인 코드 발급
 *
 * Request body:
 *   { token: string }
 *
 * 정책:
 *   - 유효한 미사용 코드가 이미 있으면 기존 코드를 반환 (재발급 없음)
 *   - 없는 경우에만 신규 코드 생성 (ACRGYM- + 6자리 대문자 영숫자)
 *   - 코드 유효 기간: 발급일 기준 30일
 *
 * Response 200:
 *   { success: true, code, expires_at }
 *
 * Feature Flag: hotelMemberPage
 */
router.post('/issue-room-discount', async (req, res) => {
    if (!flags.hotelMemberPage) return flagOff(res);

    try {
        const sb  = getSupabase();
        const row = await verifyToken(sb, req.body.token, res);
        if (!row) return;

        // ── 유효한 미사용 코드 존재 여부 확인 ─────────────────
        const { data: existing } = await sb
            .from('discount_codes')
            .select('code, expires_at')
            .eq('application_id', row.application_id)
            .eq('discount_type', DISCOUNT_TYPE_ROOM)
            .eq('is_used', false)
            .gte('expires_at', new Date().toISOString())
            .order('expires_at', { ascending: false })
            .limit(1);

        if (existing && existing.length > 0) {
            // 기존 유효 코드 반환 — 재발급 없음
            touchLastAccessed(sb, row.token);
            return res.json({
                success:    true,
                code:       existing[0].code,
                expires_at: existing[0].expires_at,
            });
        }

        // ── 신규 코드 생성 ─────────────────────────────────────
        const code       = DISCOUNT_CODE_PREFIX + generateDiscountSuffix();
        const expiresAt  = new Date(Date.now() + DISCOUNT_CODE_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const { error: insertErr } = await sb
            .from('discount_codes')
            .insert({
                code,
                application_id: row.application_id,
                complex_id:     row.complex_id,
                discount_type:  DISCOUNT_TYPE_ROOM,
                expires_at:     expiresAt,
                is_used:        false,
            });

        if (insertErr) throw sbErr(insertErr, 'POST /hotel/members/issue-room-discount INSERT');

        touchLastAccessed(sb, row.token);

        return res.json({
            success:    true,
            code,
            expires_at: expiresAt,
        });

    } catch (e) {
        console.error('[hotel/members] POST /issue-room-discount:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── GET /next-reservations ───────────────────────────────────────
/**
 * 다가오는 예약 전체 조회 (리프레시 PT + 무료 클래스)
 *
 * Query params:
 *   token  string  필수
 *
 * Response 200:
 *   {
 *     success: true,
 *     reservations: [{
 *       application_id,
 *       program_name,
 *       scheduled_at,       // ISO 8601 (KST)
 *       instructor_name     // null이면 트레이너 없는 클래스
 *     }]
 *   }
 *
 * ⚠️  본인 phone에 연결된 예약만 반환. 타인 예약 정보 절대 미포함.
 * Feature Flag: hotelMemberPage
 */
router.get('/next-reservations', async (req, res) => {
    if (!flags.hotelMemberPage) return flagOff(res);

    try {
        const sb  = getSupabase();
        const row = await verifyToken(sb, req.query.token, res);
        if (!row) return;

        // 본인 phone 조회 (application_id → phone)
        const { data: app, error: appErr } = await sb
            .from('applications')
            .select('phone')
            .eq('id', row.application_id)
            .single();

        if (appErr || !app) {
            return res.status(404).json({ success: false, error: '회원 정보를 찾을 수 없습니다' });
        }

        // 오늘 이후 본인 예약 전체 조회
        const today = todayKST();
        const { data: reservations, error: resErr } = await sb
            .from('applications')
            .select('id, program_name, preferred_date, preferred_time, instructor_id')
            .eq('phone', app.phone)
            .eq('complex_id', row.complex_id)
            .eq('status', 'approved')
            .gte('preferred_date', today)
            .order('preferred_date', { ascending: true })
            .order('preferred_time', { ascending: true });

        if (resErr) throw sbErr(resErr, 'GET /hotel/members/next-reservations');

        // instructor_id가 있는 예약은 트레이너 이름 일괄 조회
        const instructorIds = [
            ...new Set(
                (reservations || [])
                    .map(r => r.instructor_id)
                    .filter(Boolean)
            ),
        ];

        let instructorMap = {};
        if (instructorIds.length > 0) {
            const { data: instructors } = await sb
                .from('instructors')
                .select('id, name')
                .in('id', instructorIds);

            (instructors || []).forEach(i => { instructorMap[i.id] = i.name; });
        }

        const result = (reservations || []).map(r => ({
            application_id:  r.id,
            program_name:    r.program_name,
            scheduled_at:    r.preferred_date && r.preferred_time
                ? `${r.preferred_date}T${r.preferred_time}:00+09:00`
                : null,
            instructor_name: r.instructor_id ? (instructorMap[r.instructor_id] || null) : null,
        }));

        touchLastAccessed(sb, row.token);

        return res.json({
            success:      true,
            reservations: result,
        });

    } catch (e) {
        console.error('[hotel/members] GET /next-reservations:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST /refresh-token ─────────────────────────────────────────
/**
 * 토큰 갱신
 *
 * Request body:
 *   { token: string }
 *
 * 정책:
 *   - 만료 7일 이내인 경우에만 갱신 가능
 *   - 7일 초과 남은 경우 갱신 불필요 → 400 반환 (기존 토큰 계속 사용)
 *   - 이미 만료된 토큰 → 401 (재로그인 필요)
 *   - 갱신 성공 시: 기존 토큰 즉시 무효화(expires_at=now), 새 토큰 30일 발급
 *
 * Response 200:
 *   { success: true, new_token, expires_at }
 *
 * Feature Flag: hotelMemberPage
 */
router.post('/refresh-token', async (req, res) => {
    if (!flags.hotelMemberPage) return flagOff(res);

    try {
        const sb  = getSupabase();
        const row = await verifyToken(sb, req.body.token, res);
        if (!row) return;

        // ── 7일 이내 여부 확인 ─────────────────────────────────
        const expiresMs   = new Date(row.expires_at).getTime();
        const nowMs       = Date.now();
        const remainingMs = expiresMs - nowMs;

        if (remainingMs > REFRESH_WINDOW_MS) {
            // 아직 7일 이상 남음 — 갱신 불필요
            return res.status(400).json({
                success:    false,
                error:      '토큰 갱신은 만료 7일 이내에만 가능합니다. 기존 토큰을 계속 사용하세요.',
                expires_at: row.expires_at,
            });
        }

        // ── 새 토큰 생성 ───────────────────────────────────────
        const newToken   = require('crypto').randomBytes(16).toString('hex');
        const newExpires = new Date(nowMs + NEW_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();

        // 신규 토큰 INSERT
        const { error: insertErr } = await sb
            .from('member_tokens')
            .insert({
                token:            newToken,
                application_id:   row.application_id,
                complex_id:       row.complex_id,
                expires_at:       newExpires,
                discount_rate:    row.discount_rate || 0,
                last_accessed_at: null,
            });

        if (insertErr) throw sbErr(insertErr, 'POST /hotel/members/refresh-token INSERT');

        // 기존 토큰 즉시 무효화 (expires_at=now, fire-and-forget)
        sb.from('member_tokens')
            .update({ expires_at: new Date().toISOString() })
            .eq('token', req.body.token)
            .then(({ error }) => {
                if (error) console.warn('[hotel/members] 기존 토큰 무효화 실패:', error.message);
            });

        return res.json({
            success:    true,
            new_token:  newToken,
            expires_at: newExpires,
        });

    } catch (e) {
        console.error('[hotel/members] POST /refresh-token:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


module.exports = router;
