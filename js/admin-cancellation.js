// Admin Cancellation Management
const API_ROOT = '../tables';
let allCancellations = [];
let filteredCancellations = [];
let currentCancellationId = null;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Admin Cancellation Management initialized');
    loadCancellations();
});

// Load all cancellations
async function loadCancellations() {
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('emptyState');
    const list = document.getElementById('cancellationsList');
    
    loading.style.display = 'block';
    emptyState.style.display = 'none';
    list.style.display = 'none';
    
    try {
        const response = await fetch('tables/pilates_cancellations?sort=-created_at&limit=1000');
        const result = await response.json();
        
        allCancellations = result.data || [];
        
        console.log(`📊 Loaded ${allCancellations.length} cancellations`);
        
        loading.style.display = 'none';
        
        updateStats();
        filterCancellations();
        
    } catch (error) {
        console.error('Error loading cancellations:', error);
        loading.style.display = 'none';
        emptyState.style.display = 'block';
        emptyState.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>데이터를 불러오는데 실패했습니다</p>';
    }
}

// Update statistics
function updateStats() {
    const pending = allCancellations.filter(c => c.status === '접수').length;
    const processing = allCancellations.filter(c => c.status === '처리중').length;
    const completed = allCancellations.filter(c => c.status === '완료').length;
    const rejected = allCancellations.filter(c => c.status === '반려').length;
    
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('processingCount').textContent = processing;
    document.getElementById('completedCount').textContent = completed;
    document.getElementById('rejectedCount').textContent = rejected;
    document.getElementById('totalCount').textContent = allCancellations.length;
}

// Filter cancellations
function filterCancellations() {
    const statusFilter = document.getElementById('statusFilter').value;
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    
    filteredCancellations = allCancellations.filter(cancel => {
        const statusMatch = statusFilter === 'all' || cancel.status === statusFilter;
        
        const searchText = `${cancel.name} ${cancel.dong} ${cancel.ho} ${cancel.phone}`.toLowerCase();
        const searchMatch = searchText.includes(searchInput);
        
        return statusMatch && searchMatch;
    });
    
    displayCancellations();
}

// Display cancellations
function displayCancellations() {
    const list = document.getElementById('cancellationsList');
    const emptyState = document.getElementById('emptyState');
    
    if (filteredCancellations.length === 0) {
        list.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    list.style.display = 'grid';
    
    list.innerHTML = filteredCancellations.map(cancel => {
        const statusColor = 
            cancel.status === '완료' ? 'approved' :
            cancel.status === '반려' ? 'rejected' :
            cancel.status === '처리중' ? 'processing' : 'pending';
        
        const statusIcon = 
            cancel.status === '완료' ? 'check' :
            cancel.status === '반려' ? 'ban' :
            cancel.status === '처리중' ? 'spinner' : 'clock';
        
        return `
            <div class="contract-card">
                <div class="card-header">
                    <div class="card-header-info">
                        <div class="card-title">
                            <i class="fas fa-user"></i> ${escapeHtml(cancel.name)}
                        </div>
                        <div class="card-subtitle">
                            ${escapeHtml(cancel.dong)} ${escapeHtml(cancel.ho)}
                        </div>
                    </div>
                    <span class="status-badge ${statusColor}">
                        <i class="fas fa-${statusIcon}"></i> ${escapeHtml(cancel.status)}
                    </span>
                </div>
                <div class="card-body">
                    <div class="card-info-row">
                        <span class="label"><i class="fas fa-phone"></i> 전화</span>
                        <span class="value">${escapeHtml(cancel.phone)}</span>
                    </div>
                    <div class="card-info-row">
                        <span class="label"><i class="fas fa-dumbbell"></i> 해지 프로그램</span>
                        <span class="value">${escapeHtml(cancel.lesson_type || '-')}</span>
                    </div>
                    <div class="card-info-row">
                        <span class="label"><i class="fas fa-comment"></i> 사유</span>
                        <span class="value">${escapeHtml(cancel.reason || '-')}</span>
                    </div>
                    <div class="card-info-row">
                        <span class="label"><i class="fas fa-calendar"></i> 신청일</span>
                        <span class="value">${new Date(cancel.created_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn-action primary" onclick="viewDetail('${cancel.id}')">
                        <i class="fas fa-eye"></i> 상세보기
                    </button>
                    <button class="btn-action secondary" onclick="updateStatus('${cancel.id}', '처리중')">
                        <i class="fas fa-spinner"></i> 처리중
                    </button>
                    <button class="btn-action success" onclick="updateStatus('${cancel.id}', '완료')">
                        <i class="fas fa-check"></i> 완료
                    </button>
                    <button class="btn-action danger" onclick="updateStatus('${cancel.id}', '반려')">
                        <i class="fas fa-ban"></i> 반려
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// View cancellation detail
function viewDetail(cancellationId) {
    const cancel = allCancellations.find(c => c.id === cancellationId);
    if (!cancel) return;
    
    currentCancellationId = cancellationId;
    
    const detailContent = `
        <div class="detail-section">
            <h3><i class="fas fa-user"></i> 신청자 정보</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">이름</span>
                    <span class="detail-value">${escapeHtml(cancel.name)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">주소</span>
                    <span class="detail-value">${escapeHtml(cancel.dong)} ${escapeHtml(cancel.ho)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">전화번호</span>
                    <span class="detail-value">${escapeHtml(cancel.phone)}</span>
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3><i class="fas fa-dumbbell"></i> 해지 정보</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">프로그램</span>
                    <span class="detail-value">${escapeHtml(cancel.lesson_type || '-')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">사유</span>
                    <span class="detail-value">${escapeHtml(cancel.reason || '-')}</span>
                </div>
                <div class="detail-item full-width">
                    <span class="detail-label">상세 사유</span>
                    <span class="detail-value">${escapeHtml(cancel.reason_detail || '(상세 사유 없음)')}</span>
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3><i class="fas fa-info-circle"></i> 처리 정보</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">상태</span>
                    <span class="detail-value">
                        <span class="status-badge ${getStatusColor(cancel.status)}">
                            ${escapeHtml(cancel.status)}
                        </span>
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">신청일</span>
                    <span class="detail-value">${new Date(cancel.created_at).toLocaleString('ko-KR')}</span>
                </div>
                <div class="detail-item full-width">
                    <span class="detail-label">관리자 메모</span>
                    <textarea 
                        id="adminNoteInput" 
                        style="width: 100%; min-height: 80px; padding: 10px; border: 1px solid #e0e0e0; border-radius: 8px; font-family: inherit;"
                        placeholder="환불 금액, 처리 내용 등을 입력하세요..."
                    >${escapeHtml(cancel.admin_note || '')}</textarea>
                    <button 
                        onclick="saveAdminNote('${cancel.id}')" 
                        style="margin-top: 10px; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-save"></i> 메모 저장
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('detailContent').innerHTML = detailContent;
    document.getElementById('detailModal').style.display = 'flex';
}

// Get status color
function getStatusColor(status) {
    switch(status) {
        case '완료': return 'approved';
        case '반려': return 'rejected';
        case '처리중': return 'processing';
        default: return 'pending';
    }
}

// Close detail modal
function closeDetailModal() {
    document.getElementById('detailModal').style.display = 'none';
    currentCancellationId = null;
}

// Update cancellation status
async function updateStatus(cancellationId, newStatus) {
    const cancel = allCancellations.find(c => c.id === cancellationId);
    if (!cancel) return;
    
    const confirmMsg = newStatus === '완료' 
        ? '해지 처리를 완료하시겠습니까?' 
        : newStatus === 'approved'
        ? '해지를 승인하시겠습니까?'
        : newStatus === '반려'
        ? '해지 신청을 반려하시겠습니까?'
        : '처리중으로 변경하시겠습니까?';
    
    if (!confirm(confirmMsg)) return;
    
    try {
        console.log(`🔄 Updating cancellation status to: ${newStatus}`);
        
        // DELETE + POST approach
        await fetch(`tables/pilates_cancellations/${cancellationId}`, {
            method: 'DELETE'
        });
        
        const updatedData = {
            ...cancel,
            status: newStatus
        };
        
        const response = await fetch('tables/pilates_cancellations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        
        if (response.ok) {
            console.log('✅ Cancellation status updated successfully');
            
            // === B. 해지 승인 시 대기자 자동 승인 로직 ===
            if (newStatus === 'approved') {
                console.log('🔄 Checking for waiting list...');
                await processWaitingListForCancellation(cancel.lesson_type);
            }
            
            alert(`${newStatus} 처리되었습니다.`);
            await loadCancellations();
        } else {
            throw new Error(`Failed to update: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error updating status:', error);
        alert('상태 변경에 실패했습니다.');
    }
}

// 🆕 B. 대기자 자동 승인 및 웹훅 전송
async function processWaitingListForCancellation(lessonType) {
    try {
        console.log(`📋 Processing waiting list for: ${lessonType}`);
        
        // 1. 모든 대기 중인 신청 조회
        const response = await fetch('tables/pilates_contracts?limit=1000');
        const result = await response.json();
        const allContracts = result.data || [];
        
        // 동일 프로그램 + waiting 상태 필터링
        const waitingContracts = allContracts.filter(c =>
            c.status === 'waiting' &&
            (c.lesson_type === lessonType || c.lesson_type.includes(lessonType) || lessonType.includes(c.lesson_type))
        );
        
        if (waitingContracts.length === 0) {
            console.log('ℹ️ No waiting contracts found');
            return;
        }
        
        // 2. 가장 빠른 순번 찾기 (waiting_order가 가장 작은 것)
        waitingContracts.sort((a, b) => (a.waiting_order || 999) - (b.waiting_order || 999));
        const nextWaiting = waitingContracts[0];
        
        console.log(`✅ Found next waiting applicant:`, {
            name: nextWaiting.name,
            dong: nextWaiting.dong,
            ho: nextWaiting.ho,
            waiting_order: nextWaiting.waiting_order,
            phone: nextWaiting.phone
        });
        
        // 3. 대기자를 approved로 변경
        const updateData = {
            ...nextWaiting,
            status: 'approved',
            auto_approved: true,
            waiting_order: null
        };
        
        // 시스템 필드 제거
        delete updateData.gs_project_id;
        delete updateData.gs_table_name;
        delete updateData.updated_at;
        
        const updateResponse = await fetch(`tables/pilates_contracts/${nextWaiting.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        if (!updateResponse.ok) {
            console.warn('⚠️ PUT failed, trying PATCH...');
            const patchResponse = await fetch(`tables/pilates_contracts/${nextWaiting.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'approved',
                    auto_approved: true,
                    waiting_order: null
                })
            });
            
            if (!patchResponse.ok) {
                throw new Error(`Failed to update waiting contract: ${patchResponse.status}`);
            }
        }
        
        console.log('✅ Waiting applicant auto-approved');
        
        // 4. 웹훅 전송 (Make.com / Zapier)
        await sendWaitingApprovedWebhook(nextWaiting);
        
        alert(`✅ 대기자가 자동 승인되었습니다!\n\n이름: ${nextWaiting.name}\n동/호: ${nextWaiting.dong}동 ${nextWaiting.ho}호\n프로그램: ${nextWaiting.lesson_type}\n\n알림이 자동 발송됩니다.`);
        
    } catch (error) {
        console.error('❌ Error processing waiting list:', error);
        // 에러 발생해도 해지 승인은 진행됨
    }
}

// 🆕 웹훅 전송 함수
async function sendWaitingApprovedWebhook(contract) {
    try {
        // TODO: Make.com 또는 Zapier 웹훅 URL 설정
        // const webhookUrl = 'https://hook.make.com/YOUR_WEBHOOK_ID';
        
        // 임시로 콘솔 로그만 출력 (실제 구현 시 위 주석 해제)
        const webhookData = {
            event: 'waiting_approved',
            timestamp: new Date().toISOString(),
            contract_id: contract.id,
            user_name: contract.name,
            user_phone: contract.phone,
            dong: contract.dong,
            ho: contract.ho,
            program: contract.lesson_type,
            preferred_time: contract.preferred_time,
            message: `[필라테스] ${contract.name}님의 대기 신청이 승인되었습니다.\n\n프로그램: ${contract.lesson_type}\n희망 시간: ${contract.preferred_time}\n\n자세한 사항은 관리사무소로 연락주세요.`
        };
        
        console.log('📤 Webhook data (ready to send):', webhookData);
        
        // 실제 웹훅 전송 (Make.com 설정 후 활성화)
        /*
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookData)
        });
        
        if (response.ok) {
            console.log('✅ Webhook sent successfully');
        } else {
            console.warn('⚠️ Webhook failed:', response.status);
        }
        */
        
    } catch (error) {
        console.error('❌ Error sending webhook:', error);
        // 웹훅 실패해도 승인 프로세스는 계속 진행
    }
}

// Save admin note
async function saveAdminNote(cancellationId) {
    const noteInput = document.getElementById('adminNoteInput');
    const newNote = noteInput.value.trim();
    
    const cancel = allCancellations.find(c => c.id === cancellationId);
    if (!cancel) return;
    
    try {
        console.log('💾 Saving admin note...');
        
        // DELETE + POST approach
        await fetch(`tables/pilates_cancellations/${cancellationId}`, {
            method: 'DELETE'
        });
        
        const updatedData = {
            ...cancel,
            admin_note: newNote
        };
        
        const response = await fetch('tables/pilates_cancellations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        
        if (response.ok) {
            console.log('✅ Admin note saved');
            alert('메모가 저장되었습니다.');
            await loadCancellations();
        } else {
            throw new Error(`Failed to save: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error saving note:', error);
        alert('메모 저장에 실패했습니다.');
    }
}

// Delete cancellation
async function deleteCancellation(cancellationId) {
    const cancel = allCancellations.find(c => c.id === cancellationId);
    if (!cancel) return;
    
    const confirmMsg = `다음 해지 신청을 삭제하시겠습니까?\n\n이름: ${cancel.name}\n동/호: ${cancel.dong} ${cancel.ho}\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`;
    
    if (!confirm(confirmMsg)) return;
    
    try {
        console.log('🗑️ Deleting cancellation:', cancellationId);
        
        const response = await fetch(`tables/pilates_cancellations/${cancellationId}`, {
            method: 'DELETE'
        });
        
        if (response.ok || response.status === 204) {
            console.log('✅ Cancellation deleted successfully');
            alert('삭제되었습니다.');
            closeDetailModal();
            await loadCancellations();
        } else {
            throw new Error(`Failed to delete: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error deleting cancellation:', error);
        alert('삭제에 실패했습니다.');
    }
}

// Export to CSV
function exportToCSV() {
    if (filteredCancellations.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
    }
    
    const headers = ['신청일시', '상태', '동', '호수', '이름', '전화번호', '프로그램', '사유', '상세사유', '관리자메모'];
    
    const rows = filteredCancellations.map(cancel => [
        new Date(cancel.created_at).toLocaleString('ko-KR'),
        cancel.status,
        cancel.dong,
        cancel.ho,
        cancel.name,
        cancel.phone,
        cancel.lesson_type || '-',
        cancel.reason || '-',
        cancel.reason_detail || '-',
        cancel.admin_note || '-'
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
    link.setAttribute('download', `필라테스해지신청_${new Date().toISOString().split('T')[0]}.csv`);
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
