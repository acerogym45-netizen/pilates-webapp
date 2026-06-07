/**
 * server/routes/hotel/workout-reports.js
 * 트레이너용 회원 운동 리포트 CRUD 라우터 (admin 전용)
 *
 * 엔드포인트 (4개):
 *   GET  /           — 회원 운동 리포트 목록 조회 (application_id 기준)
 *   GET  /:id        — 단일 리포트 상세 조회
 *   POST /           — 신규 리포트 등록 (FMS 7동작 + 인바디 + 코멘트)
 *   POST /:id/pdf-url — PDF URL 생성 (Phase 2 placeholder)
 *
 * 설계 원칙:
 *   - Feature Flag: 전 엔드포인트 flags.hotelMemberPage 체크 (ENABLE_HOTEL_MEMBER_PAGE)
 *   - venue_type='hotel' 검증: application_id → applications → complex_id → venue_type 확인
 *   - FMS 점수: 각 항목 0~3 정수만 허용 (서버 측 검증 필수)
 *   - 인원카운트 / 혼잡도 / 출입 관련 기능 없음
 *   - 별도 알림 강제 없음 — 회원 마이페이지(C-3)에서 자동 노출
 *   - 기존 단지 무영향 — hotelMode 블록 내부에서만 마운트
 *
 * 연결 위치:
 *   server/index.js if(flags.hotelMode) 블록 내:
 *     app.use('/api/hotel/workout-reports', require('./routes/hotel/workout-reports'));
 *
 * DB 패턴: getSupabase() / sbErr() — db-supabase.js 공통 패턴
 * 단계: D-3 / 작성일: 2026-06-07
 */

'use strict';

const express = require('express');
const router  = express.Router();

const { getSupabase, sbErr } = require('../../db-supabase');
const flags                  = require('../../config/feature-flags');

// ── 상수 ────────────────────────────────────────────────────────

/** FMS 7동작 키 목록 — 이 키 외의 키는 무시 */
const FMS_KEYS = [
    'deep_squat',
    'hurdle_step',
    'inline_lunge',
    'shoulder_mobility',
    'active_slr',
    'trunk_stability_pushup',
    'rotary_stability',
];

/** FMS 점수 허용 범위 */
const FMS_MIN = 0;
const FMS_MAX = 3;

/** 인바디 허용 필드 목록 — 이 외 필드는 서버에서 제거 */
const INBODY_ALLOWED_KEYS = [
    'weight',           // 체중 (kg)
    'skeletal_muscle',  // 골격근량 (kg)
    'body_fat_pct',     // 체지방률 (%)
    'body_water',       // 체수분 (L)
    'bmi',              // BMI
    'basal_metabolic_rate', // 기초대사량 (kcal)
];


// ── 유틸 ────────────────────────────────────────────────────────

/**
 * Feature Flag 비활성화 응답 공통 핸들러
 * @param {import('express').Response} res
 * @param {string} flagName  환경변수명 (안내용)
 */
function flagOff(res, flagName) {
    return res.status(403).json({
        success: false,
        error: `해당 기능이 현재 비활성화되어 있습니다 (${flagName})`,
    });
}

/**
 * FMS 점수 객체 검증
 *
 * fms_scores가 제공된 경우:
 *   - 모든 값이 0~3 정수여야 함
 *   - 허용 키(FMS_KEYS) 외의 키 포함 시 400
 *   - 빈 객체 {} 허용 (부분 입력)
 *   - null / undefined 허용 (FMS 미입력)
 *
 * @param {*}                           fmsScores  검증 대상
 * @param {import('express').Response}  res
 * @returns {boolean}  유효하면 true, 응답 후 false
 */
function validateFmsScores(fmsScores, res) {
    if (fmsScores == null) return true;          // null/undefined → 통과

    if (typeof fmsScores !== 'object' || Array.isArray(fmsScores)) {
        res.status(400).json({ success: false, error: 'fms_scores는 객체여야 합니다' });
        return false;
    }

    for (const [key, val] of Object.entries(fmsScores)) {
        if (!FMS_KEYS.includes(key)) {
            res.status(400).json({
                success: false,
                error: `fms_scores에 허용되지 않는 키가 있습니다: ${key}. 허용 키: ${FMS_KEYS.join(', ')}`,
            });
            return false;
        }
        const n = Number(val);
        if (!Number.isInteger(n) || n < FMS_MIN || n > FMS_MAX) {
            res.status(400).json({
                success: false,
                error: `fms_scores.${key} 값이 유효하지 않습니다: ${val}. 0~3 정수만 허용됩니다`,
            });
            return false;
        }
    }
    return true;
}

/**
 * 인바디 데이터 정제 — 허용된 키만 남기고 나머지 제거
 * @param {*} inbodyData
 * @returns {object|null}
 */
function sanitizeInbodyData(inbodyData) {
    if (inbodyData == null) return null;
    if (typeof inbodyData !== 'object' || Array.isArray(inbodyData)) return null;

    const result = {};
    for (const key of INBODY_ALLOWED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(inbodyData, key)) {
            const val = inbodyData[key];
            // 숫자 또는 null만 허용
            if (val === null || (typeof val === 'number' && isFinite(val))) {
                result[key] = val;
            }
        }
    }
    return Object.keys(result).length > 0 ? result : null;
}

/**
 * application_id로 applications 조회 → complex_id 획득 → venue_type='hotel' 검증
 *
 * 실패 시 res에 직접 응답 후 null 반환 → 호출부에서 `if (!app) return;` 처리.
 *
 * @param {object}   sb              Supabase 클라이언트
 * @param {string}   applicationId   UUID
 * @param {import('express').Response} res
 * @returns {Promise<{id:string, complex_id:string}|null>}
 */
async function resolveHotelApplicationById(sb, applicationId, res) {
    if (!applicationId) {
        res.status(400).json({ success: false, error: 'application_id가 필요합니다' });
        return null;
    }

    // ── applications 조회 ───────────────────────────────────────
    const { data: app, error: appErr } = await sb
        .from('applications')
        .select('id, complex_id')
        .eq('id', applicationId)
        .single();

    if (appErr || !app) {
        res.status(404).json({ success: false, error: '신청 정보를 찾을 수 없습니다' });
        return null;
    }

    // ── complex 조회 → venue_type='hotel' 검증 ──────────────────
    const { data: complex, error: cxErr } = await sb
        .from('complexes')
        .select('id, venue_type, name')
        .eq('id', app.complex_id)
        .single();

    if (cxErr || !complex) {
        res.status(404).json({ success: false, error: '단지 정보를 찾을 수 없습니다' });
        return null;
    }

    if (complex.venue_type !== 'hotel') {
        res.status(403).json({
            success: false,
            error: `이 기능은 hotel 단지에서만 사용할 수 있습니다 (현재: ${complex.venue_type})`,
        });
        return null;
    }

    return { id: app.id, complex_id: app.complex_id };
}


// ── GET / ───────────────────────────────────────────────────────
/**
 * 운동 리포트 목록 조회
 *
 * Query params:
 *   application_id  string  필수  — 조회 대상 회원의 application UUID
 *
 * Response 200:
 *   { success: true, reports: [{ id, phase, fms_scores, inbody_data, trainer_comment, pdf_url, created_at }] }
 *
 * Feature Flag: hotelMemberPage
 */
router.get('/', async (req, res) => {
    if (!flags.hotelMemberPage) return flagOff(res, 'ENABLE_HOTEL_MEMBER_PAGE');

    try {
        const sb            = getSupabase();
        const applicationId = req.query.application_id;

        const app = await resolveHotelApplicationById(sb, applicationId, res);
        if (!app) return;

        const { data, error } = await sb
            .from('workout_reports')
            .select('id, phase, fms_scores, inbody_data, trainer_comment, pdf_url, created_at')
            .eq('application_id', applicationId)
            .order('phase', { ascending: true });

        if (error) throw sbErr(error, 'GET /hotel/workout-reports');

        return res.json({
            success: true,
            reports: data || [],
        });

    } catch (e) {
        console.error('[hotel/workout-reports] GET /:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── GET /:id ─────────────────────────────────────────────────────
/**
 * 단일 리포트 상세 조회
 *
 * Path param:
 *   id  string  필수  — workout_report UUID
 *
 * Response 200:
 *   { success: true, report: { id, application_id, phase, fms_scores, inbody_data, trainer_comment, pdf_url, created_at } }
 *
 * Feature Flag: hotelMemberPage
 */
router.get('/:id', async (req, res) => {
    if (!flags.hotelMemberPage) return flagOff(res, 'ENABLE_HOTEL_MEMBER_PAGE');

    try {
        const sb = getSupabase();

        const { data: report, error } = await sb
            .from('workout_reports')
            .select('id, application_id, phase, fms_scores, inbody_data, trainer_comment, pdf_url, created_at')
            .eq('id', req.params.id)
            .single();

        if (error || !report) {
            return res.status(404).json({ success: false, error: '리포트를 찾을 수 없습니다' });
        }

        // venue_type='hotel' 검증 (소속 application의 단지 확인)
        const app = await resolveHotelApplicationById(sb, report.application_id, res);
        if (!app) return;

        return res.json({
            success: true,
            report,
        });

    } catch (e) {
        console.error('[hotel/workout-reports] GET /:id:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST / ──────────────────────────────────────────────────────
/**
 * 신규 운동 리포트 등록
 *
 * Request body:
 *   {
 *     application_id:  string   필수  — 대상 회원 application UUID
 *     phase:           number   필수  — 리포트 회차 (1~)
 *     fms_scores:      object   선택  — { deep_squat:0~3, hurdle_step:0~3, ... }
 *     inbody_data:     object   선택  — { weight, skeletal_muscle, body_fat_pct, ... }
 *     trainer_comment: string   선택  — 트레이너 자유 코멘트
 *   }
 *
 * 검증:
 *   - application_id → venue_type='hotel' 확인
 *   - phase: 양의 정수
 *   - fms_scores: 각 항목 0~3 정수 (validateFmsScores)
 *   - inbody_data: 허용 필드만 저장 (sanitizeInbodyData)
 *
 * Response 201:
 *   { success: true, id }
 *
 * Feature Flag: hotelMemberPage
 */
router.post('/', async (req, res) => {
    if (!flags.hotelMemberPage) return flagOff(res, 'ENABLE_HOTEL_MEMBER_PAGE');

    try {
        const sb = getSupabase();
        const { application_id, phase, fms_scores, inbody_data, trainer_comment } = req.body;

        // ── application → hotel 단지 검증 ──────────────────────
        const app = await resolveHotelApplicationById(sb, application_id, res);
        if (!app) return;

        // ── phase 검증 ────────────────────────────────────────
        const phaseNum = parseInt(phase, 10);
        if (!Number.isInteger(phaseNum) || phaseNum < 1) {
            return res.status(400).json({
                success: false,
                error: 'phase는 1 이상의 정수여야 합니다',
            });
        }

        // ── FMS 점수 검증 ─────────────────────────────────────
        if (!validateFmsScores(fms_scores, res)) return;

        // ── 인바디 데이터 정제 ────────────────────────────────
        const cleanedInbody = sanitizeInbodyData(inbody_data);

        // ── INSERT ────────────────────────────────────────────
        const { data: inserted, error: insertErr } = await sb
            .from('workout_reports')
            .insert({
                application_id,
                phase:           phaseNum,
                fms_scores:      fms_scores    || null,
                inbody_data:     cleanedInbody || null,
                trainer_comment: typeof trainer_comment === 'string'
                    ? trainer_comment.trim().slice(0, 2000)
                    : null,
            })
            .select('id')
            .single();

        if (insertErr) throw sbErr(insertErr, 'POST /hotel/workout-reports INSERT');

        return res.status(201).json({
            success: true,
            id: inserted.id,
        });

    } catch (e) {
        console.error('[hotel/workout-reports] POST /:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// ── POST /:id/pdf-url ────────────────────────────────────────────
/**
 * PDF URL 생성 (Phase 2 Placeholder)
 *
 * 현재 단계에서는 실제 PDF 파일을 생성하지 않는다.
 * pdf_url 컬럼에 placeholder URL을 저장하고 반환한다.
 * Phase 2에서 실제 PDF 렌더링 서비스 연동 예정.
 *
 * Path param:
 *   id  string  필수  — workout_report UUID
 *
 * Response 200:
 *   { success: true, pdf_url: "https://placeholder/..." }
 *
 * Feature Flag: hotelMemberPage
 */
router.post('/:id/pdf-url', async (req, res) => {
    if (!flags.hotelMemberPage) return flagOff(res, 'ENABLE_HOTEL_MEMBER_PAGE');

    try {
        const sb = getSupabase();

        // ── 리포트 조회 ────────────────────────────────────────
        const { data: report, error: fetchErr } = await sb
            .from('workout_reports')
            .select('id, application_id, phase, pdf_url')
            .eq('id', req.params.id)
            .single();

        if (fetchErr || !report) {
            return res.status(404).json({ success: false, error: '리포트를 찾을 수 없습니다' });
        }

        // ── venue_type='hotel' 검증 ────────────────────────────
        const app = await resolveHotelApplicationById(sb, report.application_id, res);
        if (!app) return;

        // ── 이미 PDF URL이 있으면 그대로 반환 ─────────────────
        if (report.pdf_url) {
            return res.json({ success: true, pdf_url: report.pdf_url });
        }

        // ── Placeholder URL 생성 및 저장 ──────────────────────
        // Phase 2에서 실제 PDF 생성 서비스(예: WeasyPrint, Puppeteer) 연동 예정
        const placeholderUrl = `https://placeholder.example.com/workout-reports/${report.id}/report-phase${report.phase}.pdf`;

        const { error: updateErr } = await sb
            .from('workout_reports')
            .update({ pdf_url: placeholderUrl })
            .eq('id', report.id);

        if (updateErr) throw sbErr(updateErr, 'POST /hotel/workout-reports/:id/pdf-url UPDATE');

        return res.json({
            success: true,
            pdf_url: placeholderUrl,
        });

    } catch (e) {
        console.error('[hotel/workout-reports] POST /:id/pdf-url:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


module.exports = router;
