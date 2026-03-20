// Configuration
// 같은 도메인의 루트 경로 사용 (상대 경로)
const TABLES_ENDPOINT = '../tables'; // 부모 디렉토리의 tables API

// State Management
let allContracts = [];
let filteredContracts = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadContracts();
});
// Load all contracts
async function loadContracts() {
    const listContainer = document.getElementById('contractsList');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const emptyState = document.getElementById('emptyState');
    
    try {
        loadingSpinner.style.display = 'block';
        listContainer.style.display = 'none';
        emptyState.style.display = 'none';
        
        const response = await fetch(`tables/pilates_contracts?sort=-created_at&limit=1000`);
        const result = await response.json();
        
        allContracts = result.data || [];
        
        loadingSpinner.style.display = 'none';
        
        updateStats();
        filterContracts();
        
    } catch (error) {
        console.error('Error loading contracts:', error);
        loadingSpinner.style.display = 'none';
        listContainer.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>데이터를 불러오는데 실패했습니다.</p></div>';
        listContainer.style.display = 'block';
    }
}

// Update statistics
function updateStats() {
    const pending = allContracts.filter(c => c.status === 'pending').length;
    const approved = allContracts.filter(c => c.status === 'approved').length;
    const rejected = allContracts.filter(c => c.status === 'rejected').length;
    const total = allContracts.length;
    
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('approvedCount').textContent = approved;
    document.getElementById('rejectedCount').textContent = rejected;
    document.getElementById('totalCount').textContent = total;
}

// Status mapping: 한글 ↔ 영문
const STATUS_MAP = {
    '대기중': 'pending',
    '승인': 'approved',
    '거부': 'rejected',
    'pending': '대기중',
    'approved': '승인',
    'rejected': '거부'
};

// Filter contracts
function filterContracts() {
    const statusFilter = document.getElementById('statusFilter').value;
    const programFilter = document.getElementById('programFilter').value;
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    
    filteredContracts = allContracts.filter(contract => {
        // 한글 필터를 영문으로 변환하여 비교
        const statusFilterEn = statusFilter === 'all' ? 'all' : (STATUS_MAP[statusFilter] || statusFilter);
        const statusMatch = statusFilterEn === 'all' || contract.status === statusFilterEn;
        const programMatch = programFilter === 'all' || contract.lesson_type === programFilter;
        const searchMatch = searchInput === '' || 
            contract.name.toLowerCase().includes(searchInput) ||
            contract.dong.toLowerCase().includes(searchInput) ||
            contract.ho.toLowerCase().includes(searchInput) ||
            contract.phone.includes(searchInput);
        
        return statusMatch && programMatch && searchMatch;
    });
    
    renderContracts();
}

// Render contracts list
function renderContracts() {
    const listContainer = document.getElementById('contractsList');
    const emptyState = document.getElementById('emptyState');
    
    if (filteredContracts.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    listContainer.style.display = 'grid';
    emptyState.style.display = 'none';
    
    const html = filteredContracts.map(contract => createContractHTML(contract)).join('');
    listContainer.innerHTML = html;
}

// Create HTML for a single contract
function createContractHTML(contract) {
    const date = new Date(contract.created_at).toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // DB의 영문 상태를 한글로 변환
    const statusKo = STATUS_MAP[contract.status] || contract.status;
    const statusClass = contract.status === 'pending' ? 'pending' : 
                       contract.status === 'approved' ? 'approved' : 'rejected';
    
    return `
        <div class="contract-item">
            <div class="contract-header">
                <div class="contract-title">
                    <h3>${escapeHtml(contract.name)}</h3>
                    <span class="status-badge ${statusClass}">${statusKo}</span>
                </div>
            </div>
            <div class="contract-info">
                <div class="info-item">
                    <i class="fas fa-home"></i>
                    <span><strong>주소:</strong> ${escapeHtml(contract.dong)} ${escapeHtml(contract.ho)}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-phone"></i>
                    <span><strong>전화:</strong> ${escapeHtml(contract.phone)}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-dumbbell"></i>
                    <span><strong>프로그램:</strong> ${escapeHtml(contract.lesson_type || '-')}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-clock"></i>
                    <span><strong>희망시간:</strong> ${escapeHtml(contract.preferred_time || '-')}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-calendar"></i>
                    <span><strong>신청일:</strong> ${date}</span>
                </div>
            </div>
            <div class="contract-actions">
                <button class="btn btn-view" onclick="viewDetail('${contract.id}')">
                    <i class="fas fa-eye"></i> 상세보기
                </button>
                ${contract.status === 'pending' ? `
                    <button class="btn btn-approve" onclick="updateStatus('${contract.id}', 'approved')">
                        <i class="fas fa-check"></i> 승인
                    </button>
                    <button class="btn btn-reject" onclick="updateStatus('${contract.id}', 'rejected')">
                        <i class="fas fa-times"></i> 거부
                    </button>
                ` : ''}
                <button class="btn btn-danger" onclick="deleteContract('${contract.id}')" style="margin-left: auto;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

// View contract detail
function viewDetail(contractId) {
    const contract = allContracts.find(c => c.id === contractId);
    if (!contract) return;
    
    const detailContent = `
        <div class="detail-section">
            <h3><i class="fas fa-user"></i> 신청자 정보</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <label>이름</label>
                    <p>${escapeHtml(contract.name)}</p>
                </div>
                <div class="detail-item">
                    <label>동</label>
                    <p>${escapeHtml(contract.dong)}</p>
                </div>
                <div class="detail-item">
                    <label>호수</label>
                    <p>${escapeHtml(contract.ho)}</p>
                </div>
                <div class="detail-item">
                    <label>전화번호</label>
                    <p>${escapeHtml(contract.phone)}</p>
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3><i class="fas fa-dumbbell"></i> 레슨 정보</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <label>프로그램 종류</label>
                    <p>${escapeHtml(contract.lesson_type || '-')}</p>
                </div>
                <div class="detail-item" style="grid-column: 1 / -1;">
                    <label>희망 시간대</label>
                    ${(contract.lesson_type === '2:1 듀엣레슨' || contract.lesson_type === '1:1 개인레슨') 
                        ? `<div style="white-space: pre-wrap; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">${escapeHtml(contract.preferred_time || '-')}</div>`
                        : `<p>${escapeHtml(contract.preferred_time || '-')}</p>`
                    }
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3><i class="fas fa-pen-fancy"></i> 서명 정보</h3>
            <div class="detail-grid">
                <div class="detail-item" style="grid-column: 1 / -1;">
                    <label>서명 이미지</label>
                    ${contract.signature_image ? 
                        `<img src="${contract.signature_image}" alt="서명" style="max-width: 400px; border: 2px solid #e2e8f0; border-radius: 8px; padding: 10px; background: white;">` 
                        : '<p class="text-gray-500">서명 없음</p>'}
                </div>
                <div class="detail-item">
                    <label>서명자명</label>
                    <p>${escapeHtml(contract.signature || '-')}</p>
                </div>
                <div class="detail-item">
                    <label>서명 일자</label>
                    <p>${contract.signature_date || '-'}</p>
                </div>
                <div class="detail-item">
                    <label>약관 동의</label>
                    <p>${contract.terms_agreement ? '✓ 동의함' : '✗ 동의하지 않음'}</p>
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3><i class="fas fa-info-circle"></i> 처리 정보</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <label>처리 상태</label>
                    <p><strong class="status-${contract.status}">${contract.status}</strong></p>
                </div>
                <div class="detail-item">
                    <label>신청 일시</label>
                    <p>${new Date(contract.created_at).toLocaleString('ko-KR')}</p>
                </div>
            </div>
        </div>
        
        <div class="detail-section" style="border: none; padding-top: 20px;">
            <div class="action-buttons">
                ${contract.status === '대기중' ? `
                    <button class="btn btn-primary" onclick="updateStatus('${contract.id}', '승인')">
                        <i class="fas fa-check"></i> 승인
                    </button>
                    <button class="btn btn-danger" onclick="updateStatus('${contract.id}', '거부')">
                        <i class="fas fa-times"></i> 거부
                    </button>
                ` : ''}
                <button class="btn btn-secondary" onclick="openEditModal('${contract.id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-danger" onclick="deleteContract('${contract.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('detailContent').innerHTML = detailContent;
    document.getElementById('detailModal').classList.add('active');
}

// Close detail modal
function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('active');
}

// Update contract status
async function updateStatus(contractId, newStatus) {
    const confirmMessage = newStatus === '승인' 
        ? '이 신청을 승인하시겠습니까?' 
        : '이 신청을 거부하시겠습니까?';
    
    if (!confirm(confirmMessage)) return;
    
    try {
        console.log('🔄 Updating contract status:', contractId, '→', newStatus);
        
        // Find the contract in the already loaded data
        const contract = allContracts.find(c => c.id === contractId);
        if (!contract) {
            throw new Error('Contract not found in loaded data');
        }
        
        console.log('📋 Found contract:', contract);
        
        // Try PATCH method (only send changed fields)
        console.log('🔧 Attempting PATCH request...');
        
        const patchData = {
            status: newStatus
        };
        
        const patchResponse = await fetch(`tables/pilates_contracts/${contractId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(patchData)
        });
        
        console.log('📡 PATCH Response:', patchResponse.status, patchResponse.statusText);
        
        if (patchResponse.ok) {
            const result = await patchResponse.json();
            console.log('✅ Status updated successfully:', result);
            alert(`신청이 ${newStatus} 처리되었습니다.`);
            closeDetailModal();
            await loadContracts();
            return;
        }
        
        // If PATCH failed, try PUT with full data
        console.log('⚠️ PATCH failed, trying PUT with full data...');
        
        const updatedData = {
            ...contract,
            status: newStatus
        };
        
        // Remove system fields
        delete updatedData.gs_project_id;
        delete updatedData.gs_table_name;
        delete updatedData.updated_at;
        
        const putResponse = await fetch(`tables/pilates_contracts/${contractId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
        });
        
        console.log('📡 PUT Response:', putResponse.status, putResponse.statusText);
        
        if (putResponse.ok) {
            const result = await putResponse.json();
            console.log('✅ Status updated successfully:', result);
            alert(`신청이 ${newStatus} 처리되었습니다.`);
            closeDetailModal();
            await loadContracts();
            return;
        }
        
        // If both failed, try DELETE + POST
        console.log('⚠️ PUT also failed, trying DELETE + POST...');
        
        const deleteResponse = await fetch(`tables/pilates_contracts/${contractId}`, {
            method: 'DELETE'
        });
        
        console.log('📡 DELETE Response:', deleteResponse.status, deleteResponse.statusText);
        
        if (!deleteResponse.ok && deleteResponse.status !== 204) {
            throw new Error(`All update methods failed. Last error: ${deleteResponse.status}`);
        }
        
        console.log('✅ Old record deleted, creating new one...');
        
        const newData = {
            ...contract,
            status: newStatus,
            id: contractId
        };
        
        delete newData.gs_project_id;
        delete newData.gs_table_name;
        delete newData.updated_at;
        
        const postResponse = await fetch('tables/pilates_contracts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newData)
        });
        
        console.log('📡 POST Response:', postResponse.status, postResponse.statusText);
        
        if (postResponse.ok) {
            const result = await postResponse.json();
            console.log('✅ Status updated successfully via DELETE+POST:', result);
            alert(`신청이 ${newStatus} 처리되었습니다.`);
            closeDetailModal();
            await loadContracts();
        } else {
            const errorText = await postResponse.text();
            console.error('❌ POST failed:', postResponse.status, errorText);
            throw new Error(`Failed to recreate record: ${postResponse.status}`);
        }
        
    } catch (error) {
        console.error('💥 Error updating status:', error);
        alert('상태 업데이트에 실패했습니다.\n\n에러: ' + error.message + '\n\n관리자에게 문의하세요.');
    }
}

// Export to CSV
function exportToCSV() {
    if (filteredContracts.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
    }
    
    const headers = ['신청일시', '상태', '동', '호수', '이름', '전화번호', '프로그램종류', '희망시간대', '서명자명', '서명일자'];
    
    const rows = filteredContracts.map(contract => [
        new Date(contract.created_at).toLocaleString('ko-KR'),
        contract.status,
        contract.dong,
        contract.ho,
        contract.name,
        contract.phone,
        contract.lesson_type || '-',
        contract.preferred_time || '-',
        contract.signature || '-',
        contract.signature_date || '-'
    ]);
    
    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += headers.join(',') + '\n';
    
    rows.forEach(row => {
        csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `필라테스신청_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// ===== EDIT & DELETE FUNCTIONS =====

// Open edit modal
function openEditModal(contractId) {
    const contract = allContracts.find(c => c.id === contractId);
    if (!contract) return;
    
    // Populate form fields
    document.getElementById('editContractId').value = contract.id;
    document.getElementById('editDong').value = contract.dong || '';
    document.getElementById('editHo').value = contract.ho || '';
    document.getElementById('editName').value = contract.name || '';
    document.getElementById('editPhone').value = contract.phone || '';
    document.getElementById('editLessonType').value = contract.lesson_type || '';
    document.getElementById('editStatus').value = contract.status || '대기중';
    
    // 프로그램에 따라 시간대 입력 방식 전환
    const isPersonal = contract.lesson_type === '2:1 듀엣레슨' || contract.lesson_type === '1:1 개인레슨';
    
    if (isPersonal) {
        document.getElementById('editTimeSelectGroup').style.display = 'none';
        document.getElementById('editTimeTextGroup').style.display = 'block';
        document.getElementById('editPreferredTimeText').value = contract.preferred_time || '';
        document.getElementById('editPreferredTime').required = false;
        document.getElementById('editPreferredTimeText').required = true;
    } else {
        document.getElementById('editTimeSelectGroup').style.display = 'block';
        document.getElementById('editTimeTextGroup').style.display = 'none';
        document.getElementById('editPreferredTime').value = contract.preferred_time || '';
        document.getElementById('editPreferredTime').required = true;
        document.getElementById('editPreferredTimeText').required = false;
    }
    
    // Close detail modal and open edit modal
    closeDetailModal();
    document.getElementById('editModal').classList.add('active');
}

// Toggle edit time input based on program type
function toggleEditTimeInput() {
    const lessonType = document.getElementById('editLessonType').value;
    const isPersonal = lessonType === '2:1 듀엣레슨' || lessonType === '1:1 개인레슨';
    
    if (isPersonal) {
        document.getElementById('editTimeSelectGroup').style.display = 'none';
        document.getElementById('editTimeTextGroup').style.display = 'block';
        document.getElementById('editPreferredTime').required = false;
        document.getElementById('editPreferredTimeText').required = true;
    } else {
        document.getElementById('editTimeSelectGroup').style.display = 'block';
        document.getElementById('editTimeTextGroup').style.display = 'none';
        document.getElementById('editPreferredTime').required = true;
        document.getElementById('editPreferredTimeText').required = false;
    }
}

// Close edit modal
function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    document.getElementById('editForm').reset();
}

// Save edited contract
async function saveEditedContract() {
    const contractId = document.getElementById('editContractId').value;
    const contract = allContracts.find(c => c.id === contractId);
    
    if (!contract) {
        alert('계약서를 찾을 수 없습니다.');
        return;
    }
    
    // Get lesson type to determine which time input to use
    const lessonType = document.getElementById('editLessonType').value;
    const isPersonal = lessonType === '2:1 듀엣레슨' || lessonType === '1:1 개인레슨';
    
    // Get updated values
    const updatedData = {
        ...contract,
        dong: document.getElementById('editDong').value.trim(),
        ho: document.getElementById('editHo').value.trim(),
        name: document.getElementById('editName').value.trim(),
        phone: document.getElementById('editPhone').value.trim(),
        lesson_type: lessonType,
        preferred_time: isPersonal 
            ? document.getElementById('editPreferredTimeText').value.trim()
            : document.getElementById('editPreferredTime').value,
        status: document.getElementById('editStatus').value
    };
    
    // Validate required fields
    if (!updatedData.dong || !updatedData.ho || !updatedData.name || !updatedData.phone) {
        alert('필수 항목을 모두 입력해주세요.');
        return;
    }
    
    if (!confirm('수정 내용을 저장하시겠습니까?')) {
        return;
    }
    
    try {
        console.log('🔄 Updating contract:', contractId);
        
        // Remove system fields
        delete updatedData.gs_project_id;
        delete updatedData.gs_table_name;
        delete updatedData.updated_at;
        
        // Try PATCH first
        console.log('🔧 Attempting PATCH...');
        let response = await fetch(`tables/pilates_contracts/${contractId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        
        if (!response.ok) {
            console.log('⚠️ PATCH failed, trying DELETE + POST...');
            
            // Delete old record
            await fetch(`tables/pilates_contracts/${contractId}`, {
                method: 'DELETE'
            });
            
            // Create new record
            response = await fetch('tables/pilates_contracts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
        }
        
        if (response.ok) {
            console.log('✅ Contract updated successfully');
            alert('수정되었습니다.');
            closeEditModal();
            await loadContracts();
        } else {
            throw new Error('Failed to update contract');
        }
        
    } catch (error) {
        console.error('💥 Error updating contract:', error);
        alert('수정에 실패했습니다.\n\n' + error.message);
    }
}

// Delete contract
async function deleteContract(contractId) {
    const contract = allContracts.find(c => c.id === contractId);
    if (!contract) return;
    
    const confirmMsg = `다음 신청서를 삭제하시겠습니까?\n\n이름: ${contract.name}\n동/호: ${contract.dong} ${contract.ho}\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`;
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    try {
        console.log('🗑️ Deleting contract:', contractId);
        
        const response = await fetch(`tables/pilates_contracts/${contractId}`, {
            method: 'DELETE'
        });
        
        if (response.ok || response.status === 204) {
            console.log('✅ Contract deleted successfully');
            alert('삭제되었습니다.');
            closeDetailModal();
            await loadContracts();
        } else {
            const errorText = await response.text();
            console.error('❌ Delete failed:', response.status, errorText);
            throw new Error(`Failed to delete: ${response.status}`);
        }
        
    } catch (error) {
        console.error('💥 Error deleting contract:', error);
        alert('삭제에 실패했습니다.\n\n' + error.message);
    }
}

// ===== DUPLICATE CHECK FUNCTIONS =====

// Find and show duplicate applicants
function showDuplicates() {
    console.log('🔍 Checking for duplicates...');
    
    // Group by name + phone
    const groupedByPerson = {};
    
    allContracts.forEach(contract => {
        const key = `${contract.name}_${contract.phone}`.toLowerCase().trim();
        
        if (!groupedByPerson[key]) {
            groupedByPerson[key] = [];
        }
        groupedByPerson[key].push(contract);
    });
    
    // Find duplicates (groups with more than 1 entry)
    const duplicates = Object.entries(groupedByPerson)
        .filter(([key, contracts]) => contracts.length > 1)
        .map(([key, contracts]) => ({
            name: contracts[0].name,
            phone: contracts[0].phone,
            contracts: contracts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        }));
    
    console.log(`📊 Found ${duplicates.length} duplicate person(s)`);
    
    if (duplicates.length === 0) {
        alert('✅ 중복된 신청이 없습니다.');
        return;
    }
    
    displayDuplicates(duplicates);
}

// Display duplicates in modal
function displayDuplicates(duplicates) {
    const content = document.getElementById('duplicateContent');
    
    let html = `
        <div style="margin-bottom: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <i class="fas fa-exclamation-triangle" style="color: #ff9800;"></i>
            <strong>총 ${duplicates.length}명의 중복 신청자가 발견되었습니다.</strong>
            <p style="margin-top: 8px; color: #666; font-size: 0.9rem;">
                동일한 이름과 전화번호로 여러 건의 신청이 있는 경우입니다.
            </p>
        </div>
    `;
    
    duplicates.forEach((dup, index) => {
        html += `
            <div style="margin-bottom: 25px; padding: 20px; background: white; border: 2px solid #e0e0e0; border-radius: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #f0f0f0;">
                    <div>
                        <h3 style="margin: 0; color: #333;">
                            <i class="fas fa-user" style="color: #667eea;"></i> 
                            ${escapeHtml(dup.name)}
                        </h3>
                        <p style="margin: 5px 0 0 0; color: #666; font-size: 0.9rem;">
                            <i class="fas fa-phone"></i> ${escapeHtml(dup.phone)}
                        </p>
                    </div>
                    <div style="background: #ff5252; color: white; padding: 8px 15px; border-radius: 20px; font-weight: bold;">
                        ${dup.contracts.length}건 중복
                    </div>
                </div>
                
                <div style="display: grid; gap: 10px;">
        `;
        
        dup.contracts.forEach((contract, idx) => {
            const statusColor = 
                contract.status === '승인' ? '#4caf50' : 
                contract.status === '거부' ? '#f44336' : '#ff9800';
            
            const date = new Date(contract.created_at).toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f9f9f9; border-radius: 8px; border-left: 4px solid ${statusColor};">
                    <div style="flex: 1;">
                        <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
                            <span style="font-weight: 600;">
                                <i class="fas fa-building"></i> ${escapeHtml(contract.dong)} ${escapeHtml(contract.ho)}
                            </span>
                            <span style="color: #666;">
                                <i class="fas fa-dumbbell"></i> ${escapeHtml(contract.lesson_type || '-')}
                            </span>
                            <span style="color: #666;">
                                <i class="fas fa-clock"></i> ${escapeHtml(contract.preferred_time || '-')}
                            </span>
                        </div>
                        <div style="margin-top: 5px; font-size: 0.85rem; color: #999;">
                            <i class="fas fa-calendar"></i> ${date}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span style="padding: 5px 12px; background: ${statusColor}; color: white; border-radius: 15px; font-size: 0.85rem; font-weight: 600;">
                            ${escapeHtml(contract.status)}
                        </span>
                        <button 
                            onclick="viewDetailFromDuplicate('${contract.id}')" 
                            style="padding: 6px 12px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem;"
                            title="상세보기">
                            <i class="fas fa-eye"></i> 상세
                        </button>
                        <button 
                            onclick="deleteFromDuplicate('${contract.id}')" 
                            style="padding: 6px 12px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem;"
                            title="삭제">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    content.innerHTML = html;
    document.getElementById('duplicateModal').style.display = 'flex';
}

// Close duplicate modal
function closeDuplicateModal() {
    document.getElementById('duplicateModal').style.display = 'none';
}

// View detail from duplicate modal
function viewDetailFromDuplicate(contractId) {
    closeDuplicateModal();
    viewDetail(contractId);
}

// Delete from duplicate modal
async function deleteFromDuplicate(contractId) {
    await deleteContract(contractId);
    // Refresh duplicate check
    setTimeout(() => showDuplicates(), 500);
}
