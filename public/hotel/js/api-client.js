/**
 * public/hotel/js/api-client.js
 * 호텔 전용 공통 API 클라이언트
 *
 * 역할:
 *   - /api/hotel/* 경로 공통 fetch 래퍼
 *   - localStorage 토큰 자동 헤더 주입 (있는 경우만)
 *   - 에러 응답 → 사용자 친화적 메시지 변환
 *   - 네트워크 오류 처리
 *
 * 단계: C-2 / 작성일: 2026-06-07
 */

'use strict';

(function (global) {

    const STORAGE_KEY = 'hotel_member_token';
    const API_PREFIX  = '/api/hotel';

    // ── 토큰 유틸 ────────────────────────────────────────────────
    function getToken() {
        try { return localStorage.getItem(STORAGE_KEY) || null; }
        catch (e) { return null; }
    }

    // ── 에러 메시지 변환 ─────────────────────────────────────────
    /**
     * API 에러 코드/메시지 → 사용자 친화적 한국어 메시지
     * @param {number} status
     * @param {string} serverMsg
     * @returns {string}
     */
    function friendlyError(status, serverMsg) {
        if (status === 0)   return '네트워크 연결을 확인해 주세요.';
        if (status === 400) return serverMsg || '입력값을 다시 확인해 주세요.';
        if (status === 401) return '로그인이 필요하거나 세션이 만료되었습니다.';
        if (status === 403) return '현재 이용할 수 없는 기능입니다.';
        if (status === 404) return '정보를 찾을 수 없습니다.';
        if (status === 409) return serverMsg || '요청이 충돌했습니다. 다시 시도해 주세요.';
        if (status >= 500)  return '일시적인 서버 오류입니다. 잠시 후 다시 시도해 주세요.';
        return serverMsg || '오류가 발생했습니다.';
    }

    /**
     * 호텔 API 공통 fetch 래퍼
     *
     * @param {string} path   /api/hotel 이후 경로 (예: '/quick-class/availability')
     * @param {object} [opts] fetch options (method, body 등)
     * @returns {Promise<{ ok: boolean, status: number, data: any, errorMsg: string|null }>}
     *
     * 반환값:
     *   ok       true이면 성공 (2xx)
     *   status   HTTP 상태 코드
     *   data     응답 JSON (파싱 성공 시)
     *   errorMsg 오류 시 사용자 친화적 메시지
     */
    async function hotelApi(path, opts = {}) {
        const token   = getToken();
        const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };

        // 토큰이 있을 때만 Authorization 헤더 주입
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const url = API_PREFIX + path;
        let status = 0;
        let data   = null;

        try {
            const res = await fetch(url, {
                ...opts,
                headers,
                body: opts.body ? JSON.stringify(opts.body) : undefined,
            });

            status = res.status;

            try { data = await res.json(); }
            catch (e) { data = null; }

            if (res.ok) {
                return { ok: true, status, data, errorMsg: null };
            }

            const serverMsg = data?.error || null;
            return {
                ok: false, status, data,
                errorMsg: friendlyError(status, serverMsg),
            };

        } catch (e) {
            // 네트워크 오류 (fetch 자체 실패)
            return {
                ok: false, status: 0, data: null,
                errorMsg: friendlyError(0, null),
            };
        }
    }

    // ── 단축 메서드 ──────────────────────────────────────────────
    hotelApi.get = (path, params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return hotelApi(path + (qs ? '?' + qs : ''), { method: 'GET' });
    };

    hotelApi.post = (path, body = {}) =>
        hotelApi(path, { method: 'POST', body });

    // ── 전역 노출 ─────────────────────────────────────────────────
    global.hotelApi   = hotelApi;
    global.getHotelToken = getToken;

}(window));
