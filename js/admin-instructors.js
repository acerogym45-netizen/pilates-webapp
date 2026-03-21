// Admin Instructors Management
let allInstructors = [];
let currentInstructorId = null;
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
    console.log('🔧 Admin Instructors Management initialized');
    currentComplexCode = await getDefaultComplexCode();
    console.log('📍 Using complex code:', currentComplexCode);
    loadInstructors();
});

// Load all instructors
async function loadInstructors() {
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('emptyState');
    const list = document.getElementById('instructorsList');
    
    loading.style.display = 'block';
    emptyState.style.display = 'none';
    list.style.display = 'none';
    
    try {
        const response = await fetch('tables/instructors?sort=-created_at&limit=1000');
        const result = await response.json();
        
        allInstructors = result.data || [];
        
        console.log(`📊 Loaded ${allInstructors.length} instructors`);
        
        loading.style.display = 'none';
        
        updateStats();
        displayInstructors();
        
    } catch (error) {
        console.error('Error loading instructors:', error);
        loading.style.display = 'none';
        emptyState.style.display = 'block';
        emptyState.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>데이터를 불러오는데 실패했습니다</p>';
    }
}

// Update statistics
function updateStats() {
    const active = allInstructors.filter(i => i.is_active).length;
    const inactive = allInstructors.filter(i => !i.is_active).length;
    
    document.getElementById('activeCount').textContent = active;
    document.getElementById('inactiveCount').textContent = inactive;
    document.getElementById('totalCount').textContent = allInstructors.length;
}

// Display instructors
function displayInstructors() {
    const list = document.getElementById('instructorsList');
    const emptyState = document.getElementById('emptyState');
    
    if (allInstructors.length === 0) {
        list.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    list.style.display = 'grid';
    
    // Sort by display_order
    const sortedInstructors = [...allInstructors].sort((a, b) => {
        const orderA = a.display_order || 999;
        const orderB = b.display_order || 999;
        if (orderA !== orderB) return orderA - orderB;
        return new Date(b.created_at) - new Date(a.created_at);
    });
    
    list.innerHTML = sortedInstructors.map(instructor => {
        const statusColor = instructor.is_active ? 'approved' : 'pending';
        
        const certifications = Array.isArray(instructor.certifications) 
            ? instructor.certifications 
            : (instructor.certifications || '').split('\n').map(c => c.trim()).filter(c => c);
        
        return `
            <div class="contract-card">
                <div class="card-header">
                    <div class="card-header-info">
                        <div class="card-title">
                            <i class="fas fa-user-tie"></i> ${escapeHtml(instructor.name)}
                        </div>
                        <div class="card-subtitle">
                            ${escapeHtml(instructor.position || '')} • 순서: ${instructor.display_order || 0}
                        </div>
                    </div>
                    <span class="status-badge ${statusColor}">
                        ${instructor.is_active ? '활성화' : '비활성화'}
                    </span>
                </div>
                <div class="card-body">
                    ${instructor.experience_years ? `
                        <div class="card-info-row">
                            <span class="label"><i class="fas fa-calendar-check"></i> 경력</span>
                            <span class="value">${instructor.experience_years}년</span>
                        </div>
                    ` : ''}
                    ${instructor.bio ? `
                        <div class="card-info-row" style="grid-column: 1 / -1;">
                            <span class="value" style="color: #666; line-height: 1.6;">
                                ${escapeHtml(instructor.bio).substring(0, 100)}${instructor.bio.length > 100 ? '...' : ''}
                            </span>
                        </div>
                    ` : ''}
                    ${certifications.length > 0 ? `
                        <div class="card-info-row" style="grid-column: 1 / -1;">
                            <span class="label"><i class="fas fa-award"></i> 자격증</span>
                            <span class="value" style="color: #666;">
                                ${certifications.slice(0, 2).map(c => escapeHtml(c)).join(', ')}${certifications.length > 2 ? ` 외 ${certifications.length - 2}개` : ''}
                            </span>
                        </div>
                    ` : ''}
                </div>
                <div class="card-actions">
                    <button class="btn-action primary" onclick="openEditModal('${instructor.id}')">
                        <i class="fas fa-edit"></i> 수정
                    </button>
                    <button class="btn-action ${instructor.is_active ? 'secondary' : 'success'}" onclick="toggleActive('${instructor.id}')">
                        <i class="fas fa-${instructor.is_active ? 'eye-slash' : 'eye'}"></i> ${instructor.is_active ? '비활성화' : '활성화'}
                    </button>
                    <button class="btn-action danger" onclick="deleteInstructor('${instructor.id}')">
                        <i class="fas fa-trash"></i> 삭제
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Open add modal
function openAddModal() {
    currentInstructorId = null;
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-user-tie"></i> 강사 추가';
    document.getElementById('instructorForm').reset();
    document.getElementById('instructorId').value = '';
    document.getElementById('instructorActive').checked = true;
    document.getElementById('instructorOrder').value = 1;
    document.getElementById('instructorModal').style.display = 'flex';
}

// Open edit modal
function openEditModal(instructorId) {
    const instructor = allInstructors.find(i => i.id === instructorId);
    if (!instructor) return;
    
    currentInstructorId = instructorId;
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> 강사 수정';
    document.getElementById('instructorId').value = instructor.id;
    document.getElementById('instructorName').value = instructor.name;
    document.getElementById('instructorPosition').value = instructor.position || '';
    document.getElementById('instructorPhotoUrl').value = instructor.photo_url || '';
    document.getElementById('instructorBio').value = instructor.bio || '';
    document.getElementById('instructorExperience').value = instructor.experience_years || '';
    
    // Handle certifications
    const certifications = Array.isArray(instructor.certifications) 
        ? instructor.certifications 
        : (instructor.certifications || '').split('\n').map(c => c.trim()).filter(c => c);
    document.getElementById('instructorCertifications').value = certifications.join('\n');
    
    document.getElementById('instructorOrder').value = instructor.display_order || 0;
    document.getElementById('instructorActive').checked = instructor.is_active;
    document.getElementById('instructorModal').style.display = 'flex';
}

// Close modal
function closeInstructorModal() {
    document.getElementById('instructorModal').style.display = 'none';
    currentInstructorId = null;
}

// Save instructor
// Handle photo file upload (convert to base64)
async function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 업로드 가능합니다.');
        event.target.value = '';
        return;
    }
    
    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
        alert('파일 크기는 2MB 이하여야 합니다.');
        event.target.value = '';
        return;
    }
    
    try {
        // Convert to base64
        const base64 = await fileToBase64(file);
        
        // Set the base64 data URL to the URL field
        document.getElementById('instructorPhotoUrl').value = base64;
        
        console.log('✅ Photo uploaded successfully:', {
            name: file.name,
            size: (file.size / 1024).toFixed(2) + ' KB',
            type: file.type
        });
        
    } catch (error) {
        console.error('Error uploading photo:', error);
        alert('사진 업로드에 실패했습니다.');
        event.target.value = '';
    }
}

// Convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function saveInstructor() {
    const name = document.getElementById('instructorName').value.trim();
    const position = document.getElementById('instructorPosition').value.trim();
    const photoUrl = document.getElementById('instructorPhotoUrl').value.trim();
    const bio = document.getElementById('instructorBio').value.trim();
    const experienceYears = parseInt(document.getElementById('instructorExperience').value) || 0;
    const certificationsText = document.getElementById('instructorCertifications').value.trim();
    const displayOrder = parseInt(document.getElementById('instructorOrder').value) || 0;
    const isActive = document.getElementById('instructorActive').checked;
    
    if (!name || !position) {
        alert('이름과 포지션을 입력해주세요.');
        return;
    }
    
    // Parse certifications (one per line)
    const certifications = certificationsText 
        ? certificationsText.split('\n').map(c => c.trim()).filter(c => c)
        : [];
    
    const instructorData = {
        complex_id: currentComplexCode,  // Add complex_id
        name,
        position,
        photo_url: photoUrl,
        bio,
        experience_years: experienceYears,
        certifications,
        display_order: displayOrder,
        is_active: isActive,
        created_at: currentInstructorId ? undefined : new Date().toISOString()
    };
    
    try {
        console.log('💾 Saving instructor:', instructorData);
        
        if (currentInstructorId) {
            // Update existing instructor (DELETE + POST)
            await fetch(`tables/instructors/${currentInstructorId}`, {
                method: 'DELETE'
            });
            
            const existingInstructor = allInstructors.find(i => i.id === currentInstructorId);
            instructorData.id = currentInstructorId;
            instructorData.created_at = existingInstructor.created_at;
        }
        
        const response = await fetch('tables/instructors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(instructorData)
        });
        
        if (response.ok) {
            console.log('✅ Instructor saved successfully');
            alert(currentInstructorId ? '강사 정보가 수정되었습니다.' : '강사가 추가되었습니다.');
            closeInstructorModal();
            await loadInstructors();
        } else {
            throw new Error(`Failed to save: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error saving instructor:', error);
        alert('저장에 실패했습니다.\n\n' + error.message);
    }
}

// Toggle active status
async function toggleActive(instructorId) {
    const instructor = allInstructors.find(i => i.id === instructorId);
    if (!instructor) return;
    
    const newStatus = !instructor.is_active;
    const confirmMsg = newStatus ? '이 강사를 활성화하시겠습니까?' : '이 강사를 비활성화하시겠습니까?';
    
    if (!confirm(confirmMsg)) return;
    
    try {
        console.log(`🔄 Toggling active status to: ${newStatus}`);
        
        // DELETE + POST approach
        await fetch(`tables/instructors/${instructorId}`, {
            method: 'DELETE'
        });
        
        const updatedData = {
            ...instructor,
            is_active: newStatus
        };
        
        const response = await fetch('tables/instructors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        
        if (response.ok) {
            console.log('✅ Status updated successfully');
            alert(newStatus ? '활성화되었습니다.' : '비활성화되었습니다.');
            await loadInstructors();
        } else {
            throw new Error(`Failed to update: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error updating status:', error);
        alert('상태 변경에 실패했습니다.');
    }
}

// Delete instructor
async function deleteInstructor(instructorId) {
    const instructor = allInstructors.find(i => i.id === instructorId);
    if (!instructor) return;
    
    const confirmMsg = `다음 강사를 삭제하시겠습니까?\n\n이름: ${instructor.name}\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`;
    
    if (!confirm(confirmMsg)) return;
    
    try {
        console.log('🗑️ Deleting instructor:', instructorId);
        
        const response = await fetch(`tables/instructors/${instructorId}`, {
            method: 'DELETE'
        });
        
        if (response.ok || response.status === 204) {
            console.log('✅ Instructor deleted successfully');
            alert('삭제되었습니다.');
            await loadInstructors();
        } else {
            throw new Error(`Failed to delete: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error deleting instructor:', error);
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
