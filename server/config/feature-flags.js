/**
 * feature-flags.js
 * 호텔 모드 Feature Flag 인프라
 *
 * 목적:
 *   - 환경변수 한 줄로 호텔 기능 전체를 ON/OFF 가능하게 한다.
 *   - 기존 아파트 단지 로직은 이 파일과 완전히 무관하다.
 *     (아파트 라우트는 이 파일을 require하지 않으며, 기본값이 모두 false이므로
 *      환경변수 미설정 시 호텔 코드 경로는 어떤 요청에서도 진입되지 않는다.)
 *
 * 사용 방법 (A-5 이후 호텔 라우트에서만 사용):
 *   const flags = require('../config/feature-flags');
 *
 *   if (!flags.hotelMode) return res.status(404).json({ ... });
 *   if (!flags.isHotelComplex(complex)) return res.status(403).json({ ... });
 *
 * Flag 전환:
 *   Vercel 대시보드 → Settings → Environment Variables → ENABLE_HOTEL_MODE=true
 *   → Redeploy (상세 절차: docs/ops/A4-FEATURE-FLAGS.md)
 *
 * 단계: A-4 / 작성일: 2026-06-07
 */

'use strict';

/**
 * 환경변수 문자열 → boolean 변환 헬퍼
 * '1', 'true', 'yes', 'on' (대소문자 무관) → true
 * 그 외 모든 값 (undefined 포함) → false
 *
 * @param {string|undefined} val
 * @returns {boolean}
 */
function toBool(val) {
    if (val == null) return false;
    return ['1', 'true', 'yes', 'on'].includes(String(val).trim().toLowerCase());
}

/**
 * Feature Flag 객체
 *
 * @property {boolean} hotelMode         - 마스터 스위치. false이면 하위 Flag 전부 무효.
 * @property {boolean} hotelQuickClass   - 퀵클래스(당일 단회 수업) 기능.
 * @property {boolean} hotelRefreshPt    - 리프레시 PT 패키지 기능.
 * @property {boolean} hotelMemberPage   - 호텔 전용 회원 페이지 기능.
 * @property {boolean} hotelStaffAuth    - 직원 인증 기능.
 * @property {boolean} hotelMealOrder    - 식사 주문 연동 기능.
 */
const flags = {
    hotelMode:        toBool(process.env.ENABLE_HOTEL_MODE),
    hotelQuickClass:  toBool(process.env.ENABLE_HOTEL_QUICK_CLASS),
    hotelRefreshPt:   toBool(process.env.ENABLE_HOTEL_REFRESH_PT),
    hotelMemberPage:  toBool(process.env.ENABLE_HOTEL_MEMBER_PAGE),
    hotelStaffAuth:   toBool(process.env.ENABLE_HOTEL_STAFF_AUTH),
    hotelMealOrder:   toBool(process.env.ENABLE_HOTEL_MEAL_ORDER),
};

/**
 * 주어진 단지가 활성화된 호텔 단지인지 판단한다.
 *
 * 조건 두 가지를 모두 만족해야 true:
 *   1. flags.hotelMode === true  (마스터 스위치)
 *   2. complex.venue_type === 'hotel'  (DB 설정)
 *
 * 사용 예:
 *   const complex = await getComplexById(complexId);
 *   if (!flags.isHotelComplex(complex)) {
 *       return res.status(403).json({ success: false, error: '호텔 전용 기능입니다.' });
 *   }
 *
 * @param {{ venue_type?: string } | null | undefined} complex
 * @returns {boolean}
 */
flags.isHotelComplex = function isHotelComplex(complex) {
    if (!complex) return false;
    return flags.hotelMode && complex.venue_type === 'hotel';
};

module.exports = flags;
