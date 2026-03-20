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
        
        const response = await fetch(`/tables/pilates_contracts?sort=-created_at&limit=1000`);
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
    const pending = allContracts.filter(c => c.status === '대기중' || c.status === 'pending').length;
    const approved = allContracts.filter(c => c.status === 'approved' || c.status === '승인').length;
    const rejected = allContracts.filter(c => c.status === '거부' || c.status === 'rejected').length;
    const total = allContracts.length;
    
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('approvedCount').textContent = approved;
    document.getElementById('rejectedCount').textContent = rejected;
    document.getElementById('totalCount').textContent = total;
}

// Filter contracts
function filterContracts() {
    const statusFilter = document.getElementById('statusFilter').value;
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    
    filteredContracts = allContracts.filter(contract => {
        const statusMatch = statusFilter === 'all' || contract.status === statusFilter;
        const searchMatch = searchInput === '' || 
            contract.name.toLowerCase().includes(searchInput) ||
            contract.dong.toLowerCase().includes(searchInput) ||
            contract.ho.toLowerCase().includes(searchInput) ||
            contract.phone.includes(searchInput);
        
        return statusMatch && searchMatch;
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
    
    const statusClass = contract.status === '대기중' ? 'pending' : 
                       contract.status === '승인' ? 'approved' : 'rejected';
    
    return `
        <div class="contract-item">
            <div class="contract-header">
                <div class="contract-title">
                    <h3>${escapeHtml(contract.name)}</h3>
                    <span class="status-badge ${statusClass}">${contract.status}</span>
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
                    <span><strong>레슨:</strong> ${escapeHtml(contract.lesson_type)}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-calendar"></i>
                    <span><strong>결제일:</strong> ${escapeHtml(contract.payment_date)}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-clock"></i>
                    <span><strong>신청일:</strong> ${date}</span>
                </div>
            </div>
            <div class="contract-actions">
                <button class="btn btn-view" onclick="viewDetail('${contract.id}')">
                    <i class="fas fa-eye"></i> 상세보기
                </button>
                ${contract.status === '대기중' ? `
                    <button class="btn btn-approve" onclick="updateStatus('${contract.id}', '승인')">
                        <i class="fas fa-check"></i> 승인
                    </button>
                    <button class="btn btn-reject" onclick="updateStatus('${contract.id}', '거부')">
                        <i class="fas fa-times"></i> 거부
                    </button>
                ` : ''}
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
                    <label>레슨 유형</label>
                    <p>${escapeHtml(contract.lesson_type)}</p>
                </div>
                <div class="detail-item">
                    <label>주당 레슨 횟수</label>
                    <p>${escapeHtml(contract.lesson_count)}</p>
                </div>
                <div class="detail-item">
                    <label>시작 희망일</label>
                    <p>${contract.start_date}</p>
                </div>
                <div class="detail-item">
                    <label>선호 시간대</label>
                    <p>${escapeHtml(contract.preferred_time)}</p>
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3><i class="fas fa-credit-card"></i> 결제 정보</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <label>매월 결제일</label>
                    <p>${escapeHtml(contract.payment_date)}</p>
                </div>
                <div class="detail-item">
                    <label>개인정보 동의</label>
                    <p>${contract.agreement ? '✓ 동의함' : '✗ 동의하지 않음'}</p>
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3><i class="fas fa-info-circle"></i> 처리 정보</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <label>처리 상태</label>
                    <p><strong>${contract.status}</strong></p>
                </div>
                <div class="detail-item">
                    <label>신청 일시</label>
                    <p>${new Date(contract.created_at).toLocaleString('ko-KR')}</p>
                </div>
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
        const response = await fetch(`/tables/pilates_contracts/${contractId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: newStatus
            })
        });
        
        if (response.ok) {
            alert(`신청이 ${newStatus} 처리되었습니다.`);
            await loadContracts();
        } else {
            throw new Error('Failed to update status');
        }
    } catch (error) {
        console.error('Error updating status:', error);
        alert('상태 업데이트에 실패했습니다. 다시 시도해주세요.');
    }
}

// Export to CSV
function exportToCSV() {
    if (filteredContracts.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
    }
    
    const headers = ['신청일시', '상태', '동', '호수', '이름', '전화번호', '레슨유형', '주당횟수', '시작희망일', '선호시간', '결제일'];
    
    const rows = filteredContracts.map(contract => [
        new Date(contract.created_at).toLocaleString('ko-KR'),
        contract.status,
        contract.dong,
        contract.ho,
        contract.name,
        contract.phone,
        contract.lesson_type,
        contract.lesson_count,
        contract.start_date,
        contract.preferred_time,
        contract.payment_date
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
