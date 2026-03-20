// Configuration
const TABLES_ENDPOINT = 'tables';
const TABLE_NAME = 'programs';

// State Management
let allPrograms = [];
let currentComplexId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Initializing Programs Admin...');
    
    // Get complex ID from URL or use default
    const urlParams = new URLSearchParams(window.location.search);
    currentComplexId = urlParams.get('complex') || await getDefaultComplexId();
    
    if (!currentComplexId) {
        alert('단지 정보를 불러올 수 없습니다.');
        return;
    }
    
    console.log(`📍 Current complex ID: ${currentComplexId}`);
    loadPrograms();
});

// Get default complex code (first active complex)
async function getDefaultComplexId() {
    try {
        console.log('🔍 Fetching default complex...');
        const response = await fetch(`${TABLES_ENDPOINT}/complex_settings?limit=100&sort=display_order`);
        const result = await response.json();
        console.log('📦 Complex settings result:', result);
        
        if (result.data && result.data.length > 0) {
            // Find first active complex with valid complex_code
            const validComplex = result.data.find(c => 
                c.is_active && 
                c.complex_code && 
                c.complex_code.length > 2 && 
                c.complex_code !== 't' && 
                c.complex_code !== 'true'
            );
            
            if (validComplex) {
                const complexCode = validComplex.complex_code;
                console.log(`✅ Using complex_code: ${complexCode}`);
                return complexCode;
            }
            
            // Fallback to first complex_code if valid
            const firstCode = result.data[0].complex_code;
            if (firstCode && firstCode.length > 2) {
                console.log(`⚠️ Using first complex_code: ${firstCode}`);
                return firstCode;
            }
        }
    } catch (error) {
        console.error('❌ Error getting default complex:', error);
    }
    console.log('⚠️ Using fallback: cheongju-sk');
    return 'cheongju-sk'; // Fallback default
}

// Load all programs
async function loadPrograms() {
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('emptyState');
    const programsList = document.getElementById('programsList');
    
    try {
        loading.style.display = 'flex';
        emptyState.style.display = 'none';
        programsList.style.display = 'none';
        
        console.log(`🔍 Fetching programs for complex: ${currentComplexId}`);
        
        const response = await fetch(`${TABLES_ENDPOINT}/${TABLE_NAME}?limit=100&sort=display_order`);
        const result = await response.json();
        
        console.log(`📦 Total programs fetched: ${result.data ? result.data.length : 0}`, result.data);
        
        // Filter by current complex
        allPrograms = (result.data || []).filter(p => {
            const match = p.complex_id === currentComplexId;
            console.log(`  - ${p.program_name}: complex_id="${p.complex_id}" ${match ? '✅' : '❌'}`);
            return match;
        });
        
        console.log(`📋 Loaded ${allPrograms.length} programs for complex ${currentComplexId}`, allPrograms);
        
        loading.style.display = 'none';
        updateStats();
        renderPrograms();
        
    } catch (error) {
        console.error('❌ Error loading programs:', error);
        loading.style.display = 'none';
        alert('프로그램을 불러오는데 실패했습니다.');
    }
}

// Update statistics
function updateStats() {
    const active = allPrograms.filter(p => p.is_active).length;
    const inactive = allPrograms.filter(p => !p.is_active).length;
    const total = allPrograms.length;
    
    document.getElementById('activeCount').textContent = active;
    document.getElementById('inactiveCount').textContent = inactive;
    document.getElementById('totalCount').textContent = total;
}

// Render programs list
function renderPrograms() {
    const programsList = document.getElementById('programsList');
    const emptyState = document.getElementById('emptyState');
    
    if (allPrograms.length === 0) {
        emptyState.style.display = 'flex';
        programsList.style.display = 'none';
        return;
    }
    
    programsList.style.display = 'block';
    programsList.innerHTML = allPrograms.map(program => `
        <div class="contract-card program-card ${program.is_active ? '' : 'inactive'}">
            <div class="contract-header">
                <div class="contract-id">
                    <i class="fas fa-clipboard-list"></i>
                    <span style="font-weight: 600; font-size: 16px;">${escapeHtml(program.program_name)}</span>
                    ${program.is_active ? 
                        '<span class="badge approved">활성화</span>' : 
                        '<span class="badge rejected">비활성화</span>'
                    }
                </div>
                <div class="contract-actions">
                    <button class="btn-icon" onclick="openEditModal('${program.id}')" title="수정">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon danger" onclick="deleteProgram('${program.id}')" title="삭제">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            
            <div class="contract-info">
                <div class="info-row">
                    <div class="info-group">
                        <i class="fas fa-tag"></i>
                        <span class="label">프로그램 유형:</span>
                        <span class="value">${escapeHtml(program.program_type)}</span>
                    </div>
                    <div class="info-group">
                        <i class="fas fa-won-sign"></i>
                        <span class="label">월 요금:</span>
                        <span class="value" style="font-weight: 600; color: #3498db;">${formatPrice(program.price)}원</span>
                    </div>
                </div>
                
                <div class="info-row">
                    <div class="info-group">
                        <i class="fas fa-calendar"></i>
                        <span class="label">운영 요일:</span>
                        <span class="value">${escapeHtml(program.schedule_days)}</span>
                    </div>
                    <div class="info-group">
                        <i class="fas fa-clock"></i>
                        <span class="label">운영 시간:</span>
                        <span class="value">${escapeHtml(program.schedule_times)}</span>
                    </div>
                </div>
                
                <div class="info-row">
                    <div class="info-group">
                        <i class="fas fa-users"></i>
                        <span class="label">정원:</span>
                        <span class="value">${program.current_count || 0} / ${program.max_capacity}명</span>
                    </div>
                    <div class="info-group">
                        <i class="fas fa-sort"></i>
                        <span class="label">표시 순서:</span>
                        <span class="value">${program.display_order}</span>
                    </div>
                </div>
                
                ${program.description ? `
                <div class="info-row">
                    <div class="info-group full-width">
                        <i class="fas fa-info-circle"></i>
                        <span class="label">설명:</span>
                        <span class="value">${escapeHtml(program.description)}</span>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Open add modal
function openAddModal() {
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus"></i> 프로그램 추가';
    document.getElementById('programForm').reset();
    document.getElementById('programId').value = '';
    document.getElementById('complexId').value = currentComplexId;
    document.getElementById('displayOrder').value = allPrograms.length + 1;
    document.getElementById('isActive').value = 'true';
    document.getElementById('displayOnInactive').checked = false;
    
    // Uncheck all time slots
    document.querySelectorAll('input[name="timeSlot"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    document.getElementById('programModal').classList.add('active');
}

// Open edit modal
function openEditModal(programId) {
    const program = allPrograms.find(p => p.id === programId);
    if (!program) {
        alert('프로그램을 찾을 수 없습니다.');
        return;
    }
    
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> 프로그램 수정';
    document.getElementById('programId').value = program.id;
    document.getElementById('complexId').value = program.complex_id;
    document.getElementById('programName').value = program.program_name || '';
    document.getElementById('programType').value = program.program_type || '';
    document.getElementById('scheduleDays').value = program.schedule_days || '';
    document.getElementById('scheduleTimes').value = program.schedule_times || '';
    document.getElementById('price').value = program.price || 0;
    document.getElementById('maxCapacity').value = program.max_capacity || 1;
    document.getElementById('description').value = program.description || '';
    document.getElementById('displayOrder').value = program.display_order || 1;
    document.getElementById('isActive').value = program.is_active ? 'true' : 'false';
    document.getElementById('displayOnInactive').checked = program.display_on_inactive || false;
    
    // Pre-select time slots
    const availableSlots = program.available_time_slots || [];
    document.querySelectorAll('input[name="timeSlot"]').forEach(checkbox => {
        checkbox.checked = availableSlots.includes(checkbox.value);
    });
    
    console.log('✏️ Editing program:', program.program_name, 'Time slots:', availableSlots);
    
    document.getElementById('programModal').classList.add('active');
}

// Close modal
function closeModal() {
    document.getElementById('programModal').classList.remove('active');
}

// Save program
async function saveProgram(event) {
    event.preventDefault();
    
    const programId = document.getElementById('programId').value;
    const complexId = document.getElementById('complexId').value;
    
    // Collect selected time slots
    const timeSlotCheckboxes = document.querySelectorAll('input[name="timeSlot"]:checked');
    const availableTimeSlots = Array.from(timeSlotCheckboxes).map(cb => cb.value);
    
    // Validate at least one time slot is selected
    if (availableTimeSlots.length === 0) {
        alert('❌ 최소 하나의 시간대를 선택해야 합니다.');
        return;
    }
    
    const data = {
        complex_id: complexId,
        program_name: document.getElementById('programName').value.trim(),
        program_type: document.getElementById('programType').value,
        schedule_days: document.getElementById('scheduleDays').value.trim(),
        schedule_times: document.getElementById('scheduleTimes').value.trim(),
        available_time_slots: availableTimeSlots,
        price: parseInt(document.getElementById('price').value) || 0,
        max_capacity: parseInt(document.getElementById('maxCapacity').value) || 1,
        current_count: 0, // Initialize to 0
        description: document.getElementById('description').value.trim(),
        display_order: parseInt(document.getElementById('displayOrder').value) || 1,
        is_active: document.getElementById('isActive').value === 'true',
        display_on_inactive: document.getElementById('displayOnInactive').checked
    };
    
    console.log('💾 Program data to save:', data);
    
    try {
        let response;
        
        if (programId) {
            // Update existing program
            console.log('🔄 Updating program:', programId);
            
            // Try PATCH first
            response = await fetch(`${TABLES_ENDPOINT}/${TABLE_NAME}/${programId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                // Fallback to PUT
                const existing = allPrograms.find(p => p.id === programId);
                const mergedData = { ...existing, ...data };
                
                response = await fetch(`${TABLES_ENDPOINT}/${TABLE_NAME}/${programId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mergedData)
                });
            }
        } else {
            // Create new program
            console.log('➕ Creating new program');
            data.created_at = new Date().toISOString();
            
            response = await fetch(`${TABLES_ENDPOINT}/${TABLE_NAME}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }
        
        if (response.ok) {
            console.log('✅ Program saved successfully');
            alert(programId ? '프로그램이 수정되었습니다.' : '프로그램이 추가되었습니다.');
            closeModal();
            loadPrograms();
        } else {
            const errorText = await response.text();
            console.error('❌ Save failed:', response.status, errorText);
            throw new Error(`저장 실패: ${response.status}`);
        }
        
    } catch (error) {
        console.error('💥 Error saving program:', error);
        alert('프로그램 저장에 실패했습니다.\n\n' + error.message);
    }
}

// Delete program
async function deleteProgram(programId) {
    const program = allPrograms.find(p => p.id === programId);
    if (!program) {
        alert('프로그램을 찾을 수 없습니다.');
        return;
    }
    
    if (!confirm(`"${program.program_name}" 프로그램을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
        return;
    }
    
    try {
        console.log('🗑️ Deleting program:', programId);
        
        const response = await fetch(`${TABLES_ENDPOINT}/${TABLE_NAME}/${programId}`, {
            method: 'DELETE'
        });
        
        if (response.ok || response.status === 204) {
            console.log('✅ Program deleted successfully');
            alert('프로그램이 삭제되었습니다.');
            loadPrograms();
        } else {
            throw new Error(`삭제 실패: ${response.status}`);
        }
        
    } catch (error) {
        console.error('💥 Error deleting program:', error);
        alert('프로그램 삭제에 실패했습니다.\n\n' + error.message);
    }
}

// Format price
function formatPrice(price) {
    return new Intl.NumberFormat('ko-KR').format(price || 0);
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
