// Admin Notices Management
let allNotices = [];
let currentNoticeId = null;
let currentComplexCode = null;

// Get default complex code
async function getDefaultComplexCode() {
    try {
        const response = await fetch('tables/complex_settings?limit=100&sort=display_order');
        const result = await response.json();
        
        if (result.data && result.data.length > 0) {
            const validComplex = result.data.find(c => 
                c.is_active && 
                c.complex_code && 
                c.complex_code.length > 2
            );
            
            if (validComplex) {
                return validComplex.complex_code;
            }
            
            return result.data[0].complex_code || 'cheongju-sk';
        }
        
        return 'cheongju-sk'; // Fallback
    } catch (error) {
        console.error('Error fetching complex:', error);
        return 'cheongju-sk';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔧 Admin Notices Management initialized');
    currentComplexCode = await getDefaultComplexCode();
    console.log('📍 Using complex code:', currentComplexCode);
    loadNotices();
});

// Load all notices
async function loadNotices() {
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('emptyState');
    const list = document.getElementById('noticesList');
    
    loading.style.display = 'block';
    emptyState.style.display = 'none';
    list.style.display = 'none';
    
    try {
        const response = await fetch('tables/notices?sort=-created_at&limit=1000');
        const result = await response.json();
        
        allNotices = result.data || [];
        
        console.log(`📊 Loaded ${allNotices.length} notices`);
        
        loading.style.display = 'none';
        
        updateStats();
        displayNotices();
        
    } catch (error) {
        console.error('Error loading notices:', error);
        loading.style.display = 'none';
        emptyState.style.display = 'block';
        emptyState.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>데이터를 불러오는데 실패했습니다</p>';
    }
}

// Update statistics
function updateStats() {
    const active = allNotices.filter(n => n.is_active).length;
    const inactive = allNotices.filter(n => !n.is_active).length;
    
    document.getElementById('activeCount').textContent = active;
    document.getElementById('inactiveCount').textContent = inactive;
    document.getElementById('totalCount').textContent = allNotices.length;
}

// Display notices
function displayNotices() {
    const list = document.getElementById('noticesList');
    const emptyState = document.getElementById('emptyState');
    
    if (allNotices.length === 0) {
        list.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    list.style.display = 'grid';
    
    // Sort by display_order, then by created_at
    const sortedNotices = [...allNotices].sort((a, b) => {
        const orderA = a.display_order || 999;
        const orderB = b.display_order || 999;
        if (orderA !== orderB) return orderA - orderB;
        return new Date(b.created_at) - new Date(a.created_at);
    });
    
    list.innerHTML = sortedNotices.map(notice => {
        const categoryColor = 
            notice.category === '중요' ? 'rejected' :
            notice.category === '이벤트' ? 'approved' : 'pending';
        
        const statusColor = notice.is_active ? 'approved' : 'pending';
        
        return `
            <div class="contract-card">
                <div class="card-header">
                    <div class="card-header-info">
                        <div class="card-title">
                            <i class="fas ${notice.category === '중요' ? 'fa-exclamation-circle' : notice.category === '이벤트' ? 'fa-gift' : 'fa-info-circle'}"></i>
                            ${escapeHtml(notice.title)}
                        </div>
                        <div class="card-subtitle">
                            순서: ${notice.display_order || 0}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="status-badge ${categoryColor}">
                            ${escapeHtml(notice.category)}
                        </span>
                        <span class="status-badge ${statusColor}">
                            ${notice.is_active ? '활성화' : '비활성화'}
                        </span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="card-info-row" style="grid-column: 1 / -1;">
                        <span class="value" style="color: #666; line-height: 1.6;">
                            ${escapeHtml(notice.content).substring(0, 100)}${notice.content.length > 100 ? '...' : ''}
                        </span>
                    </div>
                    <div class="card-info-row">
                        <span class="label"><i class="fas fa-calendar"></i> 작성일</span>
                        <span class="value">${new Date(notice.created_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn-action primary" onclick="openEditModal('${notice.id}')">
                        <i class="fas fa-edit"></i> 수정
                    </button>
                    <button class="btn-action ${notice.is_active ? 'secondary' : 'success'}" onclick="toggleActive('${notice.id}')">
                        <i class="fas fa-${notice.is_active ? 'eye-slash' : 'eye'}"></i> ${notice.is_active ? '비활성화' : '활성화'}
                    </button>
                    <button class="btn-action danger" onclick="deleteNotice('${notice.id}')">
                        <i class="fas fa-trash"></i> 삭제
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Open add modal
function openAddModal() {
    currentNoticeId = null;
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-bullhorn"></i> 공지 추가';
    document.getElementById('noticeForm').reset();
    document.getElementById('noticeId').value = '';
    document.getElementById('noticeActive').checked = true;
    document.getElementById('noticeOrder').value = 1;
    document.getElementById('noticeModal').style.display = 'flex';
}

// Open edit modal
function openEditModal(noticeId) {
    const notice = allNotices.find(n => n.id === noticeId);
    if (!notice) return;
    
    currentNoticeId = noticeId;
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> 공지 수정';
    document.getElementById('noticeId').value = notice.id;
    document.getElementById('noticeTitle').value = notice.title;
    document.getElementById('noticeContent').value = notice.content;
    document.getElementById('noticeCategory').value = notice.category;
    document.getElementById('noticeOrder').value = notice.display_order || 0;
    document.getElementById('noticeActive').checked = notice.is_active;
    document.getElementById('noticeModal').style.display = 'flex';
}

// Close modal
function closeNoticeModal() {
    document.getElementById('noticeModal').style.display = 'none';
    currentNoticeId = null;
}

// Save notice
async function saveNotice() {
    const title = document.getElementById('noticeTitle').value.trim();
    const content = document.getElementById('noticeContent').value.trim();
    const category = document.getElementById('noticeCategory').value;
    const displayOrder = parseInt(document.getElementById('noticeOrder').value) || 0;
    const isActive = document.getElementById('noticeActive').checked;
    
    if (!title || !content) {
        alert('제목과 내용을 입력해주세요.');
        return;
    }
    
    const noticeData = {
        complex_id: currentComplexCode,  // Add complex_id
        title,
        content,
        category,
        display_order: displayOrder,
        is_active: isActive,
        created_at: currentNoticeId ? undefined : new Date().toISOString()
    };
    
    try {
        console.log('💾 Saving notice:', noticeData);
        
        if (currentNoticeId) {
            // Update existing notice (DELETE + POST)
            await fetch(`tables/notices/${currentNoticeId}`, {
                method: 'DELETE'
            });
            
            const existingNotice = allNotices.find(n => n.id === currentNoticeId);
            noticeData.id = currentNoticeId;
            noticeData.created_at = existingNotice.created_at;
        }
        
        const response = await fetch('tables/notices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(noticeData)
        });
        
        if (response.ok) {
            console.log('✅ Notice saved successfully');
            alert(currentNoticeId ? '공지가 수정되었습니다.' : '공지가 추가되었습니다.');
            closeNoticeModal();
            await loadNotices();
        } else {
            throw new Error(`Failed to save: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error saving notice:', error);
        alert('저장에 실패했습니다.\n\n' + error.message);
    }
}

// Toggle active status
async function toggleActive(noticeId) {
    const notice = allNotices.find(n => n.id === noticeId);
    if (!notice) return;
    
    const newStatus = !notice.is_active;
    const confirmMsg = newStatus ? '이 공지를 활성화하시겠습니까?' : '이 공지를 비활성화하시겠습니까?';
    
    if (!confirm(confirmMsg)) return;
    
    try {
        console.log(`🔄 Toggling active status to: ${newStatus}`);
        
        // DELETE + POST approach
        await fetch(`tables/notices/${noticeId}`, {
            method: 'DELETE'
        });
        
        const updatedData = {
            ...notice,
            is_active: newStatus
        };
        
        const response = await fetch('tables/notices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        
        if (response.ok) {
            console.log('✅ Status updated successfully');
            alert(newStatus ? '활성화되었습니다.' : '비활성화되었습니다.');
            await loadNotices();
        } else {
            throw new Error(`Failed to update: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error updating status:', error);
        alert('상태 변경에 실패했습니다.');
    }
}

// Delete notice
async function deleteNotice(noticeId) {
    const notice = allNotices.find(n => n.id === noticeId);
    if (!notice) return;
    
    const confirmMsg = `다음 공지를 삭제하시겠습니까?\n\n제목: ${notice.title}\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`;
    
    if (!confirm(confirmMsg)) return;
    
    try {
        console.log('🗑️ Deleting notice:', noticeId);
        
        const response = await fetch(`tables/notices/${noticeId}`, {
            method: 'DELETE'
        });
        
        if (response.ok || response.status === 204) {
            console.log('✅ Notice deleted successfully');
            alert('삭제되었습니다.');
            await loadNotices();
        } else {
            throw new Error(`Failed to delete: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error deleting notice:', error);
        alert('삭제에 실패했습니다.');
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

// ===== 🆕 CURRICULUM MANAGEMENT FUNCTIONS =====

let allCurriculums = [];
let currentCurriculumId = null;

// Open curriculum manager
async function openCurriculumManager() {
    const modal = document.getElementById('curriculumManagerModal');
    modal.classList.add('active');
    
    // Set default year/month
    const now = new Date();
    document.getElementById('curriculumYear').value = now.getFullYear();
    document.getElementById('curriculumMonth').value = now.getMonth() + 1;
    
    // Load existing curriculums
    await loadCurriculumList();
}

// Close curriculum manager
function closeCurriculumManager() {
    const modal = document.getElementById('curriculumManagerModal');
    modal.classList.remove('active');
    resetCurriculumForm();
}

// Reset curriculum form
function resetCurriculumForm() {
    document.getElementById('curriculumForm').reset();
    document.getElementById('curriculumId').value = '';
    currentCurriculumId = null;
    
    const now = new Date();
    document.getElementById('curriculumYear').value = now.getFullYear();
    document.getElementById('curriculumMonth').value = now.getMonth() + 1;
    
    // Reset image
    document.getElementById('curriculumImageFile').value = '';
    document.getElementById('curriculumImageUrl').value = '';
    document.getElementById('curriculumImagePreview').style.display = 'none';
    
    // ✅ 활성 상태 기본값 true로 설정
    document.getElementById('curriculumActive').checked = true;
}

// Load curriculum list
async function loadCurriculumList() {
    try {
        const response = await fetch('tables/curriculums?limit=1000&sort=-created_at');
        const result = await response.json();
        allCurriculums = result.data || [];
        
        // Filter by current complex
        const complexCurriculums = allCurriculums.filter(c => c.complex_id === currentComplexCode);
        
        const listContainer = document.getElementById('curriculumList');
        
        if (complexCurriculums.length === 0) {
            listContainer.innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">등록된 커리큘럼이 없습니다.</p>';
            return;
        }
        
        listContainer.innerHTML = complexCurriculums.map(c => `
            <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #dee2e6;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${c.year}년 ${c.month}월 - ${c.title}</strong>
                        <span style="margin-left: 10px; padding: 3px 8px; font-size: 0.75rem; border-radius: 4px; background: ${c.is_active ? '#d4edda' : '#f8d7da'}; color: ${c.is_active ? '#155724' : '#721c24'};">
                            ${c.is_active ? '활성화' : '비활성화'}
                        </span>
                    </div>
                    <div>
                        <button class="btn-small" onclick="editCurriculum('${c.id}')" style="padding: 5px 10px; margin-right: 5px;">
                            <i class="fas fa-edit"></i> 수정
                        </button>
                        <button class="btn-small" onclick="deleteCurriculum('${c.id}')" style="padding: 5px 10px; background: #e74c3c;">
                            <i class="fas fa-trash"></i> 삭제
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
        console.log(`✅ Loaded ${complexCurriculums.length} curriculums`);
        
    } catch (error) {
        console.error('❌ Error loading curriculums:', error);
        document.getElementById('curriculumList').innerHTML = '<p style="text-align: center; color: #e74c3c; padding: 20px;">커리큘럼 목록을 불러오는데 실패했습니다.</p>';
    }
}

// Save curriculum
async function saveCurriculum() {
    try {
        const year = parseInt(document.getElementById('curriculumYear').value);
        const month = parseInt(document.getElementById('curriculumMonth').value);
        const title = document.getElementById('curriculumTitle').value.trim();
        const description = document.getElementById('curriculumDescription').value.trim();
        const imageUrl = document.getElementById('curriculumImageUrl').value.trim();
        const isActive = document.getElementById('curriculumActive').checked;
        
        if (!title) {
            alert('제목을 입력해주세요.');
            return;
        }
        
        const curriculumData = {
            complex_id: currentComplexCode,
            year,
            month,
            title,
            description: description || '', // 선택사항
            image_url: imageUrl || '',
            is_active: isActive,
            created_at: Date.now()
        };
        
        console.log('💾 Saving curriculum:', curriculumData);
        console.log(`   📍 complex_id: ${curriculumData.complex_id}`);
        console.log(`   📅 year: ${curriculumData.year} (type: ${typeof curriculumData.year})`);
        console.log(`   📅 month: ${curriculumData.month} (type: ${typeof curriculumData.month})`);
        console.log(`   ✅ is_active: ${curriculumData.is_active}`);
        
        // If editing existing curriculum
        if (currentCurriculumId) {
            // DELETE + POST approach
            await fetch(`tables/curriculums/${currentCurriculumId}`, {
                method: 'DELETE'
            });
        }
        
        const response = await fetch('tables/curriculums', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(curriculumData)
        });
        
        if (response.ok) {
            console.log('✅ Curriculum saved successfully');
            alert('커리큘럼이 저장되었습니다.');
            resetCurriculumForm();
            await loadCurriculumList();
        } else {
            throw new Error(`Failed to save: ${response.status}`);
        }
        
    } catch (error) {
        console.error('❌ Error saving curriculum:', error);
        alert('커리큘럼 저장에 실패했습니다.');
    }
}

// Edit curriculum
function editCurriculum(curriculumId) {
    const curriculum = allCurriculums.find(c => c.id === curriculumId);
    if (!curriculum) return;
    
    currentCurriculumId = curriculumId;
    document.getElementById('curriculumId').value = curriculumId;
    document.getElementById('curriculumYear').value = curriculum.year;
    document.getElementById('curriculumMonth').value = curriculum.month;
    document.getElementById('curriculumTitle').value = curriculum.title;
    document.getElementById('curriculumDescription').value = curriculum.description || '';
    document.getElementById('curriculumImageUrl').value = curriculum.image_url || '';
    document.getElementById('curriculumActive').checked = curriculum.is_active;
    
    // Show image preview if exists
    if (curriculum.image_url) {
        document.getElementById('curriculumPreviewImg').src = curriculum.image_url;
        document.getElementById('curriculumImagePreview').style.display = 'block';
    } else {
        document.getElementById('curriculumImagePreview').style.display = 'none';
    }
    
    console.log('✏️ Editing curriculum:', curriculum.title);
}

// Delete curriculum
async function deleteCurriculum(curriculumId) {
    const curriculum = allCurriculums.find(c => c.id === curriculumId);
    if (!curriculum) return;
    
    const confirmMsg = `${curriculum.year}년 ${curriculum.month}월 커리큘럼을 삭제하시겠습니까?`;
    
    if (!confirm(confirmMsg)) return;
    
    try {
        console.log('🗑️ Deleting curriculum:', curriculumId);
        
        const response = await fetch(`tables/curriculums/${curriculumId}`, {
            method: 'DELETE'
        });
        
        if (response.ok || response.status === 204) {
            console.log('✅ Curriculum deleted successfully');
            alert('삭제되었습니다.');
            await loadCurriculumList();
        } else {
            throw new Error(`Failed to delete: ${response.status}`);
        }
        
    } catch (error) {
        console.error('❌ Error deleting curriculum:', error);
        alert('삭제에 실패했습니다.');
    }
}

// 🆕 Handle curriculum image upload
async function handleCurriculumImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 업로드 가능합니다.');
        event.target.value = '';
        return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('이미지 크기는 5MB 이하여야 합니다.');
        event.target.value = '';
        return;
    }
    
    try {
        console.log('📤 Uploading curriculum image:', file.name);
        
        // Convert to base64
        const reader = new FileReader();
        reader.onload = async function(e) {
            const base64Data = e.target.result;
            
            // Show preview
            document.getElementById('curriculumPreviewImg').src = base64Data;
            document.getElementById('curriculumImagePreview').style.display = 'block';
            
            // Store in hidden input
            document.getElementById('curriculumImageUrl').value = base64Data;
            
            console.log('✅ Image uploaded successfully');
        };
        
        reader.onerror = function() {
            console.error('❌ Failed to read file');
            alert('이미지 업로드에 실패했습니다.');
        };
        
        reader.readAsDataURL(file);
        
    } catch (error) {
        console.error('❌ Error uploading image:', error);
        alert('이미지 업로드 중 오류가 발생했습니다.');
    }
}

// 🆕 Remove curriculum image
function removeCurriculumImage() {
    document.getElementById('curriculumImageFile').value = '';
    document.getElementById('curriculumImageUrl').value = '';
    document.getElementById('curriculumImagePreview').style.display = 'none';
    document.getElementById('curriculumPreviewImg').src = '';
    console.log('🗑️ Image removed');
}
