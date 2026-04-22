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
let adminClickCount = 0;
let adminClickTimer = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Initializing application...');
    
    // 1. 먼저 단지 컨텍스트 로드
    await initializeComplexContext();
    console.log('✅ Complex context initialized');
    
    // 2. 나머지 초기화
    setupEventListeners();
    setMinDate();
    setSignatureDate();
    loadPrograms(); // 프로그램 동적 로드
    loadTimeSlotStatus();
    loadPublicInquiries();
    loadNotices();
    setupAdminTrigger();
    renderPeriodBanner();   // 접수·해지 기간 배너
    initManageTabBar();     // 내 신청 취소·변경 탭바 초기화
    
    console.log('✅ Application ready');
});

// Setup Event Listeners
function setupEventListeners() {
    const form = document.getElementById('contractForm');
    form.addEventListener('submit', handlePage1Submit);
    
    // Phone number formatting
    const phoneInput = document.getElementById('phone');
    phoneInput.addEventListener('input', formatPhoneNumber);
    
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

// Format phone number
function formatPhoneNumber(e) {
    let value = e.target.value.replace(/[^0-9]/g, '');
    
    if (value.length <= 3) {
        e.target.value = value;
    } else if (value.length <= 7) {
        e.target.value = value.slice(0, 3) + '-' + value.slice(3);
    } else {
        e.target.value = value.slice(0, 3) + '-' + value.slice(3, 7) + '-' + value.slice(7, 11);
    }
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
    const noshowAgreement  = document.getElementById('noshowAgreement')?.checked;
    const termsAgreement   = document.getElementById('termsAgreement').checked;
    const signatureName    = document.getElementById('signatureName').value.trim();
    const signatureDate    = document.getElementById('signatureDate').value;
    
    // Validation
    if (!refundAgreement) {
        alert('환불 규정에 동의해주세요.');
        document.getElementById('refundAgreement')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    if (!noshowAgreement) {
        alert('노쇼(No-Show) 규정에 동의해주세요.');
        document.getElementById('noshowAgreement')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

        if (response.ok && result.success) {
            console.log('✅ Application submitted:', result);
            contractData.status = result.data?.status || 'approved';
            contractData.waiting_order = result.data?.waiting_order;
            
            if (contractData.status === 'waiting') {
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

// 중복 신청 검사 함수 (동+호+이름+전화번호 모두 일치 시 중복)
async function checkDuplicateApplication(contractData) {
    try {
        const complexCode = complexContext.getComplexCode();
        const { dong, ho, name, phone } = contractData;

        console.log(`🔍 중복 검사: ${dong}동 ${ho}호 ${name} (${phone})`);

        // 동+호+이름+전화번호 모두 일치하는 승인/대기 신청 조회
        const params = new URLSearchParams({ complexCode, dong, ho, limit: 100 });
        const response = await fetch(`/api/applications?${params}`);
        const result = await response.json();
        const contracts = result.data || [];

        const duplicates = contracts.filter(c =>
            c.name  === name  &&
            c.phone === phone &&
            (c.status === 'approved' || c.status === 'waiting')
        );

        if (duplicates.length > 0) {
            console.log(`⚠️ 중복 발견: ${duplicates.length}건`);
            return { isDuplicate: true, existing: duplicates[0] };
        }

        console.log('✅ 중복 없음');
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
    // 입력 초기화
    ['myInqDong','myInqHo','myInqName','myInqPhone4'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('myInquiryResult').innerHTML = '';
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    modal.scrollTop = 0;
}

function closeMyInquiryModal() {
    const modal = document.getElementById('myInquiryModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

async function searchMyInquiries() {
    const dong      = document.getElementById('myInqDong')?.value.trim();
    const ho        = document.getElementById('myInqHo')?.value.trim();
    const name      = document.getElementById('myInqName')?.value.trim();
    const phone4    = document.getElementById('myInqPhone4')?.value.trim();
    const resultEl  = document.getElementById('myInquiryResult');

    if (!dong || !ho || !name || !phone4) {
        resultEl.innerHTML = `<p style="color:#e53e3e;font-size:.85rem;text-align:center;padding:8px 0">
            <i class="fas fa-exclamation-circle"></i> 모든 항목을 입력해주세요.</p>`;
        return;
    }
    if (!/^\d{4}$/.test(phone4)) {
        resultEl.innerHTML = `<p style="color:#e53e3e;font-size:.85rem;text-align:center;padding:8px 0">
            <i class="fas fa-exclamation-circle"></i> 전화번호 끝 4자리를 숫자로 입력하세요.</p>`;
        return;
    }

    resultEl.innerHTML = `<div style="text-align:center;padding:16px;color:#9ca3af">
        <i class="fas fa-spinner fa-spin"></i> 조회 중...</div>`;

    try {
        const complexId   = complexContext?.getComplexId?.()   || '';
        const complexCode = complexContext?.getComplexCode?.() || '';
        const params = new URLSearchParams({ dong, ho, name, phoneLast4: phone4 });
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
    
    const inquiryData = {
        complex_id: complexContext.getComplexId(),
        dong: document.getElementById('inquiryDong').value,
        ho: document.getElementById('inquiryHo').value,
        name: document.getElementById('inquiryName').value,
        phone: document.getElementById('inquiryPhone').value,
        title: document.getElementById('inquiryTitle').value,
        content: document.getElementById('inquiryContent').value,
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
    const na = document.getElementById('noshowAgreement'); if (na) na.checked = false;
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
                ${inq.reply ? `
                    <div class="inquiry-reply">
                        <strong><i class="fas fa-reply"></i> 답변</strong>
                        ${escapeHtml(inq.reply)}
                        ${inq.reply_date ? `<div style="margin-top: 8px; font-size: 12px; color: #718096;">${kstDateStr(inq.reply_date)}</div>` : ''}
                    </div>
                ` : '<div style="color: #718096; font-size: 14px; margin-top: 10px;"><i class="fas fa-clock"></i> 답변 대기중</div>'}
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading inquiries:', error);
    }
}

// Setup admin trigger - 5번 빠르게 클릭하면 관리자 페이지로
function setupAdminTrigger() {
    const logoText = document.getElementById('logoText');
    
    console.log('🔧 Admin trigger setup:', logoText ? 'Found' : 'NOT FOUND');
    
    if (!logoText) {
        console.error('❌ logoText element not found!');
        return;
    }
    
    logoText.addEventListener('click', function(e) {
        e.preventDefault();
        adminClickCount++;
        
        console.log(`👆 Click ${adminClickCount}/5`);
        
        // Clear previous timer
        if (adminClickTimer) {
            clearTimeout(adminClickTimer);
        }
        
        // Check if clicked 5 times within 2 seconds
        if (adminClickCount >= 5) {
            console.log('🎉 Trigger activated! Opening password modal...');
            
            // Visual feedback
            logoText.style.color = '#667eea';
            logoText.style.transition = 'color 0.3';
            
            // Show password modal
            setTimeout(() => {
                logoText.style.color = ''; // Reset color
                showAdminPasswordModal();
            }, 300);
            
            adminClickCount = 0;
            return;
        }
        
        // Reset counter after 2 seconds
        adminClickTimer = setTimeout(() => {
            console.log('⏰ Timer reset');
            adminClickCount = 0;
        }, 2000);
    });
    
    // Add visible cursor for testing
    logoText.style.cursor = 'pointer';
    logoText.style.userSelect = 'none';
    
    console.log('✅ Admin trigger ready!');
}

// ===== CANCELLATION FUNCTIONS =====

// Show cancellation form modal (기간 체크 추가)

/* ═══════════════════════════════════════════════════════════════
   내 신청 취소·변경 탭바 초기화 (페이지 로드 시)
   ═══════════════════════════════════════════════════════════════ */
function initManageTabBar() {
    const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const day = nowKst.getUTCDate();
    const isOpen = day >= 20 && day <= 27;

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

    // ② 헤더 버튼 배지 (20~27일 활성화 알림)
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
   내 신청 취소·변경 (매월 20~27일)
   ═══════════════════════════════════════════════════════════════ */
function showMyManageModal() {
    const modal = document.getElementById('myManageModal');
    if (!modal) return;
    // 입력 초기화
    ['manageDong','manageHo','managePhone4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('manageResult').innerHTML = '';

    // 기간 배너 표시
    const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const day = nowKst.getUTCDate();
    const banner = document.getElementById('managePeriodBanner');
    if (banner) {
        const isOpen = day >= 20 && day <= 27;
        banner.innerHTML = isOpen
            ? `<div style="background:#dcfce7;border:1px solid #22c55e;border-radius:8px;
                           padding:10px 13px;font-size:.82rem;color:#166534;margin-bottom:8px">
                   <i class="fas fa-calendar-check"></i>
                   <strong> 신청 취소·변경 가능 기간입니다 (매월 20~27일)</strong>
               </div>`
            : `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;
                           padding:10px 13px;font-size:.82rem;color:#92400e;margin-bottom:8px">
                   <i class="fas fa-clock"></i>
                   <strong> 신청 취소·변경은 매월 20~27일에만 가능합니다</strong><br>
                   <span style="font-size:.78rem">현재는 조회만 가능합니다</span>
               </div>`;
    }

    modal.style.display = 'flex';
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

        const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        const dayKst = nowKst.getUTCDate();
        const isOpen = dayKst >= 20 && dayKst <= 27;

        const fmtTime = t => {
            if (!t) return '-';
            const [h] = t.split(':').map(Number);
            if (isNaN(h)) return t;
            return `${h < 12 ? '오전' : '오후'} ${h === 0 ? 12 : h > 12 ? h - 12 : h}시`;
        };

        // 현재 저장된 조회 정보 (취소/변경 시 재사용)
        window._managePhone4 = phone4;

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
                            <button onclick="openChangeTimeModal('${a.id}','${(a.program_name||'').replace(/'/g,"\\'")}','${a.preferred_time||''}')"
                                    style="padding:8px;background:#eff6ff;border:1.5px solid #3b82f6;
                                           color:#1d4ed8;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer">
                                <i class="fas fa-clock"></i> 시간대 변경
                            </button>` : '<div></div>'}
                            <button onclick="confirmCancelApplication('${a.id}','${(a.program_name||'').replace(/'/g,"\\'")}','${a.status}')"
                                    style="padding:8px;background:#fef2f2;border:1.5px solid #ef4444;
                                           color:#ef4444;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer">
                                <i class="fas fa-times-circle"></i> ${isWaiting ? '대기 취소' : '신청 취소'}
                            </button>
                        </div>` : `
                        <div style="text-align:center;font-size:.78rem;color:#9ca3af;padding:4px 0">
                            <i class="fas fa-lock"></i> 취소·변경은 매월 20~27일에 가능합니다
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
async function confirmCancelApplication(appId, programName, status) {
    const isWaiting = (status === 'waiting');
    const phone4 = window._managePhone4;
    if (!phone4) { alert('먼저 전화번호를 입력하여 조회해 주세요.'); return; }

    const confirmed = confirm(
        `[${programName}] ${isWaiting ? '대기 신청' : '수강 신청'}을 취소하시겠습니까?\n\n` +
        (isWaiting ? '취소하면 대기 순번이 제거됩니다.' : '취소하면 다음 달 수강이 종료됩니다.\n다시 신청하려면 접수 기간(20~27일)에 신청하세요.')
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
function openChangeTimeModal(appId, programName, currentTime) {
    const phone4 = window._managePhone4;
    if (!phone4) { alert('먼저 전화번호를 입력하여 조회해 주세요.'); return; }

    // 해당 프로그램의 시간대 목록 가져오기
    _openChangeTimeModalImpl(appId, programName, currentTime, phone4);
}

async function _openChangeTimeModalImpl(appId, programName, currentTime, phone4) {
    // 시간대 목록: 저장된 앱 데이터에서 program_id를 찾아 programs API로 조회
    let timeSlots = [];
    try {
        const complexCode = complexContext?.getComplexCode?.() || '';
        // 저장된 앱 목록에서 program_id 찾기
        const appData = (window._manageAppList || []).find(a => a.id === appId);
        const programId = appData?.program_id;

        const url = programId
            ? `/api/programs?complexCode=${encodeURIComponent(complexCode)}&is_active=true`
            : `/api/programs?complexCode=${encodeURIComponent(complexCode)}&is_active=true`;
        const res = await fetch(url);
        const data = await res.json();
        const programs = data.data || [];

        // program_id 우선, 없으면 programName으로 매칭
        let prog = programId ? programs.find(p => p.id === programId) : null;
        if (!prog) prog = programs.find(p => p.name === programName || programName.includes(p.name) || (p.name && programName && p.name.replace(/\s/g,'') === programName.replace(/\s/g,'')));
        if (prog && prog.time_slots) {
            timeSlots = Array.isArray(prog.time_slots) ? prog.time_slots : [prog.time_slots];
        }
    } catch(e) { console.warn('time_slots 조회 오류:', e); }

    // 모달 생성
    const existing = document.getElementById('changeTimeModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'changeTimeModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';

    const slotsHtml = timeSlots.length > 0
        ? timeSlots.filter(t => t !== currentTime).map(t => {
            const fmtT = (() => {
                const [h] = t.split(':').map(Number);
                return isNaN(h) ? t : `${h < 12 ? '오전' : '오후'} ${h === 0 ? 12 : h > 12 ? h - 12 : h}시 (${t})`;
            })();
            return `<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid #e5e7eb;
                                  border-radius:8px;cursor:pointer;margin-bottom:6px;font-size:.88rem"
                          onmouseover="this.style.borderColor='#4f46e5'" onmouseout="this.style.borderColor='#e5e7eb'">
                        <input type="radio" name="newTime" value="${t}" style="accent-color:#4f46e5">
                        ${fmtT}
                    </label>`;
        }).join('')
        : `<p style="color:#6b7280;font-size:.85rem;text-align:center;padding:10px 0">
               시간대 정보를 불러올 수 없습니다.<br>직접 원하는 시간을 입력해 주세요.
           </p>
           <input type="time" id="manualTimeInput"
               style="width:100%;padding:9px;border:1.5px solid #d1d5db;border-radius:8px;font-size:.9rem">`;

    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:100%;max-width:400px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)">
            <div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;padding:15px 18px;
                        display:flex;align-items:center;justify-content:space-between">
                <span style="font-weight:700"><i class="fas fa-clock"></i> 시간대 변경</span>
                <button onclick="document.getElementById('changeTimeModal').remove()"
                        style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding:16px 18px">
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;
                            padding:10px;margin-bottom:14px;font-size:.82rem;color:#1e40af">
                    <strong>${programName}</strong><br>
                    현재 시간대: <strong>${currentTime}</strong><br>
                    <span style="font-size:.77rem;color:#6b7280">※ 변경 후 정원 초과 시 대기로 등록됩니다</span>
                </div>
                <div style="max-height:220px;overflow-y:auto">${slotsHtml}</div>
                <button onclick="_doChangeTime('${appId}','${phone4}')"
                        style="width:100%;margin-top:14px;padding:11px;border:none;border-radius:9px;
                               background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;
                               font-size:.93rem;font-weight:700;cursor:pointer">
                    <i class="fas fa-check"></i> 시간대 변경 확정
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function _doChangeTime(appId, phone4) {
    const selected = document.querySelector('input[name="newTime"]:checked');
    const manualInput = document.getElementById('manualTimeInput');
    const newTime = selected ? selected.value : (manualInput ? manualInput.value : '');

    if (!newTime) { alert('변경할 시간대를 선택하세요'); return; }

    try {
        const res = await fetch(`/api/applications/${appId}/change-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone4, new_preferred_time: newTime })
        });
        const data = await res.json();
        if (!data.success) { alert('변경 실패: ' + (data.error || '알 수 없는 오류')); return; }
        document.getElementById('changeTimeModal')?.remove();
        alert(`✅ ${data.message}`);
        loadMyManageList(); // 목록 새로고침
    } catch(e) {
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
function renderPeriodBanner() {
    const banner = document.getElementById('periodBanner');
    if (!banner) return;

    const now  = new Date();
    const kst  = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const day  = kst.getUTCDate();
    const mon  = kst.getUTCMonth() + 1;

    // 등록 접수 기간: 20~27일
    const isEnrollPeriod = day >= 20 && day <= 27;
    // 해지 신청 기간: 3~10일
    const isCancelPeriod = day >= 3  && day <= 10;

    if (isEnrollPeriod) {
        banner.innerHTML = `
            <div class="period-banner-active period-banner-enroll">
                <i class="fas fa-calendar-check" style="font-size:1.2rem"></i>
                <span>📝 <strong>${mon}월 등록 접수 기간입니다</strong> (${mon}월 20일 ~ 27일) — 지금 바로 신청하세요!</span>
            </div>`;
    } else if (isCancelPeriod) {
        const nextMon = mon === 12 ? 1 : mon + 1;
        banner.innerHTML = `
            <div class="period-banner-active period-banner-cancel">
                <i class="fas fa-exclamation-triangle" style="font-size:1.2rem"></i>
                <span>⚠️ <strong>해지 신청 기간입니다</strong> (${mon}월 3일 ~ 10일) — 해지를 원하시면 아래 버튼을 눌러 신청하세요.<br>
                <small style="font-weight:400;opacity:.85">당월 정상 수강 후 ${nextMon}월부터 해지 적용 · 기간 외 접수 불가</small></span>
            </div>`;
    } else {
        // 기간 아님 → 다음 기간 안내
        let nextLabel = '';
        if (day > 10 && day < 20) {
            nextLabel = `다음 등록 접수 기간: <strong>${mon}월 20일 ~ 27일</strong>`;
        } else if (day > 27) {
            const nm = mon === 12 ? 1 : mon + 1;
            nextLabel = `다음 해지 신청 기간: <strong>${nm}월 3일 ~ 10일</strong> · 다음 등록 접수: <strong>${nm}월 20일 ~ 27일</strong>`;
        } else {
            nextLabel = `다음 등록 접수 기간: <strong>${mon}월 20일 ~ 27일</strong>`;
        }
        banner.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:8px;
                        background:#f9fafb;border:1px solid #e5e7eb;font-size:.81rem;color:#6b7280">
                <i class="fas fa-calendar-alt"></i>
                <span>${nextLabel}</span>
            </div>`;
    }
}

async function showCancellationForm() {
    // === 해지 접수 기간 체크 (매월 3~10일 KST만 가능) ===
    const now = new Date();
    
    // UTC → KST 변환 (UTC+9)
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    const currentDay = kstDate.getUTCDate(); // KST 날짜
    const currentMonth = kstDate.getUTCMonth() + 1; // KST 월 (1~12)
    
    console.log(`📅 Current date (KST): ${kstDate.toISOString().slice(0, 10)} (day: ${currentDay})`);
    
    // 접수 기간 체크 (3일~10일만 가능)
    if (currentDay < 3 || currentDay > 10) {
        console.warn(`⚠️ Outside cancellation period: day ${currentDay}`);
        
        // 깔끔한 UI 모달 표시
        showCancellationPeriodWarning(currentMonth, currentDay);
        return;
    }
    
    console.log(`✅ Within cancellation period (3~10): showing form`);
    
    // Load program list dynamically
    await populateCancellationPrograms();
    
    document.getElementById('cancellationModal').classList.add('active');
}

// Populate cancellation program dropdown with active programs
async function populateCancellationPrograms() {
    try {
        const complexCode = complexContext.getComplexCode();
        if (!complexCode) {
            console.warn('⚠️ Complex code not available for cancellation programs');
            return;
        }
        
        console.log('📋 Loading programs for cancellation modal...');
        
        // Fetch active programs via /api/programs
        const response = await fetch(`/api/programs?complexCode=${complexCode}&activeOnly=true`);
        const result = await response.json();
        const programs = result.data || [];
        
        const complexPrograms = programs.filter(p => p.is_active !== false);
        
        console.log(`✅ Found ${complexPrograms.length} active programs for cancellation`);
        
        const selectElement = document.getElementById('cancelLessonType');
        
        // Clear existing options except the first one (placeholder)
        selectElement.innerHTML = '<option value="">선택하세요</option>';
        
        // Add program options
        complexPrograms.forEach(program => {
            const pName = program.name || program.program_name;
            const option = document.createElement('option');
            option.value = pName;
            option.textContent = pName;
            selectElement.appendChild(option);
        });
        
        if (complexPrograms.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '등록된 프로그램이 없습니다';
            option.disabled = true;
            selectElement.appendChild(option);
        }
        
    } catch (error) {
        console.error('❌ Failed to load programs for cancellation:', error);
        alert('프로그램 목록을 불러오는데 실패했습니다.');
    }
}

// Close cancellation modal
function closeCancellationModal() {
    document.getElementById('cancellationModal').classList.remove('active');
    document.getElementById('cancellationForm').reset();
}

// 🆕 Show cancellation period warning (깔끔한 UI)
function showCancellationPeriodWarning(currentMonth, currentDay) {
    const modal = document.getElementById('cancellationPeriodWarningModal');
    const content = document.getElementById('cancellationPeriodWarningContent');
    
    // 현재 날짜가 10일을 넘었으면 다음 달 표시
    let nextMonth = currentMonth;
    if (currentDay > 10) {
        nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    }
    
    content.innerHTML = `
        <p><strong>현재 날짜:</strong> ${currentMonth}월 ${currentDay}일 (한국시간)</p>
        <p><strong>다음 접수 기간:</strong> ${nextMonth}월 3일 ~ ${nextMonth}월 10일</p>
    `;
    
    modal.classList.add('active');
}

// 🆕 Close cancellation period warning modal
function closeCancellationPeriodWarning() {
    const modal = document.getElementById('cancellationPeriodWarningModal');
    modal.classList.remove('active');
}

// Submit cancellation
async function submitCancellation(e) {
    e.preventDefault();
    
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    const currentDay = kstDate.getUTCDate();
    const currentMonth = kstDate.getUTCMonth() + 1;
    
    const cancellationData = {
        dong: document.getElementById('cancelDong').value,
        ho: document.getElementById('cancelHo').value,
        name: document.getElementById('cancelName').value,
        phone: document.getElementById('cancelPhone').value,
        program_name: document.getElementById('cancelLessonType').value,  // 서버 필드명
        reason: document.getElementById('cancelReason').value,
        reason_detail: document.getElementById('cancelReasonDetail').value || '',
        request_type: 'cancel',  // 해지 신청 구분
        status: 'pending',  // 서버에서 pending으로 처리
        created_at: new Date().toISOString()
    };
    
    console.log('📝 Submitting cancellation (auto-approved):', cancellationData);
    
    try {
        cancellationData.complex_id = complexContext.getComplexId();
        const response = await fetch('/api/cancellations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(cancellationData)
        });
        
        console.log('📡 Response status:', response.status);
        
        if (response.ok) {
            console.log('✅ Cancellation auto-approved successfully');
            alert(`✅ 해지 신청이 접수되었습니다.\n\n프로그램: ${cancellationData.program_name}\n접수일: ${currentMonth}월 ${currentDay}일\n\n궁금하신 사항은 문의처에 접수해주세요.\n감사합니다! 😊`);
            closeCancellationModal();
        } else {
            const errorText = await response.text();
            console.error('❌ Submission failed:', response.status, errorText);
            throw new Error(`Submission failed: ${response.status}`);
        }
        
    } catch (error) {
        console.error('💥 Error submitting cancellation:', error);
        alert('해지 신청에 실패했습니다.\n\n' + error.message);
    }
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
                    ${escapeHtml(notice.content || '')}
                </div>
                <div class="notice-date">
                    <i class="fas fa-calendar"></i> ${kstDateStr(notice.created_at)}
                </div>
            </div>
        `;
    }).join('');
}

// ===== LOAD PROGRAMS =====

// Load programs from database
async function loadPrograms() {
    try {
        const complexCode = complexContext.getComplexCode();
        if (!complexCode) {
            console.warn('⚠️ Complex code not available for programs');
            return;
        }
        
        // /api/programs 엔드포인트로 단지별 프로그램 조회
        const response = await fetch(`/api/programs?complexCode=${complexCode}`);
        const result = await response.json();
        
        // 승인된 신청 수 조회
        const contractsResponse = await fetch(`/api/applications?complexCode=${complexCode}&status=approved&limit=1000`);
        const contractsResult = await contractsResponse.json();
        const approvedContracts = contractsResult.data || [];
        
        console.log(`📊 Found ${approvedContracts.length} approved contracts for complex ${complexCode}`);
        
        // Filter programs: active OR (inactive but display_on_inactive=true)
        const programs = (result.data || [])
            .filter(p => p.is_active || p.display_on_inactive)
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
            console.log(`📌 Program "${pName}": ${count}/${program.capacity || program.max_capacity} (승인된 신청자) - active: ${program.is_active}`);
        });
        
        console.log(`📋 Loaded ${programs.length} programs for complex ${complexCode}`);
        
        if (programs.length > 0) {
            populateProgramOptions(programs);
        } else {
            console.warn('⚠️ No programs found for complex', complexCode);
        }
        
    } catch (error) {
        console.error('Error loading programs:', error);
        console.warn('⚠️ Using default program options');
    }
}

// Populate program options in select dropdown
function populateProgramOptions(programs) {
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
        
        // Add "곧 오픈" or "준비중" for inactive programs
        if (!isActive) {
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
    
    console.log(`✅ Populated ${programs.length} program options (${programs.filter(p => !p.is_active).length} inactive but visible)`);
}

// Format price helper
function formatPrice(price) {
    return new Intl.NumberFormat('ko-KR').format(price || 0);
}


// ===== ADMIN PASSWORD MODAL (2단계: 일반 / 총괄) =====

// 마스터 비밀번호 (프론트 1차 검증용)
const MASTER_PW = 'master2026';

/* 모달 열기 — 항상 Step1(일반 관리자)부터 */
function showAdminPasswordModal() {
    const modal = document.getElementById('adminPasswordModal');
    modal.classList.add('active');
    _showAdminStep(1);
    _loadComplexListForAdminModal();
}

/* 모달 닫기 */
function closeAdminPasswordModal() {
    const modal = document.getElementById('adminPasswordModal');
    modal.classList.remove('active');
    const pw1 = document.getElementById('adminPasswordInput');
    const pw2 = document.getElementById('masterPasswordInput');
    if (pw1) pw1.value = '';
    if (pw2) pw2.value = '';
    _hideAdminError('adminPasswordError');
    _hideAdminError('masterPasswordError');
}

/* Step 전환 */
function showAdminStep2() { _showAdminStep(2); }
function showAdminStep1() { _showAdminStep(1); }

function _showAdminStep(step) {
    document.getElementById('adminStep1').style.display = step === 1 ? 'block' : 'none';
    document.getElementById('adminStep2').style.display = step === 2 ? 'block' : 'none';
    setTimeout(() => {
        const target = step === 1
            ? document.getElementById('adminPasswordInput')
            : document.getElementById('masterPasswordInput');
        target?.focus();
    }, 80);
}

/* 에러 표시/숨김 헬퍼 */
function _showAdminError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    const textEl = el.querySelector('span') || el;
    if (msg) textEl.textContent = msg;
    el.style.display = 'flex';
    setTimeout(() => { el.style.display = 'none'; }, 3500);
}
function _hideAdminError(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

/* 버튼 로딩 상태 */
function _setAdminBtnLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn._origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 인증 중...';
    } else {
        btn.disabled = false;
        if (btn._origHtml) btn.innerHTML = btn._origHtml;
    }
}

/* 단지 목록 로드 (드롭다운) */
async function _loadComplexListForAdminModal() {
    const select = document.getElementById('adminComplexSelect');
    const status = document.getElementById('adminComplexLoadStatus');
    if (!select) return;

    // 현재 단지가 있으면 자동 선택 후 고정
    const currentCode = (typeof complexContext !== 'undefined') ? complexContext.getComplexCode() : '';
    if (currentCode) {
        const currentName = (typeof complexContext !== 'undefined') ? (complexContext.getComplex()?.name || currentCode) : currentCode;
        select.innerHTML = `<option value="${currentCode}">${currentName || currentCode}</option>`;
        select.disabled = true;
        if (status) status.textContent = `현재 단지: ${currentName || currentCode}`;
        return;
    }

    // 단지 코드 없는 경우: API에서 전체 목록 로드
    if (status) status.textContent = '단지 목록 로딩 중...';
    try {
        const res = await fetch('/api/complexes');
        const data = await res.json();
        const list = (data.data || []).filter(c => c.is_active);
        if (!list.length) {
            if (status) status.textContent = '등록된 단지가 없습니다';
            return;
        }
        select.innerHTML = '<option value="">— 단지를 선택하세요 —</option>' +
            list.map(c => `<option value="${c.code}">${c.name}</option>`).join('');
        select.disabled = false;
        if (status) status.textContent = '';
    } catch(e) {
        if (status) { status.textContent = '목록 로드 실패'; status.style.color = '#e53935'; }
        console.warn('단지 목록 로드 실패:', e);
    }
}

/* ── Step1: 일반 관리자 비밀번호 확인 ── */
async function checkAdminPassword() {
    const selectEl   = document.getElementById('adminComplexSelect');
    const pwEl       = document.getElementById('adminPasswordInput');
    const complexCode = selectEl ? selectEl.value : '';
    const password    = pwEl ? pwEl.value.trim() : '';

    _hideAdminError('adminPasswordError');

    if (!complexCode) {
        _showAdminError('adminPasswordError', '단지를 선택하세요');
        selectEl?.focus(); return;
    }
    if (!password) {
        _showAdminError('adminPasswordError', '비밀번호를 입력하세요');
        pwEl?.focus(); return;
    }

    _setAdminBtnLoading('adminLoginBtn', true);

    try {
        const response = await fetch('/api/complexes/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ complexCode, password })
        });
        const result = await response.json();

        if (result.success) {
            console.log('✅ Admin password correct! Role:', result.role);
            sessionStorage.setItem('adminRole',    result.role);
            sessionStorage.setItem('adminComplex', JSON.stringify(result.complex || {}));
            closeAdminPasswordModal();
            const logoEl = document.getElementById('logoText');
            if (logoEl) { logoEl.style.color = '#27ae60'; setTimeout(() => logoEl.style.color = '', 600); }
            setTimeout(() => { window.location.href = '/admin/'; }, 250);
        } else {
            _setAdminBtnLoading('adminLoginBtn', false);
            _showAdminError('adminPasswordError', '비밀번호가 올바르지 않습니다');
            if (pwEl) { pwEl.value = ''; pwEl.focus(); }
        }
    } catch(e) {
        _setAdminBtnLoading('adminLoginBtn', false);
        _showAdminError('adminPasswordError', '오류가 발생했습니다. 다시 시도하세요');
        console.error('Admin password check error:', e);
    }
}

/* ── Step2: 총괄 관리자 마스터 비밀번호 확인 ── */
async function checkMasterPassword() {
    const pwEl    = document.getElementById('masterPasswordInput');
    const password = pwEl ? pwEl.value.trim() : '';

    _hideAdminError('masterPasswordError');

    if (!password) {
        _showAdminError('masterPasswordError', '마스터 비밀번호를 입력하세요');
        pwEl?.focus(); return;
    }

    _setAdminBtnLoading('masterLoginBtn', true);

    // 1차: 프론트 하드코드 검증 (master2026)
    if (password === MASTER_PW) {
        sessionStorage.setItem('adminRole',    'master');
        sessionStorage.setItem('adminComplex', JSON.stringify({ code: 'master', name: '마스터 관리자' }));
        closeAdminPasswordModal();
        const logoEl = document.getElementById('logoText');
        if (logoEl) { logoEl.style.color = '#f39c12'; setTimeout(() => logoEl.style.color = '', 600); }
        setTimeout(() => { window.location.href = '/admin/'; }, 250);
        return;
    }

    // 2차: 서버 API 검증 (단지코드 '' = master 모드)
    try {
        const response = await fetch('/api/complexes/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ complexCode: '', password })
        });
        const result = await response.json();

        if (result.success && result.role === 'master') {
            sessionStorage.setItem('adminRole',    'master');
            sessionStorage.setItem('adminComplex', JSON.stringify(result.complex || { code: 'master', name: '마스터 관리자' }));
            closeAdminPasswordModal();
            const logoEl = document.getElementById('logoText');
            if (logoEl) { logoEl.style.color = '#f39c12'; setTimeout(() => logoEl.style.color = '', 600); }
            setTimeout(() => { window.location.href = '/admin/'; }, 250);
        } else {
            _setAdminBtnLoading('masterLoginBtn', false);
            _showAdminError('masterPasswordError', '마스터 비밀번호가 올바르지 않습니다');
            if (pwEl) { pwEl.value = ''; pwEl.focus(); }
        }
    } catch(e) {
        _setAdminBtnLoading('masterLoginBtn', false);
        _showAdminError('masterPasswordError', '오류가 발생했습니다. 다시 시도하세요');
        console.error('Master password check error:', e);
    }
}

// ===== 🆕 CURRICULUM FUNCTIONS =====

// Show curriculum modal
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
