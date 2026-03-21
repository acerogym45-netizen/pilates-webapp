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
        
        const response = await fetch(`/tables/pilates_inquiries?sort=-created_at&limit=1000`);
        const result = await response.json();
        
        allInquiries = result.data || [];
        
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
    
    return `
        <div class="contract-item">
            <div class="contract-header">
                <div class="contract-title">
                    <h3>${escapeHtml(inquiry.title)} ${privacyIcon}</h3>
                    <span class="status-badge ${statusClass}">${inquiry.status}</span>
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
            <div class="contract-actions">
                <button class="btn btn-view" onclick="openReplyModal('${inquiry.id}')">
                    <i class="fas fa-reply"></i> ${inquiry.status === '완료' ? '답변보기' : '답변하기'}
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
        const response = await fetch(`/tables/pilates_inquiries/${inquiryId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reply: replyContent,
                reply_date: Date.now(),
                status: '완료'
            })
        });
        
        if (response.ok) {
            alert('답변이 등록되었습니다.');
            closeReplyModal();
            await loadInquiries();
        } else {
            throw new Error('Failed to submit reply');
        }
    } catch (error) {
        console.error('Error submitting reply:', error);
        alert('답변 등록에 실패했습니다. 다시 시도해주세요.');
    }
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
