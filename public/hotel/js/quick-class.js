/**
 * public/hotel/js/quick-class.js
 * 무료 운동 클래스 신청 페이지 스크립트
 *
 * 흐름:
 *   1. 페이지 로드 → GET /api/hotel/quick-class/availability → 일정·잔여석 표시
 *   2. localStorage 토큰 → 이름/전화 자동 채움 (있는 경우만)
 *   3. 신청 버튼 → POST /api/hotel/quick-class/apply
 *   4. 성공 → 완료 화면. 실패 → 사용자 친화적 에러 표시.
 *
 * 설계 원칙:
 *   - 동/호 입력 없음
 *   - 혼잡도/타인 예약 정보 표시 없음
 *   - 대기열 UI 없음: 정원 마감 시 다음 회차 안내만
 *   - 자동 리다이렉트 없음
 *
 * 단계: C-2 / 작성일: 2026-06-07
 *
 * 주의: 이 파일은 api-client.js 이후에 로드됩니다.
 */

'use strict';

(function () {

    // ── 설정 ────────────────────────────────────────────────────
    /**
     * 운영 단지 코드 및 프로그램 ID
     * 실제 운영 시 서버에서 URL 파라미터 또는 환경변수로 주입하거나
     * index.html?complex=ht-lamada&program=UUID 형태로 받아 사용.
     * 현재는 URL 파라미터 우선, 없으면 기본값 사용.
     */
    const params      = new URLSearchParams(window.location.search);
    const COMPLEX_CODE = params.get('complex') || 'ht-lamada';
    const PROGRAM_ID   = params.get('program') || '';   // 운영 시 실제 UUID 전달

    /**
     * 다음 회차 요일·시각 (정원 마감 안내용 텍스트)
     * 실제 운영 시 서버 응답으로 대체 가능.
     */
    const NEXT_CLASS_HINT = '다음 회차: 매주 월·수 오전 10시';

    // ── DOM 참조 ─────────────────────────────────────────────────
    const scheduleText  = document.getElementById('scheduleText');
    const scheduleSeats = document.getElementById('scheduleSeats');
    const statusBox     = document.getElementById('statusBox');
    const applyForm     = document.getElementById('applyForm');
    const inputName     = document.getElementById('inputName');
    const inputPhone    = document.getElementById('inputPhone');
    const termsCheck    = document.getElementById('termsCheck');
    const termsToggleBtn = document.getElementById('termsToggleBtn');
    const termsDetail   = document.getElementById('termsDetail');
    const submitBtn     = document.getElementById('submitBtn');
    const doneScreen    = document.getElementById('doneScreen');
    const doneDesc      = document.getElementById('doneDesc');

    // ── 상태 ─────────────────────────────────────────────────────
    let isFull      = false;   // 정원 마감 여부
    let isSubmitting = false;  // 중복 제출 방지

    // ── 유틸 ─────────────────────────────────────────────────────
    function showStatus(msg, type /* 'error'|'success'|'info' */) {
        statusBox.textContent = msg;
        statusBox.className   = `status-box ${type} show`;
    }
    function hideStatus() {
        statusBox.className = 'status-box';
        statusBox.textContent = '';
    }

    function formatPhone(raw) {
        const d = raw.replace(/\D/g, '');
        if (d.length <= 3)  return d;
        if (d.length <= 7)  return d.slice(0,3) + '-' + d.slice(3);
        return d.slice(0,3) + '-' + d.slice(3,7) + '-' + d.slice(7,11);
    }

    function extractLast4(phone) {
        const d = phone.replace(/\D/g, '');
        return d.slice(-4);
    }

    // 이름 + 전화 + 약관 모두 충족 시에만 버튼 활성화
    function updateSubmitState() {
        const nameOk  = inputName.value.trim().length >= 2;
        const phoneOk = inputPhone.value.replace(/\D/g, '').length >= 10;
        const agreeOk = termsCheck.checked;
        submitBtn.disabled = !(nameOk && phoneOk && agreeOk) || isFull || isSubmitting;
    }

    // ── 1. 일정 조회 ─────────────────────────────────────────────
    async function loadAvailability() {
        if (!PROGRAM_ID) {
            // program_id 없음 — 개발/테스트 모드 표시
            scheduleText.textContent  = '6/9(월) 10:00';
            scheduleSeats.textContent = '운영 준비 중';
            scheduleSeats.className   = 'schedule-seats';
            return;
        }

        const { ok, data, errorMsg } = await hotelApi.get(
            '/quick-class/availability',
            { complex_code: COMPLEX_CODE, program_id: PROGRAM_ID }
        );

        if (!ok) {
            scheduleText.textContent  = '일정 조회 실패';
            scheduleSeats.textContent = errorMsg;
            scheduleSeats.className   = 'schedule-seats';
            return;
        }

        const { capacity, available, is_full } = data;
        isFull = !!is_full;

        // 일정 텍스트 (서버에서 날짜 정보를 주면 사용, 없으면 기본값)
        scheduleText.textContent = data.schedule_label || '매주 월·수 10:00';

        if (isFull) {
            scheduleSeats.textContent = '이번 회차 마감';
            scheduleSeats.className   = 'schedule-seats full';
            showStatus(
                `이번 회차는 정원이 마감되었습니다.\n${NEXT_CLASS_HINT}`,
                'info'
            );
            submitBtn.disabled = true;
        } else {
            // 잔여석만 표시 — 현재 신청자 수는 표시하지 않음
            const few = available <= 3;
            scheduleSeats.textContent = `잔여 ${available}석`;
            scheduleSeats.className   = `schedule-seats ${few ? 'few' : 'available'}`;
        }
    }

    // ── 2. 토큰 있으면 이름/전화 자동 채움 ──────────────────────
    async function prefillFromToken() {
        const token = getHotelToken();
        if (!token) return;

        const { ok, data } = await hotelApi.get('/members/me', { token });
        if (!ok || !data?.member) return;

        const { name } = data.member;
        // 이름만 자동 채움 — 전화번호는 보안상 서버 미반환
        if (name && !inputName.value) {
            inputName.value = name;
            updateSubmitState();
        }
    }

    // ── 3. 신청 제출 ─────────────────────────────────────────────
    async function handleSubmit() {
        if (isSubmitting || isFull) return;
        hideStatus();

        const name  = inputName.value.trim();
        const phone = inputPhone.value.trim();

        // 클라이언트 측 검증
        if (name.length < 2) {
            showStatus('이름을 2자 이상 입력해 주세요.', 'error');
            inputName.focus();
            return;
        }
        const phoneDigits = phone.replace(/\D/g, '');
        if (phoneDigits.length < 10) {
            showStatus('올바른 휴대폰 번호를 입력해 주세요.', 'error');
            inputPhone.focus();
            return;
        }
        if (!termsCheck.checked) {
            showStatus('개인정보 수집·이용에 동의해 주세요.', 'error');
            return;
        }

        isSubmitting = true;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span>신청 중…';

        const body = {
            complex_code: COMPLEX_CODE,
            name,
            phone,
            phone_last4: extractLast4(phone),
        };
        if (PROGRAM_ID) body.program_id = PROGRAM_ID;

        // 토큰 있으면 member_token 추가
        const token = getHotelToken();
        if (token) body.member_token = token;

        const { ok, data, errorMsg } = await hotelApi.post('/quick-class/apply', body);

        isSubmitting = false;
        submitBtn.innerHTML = '신청하기';

        if (!ok) {
            // 409 is_full: 정원 마감 처리
            if (data?.is_full) {
                isFull = true;
                scheduleSeats.textContent = '이번 회차 마감';
                scheduleSeats.className   = 'schedule-seats full';
                showStatus(
                    `이번 회차는 방금 마감되었습니다.\n${NEXT_CLASS_HINT}`,
                    'info'
                );
            } else {
                showStatus(errorMsg || '신청 중 오류가 발생했습니다.', 'error');
                submitBtn.disabled = false;
            }
            return;
        }

        // ── 성공 → 완료 화면 ──────────────────────────────────
        applyForm.style.display  = 'none';
        const schedCard = document.querySelector('.schedule-card');
        if (schedCard) schedCard.style.display = 'none';
        statusBox.className = 'status-box';

        doneDesc.innerHTML =
            `클래스 당일 피트니스 센터로 오시면 됩니다.<br>` +
            `별도 확인 절차 없이 바로 입장하실 수 있습니다.`;
        doneScreen.classList.add('show');
    }

    // ── 이벤트 바인딩 ─────────────────────────────────────────────
    inputPhone.addEventListener('input', (e) => {
        const formatted = formatPhone(e.target.value);
        e.target.value  = formatted;
        updateSubmitState();
    });
    inputName.addEventListener('input', updateSubmitState);
    termsCheck.addEventListener('change', updateSubmitState);
    submitBtn.addEventListener('click', handleSubmit);

    // 약관 상세 토글
    termsToggleBtn.addEventListener('click', () => {
        const isOpen = termsDetail.style.display === 'block';
        termsDetail.style.display   = isOpen ? 'none' : 'block';
        termsToggleBtn.textContent  = isOpen ? '내용 보기' : '접기';
    });

    // ── 초기화 ────────────────────────────────────────────────────
    async function init() {
        await loadAvailability();
        await prefillFromToken();
        updateSubmitState();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}());
