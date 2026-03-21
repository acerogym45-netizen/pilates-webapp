// Configuration
// 같은 도메인의 루트 경로 사용 (절대 경로)
const TABLES_ENDPOINT = '/tables'; // 루트의 tables API

// State Management
let allInquiries = [];
let filteredInquiries = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadInquiries();
});
// Load all inquiries
async function loadInquiries() {
    const listContainer = document.getElementById('inquiriesList');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const emptyState = document.getElementById('emptyState');
    
    try {
        loadingSpinner.style.display = 'block';
        listContainer.style.display = 'none';
        emptyState.style.display = 'none';
        
        const response = await fetch(`tables/pilates_inquiries?sort=-created_at&limit=1000`);
        const result = await response.json();
        
        // Filter out deleted inquiries
        allInquiries = (result.data || []).filter(inquiry => !inquiry.is_deleted);
        
        console.log(`📊 Loaded ${allInquiries.length} inquiries (excluding deleted)`);
        
        loadingSpinner.style.display = 'none';
        
        updateStats();
        filterInquiries();
        
    } catch (error) {
        console.error('Error loading inquiries:', error);
        loadingSpinner.style.display = 'none';
        listContainer.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>데이터를 불러오는데 실패했습니다.</p></div>';
        listContainer.style.display = 'block';
    }
}

// Update statistics
function updateStats() {
    const pending = allInquiries.filter(i => i.status === '대기').length;
    const completed = allInquiries.filter(i => i.status === '완료').length;
    const publicCount = allInquiries.filter(i => i.is_public).length;
    const total = allInquiries.length;
    
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('completedCount').textContent = completed;
    document.getElementById('publicCount').textContent = publicCount;
    document.getElementById('totalCount').textContent = total;
}

// Filter inquiries
function filterInquiries() {
    const statusFilter = document.getElementById('statusFilter').value;
    const privacyFilter = document.getElementById('privacyFilter').value;
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    
    filteredInquiries = allInquiries.filter(inquiry => {
        const statusMatch = statusFilter === 'all' || inquiry.status === statusFilter;
        const privacyMatch = privacyFilter === 'all' || 
            (privacyFilter === 'public' && inquiry.is_public) ||
            (privacyFilter === 'private' && !inquiry.is_public);
        const searchMatch = searchInput === '' || 
            inquiry.name.toLowerCase().includes(searchInput) ||
            inquiry.title.toLowerCase().includes(searchInput) ||
            inquiry.dong.toLowerCase().includes(searchInput) ||
            inquiry.ho.toLowerCase().includes(searchInput);
        
        return statusMatch && privacyMatch && searchMatch;
    });
    
    renderInquiries();
}

// Render inquiries list
function renderInquiries() {
    const listContainer = document.getElementById('inquiriesList');
    const emptyState = document.getElementById('emptyState');
    
    if (filteredInquiries.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    listContainer.style.display = 'grid';
    emptyState.style.display = 'none';
    
    const html = filteredInquiries.map(inquiry => createInquiryHTML(inquiry)).join('');
    listContainer.innerHTML = html;
}

// Create HTML for a single inquiry
function createInquiryHTML(inquiry) {
    const date = new Date(inquiry.created_at).toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const statusClass = inquiry.status === '대기' ? 'pending' : 'approved';
    const privacyIcon = inquiry.is_public 
        ? '<i class="fas fa-globe" title="공개"></i>' 
        : '<i class="fas fa-lock" title="비공개"></i>';
    
    const hiddenBadge = inquiry.is_hidden 
        ? '<span class="status-badge" style="background: #6c757d;"><i class="fas fa-eye-slash"></i> 숨김</span>' 
        : '';
    
    return `
        <div class="contract-item ${inquiry.is_hidden ? 'hidden-inquiry' : ''}">
            <div class="contract-header">
                <div class="contract-title">
                    <h3>${escapeHtml(inquiry.title)} ${privacyIcon}</h3>
                    <div style="display: flex; gap: 8px;">
                        <span class="status-badge ${statusClass}">${inquiry.status}</span>
                        ${hiddenBadge}
                    </div>
                </div>
            </div>
            <div class="contract-info">
                <div class="info-item">
                    <i class="fas fa-home"></i>
                    <span><strong>주소:</strong> ${escapeHtml(inquiry.dong)} ${escapeHtml(inquiry.ho)}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-user"></i>
                    <span><strong>이름:</strong> ${escapeHtml(inquiry.name)}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-phone"></i>
                    <span><strong>전화:</strong> ${escapeHtml(inquiry.phone)}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-clock"></i>
                    <span><strong>등록일:</strong> ${date}</span>
                </div>
            </div>
            <div class="inquiry-preview">
                ${escapeHtml(inquiry.content.substring(0, 100))}${inquiry.content.length > 100 ? '...' : ''}
            </div>
            <div class="contract-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn btn-view" onclick="openReplyModal('${inquiry.id}')" style="flex: 1; min-width: 120px;">
                    <i class="fas fa-reply"></i> ${inquiry.status === '완료' ? '답변보기' : '답변하기'}
                </button>
                <button class="btn btn-secondary" onclick="toggleHideInquiry('${inquiry.id}', ${inquiry.is_hidden || false})" 
                        style="flex: 0; min-width: 100px; background: ${inquiry.is_hidden ? '#27ae60' : '#6c757d'};" 
                        title="${inquiry.is_hidden ? '숨김 해제' : '숨기기'}">
                    <i class="fas fa-eye${inquiry.is_hidden ? '' : '-slash'}"></i> ${inquiry.is_hidden ? '표시' : '숨김'}
                </button>
                <button class="btn btn-secondary" onclick="editInquiryContent('${inquiry.id}')" 
                        style="flex: 0; min-width: 80px;" title="수정">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn btn-danger" onclick="deleteInquiry('${inquiry.id}')" 
                        style="flex: 0; min-width: 80px;" title="삭제">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </div>
        </div>
    `;
}

// Open reply modal
function openReplyModal(inquiryId) {
    const inquiry = allInquiries.find(i => i.id === inquiryId);
    if (!inquiry) return;
    
    const detailHTML = `
        <div class="detail-section">
            <h3><i class="fas fa-user"></i> 문의자 정보</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <label>이름</label>
                    <p>${escapeHtml(inquiry.name)}</p>
                </div>
                <div class="detail-item">
                    <label>주소</label>
                    <p>${escapeHtml(inquiry.dong)} ${escapeHtml(inquiry.ho)}</p>
                </div>
                <div class="detail-item">
                    <label>전화번호</label>
                    <p>${escapeHtml(inquiry.phone)}</p>
                </div>
                <div class="detail-item">
                    <label>공개여부</label>
                    <p>${inquiry.is_public ? '공개' : '비공개'}</p>
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3><i class="fas fa-comment"></i> 문의 내용</h3>
            <div class="detail-item">
                <label>제목</label>
                <p><strong>${escapeHtml(inquiry.title)}</strong></p>
            </div>
            <div class="detail-item">
                <label>내용</label>
                <div class="inquiry-full-content">${escapeHtml(inquiry.content)}</div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3><i class="fas fa-cog"></i> 관리 기능</h3>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn-secondary" onclick="toggleHideInquiry('${inquiry.id}', ${inquiry.is_hidden || false})" 
                        style="flex: 1; min-width: 150px;">
                    <i class="fas fa-eye${inquiry.is_hidden ? '' : '-slash'}"></i> 
                    ${inquiry.is_hidden ? '숨김 해제' : '숨기기'}
                </button>
                <button class="btn-secondary" onclick="editInquiryContent('${inquiry.id}')" 
                        style="flex: 1; min-width: 150px;">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn-danger" onclick="deleteInquiry('${inquiry.id}')" 
                        style="flex: 1; min-width: 150px;">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </div>
            <small style="display: block; margin-top: 10px; color: #666;">
                <i class="fas fa-info-circle"></i> 
                숨기기: 입주자에게 보이지 않음 (관리자는 확인 가능) | 
                수정: 제목/내용 수정 | 
                삭제: 영구 삭제 (복구 불가)
            </small>
        </div>
    `;
    
    document.getElementById('inquiryDetail').innerHTML = detailHTML;
    document.getElementById('replyInquiryId').value = inquiryId;
    
    // Fill existing reply if any
    if (inquiry.reply) {
        document.getElementById('replyContent').value = inquiry.reply;
    } else {
        document.getElementById('replyContent').value = '';
    }
    
    document.getElementById('replyModal').classList.add('active');
}

// Close reply modal
function closeReplyModal() {
    document.getElementById('replyModal').classList.remove('active');
}

// Submit reply
async function submitReply() {
    const inquiryId = document.getElementById('replyInquiryId').value;
    const replyContent = document.getElementById('replyContent').value.trim();
    
    if (!replyContent) {
        alert('답변 내용을 입력해주세요.');
        return;
    }
    
    try {
        console.log('🔄 Submitting reply for inquiry:', inquiryId);
        
        // Find the inquiry in the already loaded data
        const inquiry = allInquiries.find(inq => inq.id === inquiryId);
        if (!inquiry) {
            throw new Error('Inquiry not found in loaded data');
        }
        
        console.log('📋 Found inquiry:', inquiry);
        
        // Try PATCH method first
        console.log('🔧 Attempting PATCH request...');
        
        const patchData = {
            reply: replyContent,
            reply_date: Date.now(),
            status: '완료'
        };
        
        const patchResponse = await fetch(`tables/pilates_inquiries/${inquiryId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(patchData)
        });
        
        console.log('📡 PATCH Response:', patchResponse.status, patchResponse.statusText);
        
        if (patchResponse.ok) {
            const result = await patchResponse.json();
            console.log('✅ Reply submitted successfully:', result);
            alert('답변이 등록되었습니다.');
            closeReplyModal();
            await loadInquiries();
            return;
        }
        
        // If PATCH failed, try PUT
        console.log('⚠️ PATCH failed, trying PUT...');
        
        const updatedData = {
            ...inquiry,
            reply: replyContent,
            reply_date: Date.now(),
            status: '완료'
        };
        
        delete updatedData.gs_project_id;
        delete updatedData.gs_table_name;
        delete updatedData.updated_at;
        
        const putResponse = await fetch(`tables/pilates_inquiries/${inquiryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
        });
        
        console.log('📡 PUT Response:', putResponse.status, putResponse.statusText);
        
        if (putResponse.ok) {
            const result = await putResponse.json();
            console.log('✅ Reply submitted successfully:', result);
            alert('답변이 등록되었습니다.');
            closeReplyModal();
            await loadInquiries();
            return;
        }
        
        // If both failed, try DELETE + POST
        console.log('⚠️ PUT also failed, trying DELETE + POST...');
        
        const deleteResponse = await fetch(`tables/pilates_inquiries/${inquiryId}`, {
            method: 'DELETE'
        });
        
        console.log('📡 DELETE Response:', deleteResponse.status, deleteResponse.statusText);
        
        if (!deleteResponse.ok && deleteResponse.status !== 204) {
            throw new Error(`All update methods failed. Last error: ${deleteResponse.status}`);
        }
        
        console.log('✅ Old inquiry deleted, creating new one...');
        
        const newData = {
            ...inquiry,
            reply: replyContent,
            reply_date: Date.now(),
            status: '완료',
            id: inquiryId
        };
        
        delete newData.gs_project_id;
        delete newData.gs_table_name;
        delete newData.updated_at;
        
        const postResponse = await fetch('tables/pilates_inquiries', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newData)
        });
        
        console.log('📡 POST Response:', postResponse.status, postResponse.statusText);
        
        if (postResponse.ok) {
            const result = await postResponse.json();
            console.log('✅ Reply submitted successfully via DELETE+POST:', result);
            alert('답변이 등록되었습니다.');
            closeReplyModal();
            await loadInquiries();
        } else {
            const errorText = await postResponse.text();
            console.error('❌ POST failed:', postResponse.status, errorText);
            throw new Error(`Failed to recreate inquiry: ${postResponse.status}`);
        }
        
    } catch (error) {
        console.error('💥 Error submitting reply:', error);
        alert('답변 등록에 실패했습니다.\n\n에러: ' + error.message + '\n\n관리자에게 문의하세요.');
    }
}

// Export to CSV
function exportToCSV() {
    if (filteredInquiries.length === 0) {
        alert('다운로드할 데이터가 없습니다.');
        return;
    }
    
    // CSV 헤더
    const headers = ['문의일시', '상태', '동', '호수', '이름', '전화번호', '공개여부', '제목', '문의내용', '답변내용', '답변일시'];
    
    // CSV 데이터 행
    const rows = filteredInquiries.map(inquiry => {
        const createdDate = new Date(inquiry.created_at).toLocaleString('ko-KR');
        const replyDate = inquiry.reply_date ? new Date(inquiry.reply_date).toLocaleString('ko-KR') : '-';
        const privacy = inquiry.is_public ? '공개' : '비공개';
        const reply = inquiry.reply || '-';
        
        return [
            createdDate,
            inquiry.status,
            inquiry.dong,
            inquiry.ho,
            inquiry.name,
            inquiry.phone,
            privacy,
            inquiry.title,
            inquiry.content,
            reply,
            replyDate
        ].map(field => {
            // CSV 이스케이프 처리
            const str = String(field || '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        });
    });
    
    // CSV 내용 생성
    const csvContent = [
        '\uFEFF', // UTF-8 BOM
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    // 다운로드
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `필라테스문의_${today}.csv`);
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

// ===== 문의사항 관리 기능 =====

// Toggle hide/show inquiry
async function toggleHideInquiry(inquiryId, currentHiddenStatus) {
    const newStatus = !currentHiddenStatus;
    const action = newStatus ? '숨김' : '숨김 해제';
    
    if (!confirm(`이 문의를 ${action} 처리하시겠습니까?`)) {
        return;
    }
    
    try {
        console.log(`🔄 ${action} inquiry:`, inquiryId);
        
        const inquiry = allInquiries.find(inq => inq.id === inquiryId);
        if (!inquiry) {
            throw new Error('Inquiry not found');
        }
        
        const updateData = {
            ...inquiry,
            is_hidden: newStatus
        };
        
        // Remove system fields that shouldn't be updated
        delete updateData.gs_project_id;
        delete updateData.gs_table_name;
        delete updateData.updated_at;
        
        const response = await fetch(`tables/pilates_inquiries/${inquiryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            console.log(`✅ Inquiry ${action} successfully`);
            alert(`문의가 ${action} 처리되었습니다.`);
            closeReplyModal();
            await loadInquiries();
        } else {
            throw new Error('Update failed');
        }
    } catch (error) {
        console.error(`❌ Failed to ${action} inquiry:`, error);
        alert(`${action} 처리 중 오류가 발생했습니다.`);
    }
}

// Edit inquiry content
async function editInquiryContent(inquiryId) {
    const inquiry = allInquiries.find(inq => inq.id === inquiryId);
    if (!inquiry) {
        alert('문의를 찾을 수 없습니다.');
        return;
    }
    
    const newTitle = prompt('새 제목을 입력하세요:', inquiry.title);
    if (newTitle === null) return; // 취소
    
    if (!newTitle.trim()) {
        alert('제목을 입력해주세요.');
        return;
    }
    
    const newContent = prompt('새 내용을 입력하세요:', inquiry.content);
    if (newContent === null) return; // 취소
    
    if (!newContent.trim()) {
        alert('내용을 입력해주세요.');
        return;
    }
    
    try {
        console.log('✏️ Editing inquiry:', inquiryId);
        
        const updateData = {
            ...inquiry,
            title: newTitle.trim(),
            content: newContent.trim()
        };
        
        // Remove system fields that shouldn't be updated
        delete updateData.gs_project_id;
        delete updateData.gs_table_name;
        delete updateData.updated_at;
        
        const response = await fetch(`tables/pilates_inquiries/${inquiryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            console.log('✅ Inquiry edited successfully');
            alert('문의가 수정되었습니다.');
            closeReplyModal();
            await loadInquiries();
        } else {
            throw new Error('Update failed');
        }
    } catch (error) {
        console.error('❌ Failed to edit inquiry:', error);
        alert('수정 중 오류가 발생했습니다.');
    }
}

// Delete inquiry (soft delete)
async function deleteInquiry(inquiryId) {
    if (!confirm('⚠️ 이 문의를 삭제하시겠습니까?\n삭제된 문의는 복구할 수 없습니다.')) {
        return;
    }
    
    // Double confirmation
    if (!confirm('정말로 삭제하시겠습니까? (복구 불가)')) {
        return;
    }
    
    try {
        console.log('🗑️ Deleting inquiry:', inquiryId);
        
        const inquiry = allInquiries.find(inq => inq.id === inquiryId);
        if (!inquiry) {
            throw new Error('Inquiry not found');
        }
        
        const updateData = {
            ...inquiry,
            is_deleted: true
        };
        
        // Remove system fields that shouldn't be updated
        delete updateData.gs_project_id;
        delete updateData.gs_table_name;
        delete updateData.updated_at;
        
        const response = await fetch(`tables/pilates_inquiries/${inquiryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            console.log('✅ Inquiry deleted successfully');
            alert('문의가 삭제되었습니다.');
            closeReplyModal();
            await loadInquiries();
        } else {
            throw new Error('Delete failed');
        }
    } catch (error) {
        console.error('❌ Failed to delete inquiry:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
}

