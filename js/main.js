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

    // 2. 문의하기 퀵액션 표시 여부 적용 (show_inquiry 설정)
    applyInquiryVisibility();
    
    // 3. 나머지 초기화
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
                alert(`❌ 선택하신 시간대는 정원이 마감되었습니다.\n\n프로그램: ${lessonType}\n시간대: ${preferredTime}\n현재 인원: ${currentCount}/${maxCapacity}명\n\n다른 시간대를 선택해주세요.`);
                return;
            }
        }
    }
    
    // Collect form data
    formData = {
        dong: document.getElementById('dong').value.trim(),
        ho: document.getElementById('ho').value.trim(),
        name: document.getElementById('name').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        lesson_type: lessonType,
        program_id: selectedOption ? (selectedOption.dataset.programId || null) : null,
        preferred_time: preferredTime,
        agreement: document.getElementById('agreement').checked
    };
    
    // Validation
    if (!formData.agreement) {
        alert('개인정보 수집 및 이용에 동의해주세요.');
        return;
    }
    
    // Validate all required fields
    const requiredFields = ['dong', 'ho', 'name', 'phone', 'lesson_type', 'preferred_time'];
    for (const field of requiredFields) {
        if (!formData[field]) {
            alert('모든 필수 항목을 입력해주세요.');
            return;
        }
    }

    // ── 동/호수/전화번호 확인 필드 일치 검증 ──────────────────────
    if (!allConfirmFieldsMatch()) return;

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
    document.getElementById('displayDong').textContent  = formData.dong;
    document.getElementById('displayHo').textContent    = formData.ho;
    document.getElementById('displayName').textContent  = formData.name;
    document.getElementById('displayPhone').textContent = formData.phone;
    document.getElementById('displayLesson').textContent = formData.lesson_type;
    document.getElementById('displayTime').textContent  = formData.preferred_time;
    
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
            agreement: contractData.terms_agreement
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
            console.warn('⛔ 정원 마감으로 신청 차단');
            showFullCapacityModal(contractData, result.error);
            return;
        }

        if (response.ok && result.success) {
            console.log('✅ Application submitted:', result);
            contractData.status = result.data?.status || 'approved';
            contractData.waiting_order = result.data?.waiting_order;
            
            // 대기 시스템 폐기: status가 waiting이어도 일반 성공으로 처리
            showSuccessNotificationModal(contractData);
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

// 중복 신청 검사 함수 (같은 카테고리 내에서만 중복 차단)
// 그룹 수업 수강 중이어도 개인/듀엣 레슨은 추가 신청 가능
async function checkDuplicateApplication(contractData) {
    try {
        const complexCode = complexContext.getComplexCode();
        const { dong, ho, name, phone, lesson_type } = contractData;

        console.log(`🔍 중복 검사: ${dong}동 ${ho}호 ${name} (${phone}) → 신청 프로그램: ${lesson_type}`);

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
        console.log('Group lesson programs:', programs.map(p => p.program_name));
        
        // ── 키를 HH:MM 형식으로 통일 (DB preferred_time과 동일한 형식)
        // programTimeSlots = { programName: { 'HH:MM': count, ... } }
        const programTimeSlots = {};

        const DEFAULT_SLOTS = ['09:00','10:00','11:00','12:00','13:00','14:00',
                               '15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

        programs.forEach(program => {
            const availableSlots = program.available_time_slots || [];
            const timeSlotCounts = {};
            const slots = availableSlots.length > 0 ? availableSlots : DEFAULT_SLOTS;
            slots.forEach(t => { timeSlotCounts[t] = 0; });
            const pKey = program.name || program.program_name;
            programTimeSlots[pKey] = timeSlotCounts;
        });

        // ── preferred_time을 HH:MM 정규화 후 카운팅 ──────────────────────
        // 정규화: '저녁 21시' / '21시' / '21:00' → '21:00'
        function normalizeToHHMM(raw) {
            if (!raw) return null;
            // 이미 HH:MM 형식
            if (/^\d{2}:\d{2}$/.test(raw)) return raw;
            // '오전 09시', '저녁 21시' 등 한글 포함
            const m = raw.match(/(\d{1,2})시/);
            if (m) return String(parseInt(m[1])).padStart(2,'0') + ':00';
            return null;
        }

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
        
        console.log('📈 Final counts by program and time:', programTimeSlots);
        
        // Store in global variable for later use
        window.programTimeSlots = programTimeSlots;
        
        // Update time slots based on current selected program
        updateTimeSlotOptions();
        
    } catch (error) {
        console.error('Error loading time slot status:', error);
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
        
        return;
    }
    
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

    availableTimeSlots.forEach(timeCode => {
        // slots 키가 HH:MM 이므로 바로 조회
        const count = (slots && slots[timeCode] != null) ? slots[timeCode] : 0;
        const isFull = count >= maxCapacity;
        const isAlmostFull = !isFull && count >= (maxCapacity - 1);
        const timeDisplay = timeDisplayMap[timeCode] || timeCode;

        let status = '모집중';
        if (isFull) status = '🔴 마감';
        else if (isAlmostFull) status = '⚠️ 마감임박';

        const disabled = isFull ? 'disabled' : '';
        const style   = isFull ? 'style="color:#999"' : '';
        // value는 HH:MM으로 저장 (DB와 일치)
        optionsHTML += `<option value="${timeCode}" ${disabled} ${style}>${timeDisplay} [${count}/${maxCapacity}명] ${status}</option>`;
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
    const dong      = document.getElementById('myInqDong')?.value.trim();
    const ho        = document.getElementById('myInqHo')?.value.trim();
    const phone4    = document.getElementById('myInqPhone4')?.value.trim();
    const resultEl  = document.getElementById('myInquiryResult');

    // 유효성 검사
    let hasError = false;
    if (!dong) {
        document.getElementById('myInqDong').style.borderColor = '#ef4444';
        hasError = true;
    }
    if (!ho) {
        document.getElementById('myInqHo').style.borderColor = '#ef4444';
        hasError = true;
    }
    if (!phone4 || !/^\d{4}$/.test(phone4)) {
        document.getElementById('myInqPhone4').style.borderColor = '#ef4444';
        if (!hasError) {
            resultEl.innerHTML = `<p style="color:#e53e3e;font-size:.85rem;text-align:center;padding:8px 0">
                <i class="fas fa-exclamation-circle"></i> 전화번호 끝 4자리를 숫자로 입력하세요.</p>`;
        }
        hasError = true;
    }
    if (hasError) {
        if (dong && ho && phone4 && !/^\d{4}$/.test(phone4)) {
            // 이미 위에서 처리됨
        } else if (!dong || !ho) {
            resultEl.innerHTML = `<p style="color:#e53e3e;font-size:.85rem;text-align:center;padding:8px 0">
                <i class="fas fa-exclamation-circle"></i> 동·호수·전화번호 끝 4자리를 모두 입력해주세요.</p>`;
        }
        return;
    }

    resultEl.innerHTML = `<div style="text-align:center;padding:16px;color:#9ca3af">
        <i class="fas fa-spinner fa-spin"></i> 조회 중...</div>`;

    try {
        const complexId   = complexContext?.getComplexId?.()   || '';
        const complexCode = complexContext?.getComplexCode?.() || '';
        // 이름 없이 동+호수+전화번호 뒤4자리로 조회
        const params = new URLSearchParams({ dong, ho, phoneLast4: phone4 });
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

    const inquiryData = {
        complex_id: complexContext.getComplexId(),
        dong: document.getElementById('inquiryDong').value,
        ho: document.getElementById('inquiryHo').value,
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
    
    content.innerHTML = `
        <p><strong>프로그램:</strong> ${contractData.lesson_type}</p>
        <p><strong>희망 시간:</strong> ${contractData.preferred_time}</p>
        <p><strong>상태:</strong> 승인 완료</p>
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
   - 반환: { isOpen, periodLabel, cancelPeriodLabel }
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
                // is_open은 서버에서 global 설정 포함해 정확히 계산된 값
                const isOpen = newSetting ? newSetting.is_open : (jsonP.data?.is_open ?? autoIsOpen);
                return {
                    isOpen,
                    periodLabel:       makePeriodLabel(newSetting, globalLabel),
                    cancelPeriodLabel: makePeriodLabel(cancelSetting, globalLabel),
                    globalLabel,
                    newSetting,
                    cancelSetting,
                };
            }
        } catch(_) { /* 폴백 */ }
    }
    return {
        isOpen:            autoIsOpen,
        periodLabel:       DEFAULT_LABEL,
        cancelPeriodLabel: DEFAULT_LABEL,
        globalLabel:       DEFAULT_LABEL,
        newSetting:        null,
        cancelSetting:     null,
    };
}

/* ═══════════════════════════════════════════════════════════════
   계약서 페이지 · 레슨 해지 모달 내 하드코딩 기간 텍스트 동적 업데이트
   ─ 서버 apply-settings + apply-period 기반으로 실시간 반영
   ═══════════════════════════════════════════════════════════════ */
async function _updateContractPeriodLabels() {
    const { periodLabel, cancelPeriodLabel, globalLabel, newSetting, cancelSetting } = await _getManagePeriodSetting();

    // 계약서 상단 "신청·해지 기간 필수 안내" 섹션
    // 등록 접수 기간
    const newPeriodEl = document.getElementById('contractNewPeriodDate');
    if (newPeriodEl) newPeriodEl.innerHTML = `매월 <strong>${periodLabel}</strong>`;

    // 해지 신청 기간
    const cancelPeriodEl = document.getElementById('contractCancelPeriodDate');
    if (cancelPeriodEl) cancelPeriodEl.innerHTML = `매월 <strong>${cancelPeriodLabel}</strong>`;

    // 자동 재등록 안내 텍스트 내 기간
    const autoRenewEl = document.getElementById('contractAutoRenewPeriod');
    if (autoRenewEl) autoRenewEl.textContent = cancelPeriodLabel;

    // 해지 및 환불 규정 → "해지 신청 기간" (strong#policyHaejiPeriod1)
    const p1 = document.getElementById('policyHaejiPeriod1');
    if (p1) p1.textContent = cancelPeriodLabel;

    // 이용약관 ② 환불 규정 내 (span#policyHaejiPeriod2)
    const p2 = document.getElementById('policyHaejiPeriod2');
    if (p2) p2.textContent = cancelPeriodLabel;

    // 이용약관 ⑧ 자동 연장 및 해지 신청 (strong#policyHaejiPeriod3)
    const p3 = document.getElementById('policyHaejiPeriod3');
    if (p3) p3.textContent = cancelPeriodLabel;
}

/* ═══════════════════════════════════════════════════════════════
   내 신청 취소·변경 탭바 초기화 (페이지 로드 시)
   ─ 서버 apply-settings 기반으로 탭바/배지/헤더 버튼 활성화
   ═══════════════════════════════════════════════════════════════ */
async function initManageTabBar() {
    // 서버 설정 기반 기간 조회 (비동기)
    const { isOpen } = await _getManagePeriodSetting();

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
    const { isOpen, periodLabel } = await _getManagePeriodSetting();
    if (banner) {
        banner.innerHTML = isOpen
            ? `<div style="background:#dcfce7;border:1px solid #22c55e;border-radius:8px;
                           padding:10px 13px;font-size:.82rem;color:#166534;margin-bottom:8px">
                   <i class="fas fa-calendar-check"></i>
                   <strong> 신청 취소·변경 가능 기간입니다 (${periodLabel})</strong>
               </div>`
            : `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;
                           padding:10px 13px;font-size:.82rem;color:#92400e;margin-bottom:8px">
                   <i class="fas fa-clock"></i>
                   <strong> 신청 취소·변경은 ${periodLabel}에만 가능합니다</strong><br>
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

        // 서버 설정 기반으로 기간 조회
        const { isOpen, periodLabel, cancelPeriodLabel } = await _getManagePeriodSetting();

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
                    const changeBtnStyle = !isWaiting
                        ? (hasAvailSlots
                            ? 'padding:8px;background:#eff6ff;border:1.5px solid #3b82f6;color:#1d4ed8;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer'
                            : 'padding:8px;background:#f3f4f6;border:1.5px solid #d1d5db;color:#9ca3af;border-radius:8px;font-size:.8rem;font-weight:600;cursor:not-allowed;opacity:.7')
                        : '';
                    const changeBtnLabel = !isWaiting
                        ? (slotInfo
                            ? (hasAvailSlots
                                ? `<i class="fas fa-exchange-alt"></i> 변경 <span style="font-size:.72rem;background:#3b82f6;color:#fff;padding:1px 5px;border-radius:8px;margin-left:2px">${slotInfo.availableCount}석</span>`
                                : '<i class="fas fa-ban"></i> 변경불가 <span style="font-size:.72rem">모두 마감</span>')
                            : '<i class="fas fa-exchange-alt"></i> 요일·시간 변경')
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
                        </div>` : `
                        <div style="text-align:center;font-size:.78rem;color:#9ca3af;padding:4px 0">
                            <i class="fas fa-lock"></i> 신청 철회·변경은 ${periodLabel}에 가능합니다<br>
                            <span style="font-size:.72rem;color:#c0c0c0">※ 익월 해지신청은 <strong>해지 신청 탭</strong>을 통하여 ${cancelPeriodLabel} 해지 신청 기간에 접수하세요</span>
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

// Display notices
function displayNotices(notices) {
    const section = document.getElementById('noticesSection');
    const container = document.getElementById('noticesContainer');
    
    if (notices.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    container.innerHTML = notices.map(notice => {
        const category = notice.category || (notice.is_pinned ? '중요' : '일반');
        const categoryClass = category === '중요' ? 'important' : 
                             category === '이벤트' ? 'event' : 'general';
        
        return `
            <div class="notice-item ${categoryClass}">
                <div class="notice-header">
                    <div class="notice-title">
                        ${notice.is_pinned ? '<i class="fas fa-exclamation-circle"></i>' : 
                          '<i class="fas fa-info-circle"></i>'}
                        ${escapeHtml(notice.title || '')}
                    </div>
                    <span class="notice-category ${categoryClass.toLowerCase()}">
                        ${escapeHtml(category)}
                    </span>
                </div>
                <div class="notice-content">
                    ${escapeHtml(notice.content || '').replace(/\n/g, '<br>')}
                </div>
                ${notice.image_url ? `
                <div class="notice-image">
                    <img src="${notice.image_url}" alt="공지 이미지"
                         onclick="notices_openImageModal('${notice.image_url}')"
                         style="max-width:100%;border-radius:8px;cursor:pointer;margin-top:8px">
                </div>` : ''}
                <div class="notice-date">
                    <i class="fas fa-calendar"></i> ${kstDateStr(notice.created_at)}
                </div>
            </div>
        `;
    }).join('');
}

// 공지 이미지 클릭 시 전체화면 뷰어 (index.html imageModal 재사용)
function notices_openImageModal(url) {
    const modal = document.getElementById('imageModal');
    if (!modal) return;
    const img = document.getElementById('modalImage');
    if (img) img.src = url;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
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
        // apply-settings new.is_open 기반으로 판단 (is_active / schedule_mode 무관)
        // is_open=true  → 신청 가능 기간 → 선택 가능 (곧 오픈 예정 X)
        // is_open=false → 신청 불가 기간 → 모든 프로그램 '곧 오픈 예정'
        // is_open=null  → API 조회 실패  → is_active 폴백 (기존 동작 유지)
        let showAsComingSoon;
        if (newApplyIsOpen === null) {
            // apply-settings 조회 실패: is_active 폴백
            showAsComingSoon = !isActive;
        } else {
            // is_open이 true면 신청 가능 → 차단 안 함
            // is_open이 false면 신청 불가 → 모든 프로그램 차단
            showAsComingSoon = !newApplyIsOpen;
        }

        // Check if it's 1:1 or 2:1 lesson
        const isPersonalLesson = pName.includes('1:1') || pName.includes('2:1');

        // Build display text
        let displayText = pName;
        if (program.days) {
            displayText += ` (${program.days})`;
        }
        if (program.price) {
            displayText += ` - ${formatPrice(program.price)}원/월`;
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
        option.dataset.isPersonalLesson = isPersonalLesson;
        option.dataset.availableTimeSlots = JSON.stringify(program.time_slots || program.available_time_slots || []);
        option.dataset.isActive = isActive;

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
    
    // Populate month select (current month and future 2 months)
    const now = new Date();
    const select = document.getElementById('curriculumMonthSelect');
    select.innerHTML = '<option value="">선택하세요</option>';
    
    for (let i = -1; i <= 2; i++) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1;
        
        const option = document.createElement('option');
        option.value = `${year}-${month}`;
        option.textContent = `${year}년 ${month}월`;
        
        if (i === 0) {
            option.selected = true;
        }
        
        select.appendChild(option);
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
        const complexId = complexContext.getComplexCode(); // ✅ UUID 대신 complex_code 사용
        
        console.log(`📅 Loading curriculum for ${year}-${month}, complex: ${complexId}`);
        
        // /api/curricula 엔드포인트로 조회
        const currParams = new URLSearchParams({ complexCode: complexId, limit: 100 });
        const response = await fetch(`/api/curricula?${currParams}`);
        const result = await response.json();
        const curriculums = result.data || [];
        
        console.log(`✅ Fetched ${curriculums.length} total curriculums`);
        
        // Filter by year, month, and active status
        const targetCurriculum = curriculums.find(c => {
            return c.year === parseInt(year) &&
                c.month === parseInt(month) &&
                c.is_active;
        });
        
        console.log('🎯 Target curriculum found:', targetCurriculum);
        
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
                ${targetCurriculum.description ? `
                    <div style="color: #4a5568; line-height: 1.8;">
                        ${targetCurriculum.description.replace(/\n/g, '<br>')}
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
