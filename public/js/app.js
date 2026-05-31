/**
 * 입주민 앱 메인 스크립트
 */
// ── 상태 관리 ────────────────────────────────────────────────────────────────
const State = {
    complex: null,
    programs: [],
    selectedProgram: null,
    selectedTime: null,
    formData: {},
    signaturePad: null,
};

// ── 초기화 ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // URL에서 단지 코드 읽기
        const params = new URLSearchParams(window.location.search);
        let complexCode = params.get('complex') || '';

        // 단지 정보 로드
        let res;
        if (complexCode) {
            res = await API.complexes.getByCode(complexCode);
        } else {
            // complex 파라미터 없으면 첫 번째 활성 단지 자동 선택
            const listRes = await fetch('/api/complexes');
            const listData = await listRes.json();
            const firstActive = (listData.data || []).find(c => c.is_active);
            if (!firstActive) throw new Error('등록된 단지가 없습니다.');
            res = { data: firstActive };
        }
        State.complex = res.data;

        // 브랜딩 적용
        applyBranding(State.complex);

        // 병렬 데이터 로드
        await Promise.all([
            loadPrograms(),
            loadNotices(),
            loadPublicInquiries()
        ]);

        // 이벤트 설정
        setupEvents();
        setTodayDate();

        // 로딩 화면 숨기기
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'block';

    } catch (e) {
        console.error('Init error:', e);
        document.getElementById('loadingScreen').innerHTML = `
            <div class="error-screen">
                <i class="fas fa-exclamation-triangle"></i>
                <p>시스템을 불러오지 못했습니다</p>
                <small>${e.message}</small>
                <button onclick="location.reload()" class="btn-primary" style="margin-top:16px">새로고침</button>
            </div>`;
    }
});

// ── 브랜딩 적용 ──────────────────────────────────────────────────────────────
function applyBranding(complex) {
    if (!complex) return;
    document.title = `${complex.name} - 레슨 신청`;
    document.getElementById('complexName').textContent = complex.name;
    if (complex.primary_color) {
        document.documentElement.style.setProperty('--color-primary', complex.primary_color);
    }
}

// ── 프로그램 로드 ─────────────────────────────────────────────────────────────
async function loadPrograms() {
    const container = document.getElementById('programCards');
    try {
        // includeInactive=true: 비활성 프로그램도 포함해서 가져옴
        // (신규접수는 서버/클라이언트 양쪽에서 차단, 해지 신청용 표시는 유지)
        const res = await API.programs.list({ complexCode: State.complex.code, includeInactive: 'true' });
        const all = res.data || [];

        // show_on_inactive=false 인 비활성 프로그램은 입주민 페이지에서 숨김
        // null/undefined/true 모두 표시, 명시적 false일 때만 숨김
        State.programs = all.filter(p => p.is_active || p.show_on_inactive === true || p.show_on_inactive === null || p.show_on_inactive === undefined);

        if (!State.programs.length) {
            container.innerHTML = '<p class="empty-hint">등록된 프로그램이 없습니다.</p>';
            return;
        }

        container.innerHTML = State.programs.map(p => {
            const inactive = !p.is_active;
            return `
            <div class="program-card ${inactive ? 'program-card-inactive' : ''}"
                 data-id="${p.id}"
                 onclick="${inactive ? '' : `selectProgram('${p.id}')`}"
                 style="${inactive ? 'cursor:default;opacity:.75' : ''}">
                <div class="program-card-header">
                    <span class="program-type-badge type-${p.type}">${typeLabel(p.type)}</span>
                    ${inactive
                        ? '<span class="program-badge-inactive">신규접수 종료</span>'
                        : `<span class="program-price">₩${p.price.toLocaleString()}/월</span>`}
                </div>
                <div class="program-name">${p.name}</div>
                <div class="program-meta">
                    <span><i class="fas fa-calendar-week"></i> ${p.days || '-'}</span>
                    <span><i class="fas fa-users"></i> 정원 ${p.capacity}명</span>
                </div>
                ${p.description ? `<div class="program-desc">${p.description}</div>` : ''}
                ${inactive ? '<div class="program-inactive-notice"><i class="fas fa-info-circle"></i> 현재 신규 접수가 종료된 프로그램입니다. 해지 신청은 하단 버튼을 이용해주세요.</div>' : ''}
            </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = '<p class="error-hint">프로그램 로드 실패</p>';
    }
}

function typeLabel(type) {
    return { group: '그룹', duet: '듀엣', personal: '개인' }[type] || type;
}

// ── 프로그램 선택 ─────────────────────────────────────────────────────────────
async function selectProgram(programId) {
    State.selectedProgram = State.programs.find(p => p.id === programId);
    State.selectedTime = null;

    // UI 업데이트
    document.querySelectorAll('.program-card').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.program-card[data-id="${programId}"]`)?.classList.add('selected');

    const timeSlotGroup = document.getElementById('timeSlotGroup');
    const customTimeGroup = document.getElementById('customTimeGroup');
    const timeBtns = document.getElementById('timeSlotButtons');

    if (!State.selectedProgram) return;
    const p = State.selectedProgram;

    if (p.type === 'group' && p.time_slots && p.time_slots.length > 0) {
        // 시간대 정원 정보 로드
        timeSlotGroup.style.display = 'block';
        customTimeGroup.style.display = 'none';
        timeBtns.innerHTML = '<div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div>';

        try {
            const cap = await API.programs.capacity(p.id);
            timeBtns.innerHTML = cap.data.map(slot => `
                <button type="button"
                    class="timeslot-btn ${slot.isFull ? 'full' : ''}"
                    data-slot="${slot.slot}"
                    onclick="selectTimeSlot('${slot.slot}', ${slot.isFull})"
                    ${slot.isFull ? '' : ''}>
                    ${slot.slot}
                    <span class="slot-count">${slot.approved}/${slot.capacity}</span>
                    ${slot.isFull ? '<span class="slot-waiting">대기 가능</span>' : '<span class="slot-avail">신청 가능</span>'}
                </button>
            `).join('');
        } catch (e) {
            timeBtns.innerHTML = p.time_slots.map(slot => `
                <button type="button" class="timeslot-btn" data-slot="${slot}" onclick="selectTimeSlot('${slot}', false)">
                    ${slot}
                </button>
            `).join('');
        }
    } else if (p.type === 'personal' || p.type === 'duet') {
        timeSlotGroup.style.display = 'none';
        customTimeGroup.style.display = 'block';
        document.getElementById('customTime').value = '';
    } else {
        timeSlotGroup.style.display = 'none';
        customTimeGroup.style.display = 'none';
    }
}

// ── 시간대 선택 ───────────────────────────────────────────────────────────────
function selectTimeSlot(slot, isFull) {
    State.selectedTime = slot;
    document.querySelectorAll('.timeslot-btn').forEach(btn => btn.classList.remove('selected'));
    document.querySelector(`.timeslot-btn[data-slot="${slot}"]`)?.classList.add('selected');
}

// ── 입력 확인 필드 일치 검사 ────────────────────────────────────────────────
function checkConfirmMatch(id1, id2, wrapId) {
    const v1   = (document.getElementById(id1)?.value  || '').trim();
    const v2   = (document.getElementById(id2)?.value  || '').trim();
    const inp2 = document.getElementById(id2);
    const wrap = document.getElementById(wrapId);
    if (!inp2 || !wrap) return;
    if (!v2) {
        inp2.classList.remove('field-mismatch', 'field-match');
        wrap.classList.remove('mismatch');
        return;
    }
    if (v1 === v2) {
        inp2.classList.remove('field-mismatch');
        inp2.classList.add('field-match');
        wrap.classList.remove('mismatch');
    } else {
        inp2.classList.remove('field-match');
        inp2.classList.add('field-mismatch');
        wrap.classList.add('mismatch');
    }
}

function allConfirmFieldsMatch() {
    const pairs = [
        { id1: 'dong',  id2: 'dongConfirm',  label: '동' },
        { id1: 'ho',    id2: 'hoConfirm',    label: '호수' },
        { id1: 'phone', id2: 'phoneConfirm', label: '전화번호' },
    ];
    for (const { id1, id2, label } of pairs) {
        const v1 = (document.getElementById(id1)?.value  || '').trim();
        const v2 = (document.getElementById(id2)?.value  || '').trim();
        if (!v2) {
            alert(`${label} 확인란을 입력해 주세요.\n\n관리비 부과 및 SMS 발송을 위하여 반드시 정확하게 입력해 주세요.`);
            document.getElementById(id2)?.focus();
            return false;
        }
        if (v1 !== v2) {
            alert(`${label}이(가) 일치하지 않습니다.\n\n관리비 부과 및 SMS 발송을 위하여 반드시 정확하게 입력해 주세요.`);
            document.getElementById(id2)?.focus();
            return false;
        }
    }
    return true;
}

// ── 이벤트 설정 ──────────────────────────────────────────────────────────────
function setupEvents() {
    // 신청서 제출
    document.getElementById('applicationForm').addEventListener('submit', handleFormSubmit);

    // 전화번호 포맷 (원본 + 확인 필드 모두)
    document.getElementById('phone').addEventListener('input', formatPhone);
    document.getElementById('cancelPhone').addEventListener('input', e => {
        formatPhone(e);
        resetCancelLookup();
    });
    document.getElementById('phoneConfirm').addEventListener('input', e => {
        formatPhone(e);
        checkConfirmMatch('phone', 'phoneConfirm', 'phoneConfirmWrap');
    });

    // 문의 제출
    document.getElementById('inquiryForm').addEventListener('submit', handleInquirySubmit);
}

function formatPhone(e) {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length <= 3) e.target.value = v;
    else if (v.length <= 7) e.target.value = `${v.slice(0,3)}-${v.slice(3)}`;
    else e.target.value = `${v.slice(0,3)}-${v.slice(3,7)}-${v.slice(7,11)}`;
}

// ── 숫자 전용 필터 (동/호수 입력 시 숫자만 허용) ─────────────────────────────
function filterNumericOnly(input) {
    const prev = input.value;
    input.value = prev.replace(/[^0-9]/g, '');
}

function setTodayDate() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const dd   = String(now.getDate()).padStart(2, '0');
    const today = `${yyyy}-${mm}-${dd}`;
    // hidden input (서버 전송용)
    const el = document.getElementById('signatureDate');
    if (el) el.value = today;
    // 표시용 텍스트
    const display = document.getElementById('signatureDateDisplay');
    if (display) display.textContent = `${yyyy}년 ${mm}월 ${dd}일`;
}

// ── Step 1: 폼 제출 → Step 2 이동 ────────────────────────────────────────────
function handleFormSubmit(e) {
    e.preventDefault();

    const dong = document.getElementById('dong').value.trim();
    const ho   = document.getElementById('ho').value.trim();
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const agreement = document.getElementById('agreement').checked;

    if (!dong || !ho || !name || !phone) { showToast('모든 필수 항목을 입력해주세요', 'error'); return; }

    // 동/호수/전화번호 확인 필드 일치 검사
    if (!allConfirmFieldsMatch()) return;

    if (!State.selectedProgram) { showToast('프로그램을 선택해주세요', 'error'); return; }

    const isGroupLesson = State.selectedProgram.type === 'group';
    const preferredTime = isGroupLesson ? State.selectedTime : document.getElementById('customTime').value.trim();

    if (isGroupLesson && !State.selectedTime) { showToast('희망 시간대를 선택해주세요', 'error'); return; }
    if (!isGroupLesson && !preferredTime)    { showToast('희망 시간을 입력해주세요', 'error'); return; }
    if (!agreement) { showToast('개인정보 수집 동의가 필요합니다', 'error'); return; }

    State.formData = { dong, ho, name, phone, program: State.selectedProgram, preferredTime };
    goToStep2();
}

// ── Step 2 이동 ───────────────────────────────────────────────────────────────
function goToStep2() {
    document.getElementById('page1').style.display = 'none';
    document.getElementById('page2').style.display = 'block';

    document.getElementById('displayDongHo').textContent = `${State.formData.dong} ${State.formData.ho}`;
    document.getElementById('displayName').textContent = State.formData.name;
    document.getElementById('displayPhone').textContent = State.formData.phone;
    document.getElementById('displayProgram').textContent = State.formData.program.name;
    document.getElementById('displayTime').textContent = State.formData.preferredTime;

    initSignaturePad();
    window.scrollTo(0, 0);
}

function goBack() {
    document.getElementById('page2').style.display = 'none';
    document.getElementById('page1').style.display = 'block';
    window.scrollTo(0, 0);
}

// ── 서명 패드 ─────────────────────────────────────────────────────────────────
function initSignaturePad() {
    const canvas = document.getElementById('signatureCanvas');
    State.signaturePad = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
    resizeCanvas();
}

function resizeCanvas() {
    const canvas = document.getElementById('signatureCanvas');
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    if (State.signaturePad) State.signaturePad.clear();
}

function clearSignature() {
    if (State.signaturePad) State.signaturePad.clear();
}

// ── 최종 신청 제출 ────────────────────────────────────────────────────────────
async function submitApplication() {
    const termsAgreement = document.getElementById('termsAgreement').checked;
    const signatureName  = document.getElementById('signatureName').value.trim();
    const signatureDate  = document.getElementById('signatureDate').value;

    if (!termsAgreement) { showToast('이용약관에 동의해주세요', 'error'); return; }
    if (!signatureName)  { showToast('서명자 성명을 입력해주세요', 'error'); return; }
    if (!State.signaturePad || State.signaturePad.isEmpty()) { showToast('서명란에 서명해주세요', 'error'); return; }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...';

    try {
        const signatureData = State.signaturePad.toDataURL();
        const payload = {
            complex_id:      State.complex.id,
            dong:            State.formData.dong,
            ho:              State.formData.ho,
            name:            State.formData.name,
            phone:           State.formData.phone,
            program_id:      State.formData.program.id,
            program_name:    State.formData.program.name,
            preferred_time:  State.formData.preferredTime,
            signature_name:  signatureName,
            signature_data:  signatureData,
            signature_date:  signatureDate,
            agreement:       true,
            terms_agreement: true
        };

        const result = await API.applications.create(payload);

        // 성공 화면
        document.getElementById('page2').style.display = 'none';
        document.getElementById('mainContainer').innerHTML = `
            <div class="success-screen">
                <div class="success-icon"><i class="fas fa-check-circle"></i></div>
                <h2>${result.status === 'waiting' ? '대기 신청 완료!' : '신청 완료!'}</h2>
                ${result.status === 'waiting'
                    ? `<p>정원이 꽉 찼습니다.<br><strong>${result.waitingOrder}번째 대기</strong>로 등록되었습니다.<br>자리가 나면 순서대로 승인됩니다.</p>`
                    : `<p>레슨 신청이 <strong>자동 승인</strong>되었습니다!<br>다음 달 1일부터 수업이 시작됩니다.</p>`
                }
                <div class="success-detail">
                    <p>${State.formData.dong} ${State.formData.ho} | ${State.formData.name}</p>
                    <p>${State.formData.program.name} | ${State.formData.preferredTime}</p>
                </div>
                <button class="btn-primary" onclick="location.reload()">
                    <i class="fas fa-home"></i> 처음으로
                </button>
            </div>`;
    } catch (e) {
        if (e.message.includes('이미')) {
            showToast('이미 해당 프로그램에 신청하셨습니다', 'error');
        } else {
            showToast('신청 중 오류가 발생했습니다: ' + e.message, 'error');
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> 신청 완료';
    }
}

// ── 공지사항 로드 ─────────────────────────────────────────────────────────────
async function loadNotices() {
    try {
        const res = await API.notices.list({ complexCode: State.complex.code });
        const notices = res.data || [];
        const section = document.getElementById('noticesSection');
        const container = document.getElementById('noticesContainer');

        if (!notices.length) return;

        section.style.display = 'block';
        container.innerHTML = notices.map(n => `
            <div class="notice-item ${n.is_pinned ? 'pinned' : ''}">
                ${n.is_pinned ? '<span class="pin-badge"><i class="fas fa-thumbtack"></i> 중요</span>' : ''}
                <h4>${n.title}</h4>
                <p>${n.content.replace(/\n/g, '<br>')}</p>
                <small><i class="fas fa-clock"></i> ${formatDate(n.created_at)}</small>
            </div>
        `).join('');
    } catch (e) { console.error('Notices load error:', e); }
}

// ── 공개 문의 로드 ────────────────────────────────────────────────────────────
async function loadPublicInquiries() {
    try {
        const res = await API.inquiries.list({ complexCode: State.complex.code });
        const list = res.data || [];
        const container = document.getElementById('inquiryList');

        if (!list.length) {
            container.innerHTML = '<p class="empty-hint">등록된 문의가 없습니다.</p>';
            return;
        }

        container.innerHTML = list.map(q => `
            <div class="inquiry-item">
                <div class="inquiry-header">
                    <strong>${q.title}</strong>
                    <span>${q.name.replace(/.$/, 'x')}</span>
                    <small>${formatDate(q.created_at)}</small>
                </div>
                <div class="inquiry-body">${q.content}</div>
                ${q.answer ? `<div class="inquiry-answer"><i class="fas fa-reply"></i> <strong>답변:</strong> ${q.answer}</div>` : '<div class="inquiry-pending">답변 대기중</div>'}
            </div>
        `).join('');
    } catch (e) { console.error('Inquiries load error:', e); }
}

function toggleInquiryList() {
    const list = document.getElementById('inquiryList');
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
}

// ── 문의 제출 ─────────────────────────────────────────────────────────────────
async function handleInquirySubmit(e) {
    e.preventDefault();
    const name  = document.getElementById('inquiryName').value.trim();
    const title = document.getElementById('inquiryTitle').value.trim();
    const content = document.getElementById('inquiryContent').value.trim();
    if (!name || !title || !content) { showToast('이름, 제목, 내용은 필수입니다', 'error'); return; }

    try {
        await API.inquiries.create({
            complex_id: State.complex.id,
            dong: document.getElementById('inquiryDong').value.trim(),
            ho:   document.getElementById('inquiryHo').value.trim(),
            name, title, content,
            is_public: document.getElementById('inquiryPublic').checked
        });
        showToast('문의가 등록되었습니다!', 'success');
        e.target.reset();
        loadPublicInquiries();
    } catch (err) {
        showToast('문의 등록 실패: ' + err.message, 'error');
    }
}

// ── 내 신청 조회 ──────────────────────────────────────────────────────────────
async function searchMyApplication() {
    const dong   = document.getElementById('searchDong').value.trim();
    const ho     = document.getElementById('searchHo').value.trim();
    const phone4 = document.getElementById('searchPhone4').value.trim();
    const result = document.getElementById('myAppResult');

    if (!dong || !ho || !phone4) { showToast('동, 호수, 전화번호 뒷 4자리를 모두 입력하세요', 'error'); return; }

    result.innerHTML = '<div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await API.applications.my({
            complexCode: State.complex.code,
            dong, ho, phone4
        });
        const apps = res.data || [];

        if (!apps.length) {
            result.innerHTML = '<p class="empty-hint">신청 내역이 없습니다.</p>';
            return;
        }

        result.innerHTML = apps.map((a, i) => `
            <div class="my-app-card">
                <div class="my-app-header">
                    <span class="status-badge status-${a.status}">${statusLabel(a.status)}</span>
                    <small>${formatDate(a.created_at)}</small>
                </div>
                <p><strong>${a.program_name}</strong></p>
                <p><small>${a.preferred_time || ''}</small></p>
                ${a.status === 'waiting' ? `<p class="waiting-order"><i class="fas fa-clock"></i> ${a.waiting_order}번째 대기</p>` : ''}
                <p class="masked-info">${a.dong} ${a.ho} | ${a.name}</p>
            </div>
        `).join('');
    } catch (e) {
        result.innerHTML = `<p class="error-hint">조회 실패: ${e.message}</p>`;
    }
}

// ── 해지 신청 ─────────────────────────────────────────────────────────────────

// 내부 상태: 조회된 수강 프로그램 목록
let _cancelLookupResult = [];

// 조회 결과 리셋 (입력 변경 시)
function resetCancelLookup() {
    _cancelLookupResult = [];
    document.getElementById('cancelStep2').style.display = 'none';
    const msg = document.getElementById('cancelLookupMsg');
    msg.style.display = 'none';
    msg.textContent = '';
    const sel = document.getElementById('cancelProgram');
    if (sel) sel.innerHTML = '<option value="">-- 해지할 프로그램 선택 --</option>';
    document.getElementById('cancelReason').value = '';
}

// 폼 전체 초기화
function resetCancelForm() {
    document.getElementById('cancelDong').value  = '';
    document.getElementById('cancelHo').value    = '';
    document.getElementById('cancelPhone').value = '';
    resetCancelLookup();
}

// STEP 1: 수강 중인 프로그램 조회
async function lookupCancelPrograms() {
    const dong  = document.getElementById('cancelDong').value.trim();
    const ho    = document.getElementById('cancelHo').value.trim();
    const phone = document.getElementById('cancelPhone').value.trim();

    if (!dong || !ho) {
        showToast('동과 호수를 입력하세요', 'error');
        return;
    }
    if (!phone) {
        showToast('전화번호를 입력하세요', 'error');
        return;
    }

    const btn = document.getElementById('cancelLookupBtn');
    const msg = document.getElementById('cancelLookupMsg');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...';
    msg.style.display = 'none';

    try {
        const complexCode = State.complex?.code || '';
        const params = new URLSearchParams({ complexCode, dong, ho, phone });
        const res  = await fetch(`/api/cancellations/lookup-programs?${params}`);
        const json = await res.json();

        if (!json.success) throw new Error(json.error || '조회 실패');

        const list = json.data || [];
        _cancelLookupResult = list;

        if (!list.length) {
            msg.style.display  = 'block';
            msg.style.color    = '#dc2626';
            msg.innerHTML = `<i class="fas fa-exclamation-circle"></i> 해당 동/호수에 수강 중인 프로그램을 찾을 수 없습니다.<br><small style="color:#888">입력 정보를 확인하거나 관리사무소에 문의하세요.</small>`;
            document.getElementById('cancelStep2').style.display = 'none';
            return;
        }

        // 이미 해지 접수된 건만 있는 경우
        const available = list.filter(p => !p.already_cancelled);
        if (!available.length) {
            msg.style.display = 'block';
            msg.style.color   = '#d97706';
            msg.innerHTML = `<i class="fas fa-info-circle"></i> 모든 수강 프로그램이 이미 해지 신청 접수된 상태입니다.`;
            document.getElementById('cancelStep2').style.display = 'none';
            return;
        }

        msg.style.display = 'none';

        // 본인 정보 표시
        const person = list[0];
        const infoEl = document.getElementById('cancelPersonInfo');
        infoEl.innerHTML = `
            <span style="font-weight:700;color:#111">${person.name || '?'}</span>
            <span style="color:#6b7280;margin:0 6px">|</span>
            <span>${dong}동 ${ho}호</span>
            <span style="color:#6b7280;margin:0 6px">|</span>
            <span>${person.phone || phone}</span>
            <span style="display:block;margin-top:4px;font-size:.78rem;color:#059669">
                <i class="fas fa-check-circle"></i> 수강 정보 확인 완료 — 수강 중인 프로그램 ${list.length}개
            </span>`;

        // 드롭다운 채우기
        const sel = document.getElementById('cancelProgram');
        sel.innerHTML = '<option value="">-- 해지할 프로그램 선택 --</option>';
        list.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.application_id;   // application_id를 value로
            opt.dataset.programName   = p.program_name;
            opt.dataset.preferredTime = p.preferred_time || '';
            opt.dataset.applicationId = p.application_id;
            opt.dataset.monthlyFee    = p.monthly_fee != null ? String(p.monthly_fee) : '';
            const timeLabel = p.preferred_time ? ` (${p.preferred_time})` : '';
            if (p.already_cancelled) {
                opt.textContent = `${p.program_name}${timeLabel} — 이미 해지 접수됨`;
                opt.disabled    = true;
                opt.style.color = '#9ca3af';
            } else {
                opt.textContent = `${p.program_name}${timeLabel}`;
            }
            sel.appendChild(opt);
        });

        // 프로그램 선택 시 월 수강료 표시
        sel.onchange = () => _onCancelProgramChange();

        // 1개뿐이고 해지 가능하면 자동 선택
        if (available.length === 1) {
            const onlyOpt = Array.from(sel.options).find(o => !o.disabled && o.value);
            if (onlyOpt) { onlyOpt.selected = true; _onCancelProgramChange(); }
        }

        document.getElementById('cancelStep2').style.display = 'block';
        document.getElementById('cancelStep2').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch(e) {
        msg.style.display = 'block';
        msg.style.color   = '#dc2626';
        msg.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 조회 오류: ${e.message}`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-search"></i> 수강 중인 프로그램 조회';
    }
}

// 프로그램 선택 변경 시 수강료 미리보기 업데이트
function _onCancelProgramChange() {
    const sel = document.getElementById('cancelProgram');
    const feeEl = document.getElementById('cancelFeePreview');
    if (!feeEl) return;
    if (!sel.value) {
        feeEl.style.display = 'none';
        return;
    }
    const opt = sel.options[sel.selectedIndex];
    const fee = opt.dataset.monthlyFee;
    if (fee && fee !== '') {
        feeEl.style.display = 'block';
        feeEl.innerHTML = `<i class="fas fa-won-sign"></i> 이번 달 수강료: <strong>${Number(fee).toLocaleString()}원</strong>`;
    } else {
        feeEl.style.display = 'none';
    }
}

// STEP 2: 해지 신청 제출
async function submitCancellation() {
    const dong   = document.getElementById('cancelDong').value.trim();
    const ho     = document.getElementById('cancelHo').value.trim();
    const phone  = document.getElementById('cancelPhone').value.trim();
    const sel    = document.getElementById('cancelProgram');
    const reason = document.getElementById('cancelReason').value.trim();

    if (!sel.value) { showToast('해지할 프로그램을 선택하세요', 'error'); return; }
    if (!reason)    { showToast('해지 사유를 입력하세요', 'error'); return; }

    const selectedOpt   = sel.options[sel.selectedIndex];
    const programName   = selectedOpt.dataset.programName || sel.value;
    const applicationId = selectedOpt.dataset.applicationId || null;
    const person        = _cancelLookupResult.find(p => p.application_id === sel.value) || _cancelLookupResult[0] || {};

    const submitBtn = document.getElementById('cancelSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 신청 중...';

    const preferredTime = selectedOpt.dataset.preferredTime || '';

    try {
        await API.cancellations.create({
            complex_id:     State.complex.id,
            application_id: applicationId,
            source:         'resident',
            dong, ho,
            name:           person.name  || '',
            phone:          person.phone || phone,
            program_name:   programName,
            preferred_time: preferredTime,
            reason
        });
        showToast('✅ 해지 신청이 접수되었습니다', 'success');
        closeModal('cancellationModal');
        resetCancelForm();
    } catch (e) {
        showToast('해지 신청 실패: ' + e.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-times-circle"></i> 해지 신청하기';
    }
}

// ── 강사 소개 모달 ────────────────────────────────────────────────────────────
async function showInstructorsModal() {
    openModal('instructorsModal');
    const content = document.getElementById('instructorsContent');
    content.innerHTML = '<div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await API.instructors.list({ complexCode: State.complex.code });
        const list = res.data || [];
        if (!list.length) {
            content.innerHTML = '<p class="empty-hint">등록된 강사가 없습니다.</p>';
            return;
        }
        content.innerHTML = list.map(i => `
            <div class="instructor-card">
                ${i.photo_url ? `<img src="${i.photo_url}" alt="${i.name}" class="instructor-photo" onclick="this.classList.toggle('expanded')">` : '<div class="instructor-photo-placeholder"><i class="fas fa-user"></i></div>'}
                <div class="instructor-info">
                    <h4>${i.name}</h4>
                    <p class="instructor-title">${i.title || ''}</p>
                    ${i.bio ? `<p class="instructor-bio">${i.bio.replace(/\n/g, '<br>')}</p>` : ''}
                </div>
            </div>
        `).join('');
    } catch (e) {
        content.innerHTML = `<p class="error-hint">강사 정보를 불러오지 못했습니다</p>`;
    }
}

// ── 커리큘럼 모달 ─────────────────────────────────────────────────────────────
async function showCurriculumModal() {
    openModal('curriculumModal');
    const content = document.getElementById('curriculumContent');
    content.innerHTML = '<div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const now = new Date();
        const res = await API.curricula.list({
            complexCode: State.complex.code,
            year: now.getFullYear(),
            month: now.getMonth() + 1
        });
        const list = res.data || [];
        if (!list.length) {
            content.innerHTML = '<p class="empty-hint">이달 커리큘럼이 아직 등록되지 않았습니다.</p>';
            return;
        }
        const c = list[0];
        content.innerHTML = `
            <h4>${now.getFullYear()}년 ${now.getMonth()+1}월 커리큘럼</h4>
            ${c.image_url ? `<img src="${c.image_url}" alt="커리큘럼" style="width:100%;border-radius:8px;margin:12px 0">` : ''}
            ${c.content ? `<div style="white-space:pre-wrap;font-size:14px">${c.content}</div>` : ''}
        `;
    } catch (e) {
        content.innerHTML = `<p class="error-hint">커리큘럼을 불러오지 못했습니다</p>`;
    }
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function showMyApplicationModal() { openModal('myAppModal'); }

// 해지 신청 모달 열기 (폼 초기화 포함)
function showCancellationForm() {
    resetCancelForm();
    openModal('cancellationModal');
}

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
    document.body.style.overflow = 'hidden';
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    document.body.style.overflow = '';
}

function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function formatDate(str) {
    if (!str) return '';
    return str.slice(0, 10).replace(/-/g, '.');
}

function statusLabel(s) {
    const map = { approved: '승인', waiting: '대기', rejected: '거부', cancelled: '해지', expired: '만료', transferred: '양도', received: '양수' };
    return map[s] || s;
}
