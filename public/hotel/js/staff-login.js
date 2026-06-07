/**
 * public/hotel/js/staff-login.js
 * 라마다 임직원 전용 로그인 페이지 스크립트
 *
 * 흐름:
 *   1. 사번 + 전화 뒤 4자리 입력 → 버튼 활성화
 *   2. 폼 제출 → POST /api/hotel/auth/verify-staff
 *   3. 성공 → 할인 안내 카드 표시 (#staffDoneScreen)
 *   4. 실패 → 사용자 친화적 에러 메시지 표시
 *
 * 설계 원칙:
 *   - 자동 회원가입 없음
 *   - 자동 리다이렉트 없음
 *   - 성공 후 안내 카드만 표시 (일반 회원과 경로 분리)
 *   - complex_code 고정: 'ht-lamada' (URL 파라미터로 오버라이드 가능)
 *
 * 단계: C-3 / 작성일: 2026-06-07
 *
 * 주의: 이 파일은 api-client.js 이후에 로드됩니다.
 */

'use strict';

(function () {

    // ── 설정 ─────────────────────────────────────────────────────
    const params       = new URLSearchParams(window.location.search);
    const COMPLEX_CODE = params.get('complex') || 'ht-lamada';

    // ── DOM ──────────────────────────────────────────────────────
    const loginArea      = document.getElementById('loginArea');
    const staffDoneScreen = document.getElementById('staffDoneScreen');
    const statusBox      = document.getElementById('statusBox');
    const inputStaffNo   = document.getElementById('inputStaffNo');
    const inputPhoneLast4 = document.getElementById('inputPhoneLast4');
    const loginBtn       = document.getElementById('loginBtn');
    const reLoginBtn     = document.getElementById('reLoginBtn');

    // ── 상태 ─────────────────────────────────────────────────────
    let isSubmitting = false;

    // ── 유틸 ─────────────────────────────────────────────────────
    function showStatus(msg, type) {
        statusBox.textContent = msg;
        statusBox.className   = `status-box ${type} show`;
    }
    function hideStatus() {
        statusBox.className   = 'status-box';
        statusBox.textContent = '';
    }

    // 사번 + 전화 뒤 4자리 모두 입력 시에만 버튼 활성화
    function updateBtnState() {
        const staffOk = inputStaffNo.value.trim().length >= 1;
        const phone4Ok = /^\d{4}$/.test(inputPhoneLast4.value.trim());
        loginBtn.disabled = !(staffOk && phone4Ok) || isSubmitting;
    }

    // ── 폼 제출 핸들러 ───────────────────────────────────────────
    async function handleLogin() {
        if (isSubmitting) return;
        hideStatus();

        const staffNo    = inputStaffNo.value.trim();
        const phoneLast4 = inputPhoneLast4.value.trim();

        // 클라이언트 검증
        if (!staffNo) {
            showStatus('사번을 입력해 주세요.', 'error');
            inputStaffNo.focus();
            return;
        }
        if (!/^\d{4}$/.test(phoneLast4)) {
            showStatus('휴대폰 번호 뒤 4자리를 숫자로 입력해 주세요.', 'error');
            inputPhoneLast4.focus();
            return;
        }

        isSubmitting = true;
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="spinner"></span>확인 중…';

        const { ok, data, errorMsg } = await hotelApi.post(
            '/auth/verify-staff',
            {
                complex_code: COMPLEX_CODE,
                staff_no:     staffNo,
                phone_last4:  phoneLast4,
            }
        );

        isSubmitting = false;
        loginBtn.innerHTML = '임직원 확인';

        if (!ok) {
            showStatus(
                errorMsg || '임직원 정보가 일치하지 않습니다. 사번과 휴대폰 번호를 확인해 주세요.',
                'error'
            );
            loginBtn.disabled = false;
            return;
        }

        // ── 성공 → 안내 카드 표시 (자동 리다이렉트 없음) ────────
        loginArea.style.display = 'none';
        staffDoneScreen.classList.add('show');
    }

    // ── 다시 로그인 ──────────────────────────────────────────────
    function handleReLogin() {
        staffDoneScreen.classList.remove('show');
        loginArea.style.display = '';
        inputStaffNo.value    = '';
        inputPhoneLast4.value = '';
        hideStatus();
        updateBtnState();
        inputStaffNo.focus();
    }

    // ── 전화 뒤 4자리 입력: 숫자만 허용 + 최대 4자리 ───────────
    inputPhoneLast4.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        updateBtnState();
    });

    // ── Enter 키 제출 지원 ────────────────────────────────────────
    [inputStaffNo, inputPhoneLast4].forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !loginBtn.disabled) handleLogin();
        });
    });

    // ── 이벤트 바인딩 ─────────────────────────────────────────────
    inputStaffNo.addEventListener('input', updateBtnState);
    loginBtn.addEventListener('click', handleLogin);
    reLoginBtn.addEventListener('click', handleReLogin);

    // ── 초기화 ────────────────────────────────────────────────────
    function init() {
        updateBtnState();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}());
