// Configuration
const TABLES_ENDPOINT = 'tables';

// State Management
let allComplexes = [];

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    loadComplexes();
});

// Load all complexes
async function loadComplexes() {
    const listContainer = document.getElementById('complexList');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const emptyState = document.getElementById('emptyState');
    
    try {
        loadingSpinner.style.display = 'block';
        listContainer.style.display = 'none';
        emptyState.style.display = 'none';
        
        const response = await fetch(`${TABLES_ENDPOINT}/complex_settings?limit=100&sort=display_order`);
        const result = await response.json();
        
        allComplexes = result.data || [];
        
        console.log(`🏢 Loaded ${allComplexes.length} complexes`);
        
        loadingSpinner.style.display = 'none';
        
        updateStats();
        await renderComplexes();  // await 추가
        
    } catch (error) {
        console.error('Error loading complexes:', error);
        loadingSpinner.style.display = 'none';
        listContainer.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>데이터를 불러오는데 실패했습니다.</p></div>';
        listContainer.style.display = 'block';
    }
}

// Update statistics
function updateStats() {
    const active = allComplexes.filter(c => c.is_active).length;
    const inactive = allComplexes.filter(c => !c.is_active).length;
    const total = allComplexes.length;
    
    document.getElementById('activeCount').textContent = active;
    document.getElementById('inactiveCount').textContent = inactive;
    document.getElementById('totalCount').textContent = total;
}

// Render complexes list
async function renderComplexes() {
    const listContainer = document.getElementById('complexList');
    const emptyState = document.getElementById('emptyState');
    
    if (allComplexes.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    listContainer.style.display = 'grid';
    emptyState.style.display = 'none';
    
    // Create HTML for all complexes (async)
    const htmlPromises = allComplexes.map(complex => createComplexHTML(complex));
    const htmlArray = await Promise.all(htmlPromises);
    const html = htmlArray.join('');
    
    listContainer.innerHTML = html;
}

// Create HTML for a single complex
async function createComplexHTML(complex) {
    const statusClass = complex.is_active ? 'approved' : 'rejected';
    const statusText = complex.is_active ? '활성화' : '비활성화';
    
    // Fetch programs dynamically for this complex
    let programsHTML = '';
    try {
        const programsResponse = await fetch('tables/programs?limit=100&sort=display_order');
        const programsResult = await programsResponse.json();
        const programs = (programsResult.data || [])
            .filter(p => p.complex_id === complex.complex_code && p.is_active);
        
        if (programs.length > 0) {
            programsHTML = `
                <div class="inquiry-preview">
                    <strong><i class="fas fa-list"></i> 등록된 프로그램 (${programs.length}개):</strong><br>
                    ${programs.map(p => `<span style="display: inline-block; margin: 3px 5px 3px 0; padding: 3px 8px; background: #e8f5e9; border-radius: 4px; font-size: 0.85rem;">• ${escapeHtml(p.program_name)}</span>`).join('')}
                </div>
            `;
        } else {
            programsHTML = `
                <div class="inquiry-preview" style="background: #fff3cd; border-left: 3px solid #ffc107;">
                    <strong><i class="fas fa-exclamation-triangle"></i> 프로그램:</strong> 등록된 프로그램이 없습니다
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading programs:', error);
        programsHTML = '';
    }
    
    return `
        <div class="contract-item">
            <div class="contract-header">
                <div class="contract-title">
                    <h3>${escapeHtml(complex.complex_name)}</h3>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
            </div>
            <div class="contract-info">
                <div class="info-item">
                    <i class="fas fa-code"></i>
                    <span><strong>코드:</strong> ${escapeHtml(complex.complex_code)}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-phone"></i>
                    <span><strong>전화:</strong> ${escapeHtml(complex.contact_phone || '-')}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-envelope"></i>
                    <span><strong>이메일:</strong> ${escapeHtml(complex.contact_email || '-')}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-map-marker-alt"></i>
                    <span><strong>주소:</strong> ${escapeHtml(complex.address || '-')}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-clock"></i>
                    <span><strong>운영시간:</strong> ${escapeHtml(complex.business_hours || '-')}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-sort"></i>
                    <span><strong>순서:</strong> ${complex.display_order || 1}</span>
                </div>
            </div>
            ${programsHTML}
            <div class="inquiry-preview" style="background: #e3f2fd; border-left: 3px solid #2196f3;">
                <strong><i class="fas fa-link"></i> 입주민 URL:</strong><br>
                <code style="font-size: 0.875rem; color: #1976d2; word-break: break-all;">
                    ${window.location.origin}/?complex=${escapeHtml(complex.complex_code)}
                </code>
            </div>
            <div class="contract-actions">
                <button class="btn-view" onclick="copyComplexURL('${complex.complex_code}')">
                    <i class="fas fa-copy"></i> URL 복사
                </button>
                <button class="btn-signature" onclick="generateQRCode('${complex.complex_code}')">
                    <i class="fas fa-qrcode"></i> QR 생성
                </button>
                <button class="btn-edit" onclick="openEditModal('${complex.id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                <button class="btn-delete" onclick="deleteComplex('${complex.id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </div>
        </div>
    `;
}

// Open add modal
function openAddModal() {
    document.getElementById('editComplexId').value = '';
    document.getElementById('editComplexName').value = '';
    document.getElementById('editComplexCode').value = '';
    document.getElementById('editContactPhone').value = '';
    document.getElementById('editContactEmail').value = '';
    document.getElementById('editAddress').value = '';
    document.getElementById('editLogoUrl').value = '';
    document.getElementById('editPrimaryColor').value = '#2c3e50';
    document.getElementById('editBusinessHours').value = '';
    document.getElementById('editDisplayOrder').value = allComplexes.length + 1;
    document.getElementById('editAdminPassword').value = 'admin1234';
    document.getElementById('editIsActive').value = 'true';
    document.getElementById('editLessonTypes').value = '';
    
    document.getElementById('editModal').classList.add('active');
}

// Open edit modal
function openEditModal(complexId) {
    const complex = allComplexes.find(c => c.id === complexId);
    if (!complex) {
        alert('단지 정보를 찾을 수 없습니다.');
        return;
    }
    
    document.getElementById('editComplexId').value = complex.id;
    document.getElementById('editComplexName').value = complex.complex_name || '';
    document.getElementById('editComplexCode').value = complex.complex_code || '';
    document.getElementById('editContactPhone').value = complex.contact_phone || '';
    document.getElementById('editContactEmail').value = complex.contact_email || '';
    document.getElementById('editAddress').value = complex.address || '';
    document.getElementById('editLogoUrl').value = complex.logo_url || '';
    document.getElementById('editPrimaryColor').value = complex.primary_color || '#2c3e50';
    document.getElementById('editBusinessHours').value = complex.business_hours || '';
    document.getElementById('editDisplayOrder').value = complex.display_order || 1;
    document.getElementById('editAdminPassword').value = complex.admin_password || '';
    document.getElementById('editIsActive').value = complex.is_active ? 'true' : 'false';
    
    const lessonTypes = Array.isArray(complex.lesson_types) 
        ? complex.lesson_types.join(', ') 
        : (complex.lesson_types || '');
    document.getElementById('editLessonTypes').value = lessonTypes;
    
    document.getElementById('editModal').classList.add('active');
}

// Close edit modal
function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

// Save complex
async function saveComplex() {
    const complexId = document.getElementById('editComplexId').value;
    const complexName = document.getElementById('editComplexName').value.trim();
    const complexCode = document.getElementById('editComplexCode').value.trim();
    
    if (!complexName || !complexCode) {
        alert('단지명과 단지 코드는 필수입니다.');
        return;
    }
    
    const lessonTypesText = document.getElementById('editLessonTypes').value.trim();
    const lessonTypes = lessonTypesText 
        ? lessonTypesText.split(',').map(t => t.trim()).filter(t => t)
        : [];
    
    const data = {
        complex_name: complexName,
        complex_code: complexCode,
        contact_phone: document.getElementById('editContactPhone').value.trim(),
        contact_email: document.getElementById('editContactEmail').value.trim(),
        address: document.getElementById('editAddress').value.trim(),
        logo_url: document.getElementById('editLogoUrl').value.trim(),
        primary_color: document.getElementById('editPrimaryColor').value.trim() || '#2c3e50',
        business_hours: document.getElementById('editBusinessHours').value.trim(),
        display_order: parseInt(document.getElementById('editDisplayOrder').value) || 1,
        admin_password: document.getElementById('editAdminPassword').value.trim() || 'admin1234',
        is_active: document.getElementById('editIsActive').value === 'true',
        lesson_types: lessonTypes
    };
    
    try {
        if (complexId) {
            // Update existing complex
            console.log('🔄 Updating complex:', complexId);
            
            // Try PATCH first
            const patchResponse = await fetch(`${TABLES_ENDPOINT}/complex_settings/${complexId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (patchResponse.ok) {
                console.log('✅ Complex updated (PATCH)');
                alert('단지 정보가 수정되었습니다.');
                closeEditModal();
                await loadComplexes();
                return;
            }
            
            // Try PUT
            const complex = allComplexes.find(c => c.id === complexId);
            const fullData = { ...complex, ...data };
            delete fullData.gs_project_id;
            delete fullData.gs_table_name;
            delete fullData.updated_at;
            
            const putResponse = await fetch(`${TABLES_ENDPOINT}/complex_settings/${complexId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fullData)
            });
            
            if (putResponse.ok) {
                console.log('✅ Complex updated (PUT)');
                alert('단지 정보가 수정되었습니다.');
                closeEditModal();
                await loadComplexes();
                return;
            }
            
            throw new Error('Update failed');
            
        } else {
            // Create new complex
            console.log('➕ Creating new complex');
            console.log('Data:', data);
            
            const response = await fetch(`${TABLES_ENDPOINT}/complex_settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            console.log('Response status:', response.status);
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Complex created:', result);
                alert('새 단지가 추가되었습니다.');
                closeEditModal();
                await loadComplexes();
            } else {
                const errorText = await response.text();
                console.error('❌ Create failed:', response.status, errorText);
                throw new Error(`Create failed: ${response.status} - ${errorText}`);
            }
        }
        
    } catch (error) {
        console.error('Error saving complex:', error);
        alert('저장에 실패했습니다.\n\n' + error.message);
    }
}

// Delete complex
async function deleteComplex(complexId) {
    const complex = allComplexes.find(c => c.id === complexId);
    if (!complex) return;
    
    const confirmed = confirm(`"${complex.complex_name}" 단지를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`);
    if (!confirmed) return;
    
    try {
        console.log('🗑️ Deleting complex:', complexId);
        
        const response = await fetch(`${TABLES_ENDPOINT}/complex_settings/${complexId}`, {
            method: 'DELETE'
        });
        
        if (response.ok || response.status === 204) {
            console.log('✅ Complex deleted');
            alert('단지가 삭제되었습니다.');
            await loadComplexes();
        } else {
            throw new Error('Delete failed');
        }
        
    } catch (error) {
        console.error('Error deleting complex:', error);
        alert('삭제에 실패했습니다.\n\n' + error.message);
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

// Copy complex URL to clipboard
function copyComplexURL(complexCode) {
    const url = `${window.location.origin}/?complex=${complexCode}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(url).then(() => {
        alert(`URL이 복사되었습니다!\n\n${url}\n\n입주민에게 이 URL을 공유하세요.`);
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback
        prompt('이 URL을 복사하세요:', url);
    });
}

// Generate QR code
function generateQRCode(complexCode) {
    const url = `${window.location.origin}/?complex=${complexCode}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}`;
    
    // Open in new window
    const qrWindow = window.open('', 'QR Code', 'width=500,height=600');
    qrWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>QR 코드 - ${complexCode}</title>
            <style>
                body {
                    font-family: 'Segoe UI', sans-serif;
                    text-align: center;
                    padding: 20px;
                    background: #f5f5f5;
                }
                h2 { color: #2c3e50; margin-bottom: 10px; }
                p { color: #666; margin-bottom: 20px; }
                img { 
                    max-width: 100%; 
                    border: 10px solid white; 
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    border-radius: 10px;
                    background: white;
                }
                .url {
                    background: white;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                    word-break: break-all;
                    font-family: monospace;
                    color: #1976d2;
                }
                button {
                    background: #2c3e50;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    margin: 10px 5px;
                }
                button:hover { background: #34495e; }
            </style>
        </head>
        <body>
            <h2>🏢 단지 QR 코드</h2>
            <p>입주민이 이 QR 코드를 스캔하면 해당 단지 페이지로 이동합니다</p>
            <img src="${qrUrl}" alt="QR Code">
            <div class="url">${url}</div>
            <button onclick="window.print()">🖨️ 인쇄하기</button>
            <button onclick="downloadQR()">💾 이미지 저장</button>
            <button onclick="window.close()">✖️ 닫기</button>
            <script>
                function downloadQR() {
                    const link = document.createElement('a');
                    link.href = '${qrUrl}';
                    link.download = 'QR_${complexCode}.png';
                    link.click();
                }
            </script>
        </body>
        </html>
    `);
}
