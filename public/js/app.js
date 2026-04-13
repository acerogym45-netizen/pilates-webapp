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
    adminClickCount: 0,
    adminClickTimer: null
};

// ── 초기화 ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // URL에서 단지 코드 읽기
        const params = new URLSearchParams(window.location.search);
        const complexCode = params.get('complex') || 'apt-demo';

        // 단지 정보 로드
        const res = await API.complexes.getByCode(complexCode);
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
        const res = await API.programs.list({ complexCode: State.complex.code, activeOnly: 'true' });
        State.programs = res.data || [];

        if (!State.programs.length) {
            container.innerHTML = '<p class="empty-hint">등록된 프로그램이 없습니다.</p>';
            return;
        }

        container.innerHTML = State.programs.map(p => `
            <div class="program-card" data-id="${p.id}" onclick="selectProgram('${p.id}')">
                <div class="program-card-header">
                    <span class="program-type-badge type-${p.type}">${typeLabel(p.type)}</span>
                    <span class="program-price">₩${p.price.toLocaleString()}/월</span>
                </div>
                <div class="program-name">${p.name}</div>
                <div class="program-meta">
                    <span><i class="fas fa-calendar-week"></i> ${p.days || '-'}</span>
                    <span><i class="fas fa-users"></i> 정원 ${p.capacity}명</span>
                </div>
                ${p.description ? `<div class="program-desc">${p.description}</div>` : ''}
            </div>
        `).join('');
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

// ── 이벤트 설정 ──────────────────────────────────────────────────────────────
function setupEvents() {
    // 신청서 제출
    document.getElementById('applicationForm').addEventListener('submit', handleFormSubmit);

    // 전화번호 포맷
    document.getElementById('phone').addEventListener('input', formatPhone);
    document.getElementById('cancelPhone').addEventListener('input', formatPhone);

    // 관리자 트리거 (헤더 5번 클릭)
    const trigger = document.getElementById('adminTrigger');
    trigger.addEventListener('click', () => {
        State.adminClickCount++;
        clearTimeout(State.adminClickTimer);
        State.adminClickTimer = setTimeout(() => { State.adminClickCount = 0; }, 2000);
        if (State.adminClickCount >= 5) {
            State.adminClickCount = 0;
            openModal('adminLoginModal');
            setTimeout(() => document.getElementById('adminPassword')?.focus(), 300);
        }
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

function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    const el = document.getElementById('signatureDate');
    if (el) el.value = today;
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
async function submitCancellation() {
    const dong    = document.getElementById('cancelDong').value.trim();
    const ho      = document.getElementById('cancelHo').value.trim();
    const name    = document.getElementById('cancelName').value.trim();
    const phone   = document.getElementById('cancelPhone').value.trim();
    const program = document.getElementById('cancelProgram').value.trim();
    const reason  = document.getElementById('cancelReason').value.trim();

    if (!dong || !ho || !name || !phone) { showToast('필수 항목을 모두 입력하세요', 'error'); return; }

    try {
        await API.cancellations.create({
            complex_id: State.complex.id,
            dong, ho, name, phone,
            program_name: program,
            reason
        });
        showToast('해지 신청이 접수되었습니다', 'success');
        closeModal('cancellationModal');
    } catch (e) {
        showToast('해지 신청 실패: ' + e.message, 'error');
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

// ── 관리자 비밀번호 확인 ──────────────────────────────────────────────────────
async function verifyAdminPassword() {
    const pw  = document.getElementById('adminPassword').value;
    const err = document.getElementById('adminPasswordError');
    err.style.display = 'none';

    try {
        const res = await API.complexes.verifyPassword(State.complex.code, pw);
        closeModal('adminLoginModal');
        window.location.href = `/admin/?complex=${State.complex.code}`;
    } catch (e) {
        err.textContent = '비밀번호가 올바르지 않습니다';
        err.style.display = 'block';
        setTimeout(() => { err.style.display = 'none'; }, 3000);
    }
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function showMyApplicationModal() { openModal('myAppModal'); }

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
