/**
 * public/hotel/js/refresh-pt.js
 * 리프레시 PT 예약 페이지 스크립트
 *
 * 흐름:
 *   1. 페이지 로드 → GET /api/hotel/refresh-pt/instructors → 트레이너 카드 렌더링
 *   2. 날짜 그리드 렌더링 (오늘 ~ +7일)
 *   3. 트레이너 + 날짜 선택 → GET /api/hotel/refresh-pt/available-slots → 가능 슬롯만 표시
 *   4. localStorage 토큰 있으면 이름 자동 채움
 *   5. 예약 버튼 클릭 → POST /api/hotel/refresh-pt/reserve
 *   6. 성공 → 완료 화면 (예약 확인 + 카카오 알림 안내)
 *
 * 설계 원칙:
 *   - 동/호 입력 없음
 *   - 혼잡도/타인 예약 정보 미표시
 *   - 이미 예약된 슬롯은 렌더링 자체를 하지 않음 (숨김 처리)
 *   - 결제는 카드 결제만 (payment_method='card')
 *   - 자동 리다이렉트 없음
 *
 * 단계: C-2 / 작성일: 2026-06-07
 *
 * 주의: 이 파일은 api-client.js 이후에 로드됩니다.
 */

'use strict';

(function () {

    // ── 설정 ────────────────────────────────────────────────────
    const params       = new URLSearchParams(window.location.search);
    const COMPLEX_CODE = params.get('complex') || 'ht-lamada';

    /** 카드 결제 고정 (Phase 1) */
    const PAYMENT_METHOD = 'card';

    /** 날 이름 (KST 기준) */
    const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

    // ── DOM 참조 ─────────────────────────────────────────────────
    const instructorList     = document.getElementById('instructorList');
    const dateGrid           = document.getElementById('dateGrid');
    const slotGrid           = document.getElementById('slotGrid');
    const slotHint           = document.getElementById('slotHint');
    const selectionSummary   = document.getElementById('selectionSummary');
    const inputName          = document.getElementById('inputName');
    const inputPhone         = document.getElementById('inputPhone');
    const termsCheck         = document.getElementById('termsCheck');
    const termsToggleBtn     = document.getElementById('termsToggleBtn');
    const termsDetail        = document.getElementById('termsDetail');
    const submitBtn          = document.getElementById('submitBtn');
    const statusBox          = document.getElementById('statusBox');
    const formArea           = document.getElementById('formArea');
    const doneScreen         = document.getElementById('doneScreen');
    const doneInstructor     = document.getElementById('doneInstructor');
    const doneSchedule       = document.getElementById('doneSchedule');

    // ── 선택 상태 ─────────────────────────────────────────────────
    let selectedInstructor = null;   // { id, name, specialty }
    let selectedDate       = null;   // 'YYYY-MM-DD'
    let selectedSlot       = null;   // 'HH:MM' (KST 시각 문자열)
    let isSubmitting       = false;

    // ── 유틸 ─────────────────────────────────────────────────────
    function showStatus(msg, type /* 'error'|'success'|'info' */) {
        statusBox.textContent = msg;
        statusBox.className   = `status-box ${type} show`;
    }
    function hideStatus() {
        statusBox.className   = 'status-box';
        statusBox.textContent = '';
    }

    function formatPhone(raw) {
        const d = raw.replace(/\D/g, '');
        if (d.length <= 3)  return d;
        if (d.length <= 7)  return d.slice(0,3) + '-' + d.slice(3);
        return d.slice(0,3) + '-' + d.slice(3,7) + '-' + d.slice(7,11);
    }

    /**
     * 'YYYY-MM-DD' + 'HH:MM' → ISO8601 KST (UTC+9)
     * 예) '2026-06-09' + '10:00' → '2026-06-09T10:00:00+09:00'
     */
    function toIso8601Kst(datePart, timePart) {
        return `${datePart}T${timePart}:00+09:00`;
    }

    /**
     * Date 객체 → 'YYYY-MM-DD' (로컬 타임 기준)
     */
    function toYmd(date) {
        const y  = date.getFullYear();
        const m  = String(date.getMonth() + 1).padStart(2, '0');
        const d  = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * 'YYYY-MM-DD' → 한국어 날짜 표시 문자열
     * 예) '2026-06-09' → '6/9(월)'
     */
    function formatDateKo(ymd) {
        const [y, m, d] = ymd.split('-').map(Number);
        const dt  = new Date(y, m - 1, d);
        const day = DAY_NAMES[dt.getDay()];
        return `${m}/${d}(${day})`;
    }

    /**
     * 버튼 활성화 조건:
     *   트레이너 + 날짜 + 슬롯 + 이름 + 전화 + 약관
     */
    function updateSubmitState() {
        const nameOk  = inputName.value.trim().length >= 2;
        const phoneOk = inputPhone.value.replace(/\D/g, '').length >= 10;
        const agreeOk = termsCheck.checked;
        const allSelected = selectedInstructor && selectedDate && selectedSlot;
        submitBtn.disabled = !(allSelected && nameOk && phoneOk && agreeOk) || isSubmitting;
    }

    /**
     * 선택 요약 배지 업데이트
     */
    function updateSelectionSummary() {
        if (!selectedInstructor && !selectedDate && !selectedSlot) {
            selectionSummary.classList.remove('show');
            return;
        }
        const parts = [];
        if (selectedInstructor) parts.push(`👤 ${selectedInstructor.name} 트레이너`);
        if (selectedDate)       parts.push(`📅 ${formatDateKo(selectedDate)}`);
        if (selectedSlot)       parts.push(`🕐 ${selectedSlot}`);
        selectionSummary.textContent = parts.join('  ·  ');
        selectionSummary.classList.add('show');
    }

    // ── 1. 트레이너 목록 불러오기 ────────────────────────────────
    async function loadInstructors() {
        instructorList.innerHTML = '<p class="instructor-placeholder">트레이너 정보를 불러오는 중…</p>';

        const { ok, data, errorMsg } = await hotelApi.get(
            '/refresh-pt/instructors',
            { complex_code: COMPLEX_CODE }
        );

        if (!ok) {
            instructorList.innerHTML =
                `<p class="instructor-placeholder">트레이너 정보를 불러올 수 없습니다.<br>${errorMsg}</p>`;
            return;
        }

        const instructors = data?.instructors || [];

        if (!instructors.length) {
            instructorList.innerHTML =
                '<p class="instructor-placeholder">등록된 트레이너가 없습니다.</p>';
            return;
        }

        // 트레이너 카드 렌더링
        instructorList.innerHTML = '';
        instructors.forEach(inst => {
            const card = document.createElement('div');
            card.className   = 'instructor-card';
            card.dataset.id  = inst.id;
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-label', `${inst.name} 트레이너 선택`);

            // 사진 영역: photo_url 있으면 <img>, 없으면 이모지 fallback
            const photoHtml = inst.photo_url
                ? `<img src="${escapeAttr(inst.photo_url)}" alt="${escapeHtml(inst.name)} 트레이너 사진" loading="lazy">`
                : '🧑‍💪';

            card.innerHTML =
                `<div class="instructor-photo">${photoHtml}</div>` +
                `<p class="instructor-name">${escapeHtml(inst.name)}</p>` +
                `<p class="instructor-specialty">${escapeHtml(inst.specialty || '')}</p>`;

            card.addEventListener('click', () => selectInstructor(inst, card));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectInstructor(inst, card);
                }
            });

            instructorList.appendChild(card);
        });
    }

    function selectInstructor(inst, card) {
        // 이전 선택 해제
        instructorList.querySelectorAll('.instructor-card').forEach(c => {
            c.classList.remove('selected');
            c.setAttribute('aria-pressed', 'false');
        });
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');

        selectedInstructor = { id: inst.id, name: inst.name, specialty: inst.specialty };
        selectedSlot = null;   // 슬롯 초기화

        updateSelectionSummary();
        updateSubmitState();

        // 날짜가 이미 선택돼 있으면 즉시 슬롯 로드
        if (selectedDate) {
            loadSlots(inst.id, selectedDate);
        } else {
            resetSlotGrid('날짜를 선택해 주세요.');
        }
    }

    // ── 2. 날짜 그리드 렌더링 (오늘 ~ +7일) ─────────────────────
    function renderDateGrid() {
        dateGrid.innerHTML = '';
        const today = new Date();

        for (let i = 0; i < 8; i++) {
            const dt  = new Date(today);
            dt.setDate(today.getDate() + i);

            const ymd  = toYmd(dt);
            const day  = DAY_NAMES[dt.getDay()];
            const mon  = dt.getMonth() + 1;
            const dateNum = dt.getDate();

            const btn = document.createElement('button');
            btn.type        = 'button';
            btn.className   = 'date-btn';
            btn.dataset.ymd = ymd;
            btn.setAttribute('aria-label', `${mon}월 ${dateNum}일 ${day}요일 선택`);
            btn.innerHTML =
                `<span class="date-btn-day">${i === 0 ? '오늘' : day}</span>` +
                `<span class="date-btn-num">${dateNum}</span>` +
                `<span class="date-btn-month">${mon}월</span>`;

            btn.addEventListener('click', () => selectDate(ymd, btn));
            dateGrid.appendChild(btn);
        }
    }

    function selectDate(ymd, btn) {
        dateGrid.querySelectorAll('.date-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        selectedDate = ymd;
        selectedSlot = null;

        updateSelectionSummary();
        updateSubmitState();

        if (selectedInstructor) {
            loadSlots(selectedInstructor.id, ymd);
        } else {
            resetSlotGrid('트레이너를 먼저 선택해 주세요.');
        }
    }

    // ── 3. 가능 슬롯 조회 ────────────────────────────────────────
    async function loadSlots(instructorId, date) {
        slotGrid.innerHTML = '<p class="slot-empty">가능한 시간을 불러오는 중…</p>';
        slotHint.style.display = 'none';

        const { ok, data, errorMsg } = await hotelApi.get(
            '/refresh-pt/available-slots',
            {
                complex_code:   COMPLEX_CODE,
                instructor_id:  instructorId,
                date,           // 'YYYY-MM-DD'
            }
        );

        slotHint.style.display = '';

        if (!ok) {
            slotGrid.innerHTML =
                `<p class="slot-empty">시간 조회 실패: ${errorMsg}</p>`;
            return;
        }

        // 서버가 반환하는 가능한 슬롯 목록
        // 응답 형식: { available_slots: ['09:00','09:45',...] }
        // 이미 예약된 슬롯은 서버에서 제외하여 반환 → 클라이언트는 그냥 렌더링
        const slots = data?.available_slots || [];

        if (!slots.length) {
            slotGrid.innerHTML =
                '<p class="slot-empty">선택하신 날짜에 가능한 시간이 없습니다.</p>';
            return;
        }

        slotGrid.innerHTML = '';
        slots.forEach(time => {
            const btn = document.createElement('button');
            btn.type      = 'button';
            btn.className = 'slot-btn';
            btn.textContent = time;
            btn.dataset.time = time;
            btn.setAttribute('aria-label', `${time} 슬롯 선택`);

            btn.addEventListener('click', () => selectSlot(time, btn));
            slotGrid.appendChild(btn);
        });
    }

    function selectSlot(time, btn) {
        slotGrid.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        selectedSlot = time;
        updateSelectionSummary();
        updateSubmitState();
    }

    function resetSlotGrid(msg) {
        selectedSlot = null;
        slotGrid.innerHTML = `<p class="slot-empty">${escapeHtml(msg)}</p>`;
        updateSelectionSummary();
        updateSubmitState();
    }

    // ── 4. 토큰 있으면 이름 자동 채움 ───────────────────────────
    async function prefillFromToken() {
        const token = getHotelToken();
        if (!token) return;

        const { ok, data } = await hotelApi.get('/members/me', { token });
        if (!ok || !data?.member) return;

        const { name } = data.member;
        // 이름만 자동 채움
        if (name && !inputName.value) {
            inputName.value = name;
            updateSubmitState();
        }
    }

    // ── 5. 예약 제출 ─────────────────────────────────────────────
    async function handleReserve() {
        if (isSubmitting) return;
        hideStatus();

        // 선택 검증
        if (!selectedInstructor) {
            showStatus('트레이너를 선택해 주세요.', 'error');
            return;
        }
        if (!selectedDate) {
            showStatus('날짜를 선택해 주세요.', 'error');
            return;
        }
        if (!selectedSlot) {
            showStatus('예약 시간을 선택해 주세요.', 'error');
            return;
        }

        const name  = inputName.value.trim();
        const phone = inputPhone.value.trim();

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
        submitBtn.innerHTML = '<span class="spinner"></span>예약 중…';

        // KST ISO8601 timestamp 생성
        const scheduledAt = toIso8601Kst(selectedDate, selectedSlot);

        const body = {
            complex_code:   COMPLEX_CODE,
            instructor_id:  selectedInstructor.id,
            scheduled_at:   scheduledAt,
            name,
            phone,
            payment_method: PAYMENT_METHOD,
        };

        // 토큰 있으면 첨부
        const token = getHotelToken();
        if (token) body.member_token = token;

        const { ok, data, errorMsg } = await hotelApi.post('/refresh-pt/reserve', body);

        isSubmitting = false;
        submitBtn.innerHTML = '예약하기';

        if (!ok) {
            showStatus(errorMsg || '예약 중 오류가 발생했습니다.', 'error');
            submitBtn.disabled = false;
            return;
        }

        // ── 성공 → 완료 화면 ──────────────────────────────────
        const instrName = selectedInstructor.name;
        const schedStr  = `${formatDateKo(selectedDate)} ${selectedSlot}`;

        doneInstructor.textContent = `${instrName} 트레이너`;
        doneSchedule.textContent   = schedStr;

        formArea.style.display = 'none';
        doneScreen.classList.add('show');
    }

    // ── XSS 방어 유틸 ────────────────────────────────────────────
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function escapeAttr(str) {
        return escapeHtml(str).replace(/\//g, '&#47;');
    }

    // ── 이벤트 바인딩 ─────────────────────────────────────────────
    inputPhone.addEventListener('input', (e) => {
        e.target.value = formatPhone(e.target.value);
        updateSubmitState();
    });
    inputName.addEventListener('input', updateSubmitState);
    termsCheck.addEventListener('change', updateSubmitState);
    submitBtn.addEventListener('click', handleReserve);

    // 약관 상세 토글
    termsToggleBtn.addEventListener('click', () => {
        const isOpen = termsDetail.style.display === 'block';
        termsDetail.style.display  = isOpen ? 'none' : 'block';
        termsToggleBtn.textContent = isOpen ? '내용 보기' : '접기';
    });

    // ── 초기화 ────────────────────────────────────────────────────
    async function init() {
        renderDateGrid();
        await loadInstructors();
        await prefillFromToken();
        updateSubmitState();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}());
