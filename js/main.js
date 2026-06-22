// ── 날짜 유틸: UTC → KST(+9h) 변환 ──────────────────────────────────────────
/**
 * UTC ISO 문자열을 KST 날짜 문자열로 변환 (YYYY. M. D. 형식)
 * Supabase DB는 UTC로 저장하므로 +9시간 변환 필요
 */
function kstDateStr(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso.slice(0, 10);
        const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        return `${kst.getUTCFullYear()}. ${kst.getUTCMonth()+1}. ${kst.getUTCDate()}.`;
    } catch(e) { return iso.slice(0, 10); }
}
function kstDateTimeStr(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso.slice(0, 16).replace('T',' ');
        const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const y = kst.getUTCFullYear();
        const mo = String(kst.getUTCMonth()+1).padStart(2,'0');
        const da = String(kst.getUTCDate()).padStart(2,'0');
        const h  = String(kst.getUTCHours()).padStart(2,'0');
        const mi = String(kst.getUTCMinutes()).padStart(2,'0');
        return `${y}-${mo}-${da} ${h}:${mi}`;
    } catch(e) { return iso.slice(0,16).replace('T',' '); }
}

// State Management
let formData = {};
let signaturePad = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Initializing application...');
    
    // 1. 먼저 단지 컨텍스트 로드
    await initializeComplexContext();
    console.log('✅ Complex context initialized');

    // 2. 호텔 모드 초기화 (venue_type='hotel' 단지 전용)
    initHotelMode();

    // 3. 문의하기 퀵액션 표시 여부 적용 (show_inquiry 설정)
    applyInquiryVisibility();

    // 3-1. 해지 신청 버튼 표시 여부 적용 (show_cancel_tab 설정)
    applyCancelTabVisibility();

    // 3-2. 헬스장 모드 적용 (gym_mode=true 이면 동/호수 숨김)
    applyGymMode();
    
    // 4. 나머지 초기화
    setupEventListeners();
    setMinDate();
    setSignatureDate();
    loadPrograms(); // 프로그램 동적 로드
    loadTimeSlotStatus();
    loadPublicInquiries();
    loadNotices();
    renderPeriodBanner();              // 접수·해지 기간 배너
    initManageTabBar();                // 내 신청 취소·변경 탭바 초기화
    _updateContractPeriodLabels();     // 계약서·해지모달 기간 텍스트 실시간 반영
    
    console.log('✅ Application ready');
});

// ── 문의하기 퀵액션 표시/숨김 적용 ─────────────────────────────────────
// complexes.show_inquiry = false 이면
//  - "문의하기" 버튼 숨김
//  - "내 문의 조회" 행 숨김
//  - 2행 그리드를 5열→4열로 전환 (빈칸 없이 정렬)
function applyInquiryVisibility() {
    const complex = complexContext?.getComplex?.();
    // show_inquiry가 명시적으로 false인 경우만 숨김 (null/undefined는 true로 간주)
    const show = complex?.show_inquiry !== false;

    const btnInquiry    = document.getElementById('quickBtnInquiry');
    const rowInquiryMain= document.getElementById('quickRowInquiryMain');
    const rowFive       = document.getElementById('quickRowFive');

    if (!show) {
        // 문의하기 버튼 숨김
        if (btnInquiry)     btnInquiry.style.display     = 'none';
        // 내 문의 조회 행 숨김
        if (rowInquiryMain) rowInquiryMain.style.display = 'none';
        // 2행 그리드: 5열 → 4열 전환
        if (rowFive) {
            rowFive.classList.remove('quick-row--five');
            rowFive.classList.add('quick-row--four');
        }
    }
}

// ── 해지 신청 버튼 표시/숨김 적용 ──────────────────────────────────────
// complexes.show_cancel_tab = false 이면 해지 신청 버튼 숨김
// null/undefined는 true로 간주 (기본 표시)
function applyCancelTabVisibility() {
    const complex = complexContext?.getComplex?.();
    // show_cancel_tab이 명시적으로 false인 경우만 숨김 (null/undefined는 true로 간주)
    const show = complex?.show_cancel_tab !== false;

    const btnCancelTab = document.getElementById('quickBtnCancelTab');
    if (!show) {
        if (btnCancelTab) btnCancelTab.style.display = 'none';
    }
}

// ── 헬스장 모드: 동/호수 입력 칸 숨김 ──────────────────────────────────
// complexes.gym_mode = true 이면 동·호수 필드(+확인 필드) 전체 숨김
// handlePage1Submit()에서도 검증 우회 처리
function applyGymMode() {
    const complex = complexContext?.getComplex?.();
    const gymMode = complex?.gym_mode === true;
    if (!gymMode) return; // false/null/undefined: 기존 표시 그대로

    // ── 1. 계약서 page2 섹션만 숨김 (신청서 page1은 그대로 표시) ────────
    const page2 = document.getElementById('page2');
    if (page2) page2.style.display = 'none';

    // ── 1-1. 신청서 제출 버튼 텍스트 변경 ───────────────────────────────
    const submitBtn = document.getElementById('page1SubmitBtn');
    if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> 접수하기';

    // ── 2. 동/호수 입력 행 전체 숨기기 (신청서 내 form-row) ──────────
    const dongEl = document.getElementById('dong');
    const dongHoRow = dongEl?.closest('.form-row');
    if (dongHoRow) dongHoRow.style.display = 'none';

    // 동/호수 확인 행 숨기기
    const dongHoConfirmRow = document.getElementById('dongHoConfirmRow');
    if (dongHoConfirmRow) dongHoConfirmRow.style.display = 'none';

    // required 속성 제거 (유효성 검사 통과용)
    ['dong','dongConfirm','ho','hoConfirm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.removeAttribute('required');
            el.value = '-'; // 빈값 검증 통과용 기본값
        }
    });

    // ── 3. 퀵액션 버튼 숨기기 — 시간표, 내 신청 조회·취소·변경 ────────
    const timetableBtn = document.getElementById('quickBtnTimetable');
    if (timetableBtn) timetableBtn.style.display = 'none';
    const manageBtn = document.getElementById('quickBtnManage');
    if (manageBtn) manageBtn.style.display = 'none';

    // ── 4. 커리큘럼 모달 제목 변경 + 월 선택 토글 숨김 ─────────────────
    const currHeader = document.querySelector('#curriculumModal .modal-header h2');
    if (currHeader) currHeader.innerHTML = '<i class="fas fa-calendar-alt"></i> 커리큘럼';
    const currMonthWrap = document.querySelector('.curriculum-month-select');
    if (currMonthWrap) currMonthWrap.style.display = 'none';

    // ── 5. 문의하기 모달 동/호수 행 숨김 ────────────────────────────────
    const inquiryDongEl = document.getElementById('inquiryDong');
    const inquiryDongRow = inquiryDongEl?.closest('.form-row');
    if (inquiryDongRow) inquiryDongRow.style.display = 'none';
    // 동/호수 안내 문구도 숨김
    const inquiryDongNotice = inquiryDongRow?.nextElementSibling;
    if (inquiryDongNotice && inquiryDongNotice.tagName === 'P') {
        inquiryDongNotice.style.display = 'none';
    }

    // ── 6. 수집항목 안내에서 '동호수,' 숨김 ─────────────────────────────
    const consentDetail = document.querySelector('.consent-detail');
    if (consentDetail) {
        consentDetail.innerHTML = consentDetail.innerHTML
            .replace(/동호수,?\s*/g, '');
    }

    // ── 7. 전화번호 불일치 안내 메시지에서 '관리비 부과' 제거 ────────────
    document.querySelectorAll('.mismatch-msg').forEach(el => {
        el.innerHTML = el.innerHTML
            .replace(/관리비 부과 및\s*/g, '');
    });

    // ── 8. 설문 섹션 표시 ────────────────────────────────────────────────
    const surveySection = document.getElementById('gymSurveySection');
    if (surveySection) surveySection.style.display = '';

    // ── 9. 예약금 배너: 선택한 프로그램에 deposit_enabled 있으면 표시 ────
    // lessonType change 시 업데이트 (아래 _updateGymDepositBanner 참조)
    document.getElementById('lessonType')?.addEventListener('change', _updateGymDepositBanner);

    console.log('🏋️ 헬스장 모드 ON: 계약서·동호수·시간표/내신청·커리큘럼월선택·문의동호수·설문 처리 완료');
}

// 헬스장 모드: 커리큘럼 로드 시 현재 월 자동 선택 (월 선택 토글 숨김 상태)
function gymModeLoadCurrentCurriculum() {
    const now = new Date();
    const select = document.getElementById('curriculumMonthSelect');
    if (!select) return;
    const val = `${now.getFullYear()}-${now.getMonth() + 1}`;
    // 해당 option이 없으면 추가
    if (!Array.from(select.options).some(o => o.value === val)) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
        select.appendChild(opt);
    }
    select.value = val;
}

// 예약금 배너 업데이트 (헬스장 모드 + 프로그램 선택 변경 시)
function _updateGymDepositBanner() {
    const banner = document.getElementById('gymDepositBanner');
    const text   = document.getElementById('gymDepositText');
    if (!banner || !text) return;

    const select = document.getElementById('lessonType');
    const opt    = select?.options[select.selectedIndex];
    if (!opt || !opt.value) { banner.style.display = 'none'; return; }

    // option에 저장된 data-deposit 값 확인 (populateProgramOptions에서 세팅)
    const depositEnabled = opt.dataset.depositEnabled === 'true';
    const depositAmount  = parseInt(opt.dataset.depositAmount || '0');

    if (depositEnabled && depositAmount > 0) {
        text.textContent = `이 프로그램은 노쇼 방지를 위해 예약금 ${depositAmount.toLocaleString()}원이 필요합니다. 신청 후 안내된 계좌로 납부해 주세요. 정상 참여 시 전액 환급됩니다.`;
        banner.style.display = '';
    } else {
        banner.style.display = 'none';
    }
}

// Setup Event Listeners
function setupEventListeners() {
    const form = document.getElementById('contractForm');
    form.addEventListener('submit', handlePage1Submit);
    
    // 전화번호 포맷 (원본 + 확인 필드 모두)
    const phoneInput = document.getElementById('phone');
    if (phoneInput) phoneInput.addEventListener('input', formatPhoneNumber);
    const phoneConfirmInput = document.getElementById('phoneConfirm');
    if (phoneConfirmInput) phoneConfirmInput.addEventListener('input', function(e) {
        formatPhoneNumber(e);
        checkConfirmMatch('phone', 'phoneConfirm', 'phoneConfirmWrap');
    });
    
    // Update time slots when program changes
    const lessonTypeSelect = document.getElementById('lessonType');
    if (lessonTypeSelect) {
        lessonTypeSelect.addEventListener('change', function() {
            // Reset time slot selection
            const timeSlotSelect = document.getElementById('preferredTime');
            if (timeSlotSelect) {
                timeSlotSelect.value = '';
            }
            // Update options
            updateTimeSlotOptions();
        });
    }
}

// Set minimum date to today
function setMinDate() {
    // No longer needed as start_date field is removed
}

// Set signature date to today
function setSignatureDate() {
    const signatureDateInput = document.getElementById('signatureDate');
    const today = new Date().toISOString().split('T')[0];
    signatureDateInput.value = today;
}

// 숫자 전용 입력 필터 (동/호수 필드용)
function filterNumericOnly(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
}

// Format phone number
function formatPhoneNumber(e) {
    const target = e ? e.target : document.getElementById('phone');
    if (!target) return;
    let value = target.value.replace(/[^0-9]/g, '');
    if (value.length <= 3) {
        target.value = value;
    } else if (value.length <= 7) {
        target.value = value.slice(0, 3) + '-' + value.slice(3);
    } else {
        target.value = value.slice(0, 3) + '-' + value.slice(3, 7) + '-' + value.slice(7, 11);
    }
}

// ── 입력 확인 필드 일치 검사 ──────────────────────────────────────────────────
// 동/호수/전화번호를 2회 입력받아 일치 여부를 실시간으로 표시
// id1: 원본 필드 id, id2: 확인 필드 id, wrapId: 확인 필드 감싸는 .form-group id
function checkConfirmMatch(id1, id2, wrapId) {
    const v1   = (document.getElementById(id1)?.value  || '').trim();
    const v2   = (document.getElementById(id2)?.value  || '').trim();
    const inp2 = document.getElementById(id2);
    const wrap = document.getElementById(wrapId);
    if (!inp2 || !wrap) return;

    // 확인 필드가 아직 비어있으면 상태 초기화 (아직 입력 안 함)
    if (!v2) {
        inp2.classList.remove('field-mismatch', 'field-match');
        wrap.classList.remove('mismatch');
        return;
    }

    if (v1 === v2) {
        // 일치
        inp2.classList.remove('field-mismatch');
        inp2.classList.add('field-match');
        wrap.classList.remove('mismatch');
    } else {
        // 불일치
        inp2.classList.remove('field-match');
        inp2.classList.add('field-mismatch');
        wrap.classList.add('mismatch');
    }
}

// 확인 필드 전체 일치 여부 반환 (제출 시 최종 검증용)
function allConfirmFieldsMatch() {
    const isGymMode = complexContext?.getComplex?.()?.gym_mode === true;
    // 헬스장 모드: "관리비 부과" 없이 SMS 발송만 언급
    const mismatchSuffix = isGymMode
        ? 'SMS 발송을 위하여 반드시 정확하게 입력해 주세요.'
        : '관리비 부과 및 SMS 발송을 위하여 반드시 정확하게 입력해 주세요.';

    const pairs = [
        { id1: 'dong',  id2: 'dongConfirm',  label: '동' },
        { id1: 'ho',    id2: 'hoConfirm',    label: '호수' },
        { id1: 'phone', id2: 'phoneConfirm', label: '전화번호' },
    ];
    for (const { id1, id2, label } of pairs) {
        const v1 = (document.getElementById(id1)?.value  || '').trim();
        const v2 = (document.getElementById(id2)?.value  || '').trim();
        if (!v2) {
            alert(`${label} 확인란을 입력해 주세요.\n\n${mismatchSuffix}`);
            document.getElementById(id2)?.focus();
            return false;
        }
        if (v1 !== v2) {
            alert(`${label}이(가) 일치하지 않습니다.\n\n${mismatchSuffix}`);
            document.getElementById(id2)?.focus();
            return false;
        }
    }
    return true;
}

// Handle page 1 form submission (move to page 2)
function handlePage1Submit(e) {
    e.preventDefault();
    
    const lessonTypeSelect = document.getElementById('lessonType');
    const lessonType = lessonTypeSelect.value;
    const selectedOption = lessonTypeSelect.options[lessonTypeSelect.selectedIndex];
    const isPersonalLesson = selectedOption && selectedOption.dataset.isPersonalLesson === 'true';
    
    const preferredTime = isPersonalLesson 
        ? document.getElementById('customTime').value.trim() 
        : document.getElementById('preferredTime').value;
    
    // Check time slot capacity for group lessons
    if (!isPersonalLesson && preferredTime && window.programTimeSlots) {
        const slots = window.programTimeSlots[lessonType];
        if (slots && selectedOption) {
            const currentCount = slots[preferredTime] || 0;
            const maxCapacity = parseInt(selectedOption.dataset.maxCapacity) || 6;

            if (currentCount >= maxCapacity) {
                // 대기 접수 활성 단지: 마감이어도 대기 신청으로 통과
                const waitingEnabledCheck = complexContext.getComplex()?.waiting_enabled === true;
                if (!waitingEnabledCheck) {
                    alert(`❌ 선택하신 시간대는 정원이 마감되었습니다.\n\n프로그램: ${lessonType}\n시간대: ${preferredTime}\n현재 인원: ${currentCount}/${maxCapacity}명\n\n다른 시간대를 선택해주세요.`);
                    return;
                }
                // waiting_enabled=true: 서버에서 대기 처리 — 통과
                console.log(`⏳ 정원 마감이지만 대기 접수 활성 단지 → 서버에서 대기 처리 예정 (${currentCount}/${maxCapacity}명)`);
            }
        }
    }
    
    // 상시 접수 레슨: 강사 선택 여부 확인
    const alwaysOpenLesson = selectedOption && selectedOption.dataset.alwaysOpenLesson === 'true';
    const instructorSelect = document.getElementById('preferredInstructor');
    const selectedInstructorId = (alwaysOpenLesson && instructorSelect) ? instructorSelect.value : null;
    if (alwaysOpenLesson && !selectedInstructorId) {
        alert('희망 강사를 선택해주세요.');
        instructorSelect?.focus();
        return;
    }

    // Collect form data
    // 호텔 모드: 객실 번호를 dong에 매핑, ho는 '호텔' 고정
    // 헬스장 모드: dong/ho 비어있어도 '-' 처리
    const isHotelMode = complexContext && complexContext.isHotel ? complexContext.isHotel() : false;
    const isGymMode   = complexContext?.getComplex?.()?.gym_mode === true;
    const roomVal = isHotelMode ? (document.getElementById('hotelRoom')?.value?.trim() || '') : '';
    // 헬스장 모드 설문 데이터 수집
    const surveyData = isGymMode ? {
        gender:      document.getElementById('surveyGender')?.value || '',
        age:         document.getElementById('surveyAge')?.value || '',
        goal:        Array.from(document.querySelectorAll('input[name="surveyGoal"]:checked')).map(el => el.value),
        career:      document.getElementById('surveyCareer')?.value || '',
        medical:     document.getElementById('surveyMedical')?.value || '',
        prefer_time: document.getElementById('surveyPreferTime')?.value || '',
        frequency:   document.getElementById('surveyFrequency')?.value || '',
        etc:         document.getElementById('surveyEtc')?.value || '',
    } : null;

    formData = {
        dong: isHotelMode ? roomVal : (isGymMode ? '-' : document.getElementById('dong').value.trim()),
        ho:   isHotelMode ? '호텔'  : (isGymMode ? '-' : document.getElementById('ho').value.trim()),
        name: document.getElementById('name').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        lesson_type: lessonType,
        program_id: selectedOption ? (selectedOption.dataset.programId || null) : null,
        preferred_time: preferredTime,
        agreement: document.getElementById('agreement').checked,
        instructor_id: selectedInstructorId || null,
        ...(surveyData ? { survey_data: surveyData } : {}),
    };
    
    // Validation
    if (!formData.agreement) {
        alert(isHotelMode ? _i18n('alert.agreement') : '개인정보 수집 및 이용에 동의해주세요.');
        return;
    }

    // 호텔 모드 전용 검증
    if (isHotelMode) {
        if (!roomVal) { alert(_i18n('alert.room')); document.getElementById('hotelRoom')?.focus(); return; }
        if (!formData.name)  { alert(_i18n('alert.name')); return; }
        if (!formData.phone) { alert(_i18n('alert.phone')); return; }
        if (!formData.lesson_type) { alert(_i18n('alert.lesson')); return; }
        if (!formData.preferred_time) { alert(_i18n('alert.time')); return; }
        goToPage2();
        return;
    }
    
    // 일반(아파트) 모드: 모든 필수 항목 검증
    // 헬스장 모드: dong/ho 검증 제외 (이미 '-'로 채워짐)
    const requiredFields = isGymMode
        ? ['name', 'phone', 'lesson_type', 'preferred_time']
        : ['dong', 'ho', 'name', 'phone', 'lesson_type', 'preferred_time'];
    for (const field of requiredFields) {
        if (!formData[field]) {
            alert('모든 필수 항목을 입력해주세요.');
            return;
        }
    }

    // ── 동/호수/전화번호 확인 필드 일치 검증 ──────────────────────
    // 헬스장 모드: 동/호수 확인 필드 검증 건너뜀
    if (isGymMode) {
        // 전화번호 확인만 검증
        const phoneV1 = (document.getElementById('phone')?.value || '').trim();
        const phoneV2 = (document.getElementById('phoneConfirm')?.value || '').trim();
        if (!phoneV2) { alert('전화번호 확인란을 입력해 주세요.'); document.getElementById('phoneConfirm')?.focus(); return; }
        if (phoneV1 !== phoneV2) { alert('전화번호가 일치하지 않습니다.'); document.getElementById('phoneConfirm')?.focus(); return; }
    } else {
        if (!allConfirmFieldsMatch()) return;
    }

    // 헬스장 모드: 계약서(page2) 없이 바로 제출
    if (complexContext?.getComplex?.()?.gym_mode === true) {
        submitContract();
        return;
    }

    // Move to page 2
    goToPage2();
}

// Go to Page 2 (Contract)
function goToPage2() {
    // Hide page 1
    document.getElementById('page1').style.display = 'none';
    
    // Show page 2
    document.getElementById('page2').style.display = 'block';
    
    // Update progress indicator
    document.querySelector('[data-step="1"]').classList.remove('active');
    document.querySelector('[data-step="1"]').classList.add('completed');
    document.querySelector('[data-step="2"]').classList.add('active');
    
    // Update header title (subtitle 요소는 삭제됐으므로 안전하게 처리)
    document.getElementById('pageTitle').textContent = '필라테스 레슨 이용계약서';
    const subtitleEl = document.getElementById('pageSubtitle');
    if (subtitleEl) subtitleEl.textContent = '계약 내용을 확인하고 서명해주세요';
    
    // Display form data
    const _isHotel = complexContext && complexContext.isHotel ? complexContext.isHotel() : false;
    const dongLabel = document.querySelector('#page2 .summary-row span:first-child');
    if (_isHotel && dongLabel && dongLabel.textContent.trim() === '동호수') {
        dongLabel.textContent = '객실 번호';
    }
    document.getElementById('displayDong').textContent  = formData.dong;
    document.getElementById('displayHo').textContent    = _isHotel ? '' : formData.ho;
    document.getElementById('displayName').textContent  = formData.name;
    document.getElementById('displayPhone').textContent = formData.phone;
    document.getElementById('displayLesson').textContent = formData.lesson_type;
    document.getElementById('displayTime').textContent  = formData.preferred_time;

    // 강사 이름 표시 (상시 접수 레슨)
    const displayInstructorWrap = document.getElementById('displayInstructorWrap');
    if (displayInstructorWrap) {
        if (formData.instructor_id) {
            const instructorSelect = document.getElementById('preferredInstructor');
            const selectedOpt = instructorSelect?.options[instructorSelect.selectedIndex];
            const instructorName = selectedOpt ? selectedOpt.textContent : '';
            displayInstructorWrap.style.display = 'block';
            const el = document.getElementById('displayInstructor');
            if (el) el.textContent = instructorName;
        } else {
            displayInstructorWrap.style.display = 'none';
        }
    }
    
    // 호텔 모드: 풀스크린 모달 step indicator Step2 활성화
    if (complexContext?.isHotel?.()) {
        _hotelApplySetStep(2);
    }

    // Scroll to top first, then init signature pad
    // (page2가 display:block 된 직후 offsetWidth가 0일 수 있어 rAF로 지연)
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            initSignaturePad();
        });
    });
}

// Go back to Page 1
function goToPage1() {
    // Show page 1
    document.getElementById('page1').style.display = 'block';
    
    // Hide page 2
    document.getElementById('page2').style.display = 'none';
    
    // Update progress indicator
    document.querySelector('[data-step="2"]').classList.remove('active');
    document.querySelector('[data-step="1"]').classList.remove('completed');
    document.querySelector('[data-step="1"]').classList.add('active');
    
    // Update header
    document.getElementById('pageTitle').textContent = '필라테스 레슨 신청서';
    const subtitleElBack = document.getElementById('pageSubtitle');
    if (subtitleElBack) subtitleElBack.textContent = '커뮤니티 피트니스센터';

    // 호텔 모드: 풀스크린 모달 step indicator Step1 복귀
    if (complexContext?.isHotel?.()) {
        _hotelApplySetStep(1);
    }

    // Scroll to top
    window.scrollTo(0, 0);
}

// Submit contract
async function submitContract() {
    const refundAgreement  = document.getElementById('refundAgreement')?.checked;
    const termsAgreement   = document.getElementById('termsAgreement').checked;
    const signatureName    = document.getElementById('signatureName').value.trim();
    const signatureDate    = document.getElementById('signatureDate').value;
    
    // Validation
    if (!refundAgreement) {
        alert('환불 규정에 동의해주세요.');
        document.getElementById('refundAgreement')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    if (!termsAgreement) {
        alert('이용약관에 동의해주세요.');
        return;
    }
    
    if (!signatureName) {
        alert('성명을 입력해주세요.');
        return;
    }

    // 서명 미작성 체크
    if (signaturePad.isEmpty()) {
        alert('서명란에 서명해주세요.\n미작성 또는 부실한 서명은 승인되지 않으며 자동 거부됩니다.');
        document.querySelector('.signature-canvas-wrapper').style.borderColor = '#e53e3e';
        return;
    }

    // 부실 서명 감지: SignaturePad 데이터 포인트 수가 너무 적으면 거부
    const sigData = signaturePad.toData();
    const totalPoints = sigData.reduce((sum, stroke) => sum + (stroke.points?.length || stroke.length || 0), 0);
    if (totalPoints < 20) {
        alert('서명이 너무 간단합니다.\n반드시 본인 서명을 직접 작성해주세요.\n부실한 서명(점, 선 하나 등)은 승인되지 않으며 자동 거부됩니다.');
        document.querySelector('.signature-canvas-wrapper').style.borderColor = '#e53e3e';
        return;
    }
    document.querySelector('.signature-canvas-wrapper').style.borderColor = '';

    // Get signature as base64 image
    const signatureImage = signaturePad.toDataURL();
    
    // Prepare final data
    const contractData = {
        ...formData,
        complex_id: complexContext.getComplexCode(),  // Use complex_code instead of UUID
        terms_agreement: termsAgreement,
        signature: signatureName,
        signature_image: signatureImage,
        signature_date: signatureDate,
        status: 'approved',  // 🆕 자동 승인 (영문으로 통일)
        created_at: Date.now()
    };
    
    // Log the data being submitted (for debugging)
    console.log('📝 Submitting contract data:', {
        ...contractData,
        signature_image: `[Base64 image ${signatureImage.length} chars]` // Don't log full image
    });
    
    // Get submit button
    const submitBtn = document.querySelector('button[onclick="submitContract()"]');
    
    try {
        // Disable submit button
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 제출 중...';
        }
        
        // 중복 신청 검사 (동+호+이름+전화번호 모두 일치)
        console.log('🔍 중복 신청 검사 중...');
        const dupResult = await checkDuplicateApplication(contractData);

        if (dupResult.isDuplicate) {
            showDuplicateWarningModal(contractData, dupResult.existing);
            console.log('❌ 중복 신청 차단');
            return;
        }

        console.log('✅ 중복 없음 - 신청 진행');
        
        // 신규 /api/applications 엔드포인트로 POST
        const submitPayload = {
            complex_id: complexContext.getComplexId(),
            dong: contractData.dong,
            ho: contractData.ho,
            name: contractData.name,
            phone: contractData.phone,
            program_id: contractData.program_id || null,   // 정원 체크용 program_id
            program_name: contractData.lesson_type,
            preferred_time: contractData.preferred_time,
            signature_name: contractData.signature,        // 서버 필드명
            signature_data: contractData.signature_image,  // 서버 필드명
            signature_date: contractData.signature_date,
            terms_agreement: contractData.terms_agreement,
            agreement: contractData.terms_agreement,
            instructor_id: contractData.instructor_id || null  // 개인/듀엣 희망 강사
        };
        
        console.log('🚀 Sending POST request to: /api/applications');
        
        const response = await fetch('/api/applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submitPayload)
        });
        
        console.log('📡 Response status:', response.status, response.statusText);
        
        const result = await response.json();
        
        // 서버 중복 체크 (409 응답)
        if (response.status === 409 && result.duplicate) {
            showDuplicateWarningModal(contractData, { program_name: result.existingProgram, status: result.existingStatus });
            console.log('❌ 서버에서 중복 신청 차단');
            return;
        }

        // 정원 마감 오류 (400 + is_full)
        if (response.status === 400 && result.is_full) {
            // 대기 접수 활성 단지: 서버가 대기 처리하지 않고 400을 반환한 경우
            // (waiting_enabled=false인 단지는 기존대로 마감 모달)
            const waitingEnabledSubmit = complexContext.getComplex()?.waiting_enabled === true;
            if (waitingEnabledSubmit) {
                // 대기 활성 단지에서는 정원 마감 안내 대신 대기 불가 안내
                showFullCapacityModal(contractData,
                    result.error || '대기 접수 처리 중 오류가 발생했습니다. 잠시 후 다시 시도하거나 관리사무소에 문의해주세요.');
            } else {
                console.warn('⛔ 정원 마감으로 신청 차단');
                showFullCapacityModal(contractData, result.error);
            }
            return;
        }

        if (response.ok && result.success) {
            console.log('✅ Application submitted:', result);
            contractData.status = result.data?.status || 'approved';
            contractData.waiting_order = result.data?.waiting_order;

            // waiting_enabled 단지에서 대기 접수 성공 시 → 대기 전용 안내 모달
            if (contractData.status === 'waiting' && contractData.waiting_order) {
                console.log(`⏳ 대기 접수 완료 (순번: ${contractData.waiting_order}번)`);
                showWaitingListModal(contractData);
            } else {
                showSuccessNotificationModal(contractData);
            }
        } else {
            const errorMsg = result.error || `Failed: ${response.status} ${response.statusText}`;
            console.error('❌ Submit failed:', errorMsg);
            throw new Error(errorMsg);
        }
    } catch (error) {
        console.error('💥 Error submitting contract:', error);
        alert('계약서 제출에 실패했습니다. 다시 시도해주세요.\n\n오류가 계속되면 관리사무소로 연락주세요.\n\n에러: ' + error.message);
    } finally {
        // Re-enable submit button
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> 계약서 제출';
        }
    }
}

// 프로그램명으로 카테고리 분류 (서버 로직과 동일)
function _getProgramCategory(programName) {
    if (!programName) return 'group';
    if (/1:1|개인/.test(programName)) return 'individual';
    if (/2:1|듀엣/.test(programName)) return 'duet';
    return 'group';
}

// ── 중흥S클래스 예외 로직 헬퍼 ──────────────────────────────────────────────
// ※ 중흥S클래스 단지 코드 패턴: DB에 등록된 complexes.code 값 기준
//   예) 'junghung-sclass', 'apt-sclass', 'junghung_s' 등 실제 코드에 맞게 수정하세요.
//   여러 코드를 등록해야 할 경우 배열에 추가합니다.
const JUNGHUNG_SCLASS_CODES = [
    'apt-sclass'  // 소사벌 중흥 S클래스 (complexes.code 확인값)
];

/**
 * 현재 단지가 중흥S클래스인지 확인
 * @param {string} complexCode - complexContext.getComplexCode() 반환값
 * @returns {boolean}
 */
function _isJunghungSClass(complexCode) {
    if (!complexCode) return false;
    const code = complexCode.toLowerCase();
    return JUNGHUNG_SCLASS_CODES.some(c => code === c.toLowerCase());
}

/**
 * 프로그램명이 무료체험 수업인지 확인
 * @param {string} programName
 * @returns {boolean}
 */
function _isFreeTrialProgram(programName) {
    if (!programName) return false;
    return /무료|체험/.test(programName);
}

// 중복 신청 검사 함수 (같은 카테고리 내에서만 중복 차단)
// 그룹 수업 수강 중이어도 개인/듀엣 레슨은 추가 신청 가능
async function checkDuplicateApplication(contractData) {
    try {
        const complexCode = complexContext.getComplexCode();
        const { dong, ho, name, phone, lesson_type } = contractData;

        console.log(`🔍 중복 검사: ${dong}동 ${ho}호 ${name} (${phone}) → 신청 프로그램: ${lesson_type}`);

        // ── [중흥S클래스 예외] 무료체험 ↔ 정규 수업 교차 중복은 허용 ──────────
        // 조건: ① 중흥S클래스 단지 AND ② 신청/기존 중 하나라도 무료체험
        //   - 무료체험 + 정규 수업  → 중복 허용 (신청 방향 무관)
        //   - 정규 수업 + 정규 수업 → 기존 로직 그대로 차단
        //   - 무료체험 + 무료체험  → 기존 로직 그대로 차단
        //   - 다른 단지            → 기존 로직 그대로
        if (_isJunghungSClass(complexCode)) {
            // 동+호+이름+전화번호 일치하는 활성 신청 전체 조회
            const jhParams = new URLSearchParams({ complexCode, dong, ho, limit: 100 });
            const jhResponse = await fetch(`/api/applications?${jhParams}`);
            const jhResult = await jhResponse.json();
            const jhActiveContracts = (jhResult.data || []).filter(c =>
                c.name  === name  &&
                c.phone === phone &&
                (c.status === 'approved' || c.status === 'waiting')
            );

            const targetIsTrial = _isFreeTrialProgram(lesson_type);
            const targetCategory = _getProgramCategory(lesson_type);

            if (targetIsTrial) {
                // [무료체험 신청] 같은 카테고리 중 무료체험끼리만 차단, 정규와는 허용
                const trialDup = jhActiveContracts.find(c =>
                    _getProgramCategory(c.program_name) === targetCategory &&
                    _isFreeTrialProgram(c.program_name)   // 기존 신청도 무료체험일 때만 중복
                );
                if (trialDup) {
                    const categoryLabel = targetCategory === 'individual' ? '개인 레슨'
                        : targetCategory === 'duet' ? '듀엣 레슨' : '그룹 수업';
                    console.log(`⚠️ [중흥S클래스] 무료체험 중복 발견 (${categoryLabel}):`, trialDup.program_name);
                    return { isDuplicate: true, existing: trialDup };
                }
                console.log('✅ [중흥S클래스] 무료체험 신청 → 정규 수업과 교차이므로 허용');
                return { isDuplicate: false };
            } else {
                // [정규 수업 신청] 같은 카테고리 중 정규 수업끼리만 차단, 무료체험과는 허용
                const regularDup = jhActiveContracts.find(c =>
                    _getProgramCategory(c.program_name) === targetCategory &&
                    !_isFreeTrialProgram(c.program_name)  // 기존 신청이 정규 수업일 때만 중복
                );
                if (regularDup) {
                    const categoryLabel = targetCategory === 'individual' ? '개인 레슨'
                        : targetCategory === 'duet' ? '듀엣 레슨' : '그룹 수업';
                    console.log(`⚠️ [중흥S클래스] 정규 수업 중복 발견 (${categoryLabel}):`, regularDup.program_name);
                    return { isDuplicate: true, existing: regularDup };
                }
                console.log('✅ [중흥S클래스] 정규 수업 신청 → 기존이 무료체험/다른카테고리이므로 허용');
                return { isDuplicate: false };
            }
        }
        // ── 중흥S클래스 예외 끝 (다른 단지는 기존 로직으로) ──────────────────

        // 신청하려는 프로그램의 카테고리
        const targetCategory = _getProgramCategory(lesson_type);
        console.log(`📂 신청 카테고리: ${targetCategory}`);

        // 동+호+이름+전화번호 일치하는 활성 신청 전체 조회
        const params = new URLSearchParams({ complexCode, dong, ho, limit: 100 });
        const response = await fetch(`/api/applications?${params}`);
        const result = await response.json();
        const contracts = result.data || [];

        const activeContracts = contracts.filter(c =>
            c.name  === name  &&
            c.phone === phone &&
            (c.status === 'approved' || c.status === 'waiting')
        );

        // 같은 카테고리의 신청만 중복으로 판단
        const sameCategoryDup = activeContracts.find(c =>
            _getProgramCategory(c.program_name) === targetCategory
        );

        if (sameCategoryDup) {
            const categoryLabel = targetCategory === 'individual' ? '개인 레슨'
                : targetCategory === 'duet' ? '듀엣 레슨' : '그룹 수업';
            console.log(`⚠️ 같은 카테고리(${categoryLabel}) 중복 발견:`, sameCategoryDup.program_name);
            return { isDuplicate: true, existing: sameCategoryDup };
        }

        if (activeContracts.length > 0) {
            console.log(`ℹ️ 다른 카테고리 신청 ${activeContracts.length}건 있음 → 허용 (카테고리 다름)`);
        }

        console.log('✅ 중복 없음 - 신청 진행');
        return { isDuplicate: false };

    } catch (error) {
        console.error('❌ 중복 검사 오류:', error);
        return { isDuplicate: false };
    }
}

// 🆕 B. 정원 체크 (서버에서 자동 처리됨)
async function checkProgramCapacity(contractData) {
    return { isFull: false, currentCount: 0, maxCapacity: 999, nextWaitingOrder: 1 };
}

// Initialize signature pad
function initSignaturePad() {
    const canvas = document.getElementById('signaturePad');
    if (!canvas) return;

    // 이전 SignaturePad 인스턴스 제거
    if (signaturePad) {
        signaturePad.off();
        signaturePad = null;
    }

    const wrapper = canvas.parentElement;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    function resizeCanvas() {
        // offsetWidth가 0이면 wrapper 또는 기본값 사용
        const w = canvas.offsetWidth || wrapper?.offsetWidth || 320;
        const h = canvas.offsetHeight || 130;
        canvas.width  = w * ratio;
        canvas.height = h * ratio;
        const ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        if (signaturePad) signaturePad.clear();
    }

    signaturePad = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
        minWidth: 1.5,
        maxWidth: 3
    });

    resizeCanvas();

    // resize 이벤트는 한 번만 등록 (중복 방지)
    window.removeEventListener('resize', resizeCanvas);
    window.addEventListener('resize', resizeCanvas);
}

// Clear signature
function clearSignature() {
    if (signaturePad) {
        signaturePad.clear();
    }
}

// Load time slot status
async function loadTimeSlotStatus() {
    try {
        const complexCode = complexContext.getComplexCode();
        if (!complexCode) {
            console.warn('⚠️ Complex code not available for time slot status');
            return;
        }

        // ── share_timeslot_capacity 설정 확인 ─────────────────────────────
        // true이면 같은 days(요일)를 공유하는 프로그램끼리 시간대 정원 합산
        const shareTimeslot = complexContext.getComplex()?.share_timeslot_capacity === true;
        console.log('🔗 share_timeslot_capacity:', shareTimeslot);
        
        // Load programs to get group lesson programs
        const programsResponse = await fetch(`/api/programs?complexCode=${complexCode}&activeOnly=true`);
        const programsResult = await programsResponse.json();
        const programs = (programsResult.data || [])
            .filter(p => {
                const n = p.name || p.program_name || '';
                return !n.includes('1:1') && !n.includes('2:1');
            }); // Only group lessons
        
        // Load approved applications
        const response = await fetch(`/api/applications?complexCode=${complexCode}&status=approved&limit=1000`);
        const result = await response.json();
        const contracts = result.data || [];
        
        console.log('📊 Loading time slot status...');
        console.log('Total contracts for complex:', contracts.length);
        console.log('Group lesson programs:', programs.map(p => p.name || p.program_name));
        
        // ── preferred_time을 HH:MM 정규화 후 카운팅 ──────────────────────
        // 정규화: '저녁 21시' / '21시' / '21:00' → '21:00'
        function normalizeToHHMM(raw) {
            if (!raw) return null;
            if (/^\d{2}:\d{2}$/.test(raw)) return raw;
            const m = raw.match(/(\d{1,2})시/);
            if (m) return String(parseInt(m[1])).padStart(2,'0') + ':00';
            return null;
        }

        // ── 키를 HH:MM 형식으로 통일 (DB preferred_time과 동일한 형식)
        // programTimeSlots = { programName: { 'HH:MM': count, ... } }
        const programTimeSlots = {};

        const DEFAULT_SLOTS = ['09:00','10:00','11:00','12:00','13:00','14:00',
                               '15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

        // 각 프로그램의 빈 슬롯 맵 초기화
        programs.forEach(program => {
            const availableSlots = program.time_slots || program.available_time_slots || [];
            const timeSlotCounts = {};
            const slots = availableSlots.length > 0 ? availableSlots : DEFAULT_SLOTS;
            slots.forEach(t => { timeSlotCounts[t] = 0; });
            const pKey = program.name || program.program_name;
            programTimeSlots[pKey] = timeSlotCounts;
        });

        // ── 프로그램명 → program 객체 조회 헬퍼 ─────────────────────────
        const programByName = {};
        programs.forEach(p => { programByName[p.name || p.program_name] = p; });

        // ── 계약별 카운팅 ─────────────────────────────────────────────────
        contracts.forEach(contract => {
            if (contract.status !== 'approved') return;
            const rawTime = contract.preferred_time;
            const time = normalizeToHHMM(rawTime);
            const program = contract.program_name || contract.lesson_type;
            if (!time || !program) return;

            if (programTimeSlots[program] && Object.prototype.hasOwnProperty.call(programTimeSlots[program], time)) {
                programTimeSlots[program][time]++;
            } else {
                // 프로그램명 부분 매칭
                for (const pName in programTimeSlots) {
                    if (pName.includes(program) || program.includes(pName)) {
                        if (Object.prototype.hasOwnProperty.call(programTimeSlots[pName], time)) {
                            programTimeSlots[pName][time]++;
                            break;
                        }
                    }
                }
            }
        });

        // ── share_timeslot_capacity=true: 같은 days 그룹 내 카운트 합산 ──
        // 예) 8회반(월수)과 24회반(월수)은 같은 요일→ 시간대 정원 공유
        // → 두 프로그램의 각 시간대 카운트를 합산한 값을 양쪽에 모두 적용
        if (shareTimeslot) {
            // days 값으로 그룹화
            const dayGroups = {}; // { 'days_value': [pKey, ...] }
            programs.forEach(p => {
                const pKey  = p.name || p.program_name;
                const days  = (p.days || '').trim();
                if (!days) return; // days 없는 프로그램은 단독 처리
                if (!dayGroups[days]) dayGroups[days] = [];
                dayGroups[days].push(pKey);
            });

            // 각 그룹별: 모든 슬롯 키 수집 → 합산 → 전파
            Object.entries(dayGroups).forEach(([days, pKeys]) => {
                if (pKeys.length <= 1) return; // 단독 그룹은 합산 불필요

                // 이 그룹 내 모든 슬롯 키 수집
                const allTimeKeys = new Set();
                pKeys.forEach(k => {
                    Object.keys(programTimeSlots[k] || {}).forEach(t => allTimeKeys.add(t));
                });

                // 슬롯별 합산
                allTimeKeys.forEach(t => {
                    const total = pKeys.reduce((sum, k) => {
                        return sum + ((programTimeSlots[k] && programTimeSlots[k][t]) || 0);
                    }, 0);
                    // 그룹 내 모든 프로그램에 합산값 전파
                    pKeys.forEach(k => {
                        if (programTimeSlots[k] && Object.prototype.hasOwnProperty.call(programTimeSlots[k], t)) {
                            programTimeSlots[k][t] = total;
                        }
                    });
                });

                console.log(`🔗 [share] days='${days}' 그룹 [${pKeys.join(', ')}] 합산 완료`);
            });
        }
        
        console.log('📈 Final counts by program and time:', programTimeSlots);

        // ── display_approved_count 오버라이드 ─────────────────────────────
        // JSONB { "HH:MM": N } — 타임별 독립 표시값
        // window.programDisplayOverride = { programName: { "HH:MM": N, ... } }
        const programDisplayOverride = {};
        programs.forEach(p => {
            const pKey = p.name || p.program_name;
            if (p.display_approved_count && typeof p.display_approved_count === 'object' && pKey) {
                programDisplayOverride[pKey] = p.display_approved_count;
            }
        });
        window.programDisplayOverride = programDisplayOverride;

        // Store in global variable for later use
        window.programTimeSlots = programTimeSlots;
        
        // Update time slots based on current selected program
        updateTimeSlotOptions();
        
    } catch (error) {
        console.error('Error loading time slot status:', error);
    }
}

// 강사 목록 드롭다운 채우기 (API 조회, 결과 캐시)
let _instructorCache = null; // { complexCode: [{id, name, phone, assigned_programs},...] }
async function _fillInstructorOptions(selectEl, programId, isLesson) {
    selectEl.innerHTML = '<option value="">불러오는 중...</option>';
    selectEl.disabled = true;
    try {
        const complexCode = complexContext.getComplexCode();
        if (!_instructorCache || _instructorCache._code !== complexCode) {
            const r = await fetch(`/api/instructors?complexCode=${complexCode}`);
            const j = await r.json();
            _instructorCache = { _code: complexCode, list: j.data || [] };
        }
        let list = _instructorCache.list;
        // 개인/듀엣 레슨은 assigned_programs 필터 무시 → 전체 강사 표시
        // 그룹 프로그램만 assigned_programs 기반 필터 적용
        if (programId && !isLesson) {
            const filtered = list.filter(ins => {
                const ap = ins.assigned_programs;
                if (!ap || ap.length === 0) return true; // 담당 미지정 → 전체 노출
                // 신형: 객체 배열 → program_id 필드로 비교
                if (typeof ap[0] === 'object' && ap[0] !== null) {
                    return ap.some(a => a.program_id === programId);
                }
                // 구형: 문자열 배열 (하위호환)
                return ap.includes(programId);
            });
            if (filtered.length > 0) list = filtered;
        }
        selectEl.innerHTML = '<option value="">-- 강사를 선택해주세요 --</option>';
        list.forEach(ins => {
            const opt = document.createElement('option');
            opt.value = ins.id;
            opt.textContent = ins.name || ins.title || '이름 없음';
            selectEl.appendChild(opt);
        });
        selectEl.disabled = false;
        console.log(`✅ 강사 목록 ${list.length}명 로딩 완료`);
    } catch (e) {
        console.error('강사 목록 로딩 실패:', e);
        selectEl.innerHTML = '<option value="">불러오기 실패 (새로고침 후 시도)</option>';
        selectEl.disabled = false;
    }
}

// Update time slot options based on selected program
function updateTimeSlotOptions() {
    const lessonTypeSelect = document.getElementById('lessonType');
    const timeSlotSelect = document.getElementById('preferredTime');
    const customTimeGroup = document.getElementById('customTimeGroup');
    const customTimeInput = document.getElementById('customTime');
    
    if (!lessonTypeSelect || !timeSlotSelect) {
        console.error('❌ Required elements not found');
        return;
    }
    
    const selectedProgram = lessonTypeSelect.value;
    const selectedOption = lessonTypeSelect.options[lessonTypeSelect.selectedIndex];
    
    console.log('🔄 updateTimeSlotOptions called');
    console.log('Selected program:', selectedProgram);
    
    // 프로그램 미선택
    if (!selectedProgram) {
        console.log('⚠️ No program selected');
        timeSlotSelect.innerHTML = '<option value="">먼저 프로그램을 선택하세요</option>';
        timeSlotSelect.disabled = true;
        timeSlotSelect.required = true;
        customTimeGroup.style.display = 'none';
        customTimeInput.required = false;
        return;
    }
    
    // Check if it's personal lesson from data attribute
    const isPersonalLesson = selectedOption && selectedOption.dataset.isPersonalLesson === 'true';
    
    // 개인/듀엣 레슨인 경우
    if (isPersonalLesson) {
        console.log('✅ Personal lesson selected - showing custom time input');

        // 드롭다운 숨기기
        timeSlotSelect.parentElement.style.display = 'none';
        timeSlotSelect.required = false;

        // 자유 입력 표시
        customTimeGroup.style.display = 'block';
        customTimeInput.required = true;

        // 상시 접수(always_open_lesson)인 경우 강사 선택 드롭다운 표시
        const alwaysOpen = selectedOption.dataset.alwaysOpenLesson === 'true';
        const instructorGroup = document.getElementById('instructorGroup');
        const instructorSelect = document.getElementById('preferredInstructor');
        if (instructorGroup && instructorSelect) {
            if (alwaysOpen) {
                instructorGroup.style.display = 'block';
                instructorSelect.required = true;
                // 강사 목록 채우기 — alwaysOpen(개인/듀엣 상시접수)이면 필터 무시, 전체 강사 표시
                _fillInstructorOptions(instructorSelect, selectedOption.dataset.programId, true);
            } else {
                instructorGroup.style.display = 'none';
                instructorSelect.required = false;
                instructorSelect.innerHTML = '<option value="">-- 강사를 선택해주세요 --</option>';
            }
        }

        return;
    }

    // 그룹 수업: 강사 선택 드롭다운 숨기기
    const instructorGroup = document.getElementById('instructorGroup');
    const instructorSelect = document.getElementById('preferredInstructor');
    if (instructorGroup) { instructorGroup.style.display = 'none'; }
    if (instructorSelect) { instructorSelect.required = false; }
    
    // 그룹 수업인 경우
    console.log('✅ Group lesson selected - showing time slot dropdown');
    
    // 드롭다운 표시
    timeSlotSelect.parentElement.style.display = 'block';
    timeSlotSelect.required = true;
    
    // 자유 입력 숨기기
    customTimeGroup.style.display = 'none';
    customTimeInput.required = false;
    
    if (!window.programTimeSlots) {
        console.error('❌ programTimeSlots not loaded yet');
        timeSlotSelect.innerHTML = '<option value="">데이터 로딩 중...</option>';
        timeSlotSelect.disabled = true;
        return;
    }
    
    // Enable time slot selection
    timeSlotSelect.disabled = false;
    
    // Get program-specific available time slots
    const availableTimeSlotsStr = selectedOption.dataset.availableTimeSlots;
    let availableTimeSlots = [];
    
    try {
        availableTimeSlots = availableTimeSlotsStr ? JSON.parse(availableTimeSlotsStr) : [];
    } catch (e) {
        console.error('❌ Failed to parse available_time_slots:', e);
    }
    
    console.log('⏰ Available time slots for this program:', availableTimeSlots);
    
    // If no time slots configured, show all time slots
    if (!availableTimeSlots || availableTimeSlots.length === 0) {
        console.warn('⚠️ No time slots configured for this program, showing all');
        availableTimeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
    }
    
    // Get counts for selected program
    const slots = window.programTimeSlots[selectedProgram];
    
    if (!slots) {
        console.error('❌ No slots found for program:', selectedProgram);
        console.log('Available programs:', Object.keys(window.programTimeSlots));
        timeSlotSelect.innerHTML = '<option value="">해당 프로그램의 데이터가 없습니다</option>';
        return;
    }
    
    console.log('✅ Slots for selected program:', slots);
    
    // Get max capacity from selected option data attribute
    const maxCapacity = selectedOption && selectedOption.dataset.maxCapacity 
        ? parseInt(selectedOption.dataset.maxCapacity) 
        : 6; // default to 6
    
    console.log('📊 Max capacity for this program:', maxCapacity);
    
    // ── 슬롯 키는 HH:MM 형식 (programTimeSlots와 동일)
    // option value는 HH:MM, 표시 텍스트만 한글로 변환
    const timeDisplayMap = {
        '09:00': '오전 09시', '10:00': '오전 10시', '11:00': '오전 11시',
        '12:00': '오후 12시', '13:00': '오후 13시', '14:00': '오후 14시',
        '15:00': '오후 15시', '16:00': '오후 16시', '17:00': '오후 17시',
        '18:00': '저녁 18시', '19:00': '저녁 19시', '20:00': '저녁 20시',
        '21:00': '저녁 21시', '22:00': '저녁 22시'
    };

    let optionsHTML = '<option value="">선택하세요</option>';

    // display_approved_count 오버라이드 맵 { "HH:MM": N } — 타임별 독립
    const overrideMap = (window.programDisplayOverride && window.programDisplayOverride[selectedProgram])
        || null;

    // ── 대기 접수 가능 여부 — 이 단지에서만 적용 ──────────────────────────
    // complexes.waiting_enabled=true 인 단지: 정원 마감 슬롯도 '🟡 대기접수'로 선택 가능
    // false/미설정 단지(청주SK·라마다호텔 등): 기존과 동일하게 disabled
    const waitingEnabled = complexContext.getComplex()?.waiting_enabled === true;

    availableTimeSlots.forEach(timeCode => {
        // slots 키가 HH:MM 이므로 바로 조회
        const realCount = (slots && slots[timeCode] != null) ? slots[timeCode] : 0;
        // 해당 타임에 display값 있으면 표시용으로만 사용 (정원 마감 판단은 실제값 유지)
        const displayCount = (overrideMap && overrideMap[timeCode] != null)
            ? overrideMap[timeCode]
            : realCount;
        const isFull = realCount >= maxCapacity;
        const isAlmostFull = !isFull && realCount >= (maxCapacity - 1);
        const timeDisplay = timeDisplayMap[timeCode] || timeCode;

        let status = '모집중';
        if (isFull) {
            // 대기 접수 활성 단지: 마감이어도 선택 가능 + 대기 안내 표시
            status = waitingEnabled ? '🟡 대기접수' : '🔴 마감';
        } else if (isAlmostFull) {
            status = '⚠️ 마감임박';
        }

        // 대기 활성 단지에서 마감 슬롯은 disabled 해제, 스타일만 구분
        const disabled = (isFull && !waitingEnabled) ? 'disabled' : '';
        const style    = isFull
            ? (waitingEnabled ? 'style="color:#b45309"' : 'style="color:#999"')
            : '';
        // value는 HH:MM으로 저장 (DB와 일치)
        optionsHTML += `<option value="${timeCode}" ${disabled} ${style}>${timeDisplay} [${displayCount}/${maxCapacity}명] ${status}</option>`;
    });

    timeSlotSelect.innerHTML = optionsHTML;
    
    console.log(`✅ Time slots updated successfully for "${selectedProgram}" with ${availableTimeSlots.length} available slots, max capacity ${maxCapacity}`);
}

// Show success modal
function showSuccessModal() {
    const modal = document.getElementById('successModal');
    modal.classList.add('active');
}

// Close modal and reset to page 1
function closeModal() {
    const modal = document.getElementById('successModal');
    modal.classList.remove('active');
    
    // Reset to page 1
    goToPage1();
}

// Utility function to escape HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Show inquiry form modal
function showInquiryForm() {
    document.getElementById('inquiryModal').classList.add('active');
}

// Close inquiry modal
function closeInquiryModal() {
    document.getElementById('inquiryModal').classList.remove('active');
    document.getElementById('inquiryForm').reset();
}

/* ── 내 문의 조회 모달 ───────────────────────────────────────────────── */
function showMyInquiryModal() {
    const modal = document.getElementById('myInquiryModal');
    if (!modal) return;
    // 입력 초기화 (이름 필드는 hidden이므로 제외)
    ['myInqDong','myInqHo','myInqPhone4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.value = ''; el.style.borderColor = '#d1d5db'; }
    });
    document.getElementById('myInquiryResult').innerHTML = '';
    modal.style.display = 'flex';
    modal.style.alignItems = 'flex-start';
    document.body.style.overflow = 'hidden';
    modal.scrollTop = 0;
    // 첫 번째 입력 필드 포커스
    setTimeout(() => document.getElementById('myInqDong')?.focus(), 100);
}

function closeMyInquiryModal() {
    const modal = document.getElementById('myInquiryModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

async function searchMyInquiries() {
    const isHotelMode = complexContext?.isHotel?.() ?? false;
    const dong      = document.getElementById('myInqDong')?.value.trim();
    const ho        = document.getElementById('myInqHo')?.value.trim();
    const phone4    = document.getElementById('myInqPhone4')?.value.trim();
    const resultEl  = document.getElementById('myInquiryResult');

    // 유효성 검사 — 전화번호 끝 4자리만 필수, 동·호수/객실은 선택
    if (!phone4 || !/^\d{4}$/.test(phone4)) {
        document.getElementById('myInqPhone4').style.borderColor = '#ef4444';
        resultEl.innerHTML = `<p style="color:#e53e3e;font-size:.85rem;text-align:center;padding:8px 0">
            <i class="fas fa-exclamation-circle"></i> 전화번호 끝 4자리를 숫자로 입력하세요.</p>`;
        return;
    }

    resultEl.innerHTML = `<div style="text-align:center;padding:16px;color:#9ca3af">
        <i class="fas fa-spinner fa-spin"></i> 조회 중...</div>`;

    try {
        const complexId   = complexContext?.getComplexId?.()   || '';
        const complexCode = complexContext?.getComplexCode?.() || '';
        // 전화번호 끝 4자리 필수, 동·호수/객실은 입력된 경우에만 파라미터 추가
        const params = new URLSearchParams({ phoneLast4: phone4 });
        if (isHotelMode) {
            // 호텔 모드: myInqDong에 객실 번호가 입력됨 (hotelPatch 후 단일 필드)
            if (dong) params.set('room', dong);
        } else {
            if (dong) params.set('dong', dong);
            if (ho)   params.set('ho', ho);
        }
        if (complexId)   params.set('complexId', complexId);
        if (complexCode) params.set('complexCode', complexCode);

        const res  = await fetch(`/api/inquiries/my?${params}`);
        const data = await res.json();

        if (!data.success) {
            resultEl.innerHTML = `<div style="background:#fff5f5;border:1px solid #fecaca;border-radius:8px;
                padding:14px;text-align:center;font-size:.85rem;color:#b91c1c;line-height:1.6">
                <i class="fas fa-exclamation-circle" style="font-size:1.3rem;display:block;margin-bottom:6px"></i>
                ${data.error || '조회 결과가 없습니다.'}</div>`;
            return;
        }

        const list = data.data || [];
        if (list.length === 0) {
            resultEl.innerHTML = `<div style="text-align:center;padding:20px;color:#9ca3af;font-size:.88rem">
                <i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:8px"></i>
                등록된 문의가 없습니다.</div>`;
            return;
        }

        // UTC → KST(+9h) 변환하여 날짜 표시
        const fmtDate = (iso) => {
            if (!iso) return '';
            const d = new Date(iso);
            const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
            return `${kst.getUTCFullYear()}. ${kst.getUTCMonth()+1}. ${kst.getUTCDate()}.`;
        };

        resultEl.innerHTML = `
            <div style="border-top:1px solid #f0f0f0;padding-top:12px;margin-bottom:4px">
                <span style="font-size:.8rem;font-weight:700;color:#374151">${list.length}건의 문의</span>
            </div>
            ${list.map(q => {
                const answered = q.answer && q.answer.trim();
                const badge = answered
                    ? `<span style="background:#dcfce7;color:#166534;font-size:.72rem;padding:2px 7px;border-radius:10px;font-weight:600">답변완료</span>`
                    : `<span style="background:#fef9c3;color:#854d0e;font-size:.72rem;padding:2px 7px;border-radius:10px;font-weight:600"><i class="fas fa-clock" style="font-size:.65rem"></i> 답변 대기중</span>`;
                const privacy = q.is_public
                    ? `<span style="font-size:.72rem;color:#6b7280">공개</span>`
                    : `<span style="font-size:.72rem;color:#6b7280"><i class="fas fa-lock" style="font-size:.65rem"></i> 비공개</span>`;
                return `
                <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:10px">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                        <div style="display:flex;gap:6px;align-items:center">${badge}${privacy}</div>
                        <span style="font-size:.75rem;color:#9ca3af">${fmtDate(q.created_at)}</span>
                    </div>
                    <div style="font-weight:700;font-size:.9rem;color:#111827;margin-bottom:4px">${q.title}</div>
                    <div style="font-size:.83rem;color:#4b5563;white-space:pre-wrap;margin-bottom:${answered ? '10px' : '0'}">${q.content}</div>
                    ${answered ? `
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;padding:10px 12px;margin-top:6px">
                        <div style="font-size:.75rem;font-weight:700;color:#166534;margin-bottom:4px">
                            <i class="fas fa-reply"></i> 관리자 답변 ${q.answered_at ? '· ' + fmtDate(q.answered_at) : ''}
                        </div>
                        <div style="font-size:.84rem;color:#166534;white-space:pre-wrap;line-height:1.6">${q.answer}</div>
                    </div>` : ''}
                </div>`;
            }).join('')}`;
    } catch (e) {
        resultEl.innerHTML = `<p style="color:#e53e3e;font-size:.85rem;text-align:center;padding:8px 0">
            오류가 발생했습니다: ${e.message}</p>`;
    }
}
/* ── 내 문의 조회 끝 ─────────────────────────────────────────────────── */

async function submitInquiry(e) {
    e.preventDefault();

    const name    = document.getElementById('inquiryName').value.trim();
    const phone   = document.getElementById('inquiryPhone').value.trim();
    const title   = document.getElementById('inquiryTitle').value.trim();
    const content = document.getElementById('inquiryContent').value.trim();

    if (!name)  { alert('이름을 입력해주세요.'); return; }
    if (!phone) { alert('전화번호를 입력해주세요.'); return; }
    if (!/^01[0-9]{1}-?\d{3,4}-?\d{4}$/.test(phone.replace(/\s/g, ''))) {
        alert('전화번호 형식이 올바르지 않습니다.\n예) 010-1234-5678');
        return;
    }
    if (!title)   { alert('제목을 입력해주세요.'); return; }
    if (!content) { alert('내용을 입력해주세요.'); return; }

    const isHotelModeInq = complexContext?.isHotel?.() ?? false;
    // 호텔 모드: room 필드에서 객실 번호 읽기 / 아파트 모드: dong·ho 필드
    const dongVal = isHotelModeInq
        ? (document.getElementById('inquiryRoom')?.value.trim() || '')
        : document.getElementById('inquiryDong')?.value.trim() || '';
    const hoVal   = isHotelModeInq ? '' : (document.getElementById('inquiryHo')?.value.trim() || '');

    const inquiryData = {
        complex_id: complexContext.getComplexId(),
        dong: dongVal,
        ho:   hoVal,
        name,
        phone,
        title,
        content,
        is_public: document.getElementById('inquiryPublic')?.checked ?? true,
        status: '대기중',
        created_at: new Date().getTime()
    };
    
    try {
        const response = await fetch('/api/inquiries', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                complex_id: inquiryData.complex_id,
                dong: inquiryData.dong,
                ho: inquiryData.ho,
                name: inquiryData.name,
                phone: inquiryData.phone,
                title: inquiryData.title,
                content: inquiryData.content,
                is_public: inquiryData.is_public
            })
        });
        
        if (response.ok) {
            alert('문의가 접수되었습니다. 빠른 시일 내에 답변 드리겠습니다.');
            closeInquiryModal();
            if (inquiryData.is_public) {
                loadPublicInquiries();
            }
        } else {
            throw new Error('Failed to submit inquiry');
        }
    } catch (error) {
        console.error('Error submitting inquiry:', error);
        alert('문의 접수에 실패했습니다. 다시 시도해주세요.');
    }
}

// 중복 신청 경고 모달
function showDuplicateWarningModal(contractData, existing) {
    const modal = document.getElementById('duplicateWarningModal');
    const content = document.getElementById('duplicateWarningContent');

    const statusLabel = existing?.status === 'waiting' ? '대기 중' : '승인 완료';
    const progName = existing?.program_name || contractData.lesson_type || '-';

    content.innerHTML = `
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;margin-bottom:4px">
            <p style="margin:0 0 6px"><strong>동/호:</strong> ${contractData.dong}동 ${contractData.ho}호</p>
            <p style="margin:0 0 6px"><strong>성명:</strong> ${contractData.name}</p>
            <p style="margin:0 0 6px"><strong>연락처:</strong> ${contractData.phone}</p>
            <p style="margin:0"><strong>기존 신청:</strong> ${progName} <span style="color:#d97706">(${statusLabel})</span></p>
        </div>`;

    modal.classList.add('active');
}

// 중복 신청 경고 모달 닫기
function closeDuplicateWarningModal() {
    const modal = document.getElementById('duplicateWarningModal');
    modal.classList.remove('active');
}

// Show success notification modal
function showSuccessNotificationModal(contractData) {
    const modal = document.getElementById('successNotificationModal');
    const content = document.getElementById('successNotificationContent');

    // 서버에서 받은 실제 status에 따라 아이콘·타이틀·상태 텍스트 결정
    const status = contractData.status || 'approved';

    const iconEl  = document.getElementById('successNotificationIcon');
    const titleEl = document.getElementById('successNotificationTitle');

    let statusHtml;
    if (status === 'waiting') {
        if (iconEl)  { iconEl.className  = 'fas fa-clock result-icon'; iconEl.style.color  = '#f59e0b'; }
        if (titleEl) titleEl.textContent = '신청 접수가 완료되었습니다!';
        statusHtml = `<span style="color:#d97706;font-weight:600">⏳ 승인 대기 중</span>
            <div style="margin-top:8px;background:#fff7ed;border-left:3px solid #f59e0b;padding:8px 12px;border-radius:6px;font-size:.85rem;color:#92400e">
                입금 확인 후 관리자가 수동 승인합니다.<br>승인 완료 시 안내 문자가 발송됩니다.
            </div>`;
    } else if (status === 'received') {
        if (iconEl)  { iconEl.className  = 'fas fa-clipboard-check result-icon'; iconEl.style.color = '#6366f1'; }
        if (titleEl) titleEl.textContent = '신청 접수가 완료되었습니다!';
        statusHtml = `<span style="color:#6366f1;font-weight:600">📋 접수 완료 (검토 중)</span>
            <div style="margin-top:8px;background:#f0f4ff;border-left:3px solid #6366f1;padding:8px 12px;border-radius:6px;font-size:.85rem;color:#3730a3">
                관리자 검토 후 승인 처리됩니다.<br>승인 완료 시 안내 문자가 발송됩니다.
            </div>`;
    } else {
        // approved (카드 결제·자동승인 단지)
        if (iconEl)  { iconEl.className  = 'fas fa-check-circle result-icon success'; iconEl.style.color = ''; }
        if (titleEl) titleEl.textContent = '신청이 완료되었습니다!';
        statusHtml = `<span style="color:#059669;font-weight:600">✅ 승인 완료</span>`;
    }

    content.innerHTML = `
        <p><strong>프로그램:</strong> ${contractData.lesson_type}</p>
        <p><strong>희망 시간:</strong> ${contractData.preferred_time}</p>
        <p style="display:flex;flex-direction:column;gap:4px"><strong>상태:</strong> ${statusHtml}</p>
    `;
    
    modal.classList.add('active');
}

// Close success notification modal
function closeSuccessNotificationModal() {
    const modal = document.getElementById('successNotificationModal');
    modal.classList.remove('active');
    
    // 모달 닫을 때 폼 리셋
    document.getElementById('contractForm').reset();
    document.getElementById('termsAgreement').checked = false;
    const ra = document.getElementById('refundAgreement');  if (ra)  ra.checked = false;
    document.getElementById('signatureName').value = '';
    if (typeof signaturePad !== 'undefined' && signaturePad) {
        signaturePad.clear();
    }
    formData = {};
    
    // 페이지 1로 돌아가기
    goToPage1();
}

// 🆕 B. 대기열 모달 표시
function showWaitingListModal(contractData) {
    const modal = document.getElementById('successNotificationModal');
    const content = document.getElementById('successNotificationContent');
    
    content.innerHTML = `
        <div style="text-align: center;">
            <i class="fas fa-clock" style="font-size: 48px; color: #f59e0b; margin-bottom: 15px;"></i>
        </div>
        <p><strong>프로그램:</strong> ${contractData.lesson_type}</p>
        <p><strong>희망 시간:</strong> ${contractData.preferred_time}</p>
        <p><strong>대기 순번:</strong> ${contractData.waiting_order}번</p>
        <div style="background: #fff7ed; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-size: 0.95rem;">
                <i class="fas fa-info-circle"></i> <strong>대기 안내</strong><br><br>
                현재 프로그램이 마감되어 대기 목록에 등록되었습니다.<br><br>
                취소자가 발생하면 순번대로 <strong>자동 승인</strong>되며,<br>
                승인 시 <strong>자동으로 연락</strong>드립니다.<br><br>
                궁금하신 사항은 문의처에 접수해주세요.
            </p>
        </div>
    `;
    
    modal.classList.add('active');
}

// 정원 마감 안내 모달 (대기 시스템 폐기 후)
function showFullCapacityModal(contractData, errorMsg) {
    const modal = document.getElementById('successNotificationModal');
    const content = document.getElementById('successNotificationContent');

    content.innerHTML = `
        <div style="text-align:center;">
            <i class="fas fa-ban" style="font-size:48px;color:#ef4444;margin-bottom:15px;"></i>
            <h3 style="color:#ef4444;margin-bottom:10px;">정원 마감</h3>
        </div>
        <p><strong>프로그램:</strong> ${contractData.lesson_type || ''}</p>
        <p><strong>희망 시간:</strong> ${contractData.preferred_time || ''}</p>
        <div style="background:#fef2f2;padding:15px;border-radius:8px;margin-top:16px;border-left:4px solid #ef4444;">
            <p style="margin:0;color:#991b1b;font-size:.93rem;">
                <i class="fas fa-exclamation-triangle"></i> <strong>신청 불가 안내</strong><br><br>
                ${errorMsg || '선택하신 시간대가 정원 마감되어 신청이 불가합니다.'}<br><br>
                다른 요일 또는 시간대를 선택하여 다시 신청해 주세요.<br>
                <span style="font-size:.85rem;color:#b91c1c;">※ 대기 접수는 현재 운영되지 않습니다.</span>
            </p>
        </div>
    `;

    modal.classList.add('active');
}

// Load public inquiries
async function loadPublicInquiries() {
    try {
        const complexId = complexContext.getComplexId();
        if (!complexId) {
            console.warn('⚠️ Complex ID not available yet');
            return;
        }
        
        const params = new URLSearchParams({ complexId, limit: 100 });
        const response = await fetch(`/api/inquiries?${params}`);
        const result = await response.json();
        const inquiries = result.data || [];
        
        // Filter: public + not hidden + not deleted
        const publicInquiries = inquiries.filter(inq => 
            inq.is_public && 
            !inq.is_hidden &&
            !inq.is_deleted
        );
        
        console.log(`📋 Loaded ${publicInquiries.length} public inquiries (filtered from ${inquiries.length} total)`);
        
        const container = document.getElementById('inquiriesContainer');
        
        if (publicInquiries.length === 0) {
            container.innerHTML = `
                <div class="inquiry-empty">
                    <i class="fas fa-inbox" style="font-size: 48px; color: #cbd5e0; margin-bottom: 15px;"></i>
                    <p>아직 등록된 문의가 없습니다.</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = publicInquiries.map(inq => `
            <div class="inquiry-item">
                <div class="inquiry-header-row">
                    <div class="inquiry-title">
                        <i class="fas fa-question-circle"></i> ${escapeHtml(inq.title)}
                    </div>
                    <div class="inquiry-date">
                        ${kstDateStr(inq.created_at)}
                    </div>
                </div>
                <div class="inquiry-content">
                    ${escapeHtml(inq.content)}
                </div>
                ${(inq.answer && inq.answer.trim()) ? `
                    <div class="inquiry-reply">
                        <strong><i class="fas fa-reply"></i> 답변</strong>
                        ${escapeHtml(inq.answer)}
                        ${inq.answered_at ? `<div style="margin-top: 8px; font-size: 12px; color: #718096;">${kstDateStr(inq.answered_at)}</div>` : ''}
                    </div>
                ` : '<div style="color: #718096; font-size: 14px; margin-top: 10px;"><i class="fas fa-clock"></i> 답변 대기중</div>'}
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading inquiries:', error);
    }
}

// ===== CANCELLATION FUNCTIONS =====

// Show cancellation form modal (기간 체크 추가)

/* ═══════════════════════════════════════════════════════════════
   [공통 헬퍼] 내 신청 취소·변경 기간 설정 조회
   - 서버 apply-settings 우선, 실패 시 22~26일 기본값 폴백
   - 반환: { isOpen, periodLabel, cancelPeriodLabel, changePeriodLabel }
   ═══════════════════════════════════════════════════════════════ */
async function _getManagePeriodSetting() {
    const now    = new Date();
    const nowKst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const day    = nowKst.getUTCDate();
    const hour   = nowKst.getUTCHours();
    const autoIsOpen = (day === 22 && hour >= 9) || (day > 22 && day < 26) || (day === 26 && hour < 9);
    const DEFAULT_LABEL = '매월 22일 09시 ~ 26일 09시';

    // ISO 날짜 → KST 표시 텍스트
    const fmtKst = (iso) => {
        const d  = new Date(iso);
        const kd = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const mo = kd.getUTCMonth() + 1;
        const dy = kd.getUTCDate();
        const hr = kd.getUTCHours();
        const mi = kd.getUTCMinutes();
        return `${mo}월 ${dy}일 ${hr}시${mi ? ' ' + mi + '분' : ''}`;
    };

    // 기간 설정 → 표시 텍스트 변환
    // globalLabel: 전체 기본 기간(global) 설정에서 만든 레이블 (auto 모드 폴백용)
    const makePeriodLabel = (setting, globalLabel) => {
        if (!setting) return globalLabel || DEFAULT_LABEL;
        const mode = setting.period_mode || 'auto';
        if (mode === 'always') return '상시 가능';
        if (mode === 'closed') return '현재 접수 마감';
        if (mode === 'custom' && setting.period_start && setting.period_end) {
            return `${fmtKst(setting.period_start)} ~ ${fmtKst(setting.period_end)}`;
        }
        // auto: 개별 설정이 없으면 global 기간 레이블 사용, 그것도 없으면 기본값
        return globalLabel || DEFAULT_LABEL;
    };

    const complexId = complexContext?.getComplexId?.();
    if (complexId) {
        try {
            // apply-settings(개별)와 apply-period(전체 기본) 병렬 조회
            const [resS, resP] = await Promise.all([
                fetch(`/api/complexes/${complexId}/apply-settings`),
                fetch(`/api/complexes/${complexId}/apply-period`),
            ]);
            const [jsonS, jsonP] = await Promise.all([resS.json(), resP.json()]);

            // 전체 기본 기간(global) 레이블 계산
            let globalLabel = DEFAULT_LABEL;
            if (jsonP.success && jsonP.data) {
                const gd = jsonP.data;
                if (gd.mode === 'always_open') {
                    globalLabel = '상시 가능';
                } else if (gd.mode === 'custom' && gd.apply_start && gd.apply_end) {
                    globalLabel = `${fmtKst(gd.apply_start)} ~ ${fmtKst(gd.apply_end)}`;
                }
                // mode === 'auto' → DEFAULT_LABEL 유지
            }

            if (jsonS.success) {
                const newSetting    = (jsonS.data || []).find(x => x.apply_type_key === 'new');
                const cancelSetting = (jsonS.data || []).find(x => x.apply_type_key === 'cancel');
                const changeSetting = (jsonS.data || []).find(x => x.apply_type_key === 'change');
                // is_open은 서버에서 global 설정 포함해 정확히 계산된 값
                const isOpen = newSetting ? newSetting.is_open : (jsonP.data?.is_open ?? autoIsOpen);
                // 취소·변경 기간: change 타입 설정이 있으면 사용, 없으면 auto(22일~26일 폴백)
                const changeIsOpen = changeSetting ? changeSetting.is_open : autoIsOpen;
                return {
                    isOpen,
                    periodLabel:        makePeriodLabel(newSetting, globalLabel),
                    cancelPeriodLabel:  makePeriodLabel(cancelSetting, globalLabel),
                    changePeriodLabel:  makePeriodLabel(changeSetting, globalLabel),
                    changeIsOpen,
                    globalLabel,
                    newSetting,
                    cancelSetting,
                    changeSetting,
                };
            }
        } catch(_) { /* 폴백 */ }
    }
    return {
        isOpen:             autoIsOpen,
        periodLabel:        DEFAULT_LABEL,
        cancelPeriodLabel:  DEFAULT_LABEL,
        changePeriodLabel:  DEFAULT_LABEL,
        changeIsOpen:       autoIsOpen,
        globalLabel:        DEFAULT_LABEL,
        newSetting:         null,
        cancelSetting:      null,
        changeSetting:      null,
    };
}

/* ═══════════════════════════════════════════════════════════════
   계약서 페이지 · 레슨 해지 모달 내 하드코딩 기간 텍스트 동적 업데이트
   ─ 서버 apply-settings + apply-period + payment_mode 기반으로 실시간 반영
   ═══════════════════════════════════════════════════════════════ */
async function _updateContractPeriodLabels() {
    const { periodLabel, cancelPeriodLabel, globalLabel, newSetting, cancelSetting } = await _getManagePeriodSetting();

    // ── payment_mode 조회 (direct 여부 판단) ──────────────────────────────
    let isDirectPayment = false;
    const complexId = complexContext?.getComplexId?.();
    if (complexId) {
        try {
            const res  = await fetch(`/api/complexes/${complexId}/apply-settings`);
            const json = await res.json();
            if (json.success && json.complex) {
                isDirectPayment = json.complex.payment_mode === 'direct';
            }
        } catch(_) { /* 폴백: management_fee 취급 */ }
    }

    // ── 계약서 상단 "신청·해지 기간 필수 안내" 섹션 ─────────────────────────
    // 등록 접수 기간
    const newPeriodEl = document.getElementById('contractNewPeriodDate');
    if (newPeriodEl) newPeriodEl.innerHTML = `매월 <strong>${periodLabel}</strong>`;

    // 해지 신청 기간
    const cancelPeriodEl = document.getElementById('contractCancelPeriodDate');
    if (cancelPeriodEl) {
        // 상시 가능 포함 항상 텍스트 표시 (숨김 없음)
        cancelPeriodEl.innerHTML = `매월 <strong>${cancelPeriodLabel}</strong>`;
    }

    // 자동 재등록 안내 줄 — direct(계좌/현금) 방식이면 숨김
    const autoRenewRow = document.getElementById('contractAutoRenewRow');
    if (autoRenewRow) autoRenewRow.style.display = isDirectPayment ? 'none' : '';
    const autoRenewEl = document.getElementById('contractAutoRenewPeriod');
    if (autoRenewEl) autoRenewEl.textContent = cancelPeriodLabel;

    // ── 해지 및 환불 규정 > "해지 신청 기간" 텍스트 ───────────────────────────
    const p1 = document.getElementById('policyHaejiPeriod1');
    if (p1) p1.textContent = cancelPeriodLabel;

    // 이용약관 ② 환불 규정 내 기간 텍스트
    const p2 = document.getElementById('policyHaejiPeriod2');
    if (p2) p2.textContent = cancelPeriodLabel;

    // ── 이용약관 ⑧항 — payment_mode에 따라 조건부 표시 ──────────────────────
    const terms8Mgmt   = document.getElementById('terms8ManagementFee');
    const terms8Direct = document.getElementById('terms8Direct');
    const p3           = document.getElementById('policyHaejiPeriod3');
    const p3Direct     = document.getElementById('policyHaejiPeriod3Direct');
    const agreeLabel   = document.getElementById('termsAgreeLabel');

    if (isDirectPayment) {
        // direct: 자동연장 문구 제거, 해지 신청 기간만 표시
        if (terms8Mgmt)   terms8Mgmt.style.display   = 'none';
        if (terms8Direct) terms8Direct.style.display  = '';
        // direct용 기간 텍스트 업데이트
        if (p3Direct) p3Direct.textContent = cancelPeriodLabel;
        // 동의 문구: ①~⑧ 유지 (HTML 기본값 사용)
    } else {
        // management_fee: 자동연장 포함 기존 문구
        if (terms8Mgmt)   terms8Mgmt.style.display   = '';
        if (terms8Direct) terms8Direct.style.display  = 'none';
        if (p3) p3.textContent = cancelPeriodLabel;
        if (agreeLabel) agreeLabel.innerHTML = '위 이용약관 전체 (①~⑧)를 모두 읽고 동의합니다 <span class="required">*</span>';
    }
}

/* ═══════════════════════════════════════════════════════════════
   내 신청 취소·변경 탭바 초기화 (페이지 로드 시)
   ─ 서버 apply-settings 기반으로 탭바/배지/헤더 버튼 활성화
   ═══════════════════════════════════════════════════════════════ */
async function initManageTabBar() {
    // 서버 설정 기반 기간 조회 (비동기) — 취소·변경 탭은 change 타입 기준
    const { changeIsOpen: isOpen } = await _getManagePeriodSetting();

    // ① 탭바 버튼 스타일
    const tabBtn = document.getElementById('manageTabBtn');
    const badge  = document.getElementById('manageTabPeriodBadge');
    if (tabBtn) {
        if (isOpen) {
            tabBtn.style.color = '#4f46e5';
            tabBtn.style.borderBottomColor = '#4f46e5';
            tabBtn.style.background = '#f5f3ff';
        } else {
            tabBtn.style.color = '#6b7280';
            tabBtn.style.borderBottomColor = 'transparent';
            tabBtn.style.background = 'transparent';
        }
    }
    if (badge) badge.style.display = isOpen ? 'inline' : 'none';

    // ② 헤더 버튼 배지 (22일09시~26일09시 활성화 알림)
    const headerBadge = document.getElementById('headerManageBadge');
    if (headerBadge) headerBadge.style.display = isOpen ? 'block' : 'none';

    // ③ 헤더 버튼 배경색 (기간에 따라 변경)
    const headerBtn = document.getElementById('headerManageBtn');
    if (headerBtn) {
        headerBtn.style.background = isOpen ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : '#4f46e5';
        headerBtn.style.animation = isOpen ? 'pulse 2s infinite' : 'none';
    }
}

/* ═══════════════════════════════════════════════════════════════
   내 신청 취소·변경 (매월 22일 09:00 ~ 26일 09:00 KST)
   ═══════════════════════════════════════════════════════════════ */
async function showMyManageModal() {
    const modal = document.getElementById('myManageModal');
    if (!modal) return;
    // 입력 초기화
    ['manageDong','manageHo','managePhone4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('manageResult').innerHTML = '';

    // 서버 설정 기반으로 기간 배너 표시
    const banner = document.getElementById('managePeriodBanner');
    if (banner) {
        // 로딩 중 임시 표시
        banner.innerHTML = `<div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;
                               padding:10px 13px;font-size:.82rem;color:#6b7280;margin-bottom:8px">
                   <i class="fas fa-spinner fa-spin"></i> 접수 기간 확인 중...
               </div>`;
    }
    modal.style.display = 'flex';

    // 비동기로 실제 기간 설정 조회
    const { changeIsOpen, changePeriodLabel } = await _getManagePeriodSetting();
    if (banner) {
        banner.innerHTML = changeIsOpen
            ? `<div style="background:#dcfce7;border:1px solid #22c55e;border-radius:8px;
                           padding:10px 13px;font-size:.82rem;color:#166534;margin-bottom:8px">
                   <i class="fas fa-calendar-check"></i>
                   <strong> 신청 취소·변경 가능 기간입니다 (${changePeriodLabel})</strong>
               </div>`
            : `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;
                           padding:10px 13px;font-size:.82rem;color:#92400e;margin-bottom:8px">
                   <i class="fas fa-clock"></i>
                   <strong> 신청 취소·변경은 ${changePeriodLabel}에만 가능합니다</strong><br>
                   <span style="font-size:.78rem">현재는 조회만 가능합니다</span>
               </div>`;
    }
}

function closeMyManageModal() {
    const modal = document.getElementById('myManageModal');
    if (modal) modal.style.display = 'none';
}

// 내 신청 목록 불러오기
async function loadMyManageList() {
    const dong   = document.getElementById('manageDong')?.value.trim();
    const ho     = document.getElementById('manageHo')?.value.trim();
    const phone4 = document.getElementById('managePhone4')?.value.trim();
    const resultEl = document.getElementById('manageResult');

    if (!dong)   { document.getElementById('manageDong').style.borderColor='#ef4444'; return; }
    if (!ho)     { document.getElementById('manageHo').style.borderColor='#ef4444'; return; }
    if (!phone4 || phone4.length !== 4 || !/^\d{4}$/.test(phone4)) {
        document.getElementById('managePhone4').style.borderColor='#ef4444';
        resultEl.innerHTML = `<p style="color:#ef4444;font-size:.83rem;text-align:center">전화번호 뒷 4자리를 숫자로 입력하세요</p>`;
        return;
    }

    const btn = document.getElementById('manageSearchBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...'; }
    resultEl.innerHTML = '';

    try {
        const complexCode = complexContext?.getComplexCode?.() || '';
        const res = await fetch(`/api/applications/my?complexCode=${encodeURIComponent(complexCode)}&dong=${encodeURIComponent(dong)}&ho=${encodeURIComponent(ho)}&phone4=${encodeURIComponent(phone4)}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '조회 실패');

        const list = (data.data || []).filter(a => a.status === 'approved' || a.status === 'waiting');

        // 전체 데이터 저장 (시간대 변경 시 재사용)
        window._manageAppList = data.data || [];

        if (!list.length) {
            resultEl.innerHTML = `
                <div style="text-align:center;padding:20px 0;color:#6b7280">
                    <i class="fas fa-search" style="font-size:2rem;opacity:.3;display:block;margin-bottom:8px"></i>
                    <p style="font-size:.87rem">승인·대기 신청 내역이 없습니다.<br>
                    <small style="color:#9ca3af">동·호수·전화번호를 다시 확인해 주세요</small></p>
                </div>`;
            return;
        }

        // 서버 설정 기반으로 기간 조회 (취소·변경 기간은 change 타입 사용)
        const { changeIsOpen: isOpen, changePeriodLabel: periodLabel, cancelPeriodLabel } = await _getManagePeriodSetting();

        const fmtTime = t => {
            if (!t) return '-';
            const [h] = t.split(':').map(Number);
            if (isNaN(h)) return t;
            return `${h < 12 ? '오전' : '오후'} ${h === 0 ? 12 : h > 12 ? h - 12 : h}시`;
        };

        // 현재 저장된 조회 정보 (취소/변경 시 재사용)
        window._managePhone4 = phone4;

        // 승인된 신청의 available-slots 미리 조회 (변경 가능 슬롯 정보 표시용)
        const approvedList = list.filter(a => a.status === 'approved');
        const slotsMap = {}; // appId -> { availableCount, totalCount }
        if (isOpen && approvedList.length > 0) {
            await Promise.all(approvedList.map(async a => {
                try {
                    const r = await fetch(`/api/applications/${a.id}/available-slots?phone4=${encodeURIComponent(phone4)}`);
                    const d = await r.json();
                    if (d.success && d.data) {
                        const availCnt = d.data.filter(s => s.available).length;
                        const totalCnt = d.data.length;
                        slotsMap[a.id] = { availableCount: availCnt, totalCount: totalCnt };
                    }
                } catch(_) { /* 조회 실패 시 무시 */ }
            }));
        }

        resultEl.innerHTML = `
            <div style="border-top:1px solid #f0f0f0;padding-top:12px">
                <div style="font-size:.8rem;color:#6b7280;margin-bottom:10px;font-weight:600">
                    <i class="fas fa-list"></i> ${list.length}건의 신청 내역
                </div>
                ${list.map(a => {
                    const isWaiting = a.status === 'waiting';
                    const statusBg  = isWaiting ? '#fef3c7' : '#dcfce7';
                    const statusCol = isWaiting ? '#92400e' : '#166534';
                    const statusTxt = isWaiting ? `⏳ 대기 ${a.waiting_order || ''}번` : '✅ 승인';

                    // 변경 가능 슬롯 정보
                    const slotInfo = slotsMap[a.id];
                    const hasAvailSlots = slotInfo && slotInfo.availableCount > 0;
                    // 시간대 변경 버튼: 여유석 있으면 강조(파란 그라데이션)
                    const changeBtnStyle = !isWaiting
                        ? (hasAvailSlots
                            ? 'padding:9px 8px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(59,130,246,.4)'
                            : 'padding:9px 8px;background:#f3f4f6;border:1.5px solid #d1d5db;color:#9ca3af;border-radius:8px;font-size:.8rem;font-weight:600;cursor:not-allowed;opacity:.7')
                        : '';
                    const changeBtnLabel = !isWaiting
                        ? (slotInfo
                            ? (hasAvailSlots
                                ? `<i class="fas fa-exchange-alt"></i> 시간대 변경 <span style="font-size:.72rem;background:rgba(255,255,255,.3);color:#fff;padding:1px 5px;border-radius:8px;margin-left:2px">${slotInfo.availableCount}석 가능</span>`
                                : '<i class="fas fa-ban"></i> 변경불가 <span style="font-size:.72rem">모두 마감</span>')
                            : '<i class="fas fa-exchange-alt"></i> 시간대 변경')
                        : '';

                    return `
                    <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;
                                padding:12px 14px;margin-bottom:10px">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                            <span style="font-weight:700;font-size:.92rem;color:#1e293b">
                                ${a.program_name || '프로그램 정보 없음'}
                            </span>
                            <span style="font-size:.75rem;font-weight:700;padding:3px 8px;border-radius:20px;
                                         background:${statusBg};color:${statusCol}">
                                ${statusTxt}
                            </span>
                        </div>
                        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:.82rem;color:#475569;margin-bottom:10px">
                            <span style="color:#94a3b8">시간대</span>
                            <span style="font-weight:600;color:#0f172a">${fmtTime(a.preferred_time)} (${a.preferred_time || '-'})</span>
                            <span style="color:#94a3b8">동·호수</span>
                            <span>${a.dong} ${a.ho}</span>
                            <span style="color:#94a3b8">신청일</span>
                            <span>${a.created_at ? kstDateStr(a.created_at) : '-'}</span>
                        </div>
                        ${isOpen ? `
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                            ${!isWaiting ? `
                            <button onclick="${hasAvailSlots || !slotInfo ? `openChangeTimeModal('${a.id}','${(a.program_name||'').replace(/'/g,"\\'")}','${a.preferred_time||''}')` : 'void(0)'}"
                                    style="${changeBtnStyle}">
                                ${changeBtnLabel}
                            </button>` : '<div></div>'}
                            <button onclick="confirmCancelApplication('${a.id}','${(a.program_name||'').replace(/'/g,"\\'")}','${a.status}')"
                                    style="padding:8px;background:#fef2f2;border:1.5px solid #ef4444;
                                           color:#ef4444;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer">
                                <i class="fas fa-times-circle"></i> ${isWaiting ? '대기 취소' : '신청 철회'}
                            </button>
                        </div>
                        ${!isWaiting ? `
                        <div style="margin-top:7px;padding:7px 10px;background:#fff7ed;border:1px solid #fed7aa;
                                    border-radius:7px;font-size:.75rem;color:#92400e;line-height:1.6">
                            <i class="fas fa-lightbulb" style="color:#f97316"></i>
                            <strong>시간대만 바꾸고 싶다면?</strong>
                            위 <span style="background:#1d4ed8;color:#fff;padding:1px 5px;border-radius:4px;font-size:.72rem">시간대 변경</span> 버튼을 이용하세요.<br>
                            <span style="color:#b45309">⚠️ 신청 철회 후 재접수 시 수강 해지로 처리될 수 있습니다.</span>
                        </div>` : ''}
                        ` : `
                        <div style="text-align:center;font-size:.78rem;color:#9ca3af;padding:4px 0">
                            <i class="fas fa-lock"></i> 신청 철회·변경은 ${periodLabel}에 가능합니다<br>
                            <span style="font-size:.72rem;color:#c0c0c0">※ 시간대 변경은 <strong>내 신청 취소·변경 탭</strong>의 <strong>시간대 변경</strong> 버튼을 이용하세요</span>
                        </div>`}
                    </div>`;
                }).join('')}
                <p style="font-size:.76rem;color:#9ca3af;text-align:center;margin-top:4px">
                    <i class="fas fa-lock" style="font-size:.7rem"></i>
                    개인정보 보호를 위해 일부 정보는 가려져 있습니다
                </p>
            </div>`;
    } catch(e) {
        resultEl.innerHTML = `<p style="color:#ef4444;font-size:.83rem;text-align:center;padding:12px 0">
            <i class="fas fa-exclamation-circle"></i> ${e.message}</p>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> 내 신청 내역 불러오기'; }
    }
}

// 신청 취소 확인 (대기/승인 모두)
// ※ 이 취소는 "수강 시작 전 신청 철회" 입니다.
//   - 수강을 중단하는 "해지"(해지 신청 탭에서 설정된 접수 기간)와 완전히 다릅니다.
//   - 관리비 부과 없음, 정산 집계 제외.
async function confirmCancelApplication(appId, programName, status) {
    const isWaiting = (status === 'waiting');
    const phone4 = window._managePhone4;
    if (!phone4) { alert('먼저 전화번호를 입력하여 조회해 주세요.'); return; }

    // 해지 신청 기간 레이블을 서버에서 가져와 confirm 메시지에 반영
    const { cancelPeriodLabel } = await _getManagePeriodSetting();
    const confirmed = confirm(
        isWaiting
            ? `[${programName}] 대기 신청을 취소하시겠습니까?\n\n취소하면 대기 순번이 제거됩니다.`
            : `[${programName}] 신청을 철회하시겠습니까?\n\n` +
              `※ 이 기능은 수강 시작 전 신청을 철회하는 것입니다.\n` +
              `익월 해지신청은 해지 신청 탭을 통하여 ${cancelPeriodLabel} 해지 신청 기간에 접수하세요.`
    );
    if (!confirmed) return;

    try {
        const endpoint = isWaiting ? 'cancel-waiting' : 'cancel-approved';
        const res = await fetch(`/api/applications/${appId}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone4 })
        });
        const data = await res.json();
        if (!data.success) { alert('취소 실패: ' + (data.error || '알 수 없는 오류')); return; }
        alert(`✅ ${data.message}`);
        loadMyManageList(); // 목록 새로고침
    } catch(e) {
        alert('오류 발생: ' + e.message);
    }
}

// 시간대 변경 모달 열기
// ─── 프로그램·시간대 변경 모달 (전면 개편) ───────────────────────
// available-slots API로 변경 가능 슬롯을 조회하여 선택 UI 제공
// 정원 마감 슬롯은 표시만 되고 선택 불가
function openChangeTimeModal(appId, programName, currentTime) {
    const phone4 = window._managePhone4;
    if (!phone4) { alert('먼저 전화번호를 입력하여 조회해 주세요.'); return; }
    _openChangeTimeModalImpl(appId, programName, currentTime, phone4);
}

async function _openChangeTimeModalImpl(appId, programName, currentTime, phone4) {
    // 로딩 모달 먼저 표시
    const existing = document.getElementById('changeTimeModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'changeTimeModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:100%;max-width:460px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)">
            <div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;padding:15px 18px;
                        display:flex;align-items:center;justify-content:space-between">
                <span style="font-weight:700"><i class="fas fa-exchange-alt"></i> 프로그램·시간대 변경</span>
                <button onclick="document.getElementById('changeTimeModal').remove()"
                        style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="changeTimeBody" style="padding:20px;text-align:center;color:#6b7280">
                <i class="fas fa-spinner fa-spin" style="font-size:1.5rem"></i>
                <p style="margin-top:8px;font-size:.88rem">변경 가능한 시간대를 불러오는 중...</p>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    try {
        // available-slots API 호출
        const res = await fetch(`/api/applications/${appId}/available-slots?phone4=${encodeURIComponent(phone4)}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '조회 실패');

        const slots = data.data || [];
        const fmtTime = t => {
            if (!t) return t;
            const [h] = t.split(':').map(Number);
            if (isNaN(h)) return t;
            return `${h < 12 ? '오전' : '오후'} ${h === 0 ? 12 : h > 12 ? h - 12 : h}시`;
        };

        // 프로그램별로 그룹핑
        const grouped = {};
        for (const s of slots) {
            if (!grouped[s.program_id]) grouped[s.program_id] = { name: s.program_name, slots: [] };
            grouped[s.program_id].slots.push(s);
        }

        const availableCount = slots.filter(s => s.available).length;

        let slotsHtml = '';
        if (slots.length === 0) {
            slotsHtml = `<div style="text-align:center;padding:20px 0;color:#6b7280">
                <i class="fas fa-calendar-times" style="font-size:2rem;opacity:.4;display:block;margin-bottom:8px"></i>
                <p style="font-size:.87rem">변경 가능한 슬롯이 없습니다</p>
            </div>`;
        } else {
            slotsHtml = Object.entries(grouped).map(([progId, group]) => {
                const slotItems = group.slots.map(s => {
                    const isCurrent = (progId === (data.current?.program_id) && s.time === currentTime);
                    if (isCurrent) return '';  // 현재 슬롯은 표시 안함

                    if (s.is_full) {
                        return `
                        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;
                                    border:1.5px solid #f3f4f6;border-radius:8px;margin-bottom:5px;
                                    background:#f9fafb;opacity:.6;cursor:not-allowed">
                            <div style="width:16px;height:16px;border-radius:50%;border:2px solid #d1d5db;flex-shrink:0"></div>
                            <span style="flex:1;font-size:.85rem;color:#9ca3af">${fmtTime(s.time)} (${s.time})</span>
                            <span style="font-size:.72rem;background:#fee2e2;color:#dc2626;padding:2px 7px;border-radius:10px;font-weight:600;flex-shrink:0">
                                마감 ${s.approved_count}/${s.capacity}
                            </span>
                        </div>`;
                    }

                    return `
                    <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;
                                  border:1.5px solid #e5e7eb;border-radius:8px;cursor:pointer;margin-bottom:5px;
                                  transition:all .15s;background:#fff"
                           onmouseover="this.style.borderColor='#3b82f6';this.style.background='#eff6ff'"
                           onmouseout="this.style.borderColor='#e5e7eb';this.style.background='#fff'">
                        <input type="radio" name="newSlot"
                               value="${s.time}" data-program-id="${progId}"
                               style="accent-color:#3b82f6;flex-shrink:0">
                        <span style="flex:1;font-size:.85rem;font-weight:600;color:#1e293b">
                            ${fmtTime(s.time)} <span style="font-weight:400;color:#64748b">(${s.time})</span>
                        </span>
                        <span style="font-size:.72rem;background:#dcfce7;color:#15803d;padding:2px 7px;border-radius:10px;font-weight:600;flex-shrink:0">
                            여유 ${s.capacity - s.approved_count}석
                        </span>
                    </label>`;
                }).join('');

                if (!slotItems.trim()) return '';

                return `
                <div style="margin-bottom:12px">
                    <div style="font-size:.78rem;font-weight:700;color:#4f46e5;margin-bottom:6px;
                                padding:4px 8px;background:#ede9fe;border-radius:6px;display:inline-block">
                        <i class="fas fa-calendar-week"></i> ${group.name}
                    </div>
                    ${slotItems}
                </div>`;
            }).join('');
        }

        document.getElementById('changeTimeBody').innerHTML = `
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;
                        padding:10px 12px;margin-bottom:14px;font-size:.82rem;color:#1e40af">
                <i class="fas fa-info-circle"></i>
                <strong>현재:</strong> ${programName} · ${fmtTime(currentTime)} (${currentTime})<br>
                <span style="font-size:.77rem;color:#64748b;margin-top:3px;display:block">
                    ✅ 변경 가능 ${availableCount}개 슬롯 · 🔴 마감 슬롯은 선택 불가
                </span>
            </div>
            <div style="max-height:300px;overflow-y:auto;padding-right:2px">${slotsHtml}</div>
            <button onclick="_doChangeTime('${appId}','${phone4}')"
                    style="width:100%;margin-top:14px;padding:11px;border:none;border-radius:9px;
                           background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;
                           font-size:.93rem;font-weight:700;cursor:pointer">
                <i class="fas fa-check"></i> 변경 확정
            </button>`;

    } catch(e) {
        document.getElementById('changeTimeBody').innerHTML = `
            <div style="text-align:center;padding:16px;color:#ef4444">
                <i class="fas fa-exclamation-circle" style="font-size:1.5rem"></i>
                <p style="margin-top:8px;font-size:.88rem">${e.message}</p>
                <button onclick="document.getElementById('changeTimeModal').remove()"
                        style="margin-top:12px;padding:7px 16px;background:#f3f4f6;border:none;
                               border-radius:7px;cursor:pointer;font-size:.85rem">닫기</button>
            </div>`;
    }
}

async function _doChangeTime(appId, phone4) {
    const selected = document.querySelector('input[name="newSlot"]:checked');
    if (!selected) { alert('변경할 시간대를 선택하세요'); return; }

    const newTime = selected.value;
    const newProgramId = selected.dataset.programId;

    // 확정 버튼 로딩 상태
    const btn = document.querySelector('#changeTimeModal button:last-of-type');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...'; }

    try {
        const res = await fetch(`/api/applications/${appId}/change-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone4, new_program_id: newProgramId, new_preferred_time: newTime })
        });
        const data = await res.json();
        if (!data.success) {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> 변경 확정'; }
            alert('변경 실패: ' + (data.error || '알 수 없는 오류'));
            return;
        }
        document.getElementById('changeTimeModal')?.remove();
        alert(`✅ ${data.message}`);
        loadMyManageList();
    } catch(e) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> 변경 확정'; }
        alert('오류 발생: ' + e.message);
    }
}

// ===== 내 신청 조회 =====
function showMyLookupModal() {
    const modal = document.getElementById('myLookupModal');
    if (!modal) return;
    // 초기화
    ['lookupDong','lookupHo','lookupPhone4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('lookupResult').innerHTML = '';
    modal.style.display = 'flex';
}

function closeMyLookupModal() {
    const modal = document.getElementById('myLookupModal');
    if (modal) modal.style.display = 'none';
}

async function lookupMyApplication() {
    const dong   = document.getElementById('lookupDong')?.value.trim();
    const ho     = document.getElementById('lookupHo')?.value.trim();
    const phone4 = document.getElementById('lookupPhone4')?.value.trim();
    const result = document.getElementById('lookupResult');

    // 유효성 검사
    if (!dong)   { document.getElementById('lookupDong').style.borderColor='#ef4444';   return; }
    if (!ho)     { document.getElementById('lookupHo').style.borderColor='#ef4444';     return; }
    if (!phone4 || phone4.length !== 4 || !/^\d{4}$/.test(phone4)) {
        document.getElementById('lookupPhone4').style.borderColor='#ef4444';
        result.innerHTML = `<p style="color:#ef4444;font-size:.83rem;text-align:center">전화번호 뒷 4자리를 숫자로 입력하세요</p>`;
        return;
    }

    const btn = document.getElementById('lookupBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...'; }
    result.innerHTML = '';

    try {
        const complexCode = complexContext?.getComplexCode?.() || '';
        const res = await fetch(`/api/applications/my?complexCode=${encodeURIComponent(complexCode)}&dong=${encodeURIComponent(dong)}&ho=${encodeURIComponent(ho)}&phone4=${encodeURIComponent(phone4)}`);
        const data = await res.json();

        if (!data.success) throw new Error(data.error || '조회 실패');

        const list = (data.data || []).filter(a => a.status === 'approved' || a.status === 'waiting');

        if (!list.length) {
            // 승인/대기 건 없음
            result.innerHTML = `
                <div style="text-align:center;padding:20px 0;color:#6b7280">
                    <i class="fas fa-search" style="font-size:2rem;opacity:.3;display:block;margin-bottom:8px"></i>
                    <p style="font-size:.87rem">승인된 신청 내역이 없습니다.<br>
                    <small style="color:#9ca3af">동·호수·전화번호를 다시 확인해 주세요</small></p>
                </div>`;
            return;
        }

        // 상태 라벨
        const statusLabel = s => ({
            approved:'승인', pending:'대기', waiting:'대기 중', rejected:'거부'
        }[s] || s);

        const statusColor = s => ({
            approved:'#059669', pending:'#d97706', waiting:'#d97706', rejected:'#dc2626'
        }[s] || '#6b7280');

        // 시간 포맷 (HH:MM → 오전/오후 H시)
        const fmtTime = t => {
            if (!t) return '-';
            const [hStr] = t.split(':');
            const h = parseInt(hStr);
            if (isNaN(h)) return t;
            const period = h < 12 ? '오전' : '오후';
            const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            return `${period} ${h12}시`;
        };

        const approvedList = list.filter(a => a.status === 'approved');
        const waitingList  = list.filter(a => a.status === 'waiting');

        result.innerHTML = `
            <div style="border-top:1px solid #f0f0f0;padding-top:12px">
                ${approvedList.length > 0 ? `
                <div style="font-size:.8rem;color:#6b7280;margin-bottom:10px;font-weight:600">
                    <i class="fas fa-check-circle" style="color:#059669"></i>
                    ${approvedList.length}건의 승인된 신청 내역
                </div>
                ${approvedList.map(a => `
                <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;
                            padding:12px 14px;margin-bottom:8px">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                        <span style="font-weight:700;font-size:.92rem;color:#1e293b">
                            ${a.program_name || '프로그램 정보 없음'}
                        </span>
                        <span style="font-size:.75rem;font-weight:700;padding:3px 8px;border-radius:20px;
                                     background:${statusColor(a.status)}20;color:${statusColor(a.status)}">
                            ${statusLabel(a.status)}
                        </span>
                    </div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:.82rem;color:#475569">
                        <span style="color:#94a3b8">시간대</span>
                        <span style="font-weight:600;color:#0f172a">${fmtTime(a.preferred_time)}</span>
                        <span style="color:#94a3b8">동·호수</span>
                        <span>${a.dong} ${a.ho}</span>
                        <span style="color:#94a3b8">신청일</span>
                        <span>${a.created_at ? kstDateStr(a.created_at) : '-'}</span>
                    </div>
                </div>`).join('')}` : ''}

                ${waitingList.length > 0 ? `
                <div style="font-size:.8rem;color:#d97706;margin:${approvedList.length > 0 ? '12px' : '0'} 0 10px;font-weight:600">
                    <i class="fas fa-clock"></i>
                    ${waitingList.length}건의 대기 신청 내역
                </div>
                ${waitingList.map(a => `
                <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;
                            padding:12px 14px;margin-bottom:8px">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                        <span style="font-weight:700;font-size:.92rem;color:#1e293b">
                            ${a.program_name || '프로그램 정보 없음'}
                        </span>
                        <span style="font-size:.75rem;font-weight:700;padding:3px 8px;border-radius:20px;
                                     background:#fef3c720;color:#d97706;border:1px solid #fde68a">
                            <i class="fas fa-clock" style="font-size:.68rem"></i> 대기 ${a.waiting_order ? a.waiting_order + '번' : ''}
                        </span>
                    </div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:.82rem;color:#475569;margin-bottom:10px">
                        <span style="color:#94a3b8">시간대</span>
                        <span style="font-weight:600;color:#0f172a">${fmtTime(a.preferred_time)}</span>
                        <span style="color:#94a3b8">동·호수</span>
                        <span>${a.dong} ${a.ho}</span>
                        <span style="color:#94a3b8">신청일</span>
                        <span>${a.created_at ? kstDateStr(a.created_at) : '-'}</span>
                    </div>
                    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:7px;padding:8px 10px;margin-bottom:10px;font-size:.78rem;color:#92400e;line-height:1.5">
                        <i class="fas fa-info-circle"></i>
                        대기 중이면 다른 프로그램 신청이 제한됩니다.<br>
                        더 이상 대기를 원하지 않으시면 아래 버튼으로 취소하세요.
                    </div>
                    <button onclick="cancelWaitingApplication('${a.id}', '${(a.program_name||'').replace(/'/g,'')}')"
                            style="width:100%;padding:8px;background:#fff;border:1.5px solid #ef4444;
                                   color:#ef4444;border-radius:8px;font-size:.83rem;font-weight:600;
                                   cursor:pointer;transition:background .15s"
                            onmouseover="this.style.background='#fef2f2'"
                            onmouseout="this.style.background='#fff'">
                        <i class="fas fa-times-circle"></i> 대기 신청 취소
                    </button>
                </div>`).join('')}` : ''}

                <p style="font-size:.76rem;color:#9ca3af;text-align:center;margin-top:6px">
                    <i class="fas fa-lock" style="font-size:.7rem"></i>
                    개인정보 보호를 위해 일부 정보는 가려져 있습니다
                </p>
            </div>`;
    } catch(e) {
        result.innerHTML = `<p style="color:#ef4444;font-size:.83rem;text-align:center;padding:12px 0">
            <i class="fas fa-exclamation-circle"></i> ${e.message}</p>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i> 조회하기'; }
    }
}

// ===== 입주민 대기 신청 취소 =====
async function cancelWaitingApplication(appId, programName) {
    // 확인 모달 (confirm 대신 커스텀 UI)
    const phone4 = prompt(
        `[${programName}] 대기 신청을 취소하시겠습니까?\n\n본인 확인을 위해 전화번호 뒷 4자리를 입력해 주세요.`
    );
    if (phone4 === null) return; // 취소 클릭
    if (!phone4 || !/^\d{4}$/.test(phone4.trim())) {
        alert('전화번호 뒷 4자리(숫자)를 올바르게 입력해 주세요.');
        return;
    }

    try {
        const res = await fetch(`/api/applications/${appId}/cancel-waiting`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone4: phone4.trim() })
        });
        const data = await res.json();

        if (!data.success) {
            alert('취소 실패: ' + (data.error || '알 수 없는 오류'));
            return;
        }

        alert(`[${programName}] 대기 신청이 취소되었습니다.\n이제 다른 프로그램에 신청할 수 있습니다.`);
        // 결과 새로고침
        lookupMyApplication();
    } catch (e) {
        alert('오류가 발생했습니다: ' + e.message);
    }
}

// ===== 접수·해지 기간 배너 =====
async function renderPeriodBanner() {
    const banner = document.getElementById('periodBanner');
    if (!banner) return;

    const now = new Date();
    const kst = new Date(now.getTime() + 9*60*60*1000);
    const day = kst.getUTCDate(), hour = kst.getUTCHours(), mon = kst.getUTCMonth()+1;

    // 서버 설정 기반 신규신청·해지 기간 조회
    let isEnrollOpen = null, isCancelOpen = null;
    const complexId = complexContext?.getComplexId?.();
    if (complexId) {
        try {
            const res  = await fetch(`/api/complexes/${complexId}/apply-settings`);
            const json = await res.json();
            if (json.success) {
                const checkOpen = (typeKey) => {
                    const s = (json.data||[]).find(x => x.apply_type_key === typeKey);
                    const mode = s?.period_mode || 'auto';
                    if (mode === 'always') return true;
                    if (mode === 'closed') return false;
                    if (mode === 'custom' && s?.period_start && s?.period_end)
                        return now >= new Date(s.period_start) && now <= new Date(s.period_end);
                    // auto: 22~26일
                    return (day===22&&hour>=9)||(day>22&&day<26)||(day===26&&hour<9);
                };
                isEnrollOpen = checkOpen('new');
                isCancelOpen = checkOpen('cancel');
            }
        } catch(e) { /* 폴백 */ }
    }
    // 서버 조회 실패 시 22~26일 기본값
    const defaultOpen = (day===22&&hour>=9)||(day>22&&day<26)||(day===26&&hour<9);
    if (isEnrollOpen === null) isEnrollOpen = defaultOpen;
    if (isCancelOpen === null) isCancelOpen = defaultOpen;

    const isAnyOpen = isEnrollOpen || isCancelOpen;
    if (isAnyOpen) {
        const parts = [];
        if (isEnrollOpen) parts.push('등록 접수');
        if (isCancelOpen) parts.push('해지 신청');
        banner.innerHTML = `
            <div class="period-banner-active period-banner-enroll">
                <i class="fas fa-calendar-check" style="font-size:1.2rem"></i>
                <span>📝 <strong>${mon}월 ${parts.join(' · ')} 기간입니다</strong> — 신청은 이 기간에만 가능합니다!</span>
            </div>`;
    } else {
        // 다음 접수 기간 안내 — 서버 설정에서 next open 날짜 계산
        let nextPeriodLabel = '';
        if (complexId && !isEnrollOpen && !isCancelOpen) {
            try {
                const res2  = await fetch(`/api/complexes/${complexId}/apply-settings`);
                const json2 = await res2.json();
                if (json2.success) {
                    // 'new' 또는 'cancel' 중 어느 쪽이든 custom 설정이면 그 날짜 안내
                    const newS = (json2.data||[]).find(x => x.apply_type_key === 'new');
                    const canS = (json2.data||[]).find(x => x.apply_type_key === 'cancel');
                    const modeN = newS?.period_mode || 'auto';
                    const modeC = canS?.period_mode || 'auto';
                    const fmt = (iso) => {
                        const d  = new Date(iso);
                        const kd = new Date(d.getTime() + 9*60*60*1000);
                        const mo2 = kd.getUTCMonth()+1, dy2 = kd.getUTCDate(), hr2 = kd.getUTCHours();
                        const mi2 = kd.getUTCMinutes();
                        return `${mo2}월 ${dy2}일 ${hr2}시${mi2?' '+mi2+'분':''}`;
                    };
                    if (modeN === 'custom' && newS?.period_start) {
                        nextPeriodLabel = fmt(newS.period_start) + ' ~ ' + fmt(newS.period_end);
                    } else if (modeC === 'custom' && canS?.period_start) {
                        nextPeriodLabel = fmt(canS.period_start) + ' ~ ' + fmt(canS.period_end);
                    } else if (modeN === 'always' || modeC === 'always') {
                        nextPeriodLabel = '상시 접수';
                    } else if (modeN === 'closed' && modeC === 'closed') {
                        nextPeriodLabel = '접수 마감 (관리자 문의)';
                    }
                }
            } catch(_) {}
        }
        if (!nextPeriodLabel) {
            const isAfter = day > 26 || (day === 26 && hour >= 9);
            const nm = isAfter ? (mon === 12 ? 1 : mon+1) : mon;
            nextPeriodLabel = `${nm}월 22일 09시 ~ 26일 09시`;
        }
        banner.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:8px;
                        background:#f9fafb;border:1px solid #e5e7eb;font-size:.81rem;color:#6b7280">
                <i class="fas fa-calendar-alt"></i>
                <span>다음 등록 접수 · 해지 신청 기간: <strong>${nextPeriodLabel}</strong></span>
            </div>`;
    }
}

async function showCancellationForm() {
    // === 해지 접수 기간 체크: 서버 설정 우선(global 포함), 실패 시 22~26일 기본값 ===
    const complexId = complexContext?.getComplexId?.();
    const now = new Date();
    const kst = new Date(now.getTime() + 9*60*60*1000);
    const d = kst.getUTCDate(), h = kst.getUTCHours();

    const fmtKst = (iso) => {
        const dt = new Date(iso);
        const kd = new Date(dt.getTime() + 9*60*60*1000);
        const mo = kd.getUTCMonth()+1, dy = kd.getUTCDate(), hr = kd.getUTCHours(), mi = kd.getUTCMinutes();
        return `${mo}월 ${dy}일 ${hr}시${mi ? ' '+mi+'분' : ''}`;
    };

    // 모달 내 접수 기간 레이블 업데이트 헬퍼
    const updateModalPeriodLabel = (label) => {
        const el = document.getElementById('cancelModalPeriodLabel');
        if (el) el.textContent = label;
    };

    if (complexId) {
        try {
            // apply-settings(개별)와 apply-period(global) 병렬 조회
            const [resS, resP] = await Promise.all([
                fetch(`/api/complexes/${complexId}/apply-settings`),
                fetch(`/api/complexes/${complexId}/apply-period`),
            ]);
            const [jsonS, jsonP] = await Promise.all([resS.json(), resP.json()]);

            if (jsonS.success) {
                const setting = (jsonS.data || []).find(s => s.apply_type_key === 'cancel');
                const mode    = setting?.period_mode || 'auto';

                let isOpen = false;
                let periodLabel = '매월 22일 09시 ~ 26일 09시 (KST)';

                if (mode === 'always') {
                    isOpen = true;
                    periodLabel = '상시 가능';
                } else if (mode === 'closed') {
                    isOpen = false;
                    periodLabel = '현재 접수 마감';
                } else if (mode === 'custom' && setting?.period_start && setting?.period_end) {
                    isOpen = now >= new Date(setting.period_start) && now <= new Date(setting.period_end);
                    periodLabel = `${fmtKst(setting.period_start)} ~ ${fmtKst(setting.period_end)} (KST)`;
                } else {
                    // auto: global 설정 기반 is_open + periodLabel
                    if (setting && typeof setting.is_open === 'boolean') {
                        isOpen = setting.is_open;
                    } else if (jsonP.success && typeof jsonP.data?.is_open === 'boolean') {
                        isOpen = jsonP.data.is_open;
                    } else {
                        isOpen = (d === 22 && h >= 9) || (d > 22 && d < 26) || (d === 26 && h < 9);
                    }
                    // global custom 설정이 있으면 그 날짜로 레이블 생성
                    if (jsonP.success && jsonP.data?.mode === 'custom' && jsonP.data?.apply_start) {
                        periodLabel = `${fmtKst(jsonP.data.apply_start)} ~ ${fmtKst(jsonP.data.apply_end)} (KST)`;
                    } else if (jsonP.success && jsonP.data?.mode === 'always_open') {
                        periodLabel = '상시 가능';
                    }
                }

                if (!isOpen) {
                    await showCancellationPeriodWarning(kst.getUTCMonth()+1, d, h);
                    return;
                }
                // isOpen → 모달 열기 + 레이블 업데이트
                resetCancelFormMain();
                document.getElementById('cancellationModal').classList.add('active');
                updateModalPeriodLabel(periodLabel);
                return;
            }
        } catch(e) { /* 서버 오류 시 하드코딩 기본값으로 폴백 */ }
    }

    // 서버 조회 실패 시 하드코딩 기본값 (22~26일)
    const isInCancelPeriod = (d === 22 && h >= 9) || (d > 22 && d < 26) || (d === 26 && h < 9);
    if (!isInCancelPeriod) {
        await showCancellationPeriodWarning(kst.getUTCMonth()+1, d, h);
        return;
    }
    resetCancelFormMain();
    document.getElementById('cancellationModal').classList.add('active');
    updateModalPeriodLabel('매월 22일 09시 ~ 26일 09시 (KST)');
}

// ── 전화번호 포맷 ────────────────────────────────────────────────────────────
function formatCancelPhone(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length <= 3) input.value = v;
    else if (v.length <= 7) input.value = v.slice(0,3) + '-' + v.slice(3);
    else input.value = v.slice(0,3) + '-' + v.slice(3,7) + '-' + v.slice(7,11);
}

// ── 내부 상태 ────────────────────────────────────────────────────────────────
let _cancelLookupResultMain = [];

// 조회 결과 리셋 (입력 변경 시)
function resetCancelLookupMain() {
    _cancelLookupResultMain = [];
    const step2 = document.getElementById('cancelStep2Main');
    if (step2) step2.style.display = 'none';
    const msg = document.getElementById('cancelLookupMsgMain');
    if (msg) { msg.style.display = 'none'; msg.innerHTML = ''; }
    const sel = document.getElementById('cancelProgramMain');
    if (sel) sel.innerHTML = '<option value="">-- 선택 --</option>';
    const feeEl = document.getElementById('cancelFeePreviewMain');
    if (feeEl) feeEl.style.display = 'none';
    const reasonSel = document.getElementById('cancelReasonMain');
    if (reasonSel) reasonSel.value = '';
    const detail = document.getElementById('cancelReasonDetailMain');
    if (detail) detail.value = '';
}

// 폼 전체 초기화
function resetCancelFormMain() {
    const dong = document.getElementById('cancelDong');
    const ho   = document.getElementById('cancelHo');
    const phone = document.getElementById('cancelPhone');
    if (dong)  dong.value  = '';
    if (ho)    ho.value    = '';
    if (phone) phone.value = '';
    resetCancelLookupMain();
}

// STEP 1: 수강 중인 프로그램 조회
async function lookupCancelProgramsMain() {
    const dong  = (document.getElementById('cancelDong')?.value  || '').trim();
    const ho    = (document.getElementById('cancelHo')?.value    || '').trim();
    const phone = (document.getElementById('cancelPhone')?.value || '').trim();

    if (!dong || !ho) {
        showToastMain('동과 호수를 입력하세요', 'error');
        return;
    }
    if (!phone) {
        showToastMain('전화번호를 입력하세요', 'error');
        return;
    }

    const btn = document.getElementById('cancelLookupBtnMain');
    const msg = document.getElementById('cancelLookupMsgMain');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...';
    msg.style.display = 'none';

    try {
        const complexCode = complexContext.getComplexCode() || '';
        const params = new URLSearchParams({ complexCode, dong, ho, phone });
        const res  = await fetch(`/api/cancellations/lookup-programs?${params}`);
        const json = await res.json();

        if (!json.success) throw new Error(json.error || '조회 실패');

        const list          = json.data || [];
        const phoneMismatch = !!json.phone_mismatch;          // 전화번호 불일치 여부
        const phoneHint     = json.registered_phone_hint || ''; // 등록된 번호 마스킹 힌트
        _cancelLookupResultMain = list;

        if (!list.length) {
            msg.style.display = 'block';
            msg.style.color   = '#dc2626';
            msg.innerHTML = `<i class="fas fa-exclamation-circle"></i> 해당 동/호수에 수강 중인 프로그램을 찾을 수 없습니다.<br><small style="color:#888">입력 정보를 확인하거나 관리사무소에 문의하세요.</small>`;
            document.getElementById('cancelStep2Main').style.display = 'none';
            return;
        }

        // 이미 모두 해지 접수된 경우
        const available = list.filter(p => !p.already_cancelled);
        if (!available.length) {
            msg.style.display = 'block';
            msg.style.color   = '#d97706';
            msg.innerHTML = `<i class="fas fa-info-circle"></i> 모든 수강 프로그램이 이미 해지 신청 접수된 상태입니다.`;
            document.getElementById('cancelStep2Main').style.display = 'none';
            return;
        }

        // 전화번호 불일치 경고 표시 (조회는 성공, 하지만 번호가 다름)
        if (phoneMismatch) {
            msg.style.display = 'block';
            msg.style.color   = '#d97706';
            const hintText = phoneHint
                ? `등록된 번호: <strong>${phoneHint}</strong> — 이 번호로 다시 시도하거나 관리사무소에 문의하세요.`
                : '입력하신 번호와 등록된 번호가 다릅니다. 관리사무소에 문의하세요.';
            msg.innerHTML = `<i class="fas fa-exclamation-triangle"></i>
                <strong>전화번호가 일치하지 않습니다.</strong><br>
                <small style="color:#555">${hintText}</small>`;
            // 번호 불일치 시 STEP2 진행 차단 (보안)
            document.getElementById('cancelStep2Main').style.display = 'none';
            return;
        }

        msg.style.display = 'none';

        // 본인 정보 표시
        const person = list[0];
        const infoEl = document.getElementById('cancelPersonInfoMain');
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
        const sel = document.getElementById('cancelProgramMain');
        sel.innerHTML = '<option value="">-- 해지할 프로그램 선택 --</option>';
        list.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.application_id;
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

        // 해지 가능한 게 1개면 자동 선택
        if (available.length === 1) {
            const onlyOpt = Array.from(sel.options).find(o => !o.disabled && o.value);
            if (onlyOpt) { onlyOpt.selected = true; onCancelProgramChangeMain(); }
        }

        document.getElementById('cancelStep2Main').style.display = 'block';
        document.getElementById('cancelStep2Main').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch(e) {
        msg.style.display = 'block';
        msg.style.color   = '#dc2626';
        msg.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 조회 오류: ${e.message}`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-search"></i> 수강 중인 프로그램 조회';
    }
}

// 프로그램 선택 시 수강료 미리보기
function onCancelProgramChangeMain() {
    const sel   = document.getElementById('cancelProgramMain');
    const feeEl = document.getElementById('cancelFeePreviewMain');
    if (!feeEl) return;
    if (!sel.value) { feeEl.style.display = 'none'; return; }
    const opt = sel.options[sel.selectedIndex];
    const fee = opt.dataset.monthlyFee;
    if (fee && fee !== '') {
        feeEl.style.display = 'block';
        feeEl.innerHTML = `<i class="fas fa-won-sign"></i> 이번 달 수강료: <strong>${Number(fee).toLocaleString()}원</strong>`;
    } else {
        feeEl.style.display = 'none';
    }
}

// Close cancellation modal
function closeCancellationModal() {
    document.getElementById('cancellationModal').classList.remove('active');
    resetCancelFormMain();
}

// STEP 2: 해지 신청 제출
async function submitCancellationMain() {
    const dong   = (document.getElementById('cancelDong')?.value  || '').trim();
    const ho     = (document.getElementById('cancelHo')?.value    || '').trim();
    const phone  = (document.getElementById('cancelPhone')?.value || '').trim();
    const sel    = document.getElementById('cancelProgramMain');
    const reason = (document.getElementById('cancelReasonMain')?.value || '').trim();
    const detail = (document.getElementById('cancelReasonDetailMain')?.value || '').trim();

    if (!sel.value) { showToastMain('해지할 프로그램을 선택하세요', 'error'); return; }
    if (!reason)    { showToastMain('해지 사유를 선택하세요', 'error'); return; }

    const selectedOpt   = sel.options[sel.selectedIndex];
    const programName   = selectedOpt.dataset.programName   || sel.value;
    const preferredTime = selectedOpt.dataset.preferredTime || '';
    const applicationId = selectedOpt.dataset.applicationId || null;
    const person = _cancelLookupResultMain.find(p => p.application_id === sel.value) || _cancelLookupResultMain[0] || {};

    // ── 시간대 변경 안내 confirm ──────────────────────────────────────────
    const confirmed = window.confirm(
        '⚠️ 해지 신청 전 확인해 주세요\n\n' +
        '시간대만 바꾸고 싶다면 해지 신청이 아닌\n' +
        '「내 신청 취소·변경」 탭의 [시간대 변경] 버튼을 이용하세요.\n\n' +
        '해지 신청은 즉시 승인되며 번복이 불가합니다.\n' +
        '계속 진행하시겠습니까?'
    );
    if (!confirmed) return;

    const submitBtn = document.getElementById('cancelSubmitBtnMain');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 신청 중...';

    try {
        const complexId = complexContext.getComplexId();
        const body = JSON.stringify({
            complex_id:     complexId,
            application_id: applicationId,
            source:         'resident',
            dong, ho,
            name:           person.name  || '',
            phone:          person.phone || phone,
            program_name:   programName,
            preferred_time: preferredTime,
            reason:         detail ? `${reason}\n${detail}` : reason,
            request_type:   'cancel'
        });

        const res = await fetch('/api/cancellations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || '해지 신청 실패');

        showToastMain(`✅ 해지 신청이 완료되었습니다 (${programName}) — 즉시 승인되었으며 번복이 불가합니다.`, 'success');
        closeCancellationModal();
    } catch(e) {
        showToastMain('해지 신청 실패: ' + e.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-times-circle"></i> 해지 신청하기';
    }
}

// 간단한 토스트 알림 (main.js 전용)
function showToastMain(msg, type = 'success') {
    // 기존 toastNotification 요소가 있으면 사용, 없으면 alert 폴백
    const el = document.getElementById('toastNotification') || document.getElementById('toast');
    if (el) {
        el.className = `toast toast-${type}`;
        el.textContent = msg;
        el.style.display = 'block';
        el.style.opacity = '1';
        clearTimeout(el._toastTimer);
        el._toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
    } else {
        alert(msg);
    }
}

// 🆕 Show cancellation period warning (global 설정 기반 동적 기간 표시)
async function showCancellationPeriodWarning(currentMonth, currentDay, currentHour = 0) {
    const modal   = document.getElementById('cancellationPeriodWarningModal');
    const content = document.getElementById('cancellationPeriodWarningContent');
    const msgEl   = document.getElementById('cancellationPeriodWarningMessage');
    if (!modal || !content) return;

    const hourStr = String(currentHour).padStart(2, '0');

    const fmtKst = (iso) => {
        const d  = new Date(iso);
        const kd = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const mo = kd.getUTCMonth() + 1, dy = kd.getUTCDate();
        const hr = kd.getUTCHours(), mi = kd.getUTCMinutes();
        return `${mo}월 ${dy}일 ${hr}시${mi ? ' ' + mi + '분' : ''}`;
    };

    // 서버에서 cancel + global 기간 설정 조회
    let nextPeriodLabel = null;
    let mainMessageLabel = null; // 본문 "~에만 가능합니다" 텍스트
    try {
        const complexId = complexContext?.getComplexId?.();
        if (complexId) {
            const [resS, resP] = await Promise.all([
                fetch(`/api/complexes/${complexId}/apply-settings`),
                fetch(`/api/complexes/${complexId}/apply-period`),
            ]);
            const [jsonS, jsonP] = await Promise.all([resS.json(), resP.json()]);

            const cancelSetting = (jsonS.data || []).find(x => x.apply_type_key === 'cancel');
            const cMode = cancelSetting?.period_mode || 'auto';

            if (cMode === 'always') {
                nextPeriodLabel    = '상시 가능 (지금 바로 신청 가능)';
                mainMessageLabel   = '상시 가능';
            } else if (cMode === 'closed') {
                nextPeriodLabel    = '현재 접수 마감 (관리자 문의)';
                mainMessageLabel   = '현재 접수 마감 (관리자 문의)';
            } else if (cMode === 'custom' && cancelSetting?.period_start && cancelSetting?.period_end) {
                const lbl          = `${fmtKst(cancelSetting.period_start)} ~ ${fmtKst(cancelSetting.period_end)}`;
                nextPeriodLabel    = lbl;
                mainMessageLabel   = lbl;
            } else {
                // auto 모드 → global(apply-period) 설정 우선 사용
                if (jsonP.success && jsonP.data?.mode === 'custom' && jsonP.data?.apply_start) {
                    const lbl        = `${fmtKst(jsonP.data.apply_start)} ~ ${fmtKst(jsonP.data.apply_end)}`;
                    nextPeriodLabel  = lbl;
                    mainMessageLabel = lbl;
                } else if (jsonP.success && jsonP.data?.mode === 'always_open') {
                    nextPeriodLabel  = '상시 가능 (지금 바로 신청 가능)';
                    mainMessageLabel = '상시 가능';
                }
                // else → auto 22~26일 기본값 (폴백)
            }
        }
    } catch(_) { /* 폴백 */ }

    // global 조회 실패 또는 auto 모드 → 22~26일 기본값
    if (!nextPeriodLabel) {
        const isAfterClose = currentDay > 26 || (currentDay === 26 && currentHour >= 9);
        const nextMonth    = isAfterClose ? (currentMonth === 12 ? 1 : currentMonth + 1) : currentMonth;
        nextPeriodLabel    = `${nextMonth}월 22일 09:00 ~ ${nextMonth}월 26일 09:00`;
        mainMessageLabel   = `매월 22일 09시부터 26일 09시까지 (KST)`;
    }

    // ① 본문 "~에만 가능합니다" 텍스트 동적 업데이트
    if (msgEl && mainMessageLabel) {
        msgEl.innerHTML = `해지 신청은 <strong style="color:#e74c3c">${mainMessageLabel}</strong>에만 가능합니다.`;
    }

    // ② 상세 박스: 현재 날짜 + 다음 접수 기간
    content.innerHTML = `
        <p><strong>현재 날짜:</strong> ${currentMonth}월 ${currentDay}일 ${hourStr}시 (한국시간)</p>
        <p><strong>다음 접수 기간:</strong> ${nextPeriodLabel}</p>
    `;
    modal.classList.add('active');
}

// 🆕 Close cancellation period warning modal
function closeCancellationPeriodWarning() {
    document.getElementById('cancellationPeriodWarningModal').classList.remove('active');
}

// ===== NOTICES & INSTRUCTORS =====

// Load notices
async function loadNotices() {
    try {
        const complexCode = complexContext.getComplexCode();  // Use complex_code
        if (!complexCode) {
            console.warn('⚠️ Complex code not available yet');
            return;
        }
        
        const noticeParams = new URLSearchParams({ complexCode, limit: 100 });
        const response = await fetch(`/api/notices?${noticeParams}`);
        const result = await response.json();
        
        const notices = (result.data || [])
            .filter(n => n.is_active)
            .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        
        console.log(`📢 Loaded ${notices.length} active notices for complex ${complexCode}`);
        
        if (notices.length > 0) {
            displayNotices(notices);
        }
        
    } catch (error) {
        console.error('Error loading notices:', error);
    }
}

// Display notices — 2열 카드 그리드
function displayNotices(notices) {
    const section   = document.getElementById('noticesSection');
    const container = document.getElementById('noticesContainer');

    if (notices.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    // 중요(pinned) 먼저, 나머지는 최신순 유지
    const sorted = [...notices].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return 0;
    });

    const cards = sorted.map((notice, idx) => {
        const category      = notice.category || (notice.is_pinned ? '중요' : '일반');
        const categoryClass = category === '중요' ? 'important' :
                              category === '이벤트' ? 'event' : 'general';
        const icon          = notice.is_pinned
            ? '<i class="fas fa-exclamation-circle"></i>'
            : category === '이벤트'
                ? '<i class="fas fa-star"></i>'
                : '<i class="fas fa-info-circle"></i>';
        const contentId = `noticeContent_${idx}`;

        // 이미지 배열 정규화: images 배열 우선, 없으면 image_url 단일값
        const imgs = Array.isArray(notice.images) && notice.images.length > 0
            ? notice.images
            : (notice.image_url ? [notice.image_url] : []);
        const sliderId = `noticeSlider_${idx}`;

        // 슬라이더 HTML 생성
        let sliderHtml = '';
        if (imgs.length > 0) {
            const slides = imgs.map((url, si) => `
                <div class="nslide-item${si === 0 ? ' active' : ''}" data-index="${si}">
                    <img src="${escapeHtml(url)}" alt="공지 이미지 ${si+1}"
                         onclick="notices_openImageModal('${url.replace(/'/g,'%27')}','${sliderId}',${si})">
                </div>`).join('');

            const dots = imgs.length > 1
                ? `<div class="nslide-dots">${imgs.map((_, si) =>
                    `<button class="nslide-dot${si===0?' active':''}" onclick="notices_slideTo('${sliderId}',${si})"></button>`
                  ).join('')}</div>`
                : '';

            const arrows = imgs.length > 1 ? `
                <button class="nslide-arrow prev" onclick="notices_slideStep('${sliderId}',-1)">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button class="nslide-arrow next" onclick="notices_slideStep('${sliderId}',1)">
                    <i class="fas fa-chevron-right"></i>
                </button>` : '';

            const counter = imgs.length > 1
                ? `<span class="nslide-counter" id="${sliderId}_counter">1 / ${imgs.length}</span>`
                : '';

            sliderHtml = `
            <div class="notice-slider" id="${sliderId}" data-total="${imgs.length}" data-current="0">
                <div class="nslide-track">${slides}</div>
                ${arrows}
                ${counter}
                ${dots}
            </div>`;
        }

        return `
        <div class="notice-card ${categoryClass}${notice.is_pinned ? ' pinned' : ''}">
            <div class="notice-card-header">
                <div class="notice-card-title">
                    ${icon}
                    ${escapeHtml(notice.title || '')}
                </div>
                <span class="notice-category ${categoryClass}">
                    ${escapeHtml(category)}
                </span>
            </div>
            ${sliderHtml}
            <div class="notice-card-content" id="${contentId}">
                ${escapeHtml(notice.content || '').replace(/\n/g, '<br>')}
            </div>
            <div class="notice-card-footer">
                <span class="notice-card-date">
                    <i class="fas fa-calendar-alt"></i>
                    ${kstDateStr(notice.created_at)}
                </span>
                <button class="notice-expand-btn" onclick="notices_toggleExpand('${contentId}', this)">
                    더보기
                </button>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="notices-grid">${cards}</div>`;
}

// ── 슬라이드 이동 (절대 인덱스) ──────────────────────────────
function notices_slideTo(sliderId, idx) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;
    const total = parseInt(slider.dataset.total || '1');
    idx = Math.max(0, Math.min(total - 1, idx));
    slider.dataset.current = idx;

    // 슬라이드 아이템 active 갱신
    slider.querySelectorAll('.nslide-item').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
    });
    // 도트 active 갱신
    slider.querySelectorAll('.nslide-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === idx);
    });
    // 카운터 갱신
    const counter = document.getElementById(`${sliderId}_counter`);
    if (counter) counter.textContent = `${idx + 1} / ${total}`;
}

// ── 슬라이드 이전/다음 ────────────────────────────────────────
function notices_slideStep(sliderId, dir) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;
    const total   = parseInt(slider.dataset.total || '1');
    const current = parseInt(slider.dataset.current || '0');
    notices_slideTo(sliderId, (current + dir + total) % total);
}

// 공지 본문 펼치기/접기
function notices_toggleExpand(contentId, btn) {
    const el = document.getElementById(contentId);
    if (!el) return;
    const expanded = el.classList.toggle('expanded');
    btn.textContent = expanded ? '접기' : '더보기';
}

// 공지 이미지 클릭 시 전체화면 뷰어 (index.html imageModal 재사용)
// sliderId: 연결된 슬라이더 id (없으면 단일 이미지), startIdx: 시작 인덱스
function notices_openImageModal(url, sliderId, startIdx) {
    const modal = document.getElementById('imageModal');
    if (!modal) return;
    const img = document.getElementById('modalImage');
    if (img) img.src = url;

    // 슬라이더 이미지 목록 수집
    let urls = [url];
    let curIdx = 0;
    if (sliderId) {
        const slider = document.getElementById(sliderId);
        if (slider) {
            const items = slider.querySelectorAll('.nslide-item img');
            if (items.length > 0) {
                urls = Array.from(items).map(i => i.src);
                curIdx = (typeof startIdx === 'number') ? startIdx : 0;
            }
        }
    }

    // 모달에 상태 저장
    modal._imodalUrls  = urls;
    modal._imodalIdx   = curIdx;
    _imodalRefresh();

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// 모달 이미지 갱신 (화살표/카운터/숨기기)
function _imodalRefresh() {
    const modal = document.getElementById('imageModal');
    if (!modal) return;
    const urls   = modal._imodalUrls  || [];
    const idx    = modal._imodalIdx   || 0;
    const img    = document.getElementById('modalImage');
    const prev   = document.getElementById('imodalPrev');
    const next   = document.getElementById('imodalNext');
    const counter= document.getElementById('imodalCounter');

    if (img && urls[idx]) img.src = urls[idx];
    const multi = urls.length > 1;
    if (prev)    prev.style.display    = multi ? 'flex' : 'none';
    if (next)    next.style.display    = multi ? 'flex' : 'none';
    if (counter) {
        counter.style.display = multi ? 'block' : 'none';
        counter.textContent   = multi ? `${idx + 1} / ${urls.length}` : '';
    }
}

// 모달 내 ±1 이동
function imodalStep(dir) {
    const modal = document.getElementById('imageModal');
    if (!modal || !modal._imodalUrls) return;
    const len = modal._imodalUrls.length;
    modal._imodalIdx = (modal._imodalIdx + dir + len) % len;
    _imodalRefresh();
}

// ===== LOAD PROGRAMS =====

// Load programs from database
async function loadPrograms() {
    try {
        const complexCode = complexContext.getComplexCode();
        const complexId   = complexContext?.getComplexId?.();
        if (!complexCode) {
            console.warn('⚠️ Complex code not available for programs');
            return;
        }

        // 프로그램 목록 + 승인된 신청 수 + 신청기간 설정(apply-settings) 병렬 조회
        const fetchPromises = [
            fetch(`/api/programs?complexCode=${complexCode}&includeInactive=true`).then(r => r.json()),
            fetch(`/api/applications?complexCode=${complexCode}&status=approved&limit=1000`).then(r => r.json()),
        ];
        if (complexId) {
            fetchPromises.push(
                fetch(`/api/complexes/${complexId}/apply-settings`).then(r => r.json()).catch(() => null),
                fetch(`/api/complexes/${complexId}/apply-period`).then(r => r.json()).catch(() => null),
            );
        }
        const [result, contractsResult, jsonS, jsonP] = await Promise.all(fetchPromises);
        const approvedContracts = contractsResult.data || [];

        // ── 신청기간 설정에서 신규 수강 신청(new)의 is_open 읽기 ──
        // is_open은 서버가 auto 모드일 때 global apply-period 기반으로 이미 계산해서 반환
        let newApplyIsOpen = null; // null = 서버 값 없음 → is_active 폴백
        if (jsonS && jsonS.success) {
            const newSetting = (jsonS.data || []).find(x => x.apply_type_key === 'new');
            if (newSetting) newApplyIsOpen = !!newSetting.is_open;
        }
        console.log(`📅 신규 수강 신청 is_open (apply-settings): ${newApplyIsOpen}`);

        console.log(`📊 Found ${approvedContracts.length} approved contracts for complex ${complexCode}`);

        // Filter programs: active OR (inactive but show_on_inactive=true/null/undefined)
        // show_on_inactive가 명시적으로 false일 때만 입주민 페이지에서 숨김
        const programs = (result.data || [])
            .filter(p => p.is_active || p.show_on_inactive === true || p.show_on_inactive === null || p.show_on_inactive === undefined)
            .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

        console.log(`✅ Filtered programs: ${programs.length} (active or display_on_inactive)`);

        // Calculate current count for each program based on approved contracts
        programs.forEach(program => {
            const pName = program.name || program.program_name;
            const count = approvedContracts.filter(c =>
                (c.program_name || c.lesson_type) === pName
            ).length;
            program.current_count = count;
            program._displayName = pName;
            console.log(`📌 Program "${pName}": ${count}/${program.capacity || program.max_capacity} (승인된 신청자) - is_active: ${program.is_active}`);
        });

        console.log(`📋 Loaded ${programs.length} programs for complex ${complexCode}`);

        if (programs.length > 0) {
            // newApplyIsOpen: apply-settings new.is_open (null이면 is_active 폴백)
            populateProgramOptions(programs, newApplyIsOpen);
        } else {
            console.warn('⚠️ No programs found for complex', complexCode);
        }

    } catch (error) {
        console.error('Error loading programs:', error);
        console.warn('⚠️ Using default program options');
    }
}

// Populate program options in select dropdown
// newApplyIsOpen: apply-settings의 'new' 타입 is_open 값 (null이면 is_active 폴백)
function populateProgramOptions(programs, newApplyIsOpen = null) {
    const lessonTypeSelect = document.getElementById('lessonType');
    if (!lessonTypeSelect) return;

    // Keep the first "선택하세요" option
    lessonTypeSelect.innerHTML = '<option value="">선택하세요</option>';

    programs.forEach(program => {
        const pName = program._displayName || program.name || program.program_name;
        const option = document.createElement('option');
        option.value = pName;

        const currentCount = program.current_count || 0;
        const maxCapacity = program.capacity || program.max_capacity || 0;
        const isActive = program.is_active;

        // ── '곧 오픈 예정' 판단 ──────────────────────────────────────
        // always_open_lesson=true (개인/듀엣 상시접수)인 프로그램은
        // 신청 기간(newApplyIsOpen) 무관하게 항상 선택 가능 → comingSoon 표시 안 함
        const isAlwaysOpenLesson = !!program.always_open_lesson;
        let showAsComingSoon;
        if (isAlwaysOpenLesson) {
            // 상시 접수 레슨: 신청 기간 설정 상위 — 항상 열려 있음
            showAsComingSoon = false;
        } else if (newApplyIsOpen === null) {
            // apply-settings 조회 실패: is_active 폴백
            showAsComingSoon = !isActive;
        } else {
            // is_open이 true면 신청 가능 → 차단 안 함
            // is_open이 false면 신청 불가 → 모든 프로그램 차단
            showAsComingSoon = !newApplyIsOpen;
        }

        // Check if it's 1:1 or 2:1 lesson
        // type 컬럼(personal/duet) 우선, 없으면 프로그램명에서 판별 (하위호환)
        const pType = program.type || program.program_type || '';
        const isPersonalLesson = pType === 'personal' || pType === 'duet'
            || pName.includes('1:1') || pName.includes('2:1') || pName.includes('개인') || pName.includes('듀엣');

        // Build display text
        let displayText = pName;
        if (program.days) {
            displayText += ` (${program.days})`;
        }
        if (program.price) {
            const priceUnit = complexContext?.getComplex?.()?.gym_mode === true ? '회' : '월';
            displayText += ` - ${formatPrice(program.price)}원/${priceUnit}`;
        }

        // Add "별도 문의" for personal lessons instead of capacity
        if (isPersonalLesson) {
            displayText += ' [별도 문의]';
        }

        // Add "곧 오픈 예정": apply-settings new.is_open 기반 (schedule_mode 무관)
        if (showAsComingSoon) {
            displayText += ' [곧 오픈 예정]';
            option.disabled = true;
            option.style.color = '#999';
        }

        option.textContent = displayText;

        // Store program data as data attributes
        option.dataset.programId = program.id;
        option.dataset.programType = program.type || program.program_type;
        option.dataset.maxCapacity = maxCapacity;
        option.dataset.currentCount = currentCount;
        option.dataset.price = program.price;
        option.dataset.scheduleDays = program.days || program.schedule_days;
        option.dataset.scheduleTimes = program.days || program.schedule_times;
        option.dataset.isPersonalLesson   = isPersonalLesson;
        option.dataset.availableTimeSlots = JSON.stringify(program.time_slots || program.available_time_slots || []);
        option.dataset.isActive           = isActive;
        option.dataset.alwaysOpenLesson   = program.always_open_lesson ? 'true' : 'false';
        option.dataset.depositEnabled     = program.deposit_enabled ? 'true' : 'false';
        option.dataset.depositAmount      = program.deposit_amount || 0;

        lessonTypeSelect.appendChild(option);
    });

    const comingSoonCount = programs.filter((_, i) => {
        const opt = lessonTypeSelect.options[i + 1];
        return opt && opt.disabled;
    }).length;
    console.log(`✅ Populated ${programs.length} program options (newApplyIsOpen=${newApplyIsOpen}, comingSoon=${comingSoonCount})`);
}

// Format price helper
function formatPrice(price) {
    return new Intl.NumberFormat('ko-KR').format(price || 0);
}


// ===== 🆕 CURRICULUM FUNCTIONS =====

// Show curriculum modal
// ===== TIMETABLE MODAL =====

async function showTimetableModal() {
    const modal   = document.getElementById('timetableModal');
    const content = document.getElementById('timetableContent');
    if (!modal || !content) return;

    modal.classList.add('active');
    content.innerHTML = '<span style="color:#9ca3af;font-size:.9rem">불러오는 중...</span>';

    try {
        const complexCode = complexContext.getComplexCode();
        if (!complexCode) throw new Error('단지 정보를 찾을 수 없습니다');

        const res  = await fetch(`/api/complexes/timetable?code=${encodeURIComponent(complexCode)}`);
        const json = await res.json();

        if (!json.success) throw new Error(json.error || '조회 실패');

        if (json.timetable_url) {
            content.innerHTML = `
                <img src="${json.timetable_url}" alt="시간표"
                     style="max-width:100%;border-radius:8px;cursor:pointer"
                     onclick="notices_openImageModal('${json.timetable_url}')">`;
        } else {
            content.innerHTML = `
                <div style="color:#9ca3af;font-size:.88rem;padding:24px 0">
                    <i class="fas fa-calendar-times" style="font-size:2rem;display:block;margin-bottom:10px"></i>
                    등록된 시간표가 없습니다.<br>관리자에게 문의해 주세요.
                </div>`;
        }
    } catch (e) {
        content.innerHTML = `<span style="color:#ef4444;font-size:.88rem">오류: ${escapeHtml(e.message)}</span>`;
    }
}

function closeTimetableModal() {
    const modal = document.getElementById('timetableModal');
    if (modal) modal.classList.remove('active');
}

// ===== CURRICULUM MODAL =====

async function showCurriculumModal() {
    const modal = document.getElementById('curriculumModal');
    modal.classList.add('active');

    const isGymMode = complexContext?.getComplex?.()?.gym_mode === true;
    const now = new Date();
    const select = document.getElementById('curriculumMonthSelect');

    if (isGymMode) {
        // 헬스장 모드: 현재 달만 설정, 월 선택 토글은 applyGymMode()에서 숨김
        select.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = `${now.getFullYear()}-${now.getMonth() + 1}`;
        opt.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
        opt.selected = true;
        select.appendChild(opt);
    } else {
        // 일반 모드: 이전 1개월 ~ 이후 2개월 선택 가능
        select.innerHTML = '<option value="">선택하세요</option>';
        for (let i = -1; i <= 2; i++) {
            const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const year = targetDate.getFullYear();
            const month = targetDate.getMonth() + 1;
            const option = document.createElement('option');
            option.value = `${year}-${month}`;
            option.textContent = `${year}년 ${month}월`;
            if (i === 0) option.selected = true;
            select.appendChild(option);
        }
    }

    // Load current month curriculum
    await loadCurriculum();
}

// Close curriculum modal
function closeCurriculumModal() {
    const modal = document.getElementById('curriculumModal');
    modal.classList.remove('active');
}

// Load curriculum for selected month
async function loadCurriculum() {
    try {
        const selectValue = document.getElementById('curriculumMonthSelect').value;
        const content = document.getElementById('curriculumContent');
        
        if (!selectValue) {
            content.innerHTML = '<p style="text-align: center; color: #6c757d;">월을 선택해주세요.</p>';
            return;
        }
        
        const [year, month] = selectValue.split('-');
        const complexCode = complexContext.getComplexCode();
        
        console.log(`📅 Loading curriculum for ${year}-${month}, complex: ${complexCode}`);
        
        // year, month 서버 필터링 — is_active 컬럼 없음, 클라이언트 필터 제거
        const currParams = new URLSearchParams({ complexCode, year, month });
        const response = await fetch(`/api/curricula?${currParams}`);
        const result = await response.json();
        const curriculums = result.data || [];
        
        console.log(`✅ Fetched ${curriculums.length} total curriculums`);
        
        // 서버에서 이미 필터링됨 — 첫 번째 항목 사용
        const targetCurriculum = curriculums[0] || null;
        
        console.log('🎯 Target curriculum found:', targetCurriculum?.id ?? 'none');
        
        if (!targetCurriculum) {
            content.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-inbox" style="font-size: 48px; color: #cbd5e0; margin-bottom: 15px;"></i>
                    <p style="color: #6c757d;">${year}년 ${month}월 커리큘럼이 아직 등록되지 않았습니다.</p>
                </div>
            `;
            return;
        }
        
        // Display curriculum
        content.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 8px;">
                <h4 style="color: #2c3e50; margin-bottom: 15px;">
                    <i class="fas fa-calendar-check"></i> ${targetCurriculum.title}
                </h4>
                ${targetCurriculum.image_url ? `
                    <img src="${targetCurriculum.image_url}" 
                         alt="커리큘럼 이미지" 
                         style="width: 100%; max-width: 600px; border-radius: 8px; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto;">
                ` : ''}
                ${targetCurriculum.content ? `
                    <div style="color: #4a5568; line-height: 1.8;">
                        ${targetCurriculum.content.replace(/\n/g, '<br>')}
                    </div>
                ` : ''}
            </div>
        `;
        
        console.log('✅ Curriculum loaded');
        
    } catch (error) {
        console.error('❌ Error loading curriculum:', error);
        document.getElementById('curriculumContent').innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f59e0b; margin-bottom: 15px;"></i>
                <p style="color: #6c757d;">커리큘럼을 불러오는데 실패했습니다.</p>
            </div>
        `;
    }
}


// ── 환불 신청 모달 ──────────────────────────────────────────────────────
function showRefundRequestModal() {
    const modal = document.getElementById('refundRequestModal');
    if (!modal) return;
    // 입력 초기화
    ['refundDong','refundHo','refundName','refundPhone','refundDetail'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const sel = document.getElementById('refundReason');
    if (sel) {
        sel.value = '';
        // 사유 변경 시 서류 안내 갱신 (이미 연결됐으면 무시)
        if (!sel._docGuideAttached) {
            sel.addEventListener('change', updateRefundDocGuide);
            sel._docGuideAttached = true;
        }
    }
    // 파일 목록 초기화
    _refundDocFiles = [];
    const list  = document.getElementById('refundDocList');
    const guide = document.getElementById('refundDocGuide');
    const inp   = document.getElementById('refundDocInput');
    if (list)  list.innerHTML  = '';
    if (guide) guide.style.display = 'none';
    if (inp)   inp.value = '';
    modal.style.display = 'block';
    // body 스크롤 잠금
    document.body.style.overflow = 'hidden';
    // 열릴 때 맨 위로 스크롤
    modal.scrollTop = 0;
}

function closeRefundRequestModal() {
    const modal = document.getElementById('refundRequestModal');
    if (modal) modal.style.display = 'none';
    // body 스크롤 복원
    document.body.style.overflow = '';
    // 파일 목록 초기화
    _refundDocFiles = [];
    const list = document.getElementById('refundDocList');
    if (list) list.innerHTML = '';
    const input = document.getElementById('refundDocInput');
    if (input) input.value = '';
}

/* ── 환불 서류 첨부 관련 ───────────────────────────────────────────── */
let _refundDocFiles = []; // { file: File, previewUrl: string|null }

/** 사유 선택 시 서류 안내 박스 갱신 */
function updateRefundDocGuide() {
    const reason = document.getElementById('refundReason')?.value;
    const guide  = document.getElementById('refundDocGuide');
    if (!guide) return;
    const guides = {
        injury:     '<i class="fas fa-file-medical"></i> <strong>진단서 필수:</strong> 6개월 이상 운동 불가를 증명하는 의사 진단서 (원본 또는 스캔본)',
        emigration: '<i class="fas fa-passport"></i> <strong>비자 + 항공권 필수:</strong> 6개월 이상 해외 이주를 증명하는 비자 사본 및 항공권 사본',
        other:      '<i class="fas fa-file-alt"></i> <strong>관련 증빙서류 제출:</strong> 환불 사유를 증명할 수 있는 서류를 첨부해 주세요. 서류 미비 시 처리가 지연될 수 있습니다.'
    };
    if (reason && guides[reason]) {
        guide.innerHTML = guides[reason];
        guide.style.display = 'block';
    } else {
        guide.style.display = 'none';
    }
}

/** 파일 드롭 핸들러 */
function handleRefundDocDrop(e) {
    e.preventDefault();
    const zone = document.getElementById('refundDocDropZone');
    if (zone) { zone.style.borderColor = '#d1d5db'; zone.style.background = ''; }
    handleRefundDocSelect(e.dataTransfer.files);
}

/** 파일 선택/드롭 공통 처리 */
function handleRefundDocSelect(fileList) {
    const MAX = 5;
    const files = Array.from(fileList);
    const allowed = /\.(jpe?g|png|gif|webp|pdf)$/i;
    const MAX_SIZE = 10 * 1024 * 1024;

    for (const f of files) {
        if (_refundDocFiles.length >= MAX) {
            alert(`파일은 최대 ${MAX}개까지 첨부할 수 있습니다.`); break;
        }
        if (!allowed.test(f.name)) {
            alert(`"${f.name}" — JPG, PNG, GIF, WEBP, PDF 파일만 가능합니다.`); continue;
        }
        if (f.size > MAX_SIZE) {
            alert(`"${f.name}" — 파일 크기가 10MB를 초과합니다.`); continue;
        }
        // 중복 방지
        if (_refundDocFiles.some(x => x.file.name === f.name && x.file.size === f.size)) continue;
        _refundDocFiles.push({ file: f, previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : null });
    }
    _renderRefundDocList();
}

/** 파일 목록 렌더링 */
function _renderRefundDocList() {
    const list = document.getElementById('refundDocList');
    if (!list) return;
    if (_refundDocFiles.length === 0) { list.innerHTML = ''; return; }
    list.innerHTML = _refundDocFiles.map((item, idx) => {
        const f = item.file;
        const sizeMB = (f.size / 1024 / 1024).toFixed(1);
        const isPdf  = f.name.toLowerCase().endsWith('.pdf');
        const preview = item.previewUrl
            ? `<img src="${item.previewUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:5px;border:1px solid #e5e7eb;flex-shrink:0" alt="">`
            : `<div style="width:36px;height:36px;background:#fee2e2;border-radius:5px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-file-pdf" style="color:#dc2626;font-size:.9rem"></i></div>`;
        return `
        <div style="display:flex;align-items:center;gap:9px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px">
            ${preview}
            <div style="flex:1;min-width:0">
                <div style="font-size:.82rem;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
                <div style="font-size:.74rem;color:#9ca3af;margin-top:1px">${sizeMB} MB · ${isPdf ? 'PDF' : '이미지'}</div>
            </div>
            <button type="button" onclick="_removeRefundDoc(${idx})"
                    style="background:none;border:none;color:#9ca3af;cursor:pointer;padding:4px;font-size:1rem;line-height:1;flex-shrink:0"
                    title="삭제">✕</button>
        </div>`;
    }).join('');
}

/** 파일 개별 삭제 */
function _removeRefundDoc(idx) {
    const item = _refundDocFiles[idx];
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    _refundDocFiles.splice(idx, 1);
    _renderRefundDocList();
}

/* ── 환불 신청 제출 ─────────────────────────────────────────────────── */
async function submitRefundRequest() {
    const dong   = document.getElementById('refundDong')?.value.trim();
    const ho     = document.getElementById('refundHo')?.value.trim();
    const name   = document.getElementById('refundName')?.value.trim();
    const phone  = document.getElementById('refundPhone')?.value.trim();
    const reason = document.getElementById('refundReason')?.value;
    const detail = document.getElementById('refundDetail')?.value.trim();

    if (!dong)   { alert('동을 입력하세요.'); return; }
    if (!ho)     { alert('호수를 입력하세요.'); return; }
    if (!name)   { alert('이름을 입력하세요.'); return; }
    if (!phone)  { alert('연락처를 입력하세요.'); return; }
    if (!reason) { alert('환불 사유를 선택하세요.'); return; }
    // 기타 사유는 파일 미첨부 시 경고만 (차단하지 않음), 그 외는 필수
    if (_refundDocFiles.length === 0) {
        if (reason === 'other') {
            const proceed = confirm('증빙서류를 첨부하지 않으셨습니다.\n서류 미제출 시 환불 처리가 지연될 수 있습니다.\n그래도 신청하시겠습니까?');
            if (!proceed) return;
        } else {
            const docHint = reason === 'injury' ? '(진단서)' : '(비자·항공권 사본)';
            alert(`증빙서류를 1개 이상 첨부해주세요.\n${docHint}`);
            return;
        }
    }

    const reasonLabel = {
        injury:     '6개월 이상 운동 불가 질병·부상',
        emigration: '6개월 이상 해외 이주',
        other:      '기타'
    }[reason] || reason;

    const complexCode = complexContext?.getComplexCode?.() || '';
    const complexId   = complexContext?.getComplexId?.()   || '';

    const btn = document.querySelector('#refundRequestModal [onclick="submitRefundRequest()"]');
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 접수 중...'; }

        // Step 1: 해지/환불 신청 레코드 먼저 생성
        const res = await fetch('/api/cancellations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                complex_id: complexId,
                complex_code: complexCode,
                name, dong, ho, phone,
                program_name: '',
                request_type: 'refund',
                refund_reason: reasonLabel,
                refund_detail: detail || ''
            })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '접수 실패');

        const cancellationId = data.data?.id;

        // Step 2: 서류 파일 업로드
        let uploadedUrls = [];
        let uploadedNames = [];
        if (_refundDocFiles.length > 0 && cancellationId) {
            if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 서류 업로드 중...';
            const formData = new FormData();
            formData.append('cancellation_id', cancellationId);
            formData.append('complex_code', complexCode);
            _refundDocFiles.forEach(item => formData.append('files', item.file));

            const upRes = await fetch('/api/upload/refund-docs', {
                method: 'POST',
                body: formData
            });
            const upData = await upRes.json();

            if (upData.success) {
                uploadedUrls  = upData.urls  || [];
                uploadedNames = upData.file_names || [];

                // Step 3: cancellation 레코드에 doc_urls 저장
                if (uploadedUrls.length > 0) {
                    await fetch(`/api/cancellations/${cancellationId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            doc_urls: uploadedUrls.map((url, i) => ({
                                url,
                                name: uploadedNames[i] || `서류${i+1}`,
                                uploaded_at: new Date().toISOString()
                            }))
                        })
                    });
                }
            } else {
                // 업로드 실패해도 신청은 완료 — 경고만 표시
                console.warn('서류 업로드 실패:', upData.error);
                alert(`⚠️ 환불 신청은 접수되었으나 서류 업로드에 실패했습니다.\n직접 관리사무소에 서류를 제출해주세요.\n오류: ${upData.error}`);
                closeRefundRequestModal();
                return;
            }
        }

        closeRefundRequestModal();
        const docMsg = uploadedUrls.length > 0
            ? `\n\n📎 첨부 서류 ${uploadedUrls.length}개가 업로드되었습니다.`
            : '';
        alert(`✅ 환불 신청이 접수되었습니다.\n담당자가 확인 후 연락드리겠습니다.${docMsg}`);
    } catch (e) {
        alert('접수 중 오류가 발생했습니다: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> 환불 신청 접수'; }
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   🏨 호텔 모드 — initHotelMode() / _hotelCustomizeForm() / hotelSelectPT()
   venue_type='hotel' 단지일 때 DOMContentLoaded 직후 호출됨
   ═══════════════════════════════════════════════════════════════════════════ */
function initHotelMode() {
    if (!complexContext || !complexContext.isHotel || !complexContext.isHotel()) return;

    const complex = complexContext.getComplex();
    console.log('🏨 Hotel mode activated for:', complex?.name || complex?.complex_name);

    /* 0. body 테마 클래스 보장 */
    if (!document.body.classList.contains('theme-hotel')) {
        document.body.classList.add('theme-hotel');
        console.log('🎨 body.theme-hotel class ensured by initHotelMode');
    }

    /* 0-b. 브랜드 로고 헤더 교체 */
    const brandHeader   = document.getElementById('hotelBrandHeader');
    const defaultLogo   = document.getElementById('defaultHeaderLogo');
    if (brandHeader && defaultLogo) {
        defaultLogo.style.display = 'none';
        defaultLogo.setAttribute('aria-hidden', 'true');
        brandHeader.style.display = 'flex';
        brandHeader.removeAttribute('aria-hidden');
        /* 호텔측 공식 상호명 고정 반영: 아세로짐 대전 라마다호텔점 */
        const aceroTag = brandHeader.querySelector('.hotel-brand-acerogym .hotel-brand-tagline');
        if (aceroTag) aceroTag.textContent = '대전 라마다호텔점';
        console.log('🏨 Brand header switched to RAMADA × ACEROGYM');
    }

    /* 1. CTA 오버레이 표시 / 아파트 퀵액션·인라인 폼 섹션 숨김
     *  ⚠️ page1/page2는 DOM에 남겨두고 visibility만 숨김 —
     *     기존 폼 submit·signaturePad·goToPage2 등 모든 JS 로직은
     *     hotelApplyModal 안에서 그대로 재사용함 */
    const overlay   = document.getElementById('hotelCtaOverlay');
    const quickWrap = document.querySelector('.quick-actions-wrap');
    const page1El   = document.getElementById('page1');
    const page2El   = document.getElementById('page2');
    if (overlay)   { overlay.setAttribute('aria-hidden', 'false'); overlay.style.display = 'block'; }
    if (quickWrap) quickWrap.style.display = 'none';
    /* 호텔 모드: 인라인 신청 섹션 숨김 — 풀스크린 모달로 대체 */
    if (page1El) { page1El.setAttribute('data-hotel-hidden', '1'); page1El.style.display = 'none'; }
    if (page2El) { page2El.setAttribute('data-hotel-hidden', '1'); page2El.style.display = 'none'; }

    /* 2. CTA 안내 문구 개인화 — page_settings > 단지명 > 기본값 우선순위 */
    let ps = {};
    try { if (complex?.page_settings) ps = JSON.parse(complex.page_settings); } catch(e) {}

    const intro = document.getElementById('hotelCtaIntro');
    if (intro) {
        if (ps.hero_title) {
            intro.innerHTML = ps.hero_title;
        } else {
            const cName = complex?.name || complex?.complex_name || '';
            intro.innerHTML = cName
                ? `${cName}에<br>어서 오세요.`
                : '아세로짐 대전 라마다호텔점에<br>어서 오세요.';
        }
    }

    /* PRIMARY CTA 타이틀/설명: page_settings 우선 (바텀시트 트리거 버튼) */
    const lessonTitleEl = document.getElementById('hotelCtaLessonTitle');
    if (lessonTitleEl && ps.lesson_title) lessonTitleEl.textContent = ps.lesson_title;

    const lessonDesc = document.getElementById('hotelCtaLessonDesc');
    if (lessonDesc) {
        if (ps.lesson_desc) {
            lessonDesc.textContent = ps.lesson_desc;
        } else if (Array.isArray(complex?.lesson_types) && complex.lesson_types.length) {
            lessonDesc.textContent = complex.lesson_types.slice(0, 3).join(' · ');
        }
    }

    /* PT 타이틀/설명 */
    const ptCard = document.getElementById('hotelCtaPT');
    if (ptCard) {
        if (ps.pt_title) {
            const t = ptCard.querySelector('.hotel-cta-title');
            if (t) t.textContent = ps.pt_title;
        }
        if (ps.pt_desc) {
            const d = ptCard.querySelector('.hotel-cta-desc');
            if (d) d.textContent = ps.pt_desc;
        }
    }

    /* 예약 조회·변경 타이틀 (hotel-cta-card--muted) */
    if (ps.booking_title) {
        const bookingCards = document.querySelectorAll('.hotel-cta-card--muted .hotel-cta-title');
        if (bookingCards.length) bookingCards[0].textContent = ps.booking_title;
    }

    /* 아웃라인 버튼 레이블: 내 신청 내역 조회·변경 / 이용 해지 신청 */
    if (ps.manage_label) {
        const manageBtn = document.querySelector('.hotel-outline-btn:not(.hotel-outline-btn--cancel) span');
        if (manageBtn) manageBtn.textContent = ps.manage_label;
    }
    if (ps.cancel_label) {
        const cancelBtn = document.querySelector('.hotel-outline-btn--cancel span');
        if (cancelBtn) cancelBtn.textContent = ps.cancel_label;
    }

    /* 서브 서비스 버튼 레이블 & 표시 여부 */
    const subBtnMap = [
        ['psInquiryLabel',  'show_inquiry',   'inquiry_label',   0],
        ['psTimetableLabel','show_timetable',  'timetable_label', 1],
        ['psProgramLabel',  'show_program',    'program_label',   2],
        ['psTrainerLabel',  'show_trainer',    'trainer_label',   3],
        ['psNoticeLabel',   'show_notice',     'notice_label',    4],
        ['psContactLabel',  'show_contact',    'contact_label',   5],
    ];
    const subBtns = document.querySelectorAll('#hotelSubActions .hotel-sub-btn');
    subBtnMap.forEach(([, showKey, labelKey, idx]) => {
        const btn = subBtns[idx];
        if (!btn) return;
        if (ps[showKey] === false) {
            btn.style.display = 'none';
        }
        if (ps[labelKey]) {
            const span = btn.querySelector('span');
            if (span) span.textContent = ps[labelKey];
        }
    });

    /* 3. 폼 + 모달 커스터마이징 */
    _hotelCustomizeForm();
    _hotelCustomizeModals();

    /* 4. 헤더 서브라인 — 브랜드 헤더가 없을 때만 삽입 (fallback)
     *  brandHeaderActive: style.display가 'none' 이거나 빈 문자('')가 아니면 active로 판단
     *  (0-b 단계에서 flex 로 설정하므로 'flex' | 'block' 등 모두 active) */
    const headerEl = document.querySelector('.header');
    const _bhEl = document.getElementById('hotelBrandHeader');
    const brandHeaderActive = _bhEl && _bhEl.style.display !== 'none' && _bhEl.style.display !== '';
    if (headerEl && !brandHeaderActive && !headerEl.querySelector('.hotel-header-sub')) {
        const sub = document.createElement('p');
        sub.className = 'hotel-header-sub';
        sub.style.cssText =
            'font-size:.68rem;letter-spacing:.16em;color:var(--hotel-gold,#C8A864);' +
            'opacity:.85;margin-top:4px;font-family:"Noto Serif KR",serif;';
        sub.textContent = 'WELLNESS CONCIERGE SERVICE';
        const h1 = headerEl.querySelector('h1');
        if (h1) h1.after(sub);
    }

    /* 5. 로딩 아이콘 변경 */
    const loadingIcon = document.querySelector('.loading-logo i');
    if (loadingIcon) loadingIcon.className = 'fas fa-hotel';

    /* 6. 언어 초기화 (저장된 언어 or 기본 한국어) */
    initHotelI18n();

    console.log('✅ Hotel mode UI applied');
}

function _hotelCustomizeForm() {
    /* Step1 섹션 헤더 */
    const step1Header = document.querySelector('#page1 .section-header h3');
    if (step1Header) step1Header.innerHTML = `<i class="fas fa-concierge-bell"></i> ${_i18n('form.step1.header')}`;

    /* 동/호수 행 숨기고 객실 번호 필드 삽입 */
    const dongHoRow = document.querySelector('.form-row:has(#dong)');
    if (dongHoRow) dongHoRow.style.display = 'none';
    const dongConfirmRow = document.getElementById('dongHoConfirmRow');
    if (dongConfirmRow) dongConfirmRow.style.display = 'none';

    const basicFieldset = document.querySelector('#page1 fieldset');
    const existingRoomRow = document.getElementById('hotelRoomRow');
    if (basicFieldset) {
        if (!existingRoomRow) {
            const roomRow = document.createElement('div');
            roomRow.id = 'hotelRoomRow';
            roomRow.className = 'form-group';
            roomRow.innerHTML = `
                <label for="hotelRoom">${_i18n('form.room.label')} <span class="required">*</span></label>
                <input type="text" id="hotelRoom" placeholder="${_i18n('form.room.placeholder')}" inputmode="numeric" autocomplete="off"
                       oninput="this.value=this.value.replace(/[^0-9]/g,'')">
                <small style="color:#7f8c8d;font-size:.78rem;margin-top:4px;display:block">
                    ${_i18n('form.room.hint')}
                </small>`;
            basicFieldset.insertBefore(roomRow, basicFieldset.firstChild);
        } else {
            /* 언어 전환 시 기존 필드 레이블/placeholder/hint 갱신 */
            const lbl = existingRoomRow.querySelector('label');
            if (lbl) lbl.innerHTML = `${_i18n('form.room.label')} <span class="required">*</span>`;
            const inp = existingRoomRow.querySelector('input');
            if (inp) inp.placeholder = _i18n('form.room.placeholder');
            const hint = existingRoomRow.querySelector('small');
            if (hint) hint.textContent = _i18n('form.room.hint');
        }
    }

    /* fieldset legend 변경 */
    const legendBasic = document.querySelector('#page1 fieldset:first-of-type legend');
    if (legendBasic) legendBasic.innerHTML = `<i class="fas fa-user"></i> ${_i18n('form.legend.guest')}`;
    const legendLesson = document.querySelector('#page1 fieldset:nth-of-type(2) legend');
    if (legendLesson) legendLesson.innerHTML = `<i class="fas fa-dumbbell"></i> ${_i18n('form.legend.service')}`;

    /* 개인정보 동의 문구 */
    const consentDetail = document.querySelector('#page1 .consent-detail');
    if (consentDetail) {
        consentDetail.innerHTML = _i18n('form.consent.detail');
    }

    /* Step1 → Step2 버튼 */
    const submitBtn = document.querySelector('#contractForm button[type="submit"]');
    if (submitBtn) submitBtn.innerHTML = `<i class="fas fa-arrow-right"></i> ${_i18n('form.next.label')}`;

    /* Step2 헤더 */
    const step2Header = document.querySelector('#page2 .section-header h3');
    if (step2Header) step2Header.innerHTML = `<i class="fas fa-file-contract"></i> ${_i18n('form.step2.header')}`;

    /* 신청·해지 기간 안내 박스 숨김 */
    const periodBox = document.querySelector('.period-notice-box');
    if (periodBox) periodBox.style.display = 'none';

    /* 계약 요약 동호수 → 객실 번호 */
    document.querySelectorAll('#page2 .summary-row').forEach(row => {
        const lbl = row.querySelector('span:first-child');
        if (lbl && lbl.textContent.trim() === '동호수') lbl.textContent = _i18n('form.summary.room');
    });

    /* 환불 정책 교체 */
    const refundBox = document.querySelector('.policy-box.policy-refund');
    if (refundBox) {
        refundBox.innerHTML = `
            <div class="policy-box-header">
                <i class="fas fa-exclamation-circle"></i>
                이용 취소 및 환불 정책 <span class="policy-required-tag">필독 · 필수 동의</span>
            </div>
            <div class="policy-content">
                <div class="policy-sub-title">📋 이용 취소 방법</div>
                <ul>
                    <li>이용 취소는 <strong>본 시스템(온라인)</strong>을 통해서만 접수 가능합니다.</li>
                    <li>취소 신청 접수 후 <strong>즉시 자동 처리</strong>됩니다.</li>
                    <li>취소 확인 후 <strong>번복이 불가</strong>하며, 신중하게 신청해 주세요.</li>
                </ul>
                <div class="policy-sub-title policy-mt">💰 환불 정책</div>
                <ul>
                    <li>이용 시작 <strong>24시간 전까지</strong> 취소 시 <strong>전액 환불</strong>됩니다.</li>
                    <li>이용 시작 <strong>24시간 이내</strong> 취소 또는 노쇼 시 환불이 제한될 수 있습니다.</li>
                    <li>서비스 이용 후에는 환불이 불가합니다.</li>
                </ul>
                <div class="policy-notice">
                    ※ 취소 신청은 반드시 본 시스템을 통해 제출해야 하며, SMS · 통화 등 구두 요청은 인정되지 않습니다.
                </div>
            </div>
            <label class="policy-consent-label">
                <input type="checkbox" id="refundAgreement" required>
                <span>${_i18n('form.refund.agree')} <span class="required">*</span></span>
            </label>`;
    }

    /* 이용약관 교체 */
    const termsBox = document.querySelector('.terms-box');
    if (termsBox) {
        termsBox.innerHTML = `
            <div class="terms-section"><strong>① 본인 이용 원칙</strong>
                <p>본 서비스는 투숙객 본인만 이용 가능하며, 타인에게 양도하거나 공유할 수 없습니다.</p></div>
            <div class="terms-section"><strong>② 이용 시간 준수</strong>
                <p>예약된 시간을 준수해 주세요. 무단 지각 또는 노쇼 시 이용 요금이 청구될 수 있습니다.</p></div>
            <div class="terms-section"><strong>③ 시설 이용 수칙</strong>
                <p>피트니스 시설 내에서는 안전 수칙을 준수하고, 타 투숙객에게 불편을 주는 행동을 삼가주세요.</p></div>
            <div class="terms-section"><strong>④ 사고 면책</strong>
                <p>본인 부주의로 발생한 사고에 대해서는 시설 측의 책임을 묻지 않습니다.</p></div>
            <div class="terms-section"><strong>⑤ 개인 물품 관리</strong>
                <p>귀중품 및 개인 소지품은 직접 관리해 주세요. 분실·도난에 대해 시설 측은 책임지지 않습니다.</p></div>
            <div class="terms-section"><strong>⑥ 이용 취소 및 변경</strong>
                <p>이용 취소 또는 일정 변경은 이용 시작 24시간 전까지 본 시스템을 통해 신청해 주세요.</p></div>`;
    }

    /* 이용약관 동의 레이블 */
    const termsAgreeLabel = document.getElementById('termsAgreeLabel');
    if (termsAgreeLabel) {
        termsAgreeLabel.innerHTML = `${_i18n('form.terms.agree')} <span class="required">*</span>`;
    }

    /* 자동재등록 안내 행 숨김 */
    const autoRenewRow = document.getElementById('contractAutoRenewRow');
    if (autoRenewRow) autoRenewRow.style.display = 'none';

    console.log('✅ Hotel form customization applied');
}

/**
 * 호텔 모드 — 공유 모달 커스터마이징
 * (내 문의 조회 / 문의하기 / 시간표 / 프로그램 안내 / 트레이너 소개 모달)
 * ─ initHotelMode() 및 _applyHotelI18n()에서 호출
 */
function _hotelCustomizeModals() {
    /* ── 1. 내 문의 조회 모달 (#myInquiryModal) ── */
    const myInqModal = document.getElementById('myInquiryModal');
    if (myInqModal && !myInqModal.dataset.hotelPatched) {
        myInqModal.dataset.hotelPatched = '1';

        /* 헤더 타이틀 */
        const hdr = myInqModal.querySelector('[style*="background:var(--color-primary"] span');
        if (hdr) hdr.innerHTML = '<i class="fas fa-search"></i> ' + _i18n('myinq.title');

        /* 안내 문구 박스 — 동/호수 언급 제거, 호텔 투숙객용으로 교체 */
        const infoBubble = myInqModal.querySelector('[style*="background:#eff6ff"]');
        if (infoBubble) {
            infoBubble.innerHTML =
                `<i class="fas fa-info-circle"></i>
                <strong>${_i18n('myinq.hint.bold')}</strong>${_i18n('myinq.hint.body')}`;
        }

        /* 동·호수 입력 행 → 객실 번호 단일 필드로 교체 */
        const dongHoWrap = myInqModal.querySelector('[style*="display:flex;gap:8px"]');
        if (dongHoWrap) {
            dongHoWrap.innerHTML = `
                <div style="flex:1">
                    <label style="font-size:.8rem;font-weight:600;color:#374151;display:block;margin-bottom:3px">
                        ${_i18n('form.room.label')} <span style="color:#9ca3af;font-weight:400">(${_i18n('myinq.optional')})</span>
                    </label>
                    <input type="text" id="myInqDong" placeholder="${_i18n('form.room.placeholder')}"
                           style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #d1d5db;border-radius:7px;font-size:.88rem"
                           oninput="this.style.borderColor='#d1d5db'">
                    <input type="hidden" id="myInqHo" value="">
                </div>
                <div style="flex:1">
                    <label style="font-size:.8rem;font-weight:600;color:#374151;display:block;margin-bottom:3px">
                        ${_i18n('myinq.phone.label')} <span style="color:#e53e3e">*</span>
                    </label>
                    <input type="tel" id="myInqPhone4" placeholder="${_i18n('myinq.phone.placeholder')}" maxlength="4" inputmode="numeric"
                           style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #d1d5db;border-radius:7px;font-size:.88rem"
                           oninput="this.style.borderColor='#d1d5db'">
                </div>`;
        }

        /* 조회 버튼 */
        const searchBtn = myInqModal.querySelector('button[onclick="searchMyInquiries()"]');
        if (searchBtn) searchBtn.innerHTML = `<i class="fas fa-search"></i> ${_i18n('myinq.search.btn')}`;
    }

    /* ── 2. 문의하기 모달 (#inquiryModal) ── */
    const inqModal = document.getElementById('inquiryModal');
    if (inqModal && !inqModal.dataset.hotelPatched) {
        inqModal.dataset.hotelPatched = '1';

        /* 헤더 타이틀 */
        const h2 = inqModal.querySelector('.modal-header h2');
        if (h2) h2.innerHTML = `<i class="fas fa-pen"></i> ${_i18n('inq.title')}`;

        /* 동·호수 행 숨기기 → 객실 번호 행 삽입 */
        const dongHoRow = inqModal.querySelector('.form-row:has(#inquiryDong)');
        if (dongHoRow) dongHoRow.style.display = 'none';

        /* 동/호수 필수 안내 문구 숨기기 */
        const dongNotice = inqModal.querySelector('p[style*="color:#b45309"]');
        if (dongNotice) dongNotice.style.display = 'none';

        /* 객실 번호 필드 삽입 (중복 방지) */
        if (!document.getElementById('inquiryRoomRow')) {
            const formBody = inqModal.querySelector('.modal-body form');
            if (formBody) {
                const roomRow = document.createElement('div');
                roomRow.id = 'inquiryRoomRow';
                roomRow.className = 'form-group';
                roomRow.innerHTML = `
                    <label for="inquiryRoom">${_i18n('form.room.label')} <span class="required">*</span></label>
                    <input type="text" id="inquiryRoom" placeholder="${_i18n('form.room.placeholder')}"
                           inputmode="numeric" autocomplete="off"
                           oninput="this.value=this.value.replace(/[^0-9]/g,'')">
                    <small style="color:#6b7280;font-size:.78rem;margin-top:4px;display:block">
                        ${_i18n('form.room.hint')}
                    </small>`;
                /* 동·호수 행 바로 뒤(= formBody 첫 번째 자식)에 삽입 */
                formBody.insertBefore(roomRow, formBody.firstChild);
            }
        } else {
            /* 언어 전환 시 기존 필드 갱신 */
            const lbl = document.querySelector('#inquiryRoomRow label');
            if (lbl) lbl.innerHTML = `${_i18n('form.room.label')} <span class="required">*</span>`;
            const inp = document.getElementById('inquiryRoom');
            if (inp) inp.placeholder = _i18n('form.room.placeholder');
            const hint = document.querySelector('#inquiryRoomRow small');
            if (hint) hint.textContent = _i18n('form.room.hint');
        }

        /* 공개 문의 레이블 호텔용 */
        const publicLabel = inqModal.querySelector('input[id="inquiryPublic"] + span');
        if (publicLabel) publicLabel.textContent = _i18n('inq.public.label');
    }

    /* ── 3. 시간표 모달 헤더 ── */
    const ttHeader = document.querySelector('#timetableModal .modal-header h2');
    if (ttHeader) ttHeader.innerHTML = `<i class="fas fa-table"></i> ${_i18n('sub.timetable')}`;

    /* ── 4. 프로그램 안내 모달 헤더 ── */
    const currHeader = document.querySelector('#curriculumModal .modal-header h2');
    if (currHeader) currHeader.innerHTML = `<i class="fas fa-calendar-alt"></i> ${_i18n('sub.program')}`;

    /* ── 5. 강사(트레이너) 소개 모달 헤더 ── */
    const instrHeader = document.querySelector('#instructorsModal .modal-header h2');
    if (instrHeader) instrHeader.innerHTML = `<i class="fas fa-user-tie"></i> ${_i18n('sub.trainer')}`;

    console.log('✅ Hotel modal customization applied');
}

/* PT 예약 버튼: PT 타입 자동 선택 후 폼 스크롤 */
function hotelSelectPT() {
    const select = document.getElementById('lessonType');
    if (select) {
        const ptOption = Array.from(select.options).find(o =>
            o.text.toLowerCase().includes('pt') || o.text.includes('피티')
        );
        if (ptOption) select.value = ptOption.value;
    }
    document.getElementById('page1')?.scrollIntoView({ behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════════════════
   🏨 피트니스 신청 바텀시트
   ─ openHotelServiceSheet / closeHotelServiceSheet
   ════════════════════════════════════════════════════════════════════ */

function openHotelServiceSheet() {
    const backdrop = document.getElementById('hotelServiceSheetBackdrop');
    const sheet    = document.getElementById('hotelServiceSheet');
    if (!backdrop || !sheet) return;

    // display 먼저 block → 다음 프레임에 is-open 추가 (CSS transition 발동)
    backdrop.style.display = 'block';
    sheet.style.display    = 'block';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            backdrop.classList.add('is-open');
            sheet.classList.add('is-open');
        });
    });

    document.body.style.overflow = 'hidden';
    sheet.scrollTop = 0;
}

function closeHotelServiceSheet() {
    const backdrop = document.getElementById('hotelServiceSheetBackdrop');
    const sheet    = document.getElementById('hotelServiceSheet');
    if (!backdrop || !sheet) return;

    backdrop.classList.remove('is-open');
    sheet.classList.remove('is-open');

    // transition 끝난 후 display:none
    const onEnd = () => {
        backdrop.style.display = 'none';
        sheet.style.display    = 'none';
        document.body.style.overflow = '';
        sheet.removeEventListener('transitionend', onEnd);
    };
    sheet.addEventListener('transitionend', onEnd);
}

/* ═══════════════════════════════════════════════════════════════════════
   🤸 그룹 클래스 모달
   ─ openGroupClassModal / closeGroupClassModal / applyGroupClass
   ════════════════════════════════════════════════════════════════════ */

function openGroupClassModal() {
    const backdrop = document.getElementById('groupClassModalBackdrop');
    const modal    = document.getElementById('groupClassModal');
    if (!backdrop || !modal) return;

    backdrop.style.display = 'block';
    modal.style.display    = 'block';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            backdrop.classList.add('is-open');
            modal.classList.add('is-open');
        });
    });

    document.body.style.overflow = 'hidden';
    modal.scrollTop = 0;

    // 신청 현황 로드 (현재는 localStorage 기반 임시 구현)
    _loadGroupClassQuota();
}

function closeGroupClassModal() {
    const backdrop = document.getElementById('groupClassModalBackdrop');
    const modal    = document.getElementById('groupClassModal');
    if (!backdrop || !modal) return;

    backdrop.classList.remove('is-open');
    modal.classList.remove('is-open');

    const onEnd = () => {
        backdrop.style.display = 'none';
        modal.style.display    = 'none';
        document.body.style.overflow = '';
        modal.removeEventListener('transitionend', onEnd);
    };
    modal.addEventListener('transitionend', onEnd);
}

/**
 * 그룹 클래스 신청 현황 로드
 * 실제 API 연동 전 단계: localStorage에서 현재 주(월요일 기준) 신청 수 관리
 */
function _loadGroupClassQuota() {
    const bar   = document.getElementById('groupClassQuotaBar');
    const count = document.getElementById('groupClassQuotaCount');
    const btn   = document.getElementById('groupClassApplyBtn');
    if (!bar || !count || !btn) return;

    const MAX = 5;
    const key = _groupClassWeekKey();
    let applied = 0;
    try {
        const stored = JSON.parse(localStorage.getItem('groupClassQuota') || '{}');
        applied = Number(stored[key] || 0);
    } catch (e) { applied = 0; }

    const pct = Math.min(100, Math.round((applied / MAX) * 100));
    bar.style.width = pct + '%';
    bar.classList.toggle('is-full', applied >= MAX);

    if (applied >= MAX) {
        count.textContent = '마감 (5/5명)';
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-ban"></i> 이번 주 마감';
    } else {
        count.textContent = applied + '/' + MAX + '명';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> 신청하기';
    }
}

/** 현재 주의 월요일 날짜를 키로 사용 (YYYY-MM-DD) */
function _groupClassWeekKey() {
    const now = new Date();
    const day = now.getDay(); // 0=일, 1=월 ...
    const diff = day === 0 ? -6 : 1 - day; // 이번 주 월요일
    const mon = new Date(now);
    mon.setDate(now.getDate() + diff);
    return mon.toISOString().slice(0, 10);
}

function applyGroupClass() {
    const btn = document.getElementById('groupClassApplyBtn');
    if (!btn || btn.disabled) return;

    const MAX = 5;
    const key = _groupClassWeekKey();
    let quota = {};
    try { quota = JSON.parse(localStorage.getItem('groupClassQuota') || '{}'); } catch (e) {}

    const current = Number(quota[key] || 0);
    if (current >= MAX) {
        alert('이번 주 신청이 마감되었습니다.');
        return;
    }

    // 이미 신청 여부 체크 (같은 기기 기준)
    const appliedKey = 'groupClassApplied_' + key;
    if (localStorage.getItem(appliedKey) === '1') {
        alert('이번 주 신청이 이미 완료되었습니다.\n중복 신청은 불가합니다.');
        return;
    }

    quota[key] = current + 1;
    localStorage.setItem('groupClassQuota', JSON.stringify(quota));
    localStorage.setItem(appliedKey, '1');

    _loadGroupClassQuota();

    // 완료 피드백
    btn.innerHTML = '<i class="fas fa-check-circle"></i> 신청 완료!';
    btn.style.background = 'linear-gradient(135deg,#22c55e,#16a34a)';
    btn.disabled = true;

    setTimeout(() => {
        closeGroupClassModal();
        _showHotelToast('✅ 아세로 순환 운동 신청이 완료되었습니다!\n매주 일요일 21시 이후 확정 안내를 드립니다.');
    }, 900);
}

/* ═══════════════════════════════════════════════════════════════════════
   ⚡ 리프레시 PT 모달
   ─ openRefreshPTModal / closeRefreshPTModal / applyRefreshPT
   ════════════════════════════════════════════════════════════════════ */

function openRefreshPTModal() {
    const backdrop = document.getElementById('refreshPTModalBackdrop');
    const modal    = document.getElementById('refreshPTModal');
    if (!backdrop || !modal) return;

    backdrop.style.display = 'block';
    modal.style.display    = 'block';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            backdrop.classList.add('is-open');
            modal.classList.add('is-open');
        });
    });

    document.body.style.overflow = 'hidden';
    modal.scrollTop = 0;
}

function closeRefreshPTModal() {
    const backdrop = document.getElementById('refreshPTModalBackdrop');
    const modal    = document.getElementById('refreshPTModal');
    if (!backdrop || !modal) return;

    backdrop.classList.remove('is-open');
    modal.classList.remove('is-open');

    const onEnd = () => {
        backdrop.style.display = 'none';
        modal.style.display    = 'none';
        document.body.style.overflow = '';
        modal.removeEventListener('transitionend', onEnd);
    };
    modal.addEventListener('transitionend', onEnd);
}

function applyRefreshPT() {
    // 리프레시 PT → 풀스크린 신청 모달로 진입 (refresh 타입)
    closeRefreshPTModal();
    /* 인너 모달 close 애니메이션(transition ~.3s) 이후 풀스크린 모달 열기 */
    setTimeout(() => openHotelApplyModal('refresh'), 320);
}

/* ════════════════════════════════════════════════════════════════════
   🏨 풀스크린 신청 모달 — openHotelApplyModal() / closeHotelApplyModal()
      - body.theme-hotel 스코프 전용: 아파트 단지 완전 무영향
      - page1/page2 DOM을 #hotelApplyBody 로 이동하여 기존 JS 로직 재사용
   ════════════════════════════════════════════════════════════════════ */

/** 현재 step (1=신청정보, 2=약관·서명) */
let _hotelApplyCurrentStep = 1;
/** 서비스 종류: 'class' | 'pt' | 'refresh' */
let _hotelApplyServiceType = 'class';
/** page1/page2 원래 부모 — 모달 닫을 때 복구용 */
let _hotelApplyPage1OrigParent = null;
let _hotelApplyPage2OrigParent = null;

/**
 * 풀스크린 신청 모달 열기
 * @param {string} serviceType  'class' | 'pt' | 'refresh'
 */
function openHotelApplyModal(serviceType) {
    if (!complexContext?.isHotel?.()) return;

    serviceType = serviceType || 'class';
    _hotelApplyServiceType = serviceType;
    _hotelApplyCurrentStep = 1;

    const modal = document.getElementById('hotelApplyModal');
    const body  = document.getElementById('hotelApplyBody');
    const page1 = document.getElementById('page1');
    const page2 = document.getElementById('page2');
    if (!modal || !body || !page1 || !page2) return;

    /* ── 헤더 서비스 태그 / 타이틀 업데이트 ── */
    const tagMap = {
        class:   'WELLNESS CLASS',
        pt:      'PERSONAL TRAINING',
        refresh: 'REFRESH PT',
    };
    const titleMap = {
        class:   '헬스 클래스 등록',
        pt:      'PT 예약',
        refresh: '리프레시 PT 신청',
    };
    const tagEl   = document.getElementById('hotelApplyServiceTag');
    const titleEl = document.getElementById('hotelApplyModalTitle');
    if (tagEl)   tagEl.textContent   = tagMap[serviceType]   || 'WELLNESS';
    if (titleEl) titleEl.textContent = titleMap[serviceType] || '피트니스 신청';

    /* ── lessonType 셀렉트 사전 선택 ── */
    const select = document.getElementById('lessonType');
    if (select) {
        const findOpt = (kw) => Array.from(select.options).find(o =>
            o.text.toLowerCase().includes(kw.toLowerCase()));
        if (serviceType === 'refresh') {
            const opt = findOpt('리프레시') || findOpt('refresh') || findOpt('pt');
            if (opt) select.value = opt.value;
        } else if (serviceType === 'pt') {
            const opt = findOpt('pt') || findOpt('피티');
            if (opt) select.value = opt.value;
        }
    }

    /* ── page1/page2 원래 부모 저장 → #hotelApplyBody 로 이동 ── */
    if (!_hotelApplyPage1OrigParent) _hotelApplyPage1OrigParent = page1.parentElement;
    if (!_hotelApplyPage2OrigParent) _hotelApplyPage2OrigParent = page2.parentElement;

    page1.style.display = 'block';
    page2.style.display = 'none';
    body.appendChild(page1);
    body.appendChild(page2);

    /* ── step indicator 초기화 ── */
    _hotelApplySetStep(1);

    /* ── 슬라이드업 오픈 애니메이션 ── */
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            modal.classList.add('is-open');
        });
    });
    body.scrollTop = 0;
}

/** 풀스크린 신청 모달 닫기 */
function closeHotelApplyModal() {
    const modal = document.getElementById('hotelApplyModal');
    if (!modal) return;

    modal.classList.remove('is-open');

    const onEnd = (e) => {
        /* transform transition 이 끝날 때만 처리 */
        if (e && e.propertyName !== 'transform') return;
        modal.style.display = 'none';
        document.body.style.overflow = '';

        /* page1/page2 원래 위치로 복구 + 다시 숨김 */
        const page1 = document.getElementById('page1');
        const page2 = document.getElementById('page2');
        if (page1 && _hotelApplyPage1OrigParent) {
            page1.style.display = 'none';
            _hotelApplyPage1OrigParent.appendChild(page1);
        }
        if (page2 && _hotelApplyPage2OrigParent) {
            page2.style.display = 'none';
            _hotelApplyPage2OrigParent.appendChild(page2);
        }

        modal.removeEventListener('transitionend', onEnd);
    };
    modal.addEventListener('transitionend', onEnd);
}

/**
 * 모달 뒤로가기 버튼 핸들러
 * - Step2: Step1으로 복귀 (goToPage1 재사용)
 * - Step1: 모달 닫고 바텀시트 복귀
 */
function hotelApplyGoBack() {
    if (_hotelApplyCurrentStep === 2) {
        goToPage1(); /* goToPage1() 내부에서 _hotelApplySetStep(1) 호출됨 */
    } else {
        closeHotelApplyModal();
        /* 애니메이션 끝나면 바텀시트 복귀 (350ms transition 맞춤) */
        setTimeout(openHotelServiceSheet, 360);
    }
}

/**
 * 호텔 모달 step indicator 업데이트
 * @param {number} step  1 또는 2
 */
function _hotelApplySetStep(step) {
    _hotelApplyCurrentStep = step;
    const s1 = document.getElementById('hotelApplyStep1Dot');
    const s2 = document.getElementById('hotelApplyStep2Dot');
    if (!s1 || !s2) return;
    if (step === 1) {
        s1.className = 'hotel-apply-step hotel-apply-step--active';
        s2.className = 'hotel-apply-step';
    } else {
        s1.className = 'hotel-apply-step hotel-apply-step--done';
        s2.className = 'hotel-apply-step hotel-apply-step--active';
    }
    /* 바디 스크롤 최상단 복귀 */
    const bodyEl = document.getElementById('hotelApplyBody');
    if (bodyEl) bodyEl.scrollTop = 0;
}

/* ── 공통 토스트 알림 ── */
function _showHotelToast(msg) {
    let toast = document.getElementById('hotelToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'hotelToast';
        toast.style.cssText = [
            'position:fixed', 'bottom:calc(env(safe-area-inset-bottom,0px) + 24px)',
            'left:50%', 'transform:translateX(-50%) translateY(20px)',
            'background:rgba(10,26,46,.96)', 'color:#e2c97e',
            'border:1px solid rgba(200,168,100,.4)', 'border-radius:12px',
            'padding:12px 20px', 'font-size:.82rem', 'font-weight:600',
            'line-height:1.5', 'text-align:center', 'white-space:pre-line',
            'z-index:1500', 'box-shadow:0 4px 20px rgba(0,0,0,.5)',
            'opacity:0', 'transition:opacity .25s,transform .25s',
            'pointer-events:none', 'max-width:calc(100vw - 40px)',
        ].join(';');
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });
    });
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 3200);
}

/* ════════════════════════════════════════════════════════════════════
   🌐 호텔 i18n — 언어 선택 모듈 (호텔 모드 전용)
      지원 언어: ko(한국어) · en(English) · ja(日本語) · zh(中文)
      - data-i18n="key" 속성이 있는 요소의 textContent/placeholder 교체
      - localStorage 'hotelLang' 에 영속 저장
      - body.theme-hotel 스코프 전용 — 아파트 단지 완전 무영향
   ════════════════════════════════════════════════════════════════════ */

const _hotelI18n = {
    ko: {
        /* ── 헤더 / 브랜드 ── */
        'brand.tagline':      '대전 라마다호텔점',
        'lang.btn':           '언어',

        /* ── 로비 헤더 ── */
        'lobby.caption':      'FITNESS CONCIERGE',
        'lobby.title':        '아세로짐 대전 라마다호텔점에\n어서 오세요.',

        /* ── PRIMARY CTA ── */
        'cta.primary.label':  'WELLNESS SERVICE',
        'cta.primary.title':  '피트니스 신청하기',
        'cta.primary.desc':   '헬스 클래스 · PT · 그룹 클래스 · 리프레시 PT',

        /* ── SECONDARY CTA ── */
        'cta.pt.label':       'PERSONAL',
        'cta.pt.title':       'PT 예약',
        'cta.pt.desc':        '1:1 퍼스널 트레이닝',
        'cta.booking.label':  'BOOKING',
        'cta.booking.title':  '예약 조회·변경',
        'cta.booking.desc':   '내역 확인 · 취소 · 변경',

        /* ── MORE SERVICES ── */
        'more.label':         'MORE SERVICES',
        'sub.mybook':         '내 문의 조회',
        'sub.timetable':      '시간표',
        'sub.program':        '프로그램 안내',
        'sub.trainer':        '트레이너 소개',
        'sub.notice':         '공지사항',
        'sub.contact':        '문의하기',
        'sub.manage':         '내 신청 내역 조회·변경',
        'sub.cancel':         '이용 해지 신청',
        'sub.staff':          '임직원 / 장기 이용 문의',

        /* ── 바텀시트 ── */
        'sheet.title':        '무엇을 도와드릴까요?',
        'card.class.badge':   'MEMBERSHIP',
        'card.class.name':    '헬스 클래스 등록',
        'card.class.desc':    '월 회원권 · 외부 회원 대상',
        'card.group.badge':   'FREE · 선착순 5명',
        'card.group.name':    '아세로 순환 운동',
        'card.group.desc':    '매주 월·수 10:00 · 회원+투숙객',
        'card.pt.badge':      'PERSONAL',
        'card.pt.name':       '1:1 PT 예약',
        'card.pt.desc':       '퍼스널 트레이닝 · 회원 대상',
        'card.refresh.badge': 'GUEST · 투숙객',
        'card.refresh.name':  '리프레시 PT',
        'card.refresh.desc':  '45분 · 40,000원 · 당일 예약',

        /* ── 그룹 클래스 모달 ── */
        'grp.title':          '아세로 순환 운동',
        'grp.desc':           '호텔 피트니스센터 무료 그룹 클래스',
        'grp.apply':          '이번 주 신청하기',
        'grp.full':           '이번 주 마감',
        'grp.done':           '신청 완료',

        /* ── 리프레시 PT 모달 ── */
        'rpt.title':          '리프레시 PT',
        'rpt.subtitle':       '투숙객 전용 퍼스널 트레이닝',
        'rpt.apply':          '신청하기',

        /* ── 풀스크린 신청 모달 ── */
        'apply.step1':        '신청 정보',
        'apply.step2':        '약관 · 서명',
        'apply.tag.class':    'WELLNESS CLASS',
        'apply.tag.pt':       'PERSONAL TRAINING',
        'apply.tag.refresh':  'REFRESH PT',
        'apply.title.class':  '헬스 클래스 등록',
        'apply.title.pt':     'PT 예약',
        'apply.title.refresh':'리프레시 PT 신청',

        /* ── 폼 레이블 ── */
        'form.dong':          '동호수',
        'form.hotel.room':    '객실 번호',
        'form.name':          '이름',
        'form.phone':         '연락처',
        'form.lesson':        '이용 서비스',
        'form.time':          '희망 시간',
        'form.next':          '다음',
        'form.submit':        '신청 완료',
        'form.back':          '이전',

        /* ── 그룹 클래스 모달 상세 ── */
        'grp.badge':          'FREE CLASS',
        'grp.subtitle':       'Circuit Training · 매니저 직접 진행',
        'grp.info.schedule':  '일정',
        'grp.info.schedule.val': '매주 <strong>월 · 수</strong> 10:00 – 10:40',
        'grp.info.capacity':  '정원',
        'grp.info.capacity.val': '<strong>선착순 5명</strong> (회원 + 투숙객)',
        'grp.info.open':      '신청',
        'grp.info.open.val':  '매주 일요일 21:00 QR 오픈 → 자동 확정',
        'grp.info.equip':     '장비',
        'grp.info.equip.val': '케틀벨 · 불가리안백 · 소도구',
        'grp.info.price':     '비용',
        'grp.info.price.val': '무료',
        'grp.desc.body':      '매니저가 직접 지도하는 풀바디 순환 운동 클래스입니다.<br>회원권만으로 <strong>월 8회 무료 그룹 PT</strong> 효과를 누리실 수 있습니다.',
        'grp.quota.label':    '이번 주 신청 현황',
        'grp.quota.loading':  '확인 중…',
        'grp.notice':         '신청 확정 시 문자·알림으로 안내드립니다.<br>노쇼 2회 누적 시 당월 신청이 제한됩니다.',

        /* ── 리프레시 PT 모달 상세 ── */
        'rpt.badge':          'GUEST ONLY',
        'rpt.sub':            '출장·여행 피로 회복 웰니스 케어',
        'rpt.info.duration':  '소요 시간',
        'rpt.info.duration.val': '<strong>45분</strong>',
        'rpt.info.price':     '이용 요금',
        'rpt.info.price.val': '<strong>40,000원</strong> / 1회',
        'rpt.info.time':      '이용 시간',
        'rpt.info.time.val':  '10:00 – 16:00 <small>(데드타임 슬롯)</small>',
        'rpt.info.target':    '대상',
        'rpt.info.target.val':'라마다호텔 <strong>투숙객 본인</strong>',
        'rpt.info.pay':       '결제',
        'rpt.info.pay.val':   '룸 결제 또는 현장 결제',
        'rpt.step1.title':    '사전 설문',
        'rpt.step1.desc':     '출장 통증 부위 · 운동 목적 · 식습관',
        'rpt.step2.title':    '체형·움직임 분석',
        'rpt.step2.desc':     '스쿼트·런지 평가 · 관절 가동범위',
        'rpt.step3.title':    '근막 이완 + 셀프 운동 처방',
        'rpt.step3.desc':     '목·어깨·요추 케어 · 셀프 운동 루틴 안내',
        'rpt.cta':            '당일 예약하기',
        'rpt.notice':         '예약 후 1층 피트니스 센터로 방문해 주세요.<br>객실 번호 확인이 필요합니다.',

        /* ── 폼 레이블 (page1 · page2) ── */
        'form.step1.header':  '피트니스 이용 신청',
        'form.legend.guest':  '투숙객 정보',
        'form.legend.service':'이용 서비스 선택',
        'form.room.label':    '객실 번호',
        'form.room.placeholder': '예: 1204',
        'form.room.hint':     '투숙 중인 객실 번호를 입력하세요',
        'form.consent.detail':'수집항목: 객실번호, 이름, 전화번호 &nbsp;|&nbsp; 목적: 피트니스 이용 신청 처리 &nbsp;|&nbsp; 보유기간: 체크아웃 후 30일',
        'form.next.label':    '이용 약관 확인',
        'form.step2.header':  '피트니스 이용 동의서',
        'form.summary.room':  '객실 번호',
        'form.terms.agree':   '위 이용약관 전체 (①~⑥)를 모두 읽고 동의합니다',
        'form.refund.agree':  '위 <strong>이용 취소 및 환불 정책</strong>을 모두 읽고 동의합니다',
        'header.sub':         'WELLNESS CONCIERGE SERVICE',

        /* ── 유효성 검사 alert ── */
        'alert.room':         '객실 번호를 입력해주세요.',
        'alert.name':         '이름을 입력해주세요.',
        'alert.phone':        '전화번호를 입력해주세요.',
        'alert.lesson':       '프로그램을 선택해주세요.',
        'alert.time':         '희망 시간대를 선택해주세요.',
        'alert.agreement':    '개인정보 수집 및 이용에 동의해주세요.',

        /* ── 내 문의 조회 모달 ── */
        'myinq.title':          '내 문의 조회',
        'myinq.hint.bold':      '전화번호 끝 4자리',
        'myinq.hint.body':      '를 입력하면 등록한 문의와 답변을 확인할 수 있습니다. 객실 번호도 함께 입력하면 더 정확하게 조회됩니다.',
        'myinq.optional':       '선택',
        'myinq.phone.label':    '전화 끝 4자리',
        'myinq.phone.placeholder': '예: 5678',
        'myinq.search.btn':     '조회하기',

        /* ── 문의하기 모달 ── */
        'inq.title':            '투숙객 문의',
        'inq.public.label':     '공개 문의로 등록 (다른 투숙객이 볼 수 있습니다)',
    },

    en: {
        'brand.tagline':      'Daejeon Ramada Hotel',
        'lang.btn':           'Language',
        'lobby.caption':      'FITNESS CONCIERGE',
        'lobby.title':        'Welcome to\nAcerogym Daejeon Ramada.',
        'cta.primary.label':  'WELLNESS SERVICE',
        'cta.primary.title':  'Book Fitness',
        'cta.primary.desc':   'Wellness Class · PT · Group · Refresh PT',
        'cta.pt.label':       'PERSONAL',
        'cta.pt.title':       'PT Booking',
        'cta.pt.desc':        '1:1 Personal Training',
        'cta.booking.label':  'BOOKING',
        'cta.booking.title':  'My Reservations',
        'cta.booking.desc':   'Check · Cancel · Modify',
        'more.label':         'MORE SERVICES',
        'sub.mybook':         'My Inquiries',
        'sub.timetable':      'Timetable',
        'sub.program':        'Programs',
        'sub.trainer':        'Trainers',
        'sub.notice':         'Notice',
        'sub.contact':        'Contact',
        'sub.manage':         'Manage My Booking',
        'sub.cancel':         'Cancel Membership',
        'sub.staff':          'Staff / Long-term Inquiry',
        'sheet.title':        'How can we help you?',
        'card.class.badge':   'MEMBERSHIP',
        'card.class.name':    'Wellness Class',
        'card.class.desc':    'Monthly pass · External members',
        'card.group.badge':   'FREE · First 5',
        'card.group.name':    'Group Circuit',
        'card.group.desc':    'Mon·Wed 10:00 · Members & Guests',
        'card.pt.badge':      'PERSONAL',
        'card.pt.name':       '1:1 PT Booking',
        'card.pt.desc':       'Personal Training · Members only',
        'card.refresh.badge': 'GUEST · Hotel Guest',
        'card.refresh.name':  'Refresh PT',
        'card.refresh.desc':  '45 min · ₩40,000 · Same-day',
        'grp.title':          'Group Circuit Training',
        'grp.desc':           'Free group class for hotel fitness',
        'grp.apply':          'Book This Week',
        'grp.full':           'Fully Booked',
        'grp.done':           'Booked',
        'rpt.title':          'Refresh PT',
        'rpt.subtitle':       'Personal training for hotel guests',
        'rpt.apply':          'Book Now',
        'apply.step1':        'Details',
        'apply.step2':        'Terms & Sign',
        'apply.tag.class':    'WELLNESS CLASS',
        'apply.tag.pt':       'PERSONAL TRAINING',
        'apply.tag.refresh':  'REFRESH PT',
        'apply.title.class':  'Wellness Class',
        'apply.title.pt':     'PT Booking',
        'apply.title.refresh':'Refresh PT',
        'form.dong':          'Unit No.',
        'form.hotel.room':    'Room No.',
        'form.name':          'Name',
        'form.phone':         'Phone',
        'form.lesson':        'Service',
        'form.time':          'Preferred Time',
        'form.next':          'Next',
        'form.submit':        'Submit',
        'form.back':          'Back',

        /* ── Group Class modal ── */
        'grp.badge':          'FREE CLASS',
        'grp.subtitle':       'Circuit Training · Led by Manager',
        'grp.info.schedule':  'Schedule',
        'grp.info.schedule.val': 'Every <strong>Mon · Wed</strong> 10:00 – 10:40',
        'grp.info.capacity':  'Capacity',
        'grp.info.capacity.val': '<strong>First 5</strong> (Members & Guests)',
        'grp.info.open':      'Open',
        'grp.info.open.val':  'QR opens Sun 21:00 → Auto-confirmed',
        'grp.info.equip':     'Equipment',
        'grp.info.equip.val': 'Kettlebell · Bulgarian Bag · Small Tools',
        'grp.info.price':     'Price',
        'grp.info.price.val': 'Free',
        'grp.desc.body':      'Full-body circuit class led by our trainer.<br>Enjoy <strong>8 free group PT sessions per month</strong> with membership.',
        'grp.quota.label':    'This Week\'s Bookings',
        'grp.quota.loading':  'Loading…',
        'grp.notice':         'Confirmation will be sent via SMS.<br>2 no-shows restrict same-month bookings.',

        /* ── Refresh PT modal ── */
        'rpt.badge':          'GUEST ONLY',
        'rpt.sub':            'Wellness Recovery for Travelers',
        'rpt.info.duration':  'Duration',
        'rpt.info.duration.val': '<strong>45 min</strong>',
        'rpt.info.price':     'Price',
        'rpt.info.price.val': '<strong>₩40,000</strong> / session',
        'rpt.info.time':      'Available',
        'rpt.info.time.val':  '10:00 – 16:00 <small>(dead-time slots)</small>',
        'rpt.info.target':    'For',
        'rpt.info.target.val':'Ramada Hotel <strong>guests only</strong>',
        'rpt.info.pay':       'Payment',
        'rpt.info.pay.val':   'Room charge or on-site',
        'rpt.step1.title':    'Pre-assessment',
        'rpt.step1.desc':     'Pain areas · Goals · Lifestyle',
        'rpt.step2.title':    'Movement Analysis',
        'rpt.step2.desc':     'Squat/lunge screening · Joint ROM',
        'rpt.step3.title':    'Myofascial Release + Exercise Rx',
        'rpt.step3.desc':     'Neck/shoulder/lumbar care · Self-exercise guide',
        'rpt.cta':            'Book Same-Day',
        'rpt.notice':         'Visit 1F Fitness after booking.<br>Room number verification required.',

        /* ── Form labels ── */
        'form.step1.header':  'Fitness Registration',
        'form.legend.guest':  'Guest Information',
        'form.legend.service':'Select Service',
        'form.room.label':    'Room No.',
        'form.room.placeholder': 'e.g. 1204',
        'form.room.hint':     'Enter your current room number',
        'form.consent.detail':'Items: Room No., Name, Phone &nbsp;|&nbsp; Purpose: Fitness booking &nbsp;|&nbsp; Retention: 30 days after checkout',
        'form.next.label':    'Review Terms',
        'form.step2.header':  'Fitness Usage Agreement',
        'form.summary.room':  'Room No.',
        'form.terms.agree':   'I have read and agree to all terms (①–⑥)',
        'form.refund.agree':  'I have read and agree to the <strong>cancellation & refund policy</strong>',
        'header.sub':         'WELLNESS CONCIERGE SERVICE',

        /* ── Validation alerts ── */
        'alert.room':         'Please enter your room number.',
        'alert.name':         'Please enter your name.',
        'alert.phone':        'Please enter your phone number.',
        'alert.lesson':       'Please select a program.',
        'alert.time':         'Please select a preferred time.',
        'alert.agreement':    'Please agree to the privacy policy.',

        /* ── My Inquiry modal ── */
        'myinq.title':          'My Inquiries',
        'myinq.hint.bold':      'Last 4 digits of your phone number',
        'myinq.hint.body':      ' — enter to view your submitted inquiries and replies. Adding your room number improves accuracy.',
        'myinq.optional':       'optional',
        'myinq.phone.label':    'Phone (last 4)',
        'myinq.phone.placeholder': 'e.g. 5678',
        'myinq.search.btn':     'Search',

        /* ── Contact modal ── */
        'inq.title':            'Guest Inquiry',
        'inq.public.label':     'Post as public inquiry (visible to other guests)',
    },

    ja: {
        'brand.tagline':      '大田ラマダホテル店',
        'lang.btn':           '言語',
        'lobby.caption':      'フィットネス コンシェルジュ',
        'lobby.title':        'アセロジム 大田ラマダへ\nようこそ。',
        'cta.primary.label':  'ウェルネスサービス',
        'cta.primary.title':  'フィットネス申込',
        'cta.primary.desc':   'クラス · PT · グループ · リフレッシュPT',
        'cta.pt.label':       'パーソナル',
        'cta.pt.title':       'PT予約',
        'cta.pt.desc':        '1対1 パーソナルトレーニング',
        'cta.booking.label':  '予約確認',
        'cta.booking.title':  '予約確認・変更',
        'cta.booking.desc':   '確認 · キャンセル · 変更',
        'more.label':         'その他のサービス',
        'sub.mybook':         'お問い合わせ履歴',
        'sub.timetable':      'タイムテーブル',
        'sub.program':        'プログラム案内',
        'sub.trainer':        'トレーナー紹介',
        'sub.notice':         'お知らせ',
        'sub.contact':        'お問い合わせ',
        'sub.manage':         '申込履歴の確認・変更',
        'sub.cancel':         '退会申請',
        'sub.staff':          'スタッフ・長期利用のお問い合わせ',
        'sheet.title':        'ご用件をお聞かせください',
        'card.class.badge':   '会員制',
        'card.class.name':    'ウェルネスクラス登録',
        'card.class.desc':    '月額会員 · 外部会員対象',
        'card.group.badge':   '無料 · 先着5名',
        'card.group.name':    'グループサーキット',
        'card.group.desc':    '毎週月・水 10:00 · 会員＋宿泊客',
        'card.pt.badge':      'パーソナル',
        'card.pt.name':       '1対1 PT予約',
        'card.pt.desc':       'パーソナルトレーニング · 会員限定',
        'card.refresh.badge': 'ゲスト · 宿泊客',
        'card.refresh.name':  'リフレッシュPT',
        'card.refresh.desc':  '45分 · 40,000ウォン · 当日予約',
        'grp.title':          'グループサーキット',
        'grp.desc':           'フィットネス無料グループクラス',
        'grp.apply':          '今週申し込む',
        'grp.full':           '今週満員',
        'grp.done':           '申込済み',
        'rpt.title':          'リフレッシュPT',
        'rpt.subtitle':       '宿泊客専用パーソナルトレーニング',
        'rpt.apply':          '申し込む',
        'apply.step1':        '申込情報',
        'apply.step2':        '約款・署名',
        'apply.tag.class':    'ウェルネスクラス',
        'apply.tag.pt':       'パーソナルトレーニング',
        'apply.tag.refresh':  'リフレッシュPT',
        'apply.title.class':  'クラス登録',
        'apply.title.pt':     'PT予約',
        'apply.title.refresh':'リフレッシュPT申込',
        'form.dong':          '部屋番号',
        'form.hotel.room':    '客室番号',
        'form.name':          '氏名',
        'form.phone':         '電話番号',
        'form.lesson':        'サービス種別',
        'form.time':          '希望時間帯',
        'form.next':          '次へ',
        'form.submit':        '申込完了',
        'form.back':          '戻る',

        /* ── グループクラス モーダル詳細 ── */
        'grp.badge':          'FREE CLASS',
        'grp.subtitle':       'サーキットトレーニング · マネージャー直接指導',
        'grp.info.schedule':  '日程',
        'grp.info.schedule.val': '毎週 <strong>月 · 水</strong> 10:00 – 10:40',
        'grp.info.capacity':  '定員',
        'grp.info.capacity.val': '<strong>先着5名</strong> (会員＋宿泊客)',
        'grp.info.open':      '申込',
        'grp.info.open.val':  '毎週日曜21:00 QRオープン → 自動確定',
        'grp.info.equip':     '器具',
        'grp.info.equip.val': 'ケトルベル · ブルガリアンバッグ · 小道具',
        'grp.info.price':     '料金',
        'grp.info.price.val': '無料',
        'grp.desc.body':      'マネージャーが直接指導する全身サーキット運動クラスです。<br>会員証だけで <strong>月8回無料グループPT</strong> の効果をお楽しみいただけます。',
        'grp.quota.label':    '今週の申込状況',
        'grp.quota.loading':  '確認中…',
        'grp.notice':         '申込確定時にSMS・通知でご案内します。<br>無断欠席2回累積で当月の申込が制限されます。',

        /* ── リフレッシュPT モーダル詳細 ── */
        'rpt.badge':          'GUEST ONLY',
        'rpt.sub':            '出張・旅行疲れ回復ウェルネスケア',
        'rpt.info.duration':  '所要時間',
        'rpt.info.duration.val': '<strong>45分</strong>',
        'rpt.info.price':     '料金',
        'rpt.info.price.val': '<strong>40,000ウォン</strong> / 1回',
        'rpt.info.time':      '利用時間',
        'rpt.info.time.val':  '10:00 – 16:00 <small>(デッドタイムスロット)</small>',
        'rpt.info.target':    '対象',
        'rpt.info.target.val':'ラマダホテル <strong>宿泊客本人</strong>',
        'rpt.info.pay':       '支払',
        'rpt.info.pay.val':   'ルームチャージまたは現地払い',
        'rpt.step1.title':    '事前アンケート',
        'rpt.step1.desc':     '出張での痛み部位 · 運動目的 · 食習慣',
        'rpt.step2.title':    '体型・動作分析',
        'rpt.step2.desc':     'スクワット・ランジ評価 · 関節可動域',
        'rpt.step3.title':    '筋膜リリース＋セルフ運動処方',
        'rpt.step3.desc':     '首・肩・腰椎ケア · セルフ運動ルーティン案内',
        'rpt.cta':            '当日予約する',
        'rpt.notice':         '予約後、1階フィットネスセンターにお越しください。<br>客室番号の確認が必要です。',

        /* ── フォームラベル ── */
        'form.step1.header':  'フィットネス利用申込',
        'form.legend.guest':  '宿泊客情報',
        'form.legend.service':'利用サービス選択',
        'form.room.label':    '客室番号',
        'form.room.placeholder': '例: 1204',
        'form.room.hint':     'ご宿泊中の客室番号を入力してください',
        'form.consent.detail':'収集項目: 客室番号・氏名・電話番号 &nbsp;|&nbsp; 目的: フィットネス申込処理 &nbsp;|&nbsp; 保有期間: チェックアウト後30日',
        'form.next.label':    '利用規約確認',
        'form.step2.header':  'フィットネス利用同意書',
        'form.summary.room':  '客室番号',
        'form.terms.agree':   '上記利用規約全項目 (①〜⑥) を読み、同意します',
        'form.refund.agree':  '上記 <strong>キャンセル・返金ポリシー</strong> を読み、同意します',
        'header.sub':         'WELLNESS CONCIERGE SERVICE',

        /* ── バリデーション alert ── */
        'alert.room':         '客室番号を入力してください。',
        'alert.name':         '氏名を入力してください。',
        'alert.phone':        '電話番号を入力してください。',
        'alert.lesson':       'プログラムを選択してください。',
        'alert.time':         '希望時間帯を選択してください。',
        'alert.agreement':    '個人情報の収集・利用に同意してください。',

        /* ── 問い合わせ照会モーダル ── */
        'myinq.title':          'お問い合わせ照会',
        'myinq.hint.bold':      '電話番号下4桁',
        'myinq.hint.body':      'を入力すると、登録したお問い合わせと回答を確認できます。客室番号も入力するとより正確に照会できます。',
        'myinq.optional':       '任意',
        'myinq.phone.label':    '電話下4桁',
        'myinq.phone.placeholder': '例: 5678',
        'myinq.search.btn':     '照会する',

        /* ── お問い合わせモーダル ── */
        'inq.title':            '宿泊客お問い合わせ',
        'inq.public.label':     '公開お問い合わせとして登録 (他の宿泊客が閲覧できます)',
    },

    zh: {
        'brand.tagline':      '大田乐天希尔顿酒店店',
        'lang.btn':           '语言',
        'lobby.caption':      '健身管家服务',
        'lobby.title':        '欢迎光临\n阿塞罗健身 大田拉马达店。',
        'cta.primary.label':  '健康服务',
        'cta.primary.title':  '健身预约',
        'cta.primary.desc':   '健身课程 · PT · 团课 · 刷新PT',
        'cta.pt.label':       '私教',
        'cta.pt.title':       'PT预约',
        'cta.pt.desc':        '1对1私人训练',
        'cta.booking.label':  '预约管理',
        'cta.booking.title':  '预约查询·修改',
        'cta.booking.desc':   '查询 · 取消 · 修改',
        'more.label':         '更多服务',
        'sub.mybook':         '咨询记录',
        'sub.timetable':      '课程表',
        'sub.program':        '项目介绍',
        'sub.trainer':        '教练介绍',
        'sub.notice':         '公告',
        'sub.contact':        '联系我们',
        'sub.manage':         '预约记录查询·修改',
        'sub.cancel':         '退会申请',
        'sub.staff':          '员工/长期使用咨询',
        'sheet.title':        '请问有什么可以帮您？',
        'card.class.badge':   '会员制',
        'card.class.name':    '健身课程登记',
        'card.class.desc':    '月卡 · 外部会员专享',
        'card.group.badge':   '免费 · 限前5名',
        'card.group.name':    '团体循环训练',
        'card.group.desc':    '每周一·三 10:00 · 会员+住客',
        'card.pt.badge':      '私教',
        'card.pt.name':       '1对1 PT预约',
        'card.pt.desc':       '私人训练 · 仅限会员',
        'card.refresh.badge': '住客专属',
        'card.refresh.name':  '刷新PT',
        'card.refresh.desc':  '45分钟 · 40,000韩元 · 当日预约',
        'grp.title':          '团体循环训练',
        'grp.desc':           '酒店健身房免费团课',
        'grp.apply':          '本周预约',
        'grp.full':           '本周已满',
        'grp.done':           '已预约',
        'rpt.title':          '刷新PT',
        'rpt.subtitle':       '住客专属私人训练',
        'rpt.apply':          '立即预约',
        'apply.step1':        '申请信息',
        'apply.step2':        '条款·签名',
        'apply.tag.class':    '健身课程',
        'apply.tag.pt':       '私人训练',
        'apply.tag.refresh':  '刷新PT',
        'apply.title.class':  '课程登记',
        'apply.title.pt':     'PT预约',
        'apply.title.refresh':'刷新PT申请',
        'form.dong':          '房间号',
        'form.hotel.room':    '客房号码',
        'form.name':          '姓名',
        'form.phone':         '联系方式',
        'form.lesson':        '服务类别',
        'form.time':          '希望时段',
        'form.next':          '下一步',
        'form.submit':        '提交申请',
        'form.back':          '返回',

        /* ── 团体课程 弹窗详情 ── */
        'grp.badge':          'FREE CLASS',
        'grp.subtitle':       '循环训练 · 由管理员亲自带领',
        'grp.info.schedule':  '时间',
        'grp.info.schedule.val': '每周 <strong>周一 · 周三</strong> 10:00 – 10:40',
        'grp.info.capacity':  '名额',
        'grp.info.capacity.val': '<strong>限前5名</strong> (会员＋住客)',
        'grp.info.open':      '报名',
        'grp.info.open.val':  '每周日21:00 QR码开放 → 自动确认',
        'grp.info.equip':     '器材',
        'grp.info.equip.val': '壶铃 · 保加利亚袋 · 小器械',
        'grp.info.price':     '费用',
        'grp.info.price.val': '免费',
        'grp.desc.body':      '由管理员亲自指导的全身循环运动课程。<br>凭会员卡即可享受 <strong>每月8次免费团体PT</strong> 效果。',
        'grp.quota.label':    '本周报名情况',
        'grp.quota.loading':  '查询中…',
        'grp.notice':         '确认报名后将通过短信·通知告知。<br>累计2次无故缺席将限制当月报名。',

        /* ── 刷新PT 弹窗详情 ── */
        'rpt.badge':          'GUEST ONLY',
        'rpt.sub':            '商务出行·旅行疲劳恢复健康护理',
        'rpt.info.duration':  '时长',
        'rpt.info.duration.val': '<strong>45分钟</strong>',
        'rpt.info.price':     '费用',
        'rpt.info.price.val': '<strong>40,000韩元</strong> / 次',
        'rpt.info.time':      '可用时间',
        'rpt.info.time.val':  '10:00 – 16:00 <small>(空闲时段)</small>',
        'rpt.info.target':    '对象',
        'rpt.info.target.val':'拉马达酒店 <strong>住客本人</strong>',
        'rpt.info.pay':       '结算',
        'rpt.info.pay.val':   '房间结账或现场付款',
        'rpt.step1.title':    '预约问卷',
        'rpt.step1.desc':     '出行疼痛部位 · 运动目的 · 饮食习惯',
        'rpt.step2.title':    '体态·动作分析',
        'rpt.step2.desc':     '深蹲·弓步评估 · 关节活动范围',
        'rpt.step3.title':    '筋膜放松＋自我运动处方',
        'rpt.step3.desc':     '颈部·肩部·腰椎护理 · 自我运动方案指导',
        'rpt.cta':            '当日预约',
        'rpt.notice':         '预约后请前往1楼健身中心。<br>需要核实客房号码。',

        /* ── 表单标签 ── */
        'form.step1.header':  '健身使用申请',
        'form.legend.guest':  '住客信息',
        'form.legend.service':'选择使用服务',
        'form.room.label':    '客房号码',
        'form.room.placeholder': '例: 1204',
        'form.room.hint':     '请输入您入住的客房号码',
        'form.consent.detail':'收集项目: 客房号·姓名·电话 &nbsp;|&nbsp; 目的: 健身申请处理 &nbsp;|&nbsp; 保存期限: 退房后30天',
        'form.next.label':    '确认使用条款',
        'form.step2.header':  '健身使用同意书',
        'form.summary.room':  '客房号码',
        'form.terms.agree':   '本人已阅读并同意上述全部条款 (①–⑥)',
        'form.refund.agree':  '本人已阅读并同意上述 <strong>取消及退款政策</strong>',
        'header.sub':         'WELLNESS CONCIERGE SERVICE',

        /* ── 验证 alert ── */
        'alert.room':         '请输入客房号码。',
        'alert.name':         '请输入姓名。',
        'alert.phone':        '请输入联系方式。',
        'alert.lesson':       '请选择项目。',
        'alert.time':         '请选择希望时段。',
        'alert.agreement':    '请同意个人信息收集及使用。',

        /* ── 我的咨询查询弹窗 ── */
        'myinq.title':          '我的咨询查询',
        'myinq.hint.bold':      '手机号后4位',
        'myinq.hint.body':      '输入后可查看已提交的咨询及回复。同时填写客房号码可提高查询准确性。',
        'myinq.optional':       '选填',
        'myinq.phone.label':    '手机后4位',
        'myinq.phone.placeholder': '例: 5678',
        'myinq.search.btn':     '查询',

        /* ── 咨询弹窗 ── */
        'inq.title':            '住客咨询',
        'inq.public.label':     '公开发布 (其他住客可查看)',
    },
};

/** 현재 활성 언어 (호텔 모드 전용) */
let _hotelLang = localStorage.getItem('hotelLang') || 'ko';

/**
 * 언어 전환 (호텔 모드 전용)
 * @param {string} lang  'ko' | 'en' | 'ja' | 'zh'
 */
function setHotelLang(lang) {
    if (!_hotelI18n[lang]) return;
    _hotelLang = lang;
    try { localStorage.setItem('hotelLang', lang); } catch(_) {}
    _applyHotelI18n();
    _updateLangSwitcher(lang);
}

/**
 * 현재 언어 사전에서 키에 해당하는 값 반환 (호텔 모드 전용 헬퍼)
 * @param {string} key  사전 키
 * @returns {string}    번역 문자열 (없으면 빈 문자열)
 */
function _i18n(key) {
    const dict = _hotelI18n[_hotelLang] || _hotelI18n.ko;
    return dict[key] !== undefined ? dict[key] : '';
}

/** data-i18n 속성으로 텍스트 일괄 교체 (호텔 모드 전용) */
function _applyHotelI18n() {
    /* 방어 가드: 호텔 모드가 아닌 경우 절대 실행하지 않음 */
    if (!complexContext?.isHotel?.()) return;

    const dict = _hotelI18n[_hotelLang] || _hotelI18n.ko;

    /* textContent 교체 (HTML 마크업 포함 키는 innerHTML로) */
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const val = dict[key];
        if (val === undefined) return;
        /* HTML 태그 포함 여부로 innerHTML / textContent 선택 */
        if (/<[a-z]/i.test(val)) {
            el.innerHTML = val;
        } else {
            el.textContent = val;
        }
    });

    /* placeholder 교체 */
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        const key = el.getAttribute('data-i18n-ph');
        const val = dict[key];
        if (val !== undefined) el.placeholder = val;
    });

    /* lobby-title은 \n → <br> */
    const lobbyTitleEl = document.getElementById('hotelCtaIntro');
    if (lobbyTitleEl && dict['lobby.title']) {
        lobbyTitleEl.innerHTML = dict['lobby.title'].replace(/\n/g, '<br>');
    }

    /* html[lang] 속성 동기화 */
    const langMap = { ko:'ko', en:'en', ja:'ja', zh:'zh-Hans' };
    document.documentElement.lang = langMap[_hotelLang] || 'ko';

    /* 폼 커스터마이징 재적용 (언어 전환 시 폼 레이블도 갱신) */
    if (typeof _hotelCustomizeForm === 'function') {
        _hotelCustomizeForm();
    }
    /* 공유 모달 커스터마이징 재적용 (언어 전환 시 모달 레이블도 갱신) */
    if (typeof _hotelCustomizeModals === 'function') {
        /* dataset.hotelPatched 초기화 → 다음 호출 시 다국어 레이블 재삽입 */
        ['myInquiryModal','inquiryModal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) delete el.dataset.hotelPatched;
        });
        _hotelCustomizeModals();
    }
}

/** 언어 선택 버튼 active 상태 업데이트 */
function _updateLangSwitcher(lang) {
    document.querySelectorAll('.hotel-lang-btn').forEach(btn => {
        const l = btn.getAttribute('data-lang');
        btn.classList.toggle('is-active', l === lang);
        btn.setAttribute('aria-pressed', l === lang ? 'true' : 'false');
    });
}

/**
 * 호텔 모드 언어 초기화 — initHotelMode()에서 호출
 */
function initHotelI18n() {
    _hotelLang = localStorage.getItem('hotelLang') || 'ko';
    _applyHotelI18n();
    _updateLangSwitcher(_hotelLang);
}
