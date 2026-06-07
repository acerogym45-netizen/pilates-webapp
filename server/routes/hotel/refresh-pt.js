/**
 * server/routes/hotel/refresh-pt.js
 * 호텔 리프레시 PT 예약 라우터
 *
 * 엔드포인트 (5개):
 *   GET  /instructors      — 호텔 소속 트레이너 목록 조회
 *   GET  /available-slots  — 특정 날짜·트레이너의 예약 가능 시간대 조회
 *   POST /reserve          — PT 예약 생성
 *   POST /reschedule       — 예약 시간 변경 (24시간 이내 변경 거부)
 *   POST /cancel           — 예약 취소 (24시간 이내 취소도 패널티 없음)
 *
 * 설계 원칙:
 *   - 최소 정보 입력 — 동/호 없음, 이름·전화번호·원하는 시간만 필요
 *   - 대기열 없음 — 슬롯 중복 시 즉시 다른 시간 안내
 *   - 혼잡도·타인 예약 정보 노출 없음 — 가능 슬롯 목록만 반환
 *   - 노쇼/취소 패널티 없음 — 24시간 이내 변경은 사유 기록만
 *   - 기존 아파트 단지 무영향 — Feature Flag 미활성화 시 진입 불가
 *
 * 연결 위치: B-5에서 server/index.js에 일괄 연결 예정
 *   (현재 이 파일은 단독으로 require되지 않음 — 기존 단지 무영향)
 *
 * Feature Flag: flags.hotelRefreshPt (ENABLE_HOTEL_REFRESH_PT)
 * DB 패턴: 기존 routes와 동일하게 getSupabase() / sbErr() 사용
 * 단계: B-3 / 작성일: 2026-06-07
 */

'use strict';

const express = require('express');
const router  = express.Router();

const { getSupabase, sbErr } = require('../../db-supabase');
const flags                  = require('../../config/feature-flags');

// ── 상수 ────────────────────────────────────────────────────────
/** 리프레시 PT 기본 요금 (원, 45분 기준) */
const BASE_PRICE = 40000;

/** 할인 정책: VIP·임직원 할인율 (%) */
const VIP_DISCOUNT_RATE = 30;

/** applications.program_name 고정값 */
const PT_PROGRAM_NAME = '리프레시 PT';

/** dong/ho NOT NULL 제약 준수용 빈 문자열 */
const HOTEL_DONG = '';
const HOTEL_HO   = '';

/** 슬롯 간격 (분) */
const SLOT_INTERVAL_MIN = 45;

/** 운영 시작·종료 시각 (시) */
const SLOT_START_HOUR = 9;   // 09:00
const SLOT_END_HOUR   = 21;  // 마지막 슬롯 시작 20:15 (21:00 전)

/** 당일 취소·변경 제한 시간 (ms) — 24시간 */
const RESCHEDULE_LIMIT_MS = 24 * 60 * 60 * 1000;


// ── 유틸 ────────────────────────────────────────────────────────

/**
 * Feature Flag 비활성화 응답
 * @param {import('express').Response} res
 */
function flagOff(res) {
    return res.status(403).json({
        success: false,
        error:   '해당 기능이 현재 비활성화되어 있습니다 (ENABLE_HOTEL_REFRESH_PT)',
    });
}

/**
 * 단지 조회 + venue_type='hotel' 검증
 * 실패 시 res에 직접 응답 후 null 반환.
 *
 * @param {object} sb
 * @param {string} code  complexes.code
 * @param {import('express').Response} res
 * @returns {Promise<object|null>}
 */
async function resolveHotelComplex(sb, code, res) {
    const { data: complex, error } = await sb
        .from('complexes')
        .select('id, name, venue_type')
        .eq('code', code)
        .single();

    if (error || !complex) {
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
 * 트레이너 조회 + 해당 단지 소속 검증
 * 실패 시 res에 직접 응답 후 null 반환.
 *
 * @param {object} sb
 * @param {string} instructorId
 * @param {string} complexId
 * @param {import('express').Response} res
 * @returns {Promise<object|null>}
 */
async function resolveInstructor(sb, instructorId, complexId, res) {
    const { data: instructor, error } = await sb
        .from('instructors')
        .select('id, name, is_active, complex_id')
        .eq('id', instructorId)
        .eq('complex_id', complexId)
        .single();

    if (error || !instructor) {
        res.status(404).json({ success: false, error: '트레이너를 찾을 수 없습니다' });
        return null;
    }
    if (!instructor.is_active) {
        res.status(400).json({ success: false, error: '현재 운영 중이지 않은 트레이너입니다' });
        return null;
    }
    return instructor;
}

/**
 * 운영 시간 내 전체 슬롯 목록 생성 (HH:MM 형식)
 * 09:00 ~ 20:15, 45분 간격
 *
 * @returns {string[]} e.g. ["09:00","09:45","10:30",...]
 */
function buildAllSlots() {
    const slots = [];
    let minuteOfDay = SLOT_START_HOUR * 60;
    const endMinute = SLOT_END_HOUR * 60;   // 21:00 = 1260분 → 마지막 슬롯 시작은 그 이전

    while (minuteOfDay < endMinute) {
        const h = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
        const m = String(minuteOfDay % 60).padStart(2, '0');
        slots.push(`${h}:${m}`);
        minuteOfDay += SLOT_INTERVAL_MIN;
    }
    return slots;
}

/**
 * 날짜 문자열(YYYY-MM-DD) 유효성 검사
 * @param {string} str
 * @returns {boolean}
 */
function isValidDate(str) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const d = new Date(str);
    return !isNaN(d.getTime());
}

/**
 * ISO 8601 문자열에서 HH:MM 시각 부분만 추출
 * e.g. "2026-06-10T09:45:00+09:00" → "09:45"
 *
 * @param {string} isoStr
 * @returns {string|null}
 */
function extractTimeHHMM(isoStr) {
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return null;
        // UTC+9 기준 시각 계산 (한국 표준시)
        const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const h = String(kst.getUTCHours()).padStart(2, '0');
        const m = String(kst.getUTCMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    } catch {
        return null;
    }
}

/**
 * 날짜 문자열(YYYY-MM-DD) + 시각(HH:MM) → YYYY-MM-DD 형식 날짜 문자열 추출
 * ISO 문자열에서 날짜 부분만 KST 기준으로 반환
 *
 * @param {string} isoStr
 * @returns {string|null}  e.g. "2026-06-10"
 */
function extractDateYMD(isoStr) {
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return null;
        const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const y = kst.getUTCFullYear();
        const mo = String(kst.getUTCMonth() + 1).padStart(2, '0');
        const day = String(kst.getUTCDate()).padStart(2, '0');
        return `${y}-${mo}-${day}`;
    } catch {
        return null;
    }
}

/**
 * 할인율을 적용해 최종 금액 계산
 * @param {number} discountRate  0 또는 30
 * @returns {number}
 */
function calcTotalAmount(discountRate) {
    if (!discountRate || discountRate <= 0) return BASE_PRICE;
    return Math.round(BASE_PRICE * (1 - discountRate / 100));
}

/**
 * 해당 날짜·트레이너에 이미 예약된 시각(HH:MM) 집합을 반환
 * ⚠️ 반환값에 예약자 정보 절대 포함 금지 — 시각 문자열만 반환
 *
 * @param {object} sb
 * @param {string} complexId
 * @param {string} instructorId
 * @param {string} dateYMD      "YYYY-MM-DD"
 * @returns {Promise<Set<string>>}  {"09:00", "10:30", ...}
 */
async function getBookedSlots(sb, complexId, instructorId, dateYMD) {
    // preferred_time은 HH:MM 형식으로 저장됨
    // created_at 또는 preferred_date 컬럼 대신 preferred_time과 program_name으로 필터
    // 날짜별 구분을 위해 scheduled_at (ISO) 컬럼이 있으면 사용,
    // 없으면 program_name + instructor_id + preferred_time 조합으로 당일 중복만 차단
    const { data, error } = await sb
        .from('applications')
        .select('preferred_time')
        .eq('complex_id', complexId)
        .eq('program_name', PT_PROGRAM_NAME)
        .eq('instructor_id', instructorId)
        .eq('preferred_date', dateYMD)   // A-2 마이그레이션으로 추가된 컬럼
        .in('status', ['approved', 'pending']);

    if (error) throw sbErr(error, 'getBookedSlots');
    return new Set((data || []).map(r => r.preferred_time).filter(Boolean));
}


// ── GET /instructors ────────────────────────────────────────────
/**
 * 호텔 소속 트레이너 목록 조회
 *
 * Query params:
 *   complex_code  string  필수
 *
 * Response 200:
 *   { success: true, instructors: [{ id, name, photo_url, specialty }] }
 *
 * ⚠️  응답에 다른 예약자 정보·예약 현황 절대 미포함
 * Feature Flag: hotelRefreshPt
 */
router.get('/instructors', async (req, res) => {
    if (!flags.hotelRefreshPt) return flagOff(res);

    try {
        const { complex_code } = req.query;

        if (!complex_code) {
            return res.status(400).json({
                success: false,
                error:   'complex_code가 필요합니다',
            });
        }

        const sb      = getSupabase();
        const complex = await resolveHotelComplex(sb, complex_code, res);
        if (!complex) return;

        const { data, error } = await sb
            .from('instructors')
            .select('id, name, photo_url, specialty')
            .eq('complex_id', complex.id)
            .eq('is_active', true)
            .order('display_order', { ascending: true, nullsFirst: false })
            .order('name');

        if (error) throw sbErr(error, 'GET /hotel/refresh-pt/instructors');

        return res.json({
            success:     true,
            instructors: data || [],
        });

    } catch (e) {
        console.error('[hotel/refresh-pt] instructors:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── GET /available-slots ────────────────────────────────────────
/**
 * 특정 날짜·트레이너의 예약 가능 시간대 조회
 *
 * Query params:
 *   complex_code   string  필수
 *   instructor_id  string  필수 (UUID)
 *   date           string  필수 (YYYY-MM-DD)
 *
 * Response 200:
 *   { success: true, slots: ["09:00","09:45",...] }
 *   — 예약 가능한 슬롯만 반환. 이미 예약된 슬롯은 제외.
 *
 * ⚠️  응답에 예약자 정보·예약 건수·혼잡도 절대 미포함
 * Feature Flag: hotelRefreshPt
 */
router.get('/available-slots', async (req, res) => {
    if (!flags.hotelRefreshPt) return flagOff(res);

    try {
        const { complex_code, instructor_id, date } = req.query;

        if (!complex_code || !instructor_id || !date) {
            return res.status(400).json({
                success: false,
                error:   'complex_code, instructor_id, date(YYYY-MM-DD)가 모두 필요합니다',
            });
        }
        if (!isValidDate(date)) {
            return res.status(400).json({
                success: false,
                error:   'date 형식이 올바르지 않습니다 (YYYY-MM-DD)',
            });
        }

        const sb      = getSupabase();
        const complex = await resolveHotelComplex(sb, complex_code, res);
        if (!complex) return;

        const instructor = await resolveInstructor(sb, instructor_id, complex.id, res);
        if (!instructor) return;

        const booked    = await getBookedSlots(sb, complex.id, instructor_id, date);
        const allSlots  = buildAllSlots();
        const available = allSlots.filter(slot => !booked.has(slot));

        return res.json({
            success: true,
            slots:   available,
        });

    } catch (e) {
        console.error('[hotel/refresh-pt] available-slots:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST /reserve ───────────────────────────────────────────────
/**
 * 리프레시 PT 예약 생성
 *
 * Request body:
 *   {
 *     complex_code:     string,
 *     instructor_id:    string (UUID),
 *     scheduled_at:     string (ISO 8601 — 예: "2026-06-10T09:45:00+09:00"),
 *     name:             string,
 *     phone:            string,
 *     room_number?:     string,
 *     member_token?:    string (32자 hex — 기존 회원),
 *     payment_method:   'card' | 'room_charge'
 *   }
 *
 * Response 200:
 *   { success: true, application_id, scheduled_at, instructor_name, total_amount }
 *
 * Feature Flag: hotelRefreshPt
 */
router.post('/reserve', async (req, res) => {
    if (!flags.hotelRefreshPt) return flagOff(res);

    try {
        const {
            complex_code,
            instructor_id,
            scheduled_at,
            name,
            phone,
            room_number,
            member_token,
            payment_method,
        } = req.body;

        // ── 입력값 검증 ────────────────────────────────────────
        if (!complex_code || !instructor_id || !scheduled_at || !name || !phone || !payment_method) {
            return res.status(400).json({
                success: false,
                error:   'complex_code, instructor_id, scheduled_at, name, phone, payment_method가 모두 필요합니다',
            });
        }
        if (!['card', 'room_charge'].includes(payment_method)) {
            return res.status(400).json({
                success: false,
                error:   "payment_method는 'card' 또는 'room_charge'여야 합니다",
            });
        }

        const preferredTime = extractTimeHHMM(scheduled_at);
        const preferredDate = extractDateYMD(scheduled_at);

        if (!preferredTime || !preferredDate) {
            return res.status(400).json({
                success: false,
                error:   'scheduled_at 형식이 올바르지 않습니다 (ISO 8601 형식 사용)',
            });
        }

        // 유효 슬롯 범위 검증
        const validSlots = buildAllSlots();
        if (!validSlots.includes(preferredTime)) {
            return res.status(400).json({
                success: false,
                error:   `예약 불가능한 시간대입니다. 09:00~20:15 사이 45분 단위로만 예약할 수 있습니다`,
            });
        }

        const sb = getSupabase();

        // ── 단지·트레이너 검증 ─────────────────────────────────
        const complex    = await resolveHotelComplex(sb, complex_code, res);
        if (!complex) return;

        const instructor = await resolveInstructor(sb, instructor_id, complex.id, res);
        if (!instructor) return;

        // ── 슬롯 중복 확인 ─────────────────────────────────────
        const booked = await getBookedSlots(sb, complex.id, instructor_id, preferredDate);
        if (booked.has(preferredTime)) {
            return res.status(409).json({
                success: false,
                error:   '해당 시간대는 이미 예약되었습니다. 다른 시간을 선택해 주세요.',
            });
        }

        // ── member_token 처리 (선택) ───────────────────────────
        let userType     = 'guest';
        let discountRate = 0;

        if (member_token) {
            const { data: tokenRow } = await sb
                .from('member_tokens')
                .select('id, expires_at, discount_rate')
                .eq('token', member_token)
                .single();

            if (tokenRow && new Date(tokenRow.expires_at) >= new Date()) {
                userType     = 'pt_member';
                discountRate = tokenRow.discount_rate || 0;
            }
            // 만료·유효하지 않은 토큰: 무시하고 guest로 진행
        }

        // ── staff/VIP 할인율 override ──────────────────────────
        // member_token에서 받은 discount_rate가 VIP_DISCOUNT_RATE 미만이면 그대로,
        // staff 인증 토큰에서 VIP_DISCOUNT_RATE가 이미 반영되어 있으면 그것을 사용
        if (discountRate < VIP_DISCOUNT_RATE && userType === 'pt_member') {
            // 추가 staff 검증 없이 토큰의 discount_rate 그대로 사용
        }
        const totalAmount = calcTotalAmount(discountRate);

        // ── 예약 INSERT ────────────────────────────────────────
        const insertData = {
            complex_id:     complex.id,
            program_name:   PT_PROGRAM_NAME,
            instructor_id,
            preferred_time: preferredTime,
            preferred_date: preferredDate,
            name:           name.trim(),
            phone,
            dong:           HOTEL_DONG,       // NOT NULL 제약 준수 — 호텔은 동/호 없음
            ho:             HOTEL_HO,
            status:         'approved',
            user_type:      userType,
            discount_rate:  discountRate,
            payment_method,
            waiting_order:  null,
        };

        // room_number는 선택 컬럼 — 제공된 경우에만 포함
        if (room_number) insertData.room_number = room_number;

        const { data: inserted, error: insertErr } = await sb
            .from('applications')
            .insert(insertData)
            .select('id')
            .single();

        if (insertErr) throw sbErr(insertErr, 'POST /hotel/refresh-pt/reserve INSERT');

        return res.json({
            success:         true,
            application_id:  inserted.id,
            scheduled_at,
            instructor_name: instructor.name,
            total_amount:    totalAmount,
        });

    } catch (e) {
        console.error('[hotel/refresh-pt] reserve:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST /reschedule ────────────────────────────────────────────
/**
 * 예약 시간 변경
 *
 * Request body:
 *   { application_id: string, phone_last4: string (4자리), new_scheduled_at: string (ISO 8601) }
 *
 * 정책:
 *   - 기존 예약 시각까지 24시간 미만 남은 경우 변경 거부 (409 반환)
 *   - 노쇼 페널티 없음
 *
 * Response 200:
 *   { success: true, application_id, new_scheduled_at }
 *
 * Feature Flag: hotelRefreshPt
 */
router.post('/reschedule', async (req, res) => {
    if (!flags.hotelRefreshPt) return flagOff(res);

    try {
        const { application_id, phone_last4, new_scheduled_at } = req.body;

        if (!application_id || !phone_last4 || !new_scheduled_at) {
            return res.status(400).json({
                success: false,
                error:   'application_id, phone_last4, new_scheduled_at가 모두 필요합니다',
            });
        }
        if (!/^\d{4}$/.test(phone_last4)) {
            return res.status(400).json({
                success: false,
                error:   'phone_last4는 숫자 4자리여야 합니다',
            });
        }

        const newTime = extractTimeHHMM(new_scheduled_at);
        const newDate = extractDateYMD(new_scheduled_at);

        if (!newTime || !newDate) {
            return res.status(400).json({
                success: false,
                error:   'new_scheduled_at 형식이 올바르지 않습니다 (ISO 8601 형식 사용)',
            });
        }
        const validSlots = buildAllSlots();
        if (!validSlots.includes(newTime)) {
            return res.status(400).json({
                success: false,
                error:   '변경 불가능한 시간대입니다. 09:00~20:15 사이 45분 단위로만 변경할 수 있습니다',
            });
        }

        const sb = getSupabase();

        // ── 기존 예약 조회 ─────────────────────────────────────
        const { data: app, error: fetchErr } = await sb
            .from('applications')
            .select('id, phone, status, preferred_time, preferred_date, instructor_id, complex_id, complexes!inner(venue_type)')
            .eq('id', application_id)
            .single();

        if (fetchErr || !app) {
            return res.status(404).json({
                success: false,
                error:   '예약 내역을 찾을 수 없습니다',
            });
        }
        if (app.complexes?.venue_type !== 'hotel') {
            return res.status(403).json({
                success: false,
                error:   '호텔 단지의 예약만 변경할 수 있습니다',
            });
        }
        if (app.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                error:   '이미 취소된 예약입니다',
            });
        }

        // ── 전화번호 본인 확인 ─────────────────────────────────
        const storedPhone = (app.phone || '').replace(/\D/g, '');
        if (!storedPhone.endsWith(phone_last4)) {
            return res.status(403).json({
                success: false,
                error:   '전화번호가 일치하지 않습니다',
            });
        }

        // ── 24시간 이내 변경 거부 ──────────────────────────────
        if (app.preferred_date && app.preferred_time) {
            const existingDateTimeStr = `${app.preferred_date}T${app.preferred_time}:00+09:00`;
            const existingMs          = new Date(existingDateTimeStr).getTime();
            const nowMs               = Date.now();
            if (existingMs - nowMs < RESCHEDULE_LIMIT_MS) {
                return res.status(409).json({
                    success: false,
                    error:   '예약 시작 24시간 이내에는 시간 변경이 불가합니다. 취소 후 재예약을 이용해 주세요.',
                });
            }
        }

        // ── 새 슬롯 중복 확인 ──────────────────────────────────
        const booked = await getBookedSlots(sb, app.complex_id, app.instructor_id, newDate);
        // 자기 자신의 기존 슬롯은 중복 판정에서 제외 (같은 날 시간 변경 시)
        if (booked.has(newTime) &&
            !(app.preferred_date === newDate && app.preferred_time === newTime)) {
            return res.status(409).json({
                success: false,
                error:   '해당 시간대는 이미 예약되었습니다. 다른 시간을 선택해 주세요.',
            });
        }

        // ── 시간 변경 UPDATE ───────────────────────────────────
        const { error: updateErr } = await sb
            .from('applications')
            .update({
                preferred_time: newTime,
                preferred_date: newDate,
                updated_at:     new Date().toISOString(),
            })
            .eq('id', application_id);

        if (updateErr) throw sbErr(updateErr, 'POST /hotel/refresh-pt/reschedule UPDATE');

        return res.json({
            success:          true,
            application_id,
            new_scheduled_at,
        });

    } catch (e) {
        console.error('[hotel/refresh-pt] reschedule:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST /cancel ────────────────────────────────────────────────
/**
 * 예약 취소
 *
 * Request body:
 *   { application_id: string, phone_last4: string (4자리) }
 *
 * 정책:
 *   - 24시간 이내 취소: 사유 기록만 하고 취소 허용 (패널티 없음)
 *   - 노쇼 페널티·블랙리스트 로직 없음
 *
 * Response 200:
 *   { success: true }
 *
 * Feature Flag: hotelRefreshPt
 */
router.post('/cancel', async (req, res) => {
    if (!flags.hotelRefreshPt) return flagOff(res);

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

        // ── 예약 조회 ──────────────────────────────────────────
        const { data: app, error: fetchErr } = await sb
            .from('applications')
            .select('id, phone, status, preferred_time, preferred_date, complexes!inner(venue_type)')
            .eq('id', application_id)
            .single();

        if (fetchErr || !app) {
            return res.status(404).json({
                success: false,
                error:   '예약 내역을 찾을 수 없습니다',
            });
        }
        if (app.complexes?.venue_type !== 'hotel') {
            return res.status(403).json({
                success: false,
                error:   '호텔 단지의 예약만 취소할 수 있습니다',
            });
        }
        if (app.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                error:   '이미 취소된 예약입니다',
            });
        }

        // ── 전화번호 본인 확인 ─────────────────────────────────
        const storedPhone = (app.phone || '').replace(/\D/g, '');
        if (!storedPhone.endsWith(phone_last4)) {
            return res.status(403).json({
                success: false,
                error:   '전화번호가 일치하지 않습니다',
            });
        }

        // ── 24시간 이내 여부 판단 (사유 기록용) ───────────────
        let cancelNote = null;
        if (app.preferred_date && app.preferred_time) {
            const sessionMs = new Date(`${app.preferred_date}T${app.preferred_time}:00+09:00`).getTime();
            if (sessionMs - Date.now() < RESCHEDULE_LIMIT_MS) {
                // 노쇼 페널티 없음 — 단순 기록만
                cancelNote = 'short_notice';   // 24시간 이내 취소 메모 (운영 참고용)
            }
        }

        // ── 취소 UPDATE ────────────────────────────────────────
        const updatePayload = {
            status:     'cancelled',
            updated_at: new Date().toISOString(),
        };
        if (cancelNote) updatePayload.cancel_note = cancelNote;   // 컬럼 없으면 Supabase가 무시

        const { error: updateErr } = await sb
            .from('applications')
            .update(updatePayload)
            .eq('id', application_id);

        if (updateErr) throw sbErr(updateErr, 'POST /hotel/refresh-pt/cancel UPDATE');

        return res.json({ success: true });

    } catch (e) {
        console.error('[hotel/refresh-pt] cancel:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


module.exports = router;
