// State Management
let formData = {};
let signaturePad = null;

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
    console.log('✅ Application ready');
});

// Setup Event Listeners
function setupEventListeners() {
    const form = document.getElementById('contractForm');
    form.addEventListener('submit', handlePage1Submit);
    
    // Phone number formatting (oninput 속성으로도 등록되어 있으나 누락 방지용 유지)
    const phoneInput = document.getElementById('phone');
    if (phoneInput) phoneInput.addEventListener('input', formatPhoneNumber);
    
    // Update time slots when program changes
    const lessonTypeSelect = document.getElementById('lessonType');
    if (lessonTypeSelect) {
        lessonTypeSelect.addEventListener('change', function() {
            const timeSlotSelect = document.getElementById('preferredTime');
            if (timeSlotSelect) timeSlotSelect.value = '';
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

    // ── 동/호수/전화번호 확인 필드 일치 검증 ──────────────────────────────────
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
    const termsAgreement = document.getElementById('termsAgreement').checked;
    const signatureName = document.getElementById('signatureName').value.trim();
    const signatureDate = document.getElementById('signatureDate').value;
    
    // Validation
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
            // 중복 신청인 경우 모달 표시
            showDuplicateWarningModal(contractData);
            console.log('❌ Duplicate application detected - submission cancelled');
            return; // 제출 중단
        }
        
        console.log('✅ No duplicate found - proceeding with submission');
        
        // === B. 정원 체크 및 대기열 로직 ===
        const capacityCheck = await checkProgramCapacity(contractData);
        
        if (capacityCheck.isFull) {
            console.log('⚠️ Program full - adding to waiting list');
            
            // 대기열에 추가
            contractData.status = 'waiting';
            contractData.waiting_order = capacityCheck.nextWaitingOrder;
            contractData.auto_approved = false;
            
            console.log(`📋 Waiting list order: ${contractData.waiting_order}`);
            
            const response = await fetch('tables/pilates_contracts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(contractData)
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Added to waiting list:', result);
                showWaitingListModal(contractData);
            } else {
                throw new Error(`Failed to add to waiting list: ${response.status}`);
            }
            
            return;
        }
        
        // 정원 여유 있음 - 자동 승인
        console.log('✅ Capacity available - auto-approving');
        contractData.status = 'approved';
        contractData.auto_approved = true;
        contractData.waiting_order = null;
        
        console.log('🚀 Sending POST request to: tables/pilates_contracts');
        
        const response = await fetch('tables/pilates_contracts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(contractData)
        });
        
        console.log('📡 Response status:', response.status, response.statusText);
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Contract submitted and auto-approved successfully:', result);
            
            // 🆕 자동 승인 안내 모달
            showSuccessNotificationModal(contractData);
        } else {
            const errorText = await response.text();
            console.error('❌ Submit failed:', {
                status: response.status,
                statusText: response.statusText,
                errorText: errorText
            });
            throw new Error(`Failed to submit contract: ${response.status} ${response.statusText}`);
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
        const complexCode = contractData.complex_id;
        const dong = contractData.dong;
        const ho = contractData.ho;
        const name = contractData.name;
        const lessonType = contractData.lesson_type;
        
        console.log(`🔍 Checking duplicates for: ${dong}동 ${ho}호 ${name} - ${lessonType}`);
        
        // 모든 계약 조회
        const response = await fetch('tables/pilates_contracts?limit=1000');
        const result = await response.json();
        const contracts = result.data || [];
        
        // 동일 단지 + 동일인(동/호/이름) + 동일 프로그램 + 승인 상태인 계약 찾기
        const duplicates = contracts.filter(contract => 
            contract.complex_id === complexCode &&
            contract.dong === dong &&
            contract.ho === ho &&
            contract.name === name &&
            contract.lesson_type === lessonType &&
            contract.status === 'approved'  // 승인된 신청만 중복으로 간주 (영문)
        );
        
        if (duplicates.length > 0) {
            console.log(`⚠️ Found ${duplicates.length} duplicate(s):`, duplicates.map(d => ({
                id: d.id.substring(0, 8),
                created_at: new Date(d.created_at).toLocaleString(),
                lesson_type: d.lesson_type,
                status: d.status
            })));
            return true;
        }
        
        console.log('✅ No duplicates found');
        return false;
        
    } catch (error) {
        console.error('❌ Error checking duplicates:', error);
        // 에러 발생 시 안전하게 false 반환 (중복 체크 실패 시 신청 허용)
        return false;
    }
}

// 🆕 B. 정원 체크 함수
async function checkProgramCapacity(contractData) {
    try {
        const complexCode = contractData.complex_id;
        const lessonType = contractData.lesson_type;
        
        console.log(`📊 Checking capacity for: ${lessonType}`);
        
        // 1. 프로그램 정보 조회 (최대 정원)
        const programsResponse = await fetch('tables/programs?limit=100');
        const programsResult = await programsResponse.json();
        const programs = programsResult.data || [];
        
        // 프로그램명 유연한 매칭
        const targetProgram = programs.find(p => 
            p.complex_id === complexCode && 
            p.is_active && 
            (p.program_name === lessonType || p.program_name.includes(lessonType) || lessonType.includes(p.program_name))
        );
        
        if (!targetProgram) {
            console.warn('⚠️ Program not found - allowing submission');
            return { isFull: false, currentCount: 0, maxCapacity: 999, nextWaitingOrder: 1 };
        }
        
        const maxCapacity = targetProgram.max_capacity || 6;
        console.log(`📋 Program max capacity: ${maxCapacity}`);
        
        // 2. 현재 승인된 신청 수 조회
        const contractsResponse = await fetch('tables/pilates_contracts?limit=1000');
        const contractsResult = await contractsResponse.json();
        const allContracts = contractsResult.data || [];
        
        // 동일 단지 + 동일 프로그램 + 승인 상태
        const approvedContracts = allContracts.filter(c => 
            c.complex_id === complexCode &&
            c.status === 'approved' &&
            (c.lesson_type === lessonType || c.lesson_type.includes(lessonType) || lessonType.includes(c.lesson_type))
        );
        
        const currentCount = approvedContracts.length;
        console.log(`✅ Current approved contracts: ${currentCount}/${maxCapacity}`);
        
        // 3. 대기열 순번 계산
        const waitingContracts = allContracts.filter(c =>
            c.complex_id === complexCode &&
            c.status === 'waiting' &&
            (c.lesson_type === lessonType || c.lesson_type.includes(lessonType) || lessonType.includes(c.lesson_type))
        );
        
        const nextWaitingOrder = waitingContracts.length > 0 
            ? Math.max(...waitingContracts.map(c => c.waiting_order || 0)) + 1 
            : 1;
        
        console.log(`📝 Next waiting order: ${nextWaitingOrder}`);
        
        // 4. 정원 초과 여부
        const isFull = currentCount >= maxCapacity;
        
        return {
            isFull,
            currentCount,
            maxCapacity,
            nextWaitingOrder
        };
        
    } catch (error) {
        console.error('❌ Error checking capacity:', error);
        // 에러 시 안전하게 허용
        return { isFull: false, currentCount: 0, maxCapacity: 999, nextWaitingOrder: 1 };
    }
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
        const programsResponse = await fetch('tables/programs?limit=100&sort=display_order');
        const programsResult = await programsResponse.json();
        const programs = (programsResult.data || [])
            .filter(p => p.is_active && p.complex_id === complexCode)
            .filter(p => !p.program_name.includes('1:1') && !p.program_name.includes('2:1')); // Only group lessons
        
        // Load contracts
        const response = await fetch('tables/pilates_contracts?limit=1000');
        const result = await response.json();
        const contracts = (result.data || []).filter(c => c.complex_id === complexCode);
        
        console.log('📊 Loading time slot status...');
        console.log('Total contracts for complex:', contracts.length);
        console.log('Group lesson programs:', programs.map(p => p.program_name));
        
        // Time code to display name mapping
        const timeDisplayMap = {
            '09:00': '오전 09시',
            '10:00': '오전 10시',
            '11:00': '오전 11시',
            '12:00': '오후 12시',
            '13:00': '오후 13시',
            '14:00': '오후 14시',
            '15:00': '오후 15시',
            '16:00': '오후 16시',
            '17:00': '오후 17시',
            '18:00': '저녁 18시',
            '19:00': '저녁 19시',
            '20:00': '저녁 20시',
            '21:00': '저녁 21시'
        };
        
        // Initialize programTimeSlots dynamically based on programs' available_time_slots
        const programTimeSlots = {};
        
        programs.forEach(program => {
            const availableSlots = program.available_time_slots || [];
            const timeSlotCounts = {};
            
            // Initialize counts for all available time slots
            if (availableSlots.length > 0) {
                availableSlots.forEach(timeCode => {
                    const displayTime = timeDisplayMap[timeCode] || `${timeCode}시`;
                    timeSlotCounts[displayTime] = 0;
                });
            } else {
                // Fallback: if no available_time_slots, use default times
                timeSlotCounts['오전 09시'] = 0;
                timeSlotCounts['오전 10시'] = 0;
                timeSlotCounts['오전 11시'] = 0;
                timeSlotCounts['저녁 19시'] = 0;
                timeSlotCounts['저녁 20시'] = 0;
                timeSlotCounts['저녁 21시'] = 0;
            }
            
            programTimeSlots[program.program_name] = timeSlotCounts;
            console.log(`🔧 Initialized time slots for "${program.program_name}":`, Object.keys(timeSlotCounts));
        });
        
        // Count approved contracts only (status === 'approved')
        contracts.forEach(contract => {
            if (contract.status === 'approved') {
                let time = contract.preferred_time;
                let program = contract.lesson_type;
                
                console.log(`🔍 Processing contract: ${contract.name}, program: "${program}", time: "${time}"`);
                
                // Normalize old format (e.g., "09시" → "오전 09시")
                if (time && !time.includes('오전') && !time.includes('오후') && !time.includes('저녁')) {
                    const hour = time.replace('시', '');
                    if (hour === '09' || hour === '10' || hour === '11') {
                        time = `오전 ${hour}시`;
                    } else if (hour === '12' || hour === '13' || hour === '14' || hour === '15' || hour === '16' || hour === '17') {
                        time = `오후 ${hour}시`;
                    } else if (hour === '18' || hour === '19' || hour === '20' || hour === '21') {
                        time = `저녁 ${hour}시`;
                    }
                }
                
                // Try exact match first
                if (programTimeSlots[program] && programTimeSlots[program].hasOwnProperty(time)) {
                    programTimeSlots[program][time]++;
                    console.log(`✅ Counted: ${contract.name} - ${program} ${time} (Total: ${programTimeSlots[program][time]})`);
                } else {
                    // Try fuzzy matching - check if program name starts with contract's lesson_type
                    let matched = false;
                    for (let programName in programTimeSlots) {
                        if (programName.includes(program) || program.includes(programName)) {
                            if (programTimeSlots[programName].hasOwnProperty(time)) {
                                programTimeSlots[programName][time]++;
                                console.log(`✅ Fuzzy matched: ${contract.name} - "${program}" → "${programName}" ${time} (Total: ${programTimeSlots[programName][time]})`);
                                matched = true;
                                break;
                            }
                        }
                    }
                    
                    if (!matched && programTimeSlots[program]) {
                        console.warn(`⚠️ Time slot "${time}" not found in program "${program}". Available: ${Object.keys(programTimeSlots[program]).join(', ')}`);
                    } else if (!matched) {
                        console.warn(`⚠️ Program "${program}" not found in programTimeSlots. Available programs: ${Object.keys(programTimeSlots).join(', ')}`);
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
    
    // Build options HTML - only for available time slots
    let optionsHTML = '<option value="">선택하세요</option>';
    
    // Map time codes to display names
    const timeDisplayMap = {
        '09:00': '오전 09시',
        '10:00': '오전 10시',
        '11:00': '오전 11시',
        '12:00': '오후 12시',
        '13:00': '오후 13시',
        '14:00': '오후 14시',
        '15:00': '오후 15시',
        '16:00': '오후 16시',
        '17:00': '오후 17시',
        '18:00': '저녁 18시',
        '19:00': '저녁 19시',
        '20:00': '저녁 20시',
        '21:00': '저녁 21시'
    };
    
    availableTimeSlots.forEach(timeCode => {
        const timeDisplay = timeDisplayMap[timeCode] || `${timeCode}시`;
        const count = slots[timeDisplay] || 0;
        const isFull = count >= maxCapacity;
        const isAlmostFull = count >= (maxCapacity - 1);
        
        let status = '모집중';
        if (isFull) {
            status = '🔴 마감';
        } else if (isAlmostFull) {
            status = '⚠️ 마감임박';
        }
        
        const disabled = isFull ? 'disabled' : '';
        const style = isFull ? 'style="color: #999;"' : '';
        
        optionsHTML += `<option value="${timeDisplay}" ${disabled} ${style}>${timeDisplay} [${count}/${maxCapacity}명] ${status}</option>`;
        console.log(`  ${timeDisplay}: ${count}/${maxCapacity}명 - ${status}`);
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
    
    const name  = document.getElementById('inquiryName').value.trim();
    const phone = document.getElementById('inquiryPhone').value.trim();
    const title = document.getElementById('inquiryTitle').value.trim();
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
        is_public: document.querySelector('input[name="isPublic"]:checked').value === 'true',
        status: '대기중',
        created_at: new Date().getTime()
    };
    
    try {
        const response = await fetch('tables/pilates_inquiries', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(inquiryData)
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
        
        const response = await fetch('tables/pilates_inquiries?limit=100&sort=-created_at');
        const result = await response.json();
        const inquiries = result.data || [];
        
        // Filter: public + same complex + not hidden + not deleted
        const publicInquiries = inquiries.filter(inq => 
            inq.is_public && 
            inq.complex_id === complexId &&
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
        
        // 해지 신청 드롭다운은 비활성 프로그램도 포함해야 함.
        // 비활성 프로그램 수강자도 해지 신청 가능해야 하므로 includeInactive=true 사용.
        const response = await fetch(`/api/programs?complexCode=${complexCode}&includeInactive=true`);
        const result = await response.json();
        const programs = result.data || [];
        
        console.log(`✅ Found ${programs.length} programs for cancellation (active + inactive)`);
        
        const selectElement = document.getElementById('cancelLessonType');
        
        // Clear existing options except the first one (placeholder)
        selectElement.innerHTML = '<option value="">선택하세요</option>';
        
        // 활성 프로그램 먼저, 비활성 프로그램은 구분선 뒤에 표시
        const activePrograms   = programs.filter(p => p.is_active !== false);
        const inactivePrograms = programs.filter(p => p.is_active === false);

        activePrograms.forEach(program => {
            const pName = program.name || program.program_name;
            const option = document.createElement('option');
            option.value = pName;
            option.textContent = pName;
            selectElement.appendChild(option);
        });

        if (inactivePrograms.length > 0) {
            const sep = document.createElement('option');
            sep.disabled = true;
            sep.textContent = '── 신규접수 종료 ──';
            selectElement.appendChild(sep);

            inactivePrograms.forEach(program => {
                const pName = program.name || program.program_name;
                const option = document.createElement('option');
                option.value = pName;
                option.textContent = `${pName} (신규접수 종료)`;
                option.style.color = '#888';
                selectElement.appendChild(option);
            });
        }
        
        if (programs.length === 0) {
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
        lesson_type: document.getElementById('cancelLessonType').value,
        reason: document.getElementById('cancelReason').value,
        reason_detail: document.getElementById('cancelReasonDetail').value || '',
        status: 'approved',  // ✅ 자동 승인
        admin_note: `자동 승인 (${currentMonth}월 ${currentDay}일 접수)`,
        created_at: new Date().toISOString(),
        approved_at: new Date().toISOString()
    };
    
    console.log('📝 Submitting cancellation (auto-approved):', cancellationData);
    
    try {
        const response = await fetch('tables/pilates_cancellations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(cancellationData)
        });
        
        console.log('📡 Response status:', response.status);
        
        if (response.ok) {
            console.log('✅ Cancellation auto-approved successfully');
            alert(`✅ 해지 신청이 자동 승인되었습니다.\n\n프로그램: ${cancellationData.lesson_type}\n접수일: ${currentMonth}월 ${currentDay}일\n\n궁금하신 사항은 문의처에 접수해주세요.\n감사합니다! 😊`);
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
        
        const response = await fetch('tables/notices?limit=100');
        const result = await response.json();
        
        const notices = (result.data || [])
            .filter(n => n.is_active && n.complex_id === complexCode)  // Filter by complex_code
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
        const categoryClass = notice.category === '중요' ? 'important' : 
                             notice.category === '이벤트' ? 'event' : 'general';
        
        return `
            <div class="notice-item ${categoryClass}">
                <div class="notice-header">
                    <div class="notice-title">
                        ${notice.category === '중요' ? '<i class="fas fa-exclamation-circle"></i>' : 
                          notice.category === '이벤트' ? '<i class="fas fa-gift"></i>' : 
                          '<i class="fas fa-info-circle"></i>'}
                        ${escapeHtml(notice.title)}
                    </div>
                    <span class="notice-category ${categoryClass.toLowerCase()}">
                        ${escapeHtml(notice.category)}
                    </span>
                </div>
                <div class="notice-content">
                    ${escapeHtml(notice.content || '').replace(/\n/g, '<br>')}
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
        
        // Fetch programs
        const response = await fetch('tables/programs?limit=100&sort=display_order');
        const result = await response.json();
        
        // Fetch approved contracts to calculate current count
        const contractsResponse = await fetch('tables/pilates_contracts?limit=1000');
        const contractsResult = await contractsResponse.json();
        const approvedContracts = (contractsResult.data || []).filter(c => 
            c.status === 'approved' && c.complex_id === complexCode
        );
        
        console.log(`📊 Found ${approvedContracts.length} approved contracts for complex ${complexCode}`);
        
        // Filter programs: active OR (inactive but display_on_inactive=true)
        const programs = (result.data || [])
            .filter(p => {
                if (p.complex_id !== complexCode) return false;
                // Show if active, or if inactive but display_on_inactive is true
                return p.is_active || p.display_on_inactive;
            })
            .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        
        console.log(`✅ Filtered programs: ${programs.length} (active or display_on_inactive)`);
        
        // Calculate current count for each program based on approved contracts
        programs.forEach(program => {
            const count = approvedContracts.filter(c => 
                c.lesson_type === program.program_name
            ).length;
            program.current_count = count;
            console.log(`📌 Program "${program.program_name}": ${count}/${program.max_capacity} (승인된 신청자) - active: ${program.is_active}, display_on_inactive: ${program.display_on_inactive}`);
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
        const option = document.createElement('option');
        option.value = program.program_name;
        
        const currentCount = program.current_count || 0;
        const maxCapacity = program.max_capacity || 0;
        const isActive = program.is_active;
        
        // Check if it's 1:1 or 2:1 lesson
        const isPersonalLesson = program.program_name.includes('1:1') || program.program_name.includes('2:1');
        
        // Build display text
        let displayText = program.program_name;
        if (program.schedule_times) {
            displayText += ` (${program.schedule_times})`;
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
        option.dataset.programType = program.program_type;
        option.dataset.maxCapacity = maxCapacity;
        option.dataset.currentCount = currentCount;
        option.dataset.price = program.price;
        option.dataset.scheduleDays = program.schedule_days;
        option.dataset.scheduleTimes = program.schedule_times;
        option.dataset.isPersonalLesson = isPersonalLesson;
        option.dataset.availableTimeSlots = JSON.stringify(program.available_time_slots || []);
        option.dataset.isActive = isActive;
        
        lessonTypeSelect.appendChild(option);
    });
    
    console.log(`✅ Populated ${programs.length} program options (${programs.filter(p => !p.is_active).length} inactive but visible)`);
}

// Format price helper
function formatPrice(price) {
    return new Intl.NumberFormat('ko-KR').format(price || 0);
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
        const complexCode = complexContext.getComplexCode(); // URL 파라미터 기반 단지 코드
        
        console.log(`📅 Loading curriculum for ${year}-${month}, complex: ${complexCode}`);
        
        // /api/curricula 엔드포인트 — complexCode + year + month 서버 필터링
        const response = await fetch(
            `/api/curricula?complexCode=${encodeURIComponent(complexCode)}&year=${year}&month=${month}`
        );
        const result = await response.json();
        const curriculums = result.data || [];
        
        console.log(`✅ Fetched ${curriculums.length} total curriculums`);
        
        // 이미 서버에서 필터됐으므로 첫 번째 항목 사용
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

