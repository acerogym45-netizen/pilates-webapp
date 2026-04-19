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
    
    // Update header
    document.getElementById('pageTitle').textContent = '필라테스 레슨 이용계약서';
    document.getElementById('pageSubtitle').textContent = '계약 내용을 확인하고 서명해주세요';
    
    // Display form data
    document.getElementById('displayDong').textContent = formData.dong;
    document.getElementById('displayHo').textContent = formData.ho;
    document.getElementById('displayName').textContent = formData.name;
    document.getElementById('displayPhone').textContent = formData.phone;
    document.getElementById('displayLesson').textContent = formData.lesson_type;
    document.getElementById('displayTime').textContent = formData.preferred_time;
    
    // Initialize signature pad
    initSignaturePad();
    
    // Scroll to top
    window.scrollTo(0, 0);
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
    document.getElementById('pageSubtitle').textContent = '커뮤니티 피트니스센터';
    
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
    
    // Check if signature pad has content
    if (signaturePad.isEmpty()) {
        alert('서명란에 서명해주세요.');
        return;
    }
    
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
        
        // 🆕 중복 신청 검사
        console.log('🔍 Checking for duplicate applications...');
        const isDuplicate = await checkDuplicateApplication(contractData);
        
        if (isDuplicate) {
            showDuplicateWarningModal(contractData);
            console.log('❌ Duplicate application detected - submission cancelled');
            return;
        }
        
        console.log('✅ No duplicate found - proceeding with submission');
        
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

// 🆕 중복 신청 검사 함수
async function checkDuplicateApplication(contractData) {
    try {
        const complexCode = complexContext.getComplexCode();
        const dong = contractData.dong;
        const ho = contractData.ho;
        const name = contractData.name;
        const lessonType = contractData.lesson_type;
        
        console.log(`🔍 Checking duplicates for: ${dong}동 ${ho}호 ${name} - ${lessonType}`);
        
        // /api/applications 엔드포인트로 조회
        const params = new URLSearchParams({ complexCode, dong, ho, status: 'approved', limit: 50 });
        const response = await fetch(`/api/applications?${params}`);
        const result = await response.json();
        const contracts = result.data || [];
        
        const duplicates = contracts.filter(c =>
            c.name === name &&
            (c.program_name === lessonType || c.lesson_type === lessonType)
        );
        
        if (duplicates.length > 0) {
            console.log(`⚠️ Found ${duplicates.length} duplicate(s)`);
            return true;
        }
        
        console.log('✅ No duplicates found');
        return false;
        
    } catch (error) {
        console.error('❌ Error checking duplicates:', error);
        return false;
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
    
    // Set canvas size
    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext('2d').scale(ratio, ratio);
        signaturePad.clear();
    }
    
    signaturePad = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)'
    });
    
    resizeCanvas();
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

// Submit inquiry
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
        is_public: document.querySelector('input[name="isPublic"]:checked').value === 'true',
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

// Show duplicate warning modal
function showDuplicateWarningModal(contractData) {
    const modal = document.getElementById('duplicateWarningModal');
    const content = document.getElementById('duplicateWarningContent');
    
    content.innerHTML = `
        <p><strong>동/호:</strong> ${contractData.dong}동 ${contractData.ho}호</p>
        <p><strong>성명:</strong> ${contractData.name}</p>
        <p><strong>프로그램:</strong> ${contractData.lesson_type}</p>
    `;
    
    modal.classList.add('active');
}

// Close duplicate warning modal
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
                        ${new Date(inq.created_at).toLocaleDateString('ko-KR')}
                    </div>
                </div>
                <div class="inquiry-content">
                    ${escapeHtml(inq.content)}
                </div>
                ${inq.reply ? `
                    <div class="inquiry-reply">
                        <strong><i class="fas fa-reply"></i> 답변</strong>
                        ${escapeHtml(inq.reply)}
                        ${inq.reply_date ? `<div style="margin-top: 8px; font-size: 12px; color: #718096;">${new Date(inq.reply_date).toLocaleDateString('ko-KR')}</div>` : ''}
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
                    <i class="fas fa-calendar"></i> ${new Date(notice.created_at).toLocaleDateString('ko-KR')}
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
    const sel = document.getElementById('refundReason'); if (sel) sel.value = '';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0,0,0,.5)';
    modal.style.zIndex = '9999';
    modal.style.padding = '16px';
}

function closeRefundRequestModal() {
    const modal = document.getElementById('refundRequestModal');
    if (modal) modal.style.display = 'none';
}

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

    const reasonLabel = {
        injury:     '6개월 이상 운동 불가 질병·부상',
        emigration: '6개월 이상 해외 이주'
    }[reason] || reason;

    const complexCode = complexContext?.getComplexCode?.() || '';
    const complexId   = complexContext?.getComplexId?.()   || '';

    try {
        const btn = document.querySelector('#refundRequestModal [onclick="submitRefundRequest()"]');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 접수 중...'; }

        // 해지 관리 탭에서 볼 수 있도록 /api/cancellations 로 전송
        const res = await fetch('/api/cancellations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                complex_id: complexId,
                complex_code: complexCode,
                name, dong, ho, phone,
                program_name: '',          // 환불 신청 시 프로그램명 미입력 가능
                request_type: 'refund',
                refund_reason: reasonLabel,
                refund_detail: detail || ''
            })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || data.message || '접수 실패');

        closeRefundRequestModal();
        alert('환불 신청이 접수되었습니다.\n담당자가 확인 후 연락드리겠습니다.\n증빙서류를 관리사무소에 제출해주세요.');
    } catch (e) {
        alert('접수 중 오류가 발생했습니다: ' + e.message);
    } finally {
        const btn = document.querySelector('#refundRequestModal [onclick="submitRefundRequest()"]');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> 환불 신청 접수'; }
    }
}
