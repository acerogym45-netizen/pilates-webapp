/**
 * public/hotel/js/landing.js
 * 아세로짐 라마다 대전점 — 랜딩 페이지 스크립트
 *
 * 역할:
 *   1. URL ?t=토큰 파라미터를 localStorage에 저장
 *   2. 저장된 토큰이 있으면 GET /api/hotel/members/me 로 이름만 조회
 *   3. 이름이 있으면 헤더 환영 문구 + 마이페이지 CTA 설명 문구를 개인화
 *   4. 토큰 없으면 모든 CTA 그대로 유지 — 강제 로그인 없음
 *
 * 설계 원칙:
 *   - 자동 리다이렉트 절대 없음
 *   - 토큰 없어도 모든 CTA 정상 표시
 *   - API 호출 실패해도 페이지 기능 100% 유지 (silent fail)
 *   - 응답에서 name 필드만 사용, 나머지 데이터는 무시
 *
 * 단계: C-1 / 작성일: 2026-06-07
 */

'use strict';

(function () {

    // ── 상수 ────────────────────────────────────────────────────
    const STORAGE_KEY  = 'hotel_member_token';
    const API_BASE     = '/api/hotel/members';
    const PARAM_KEY    = 't';               // URL 쿼리 파라미터 이름

    // ── DOM 요소 ─────────────────────────────────────────────────
    /** @type {HTMLElement|null} */
    const welcomeMsg   = document.getElementById('welcomeMsg');
    /** @type {HTMLElement|null} */
    const memberCta    = document.getElementById('memberCta');
    /** @type {HTMLElement|null} */
    const memberCtaDesc = document.getElementById('memberCtaDesc');


    // ── 1. URL ?t= 파라미터 → localStorage 저장 ─────────────────
    /**
     * URL 쿼리스트링에서 토큰을 추출해 localStorage에 저장한다.
     * 저장 후 URL에서 파라미터를 제거해 토큰이 주소창에 노출되는 것을 최소화한다.
     *
     * @returns {string|null} 추출된 토큰 또는 null
     */
    function extractAndStoreToken() {
        const params = new URLSearchParams(window.location.search);
        const token  = params.get(PARAM_KEY);

        if (token && token.length >= 16) {
            try {
                localStorage.setItem(STORAGE_KEY, token);
            } catch (e) {
                // localStorage 쓰기 실패 (Private 모드 등) — 무시하고 계속
            }

            // URL에서 ?t= 파라미터 제거 (replaceState — 히스토리 오염 없이)
            params.delete(PARAM_KEY);
            const newSearch = params.toString();
            const newUrl    = window.location.pathname + (newSearch ? '?' + newSearch : '');
            try {
                window.history.replaceState(null, '', newUrl);
            } catch (e) {
                // replaceState 실패 시 무시
            }

            return token;
        }
        return null;
    }


    // ── 2. localStorage에서 토큰 읽기 ────────────────────────────
    /**
     * @returns {string|null}
     */
    function loadStoredToken() {
        try {
            return localStorage.getItem(STORAGE_KEY) || null;
        } catch (e) {
            return null;
        }
    }


    // ── 3. 회원 이름 조회 (이름만, 나머지 무시) ──────────────────
    /**
     * GET /api/hotel/members/me 를 호출해 name 필드만 반환한다.
     * 실패 시 null 반환 — 페이지 기능에 영향 없음.
     *
     * @param {string} token
     * @returns {Promise<string|null>}
     */
    async function fetchMemberName(token) {
        try {
            const res = await fetch(`${API_BASE}/me?token=${encodeURIComponent(token)}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!res.ok) {
                // 401: 토큰 만료/무효 → localStorage에서 제거
                if (res.status === 401) {
                    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
                }
                return null;
            }

            const json = await res.json();
            // name 필드만 사용. 다른 필드(pt_status, benefits 등)는 완전히 무시.
            if (json.success && json.member && typeof json.member.name === 'string') {
                return json.member.name.trim() || null;
            }
            return null;
        } catch (e) {
            // 네트워크 오류, JSON 파싱 오류 등 — silent fail
            return null;
        }
    }


    // ── 4. UI 개인화 ─────────────────────────────────────────────
    /**
     * 이름이 있을 때 헤더 문구와 마이페이지 CTA 설명을 개인화한다.
     * ⚠️  자동 리다이렉트 없음. 강제 로그인 없음.
     *
     * @param {string} name
     */
    function personalizeUI(name) {
        // 헤더 환영 문구
        if (welcomeMsg) {
            welcomeMsg.textContent = `${name}님, 환영합니다`;
            welcomeMsg.classList.add('is-personalized');
        }

        // 마이페이지 CTA 설명 문구
        if (memberCtaDesc) {
            memberCtaDesc.textContent = `${name}님의 PT 잔여 · 예약 변경`;
        }

        // 마이페이지 카드에 회원 상태 클래스 추가 (CSS 스타일 변경용)
        if (memberCta) {
            memberCta.classList.add('is-member');
            // 마이페이지 URL에 토큰 전달 (이동할 때 토큰 재사용)
            const stored = loadStoredToken();
            if (stored) {
                const current = memberCta.getAttribute('href') || './member.html';
                const base    = current.split('?')[0];
                memberCta.setAttribute('href', `${base}?t=${encodeURIComponent(stored)}`);
            }
        }
    }


    // ── 메인 초기화 ──────────────────────────────────────────────
    /**
     * 페이지 로드 시 실행되는 진입점.
     * 순서: URL 토큰 저장 → 저장 토큰 읽기 → (있으면) 이름 조회 → UI 개인화
     * 토큰 없거나 API 실패해도 페이지는 정상 동작.
     */
    async function init() {
        // URL ?t= 먼저 처리 (저장 후 URL 정리)
        extractAndStoreToken();

        // localStorage 토큰 읽기
        const token = loadStoredToken();

        // 토큰 없음 → 그대로 표시, 강제 로그인 없음
        if (!token) return;

        // 토큰 있음 → 이름만 조회해서 개인화
        const name = await fetchMemberName(token);
        if (name) {
            personalizeUI(name);
        }
        // name이 null이어도 페이지 정상 표시 — 추가 조치 없음
    }

    // DOM 준비 후 실행
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}());
