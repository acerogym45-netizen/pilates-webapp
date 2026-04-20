/** 강사 관리 */
const instructors = {
    data: [],
    async render() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-user-tie"></i> 강사 관리</h2>
                <button class="btn-primary btn-sm" onclick="instructors.showForm()">
                    <i class="fas fa-plus"></i> 강사 추가
                </button>
            </div>
            <div id="instructorList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load() {
        try {
            const res = await API.instructors.list({ complexId: getEffectiveComplexId() });
            this.data = res.data || [];
            this.renderList();
        } catch(e) { document.getElementById('instructorList').innerHTML = `<p class="error-hint">${e.message}</p>`; }
    },
    renderList() {
        const c = document.getElementById('instructorList');
        if (!this.data.length) { c.innerHTML = '<p class="empty-hint">등록된 강사가 없습니다</p>'; return; }
        c.innerHTML = this.data.map(i => `
            <div class="list-item">
                ${i.photo_url ? `<img src="${i.photo_url}" class="item-thumb" alt="${i.name}">` : '<div class="item-thumb-placeholder"><i class="fas fa-user"></i></div>'}
                <div class="item-main">
                    <strong>${i.name}</strong>
                    <p>${i.title || '-'}</p>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" onclick="instructors.showForm('${i.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-ghost dark btn-sm" onclick="instructors.deleteItem('${i.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`).join('');
    },
    showForm(id) {
        const i = id ? this.data.find(x => x.id === id) : null;
        const body = `
            <div class="form-group"><label>이름 *</label><input type="text" id="iName" value="${i ? escHtml(i.name) : ''}"></div>
            <div class="form-group"><label>직함</label><input type="text" id="iTitle" value="${i ? escHtml(i.title||'') : ''}" placeholder="예: 필라테스 전문 강사"></div>
            <div class="form-group"><label>소개</label><textarea id="iBio" rows="4">${i ? escHtml(i.bio||'') : ''}</textarea></div>
            <div class="form-group">
                <label>사진 URL</label>
                <input type="text" id="iPhoto" value="${i ? escHtml(i.photo_url||'') : ''}" placeholder="https://... 또는 /uploads/파일명">
                <small style="color:#999">또는 파일 직접 업로드:</small>
                <input type="file" id="iPhotoFile" accept="image/*" onchange="instructors.previewPhoto(this)">
                <div id="iPhotoPreview" style="margin-top:8px">
                    ${i?.photo_url ? `<img src="${i.photo_url}" style="width:80px;height:80px;object-fit:cover;border-radius:8px">` : ''}
                </div>
            </div>
            <div class="form-group"><label>표시 순서</label><input type="number" id="iOrder" value="${i?.display_order||0}"></div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="instructors.save('${id||''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(i ? '강사 수정' : '강사 추가', body, footer);
    },
    previewPhoto(input) {
        if (!input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = e => {
            const preview = document.getElementById('iPhotoPreview');
            if (preview) {
                preview.innerHTML = `
                    <img src="${e.target.result}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid #27ae60">
                    <div style="font-size:.75rem;color:#27ae60;margin-top:4px"><i class="fas fa-check-circle"></i> 파일 선택됨: ${escHtml(file.name)}</div>`;
            }
            // iPhoto URL 필드는 비워두기 (파일 우선 사용 명확히 표시)
            const iPhoto = document.getElementById('iPhoto');
            if (iPhoto) iPhoto.placeholder = '파일 업로드 선택됨 (저장 시 자동 처리)';
        };
        reader.readAsDataURL(file);
    },
    async save(id) {
        const name = document.getElementById('iName').value.trim();
        if (!name) { showToast('이름을 입력하세요', 'error'); return; }

        // 저장 버튼 로딩 표시
        const saveBtn = document.querySelector('#globalModal .btn-primary');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

        let photoUrl = document.getElementById('iPhoto').value.trim();
        const fileInput = document.getElementById('iPhotoFile');

        // 파일 업로드 처리
        if (fileInput && fileInput.files && fileInput.files[0]) {
            try {
                const formData = new FormData();
                formData.append('image', fileInput.files[0]);
                // 절대 URL 사용 (sandbox 환경에서 상대경로 오동작 방지)
                const uploadUrl = window.location.origin + '/api/upload/image';
                const res = await fetch(uploadUrl, { method: 'POST', body: formData });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const result = await res.json();
                if (result.success && result.url) {
                    photoUrl = result.url;
                    console.log('[instructor] 이미지 업로드 성공:', photoUrl);
                } else {
                    throw new Error(result.error || '업로드 응답 오류');
                }
            } catch(e) {
                console.error('[instructor] 이미지 업로드 실패:', e);
                if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
                showToast('이미지 업로드 실패: ' + e.message, 'error');
                return;
            }
        }

        try {
            const data = {
                name, title: document.getElementById('iTitle').value,
                bio: document.getElementById('iBio').value,
                photo_url: photoUrl,
                display_order: parseInt(document.getElementById('iOrder').value)||0
            };
            if (id) {
                await API.instructors.update(id, data);
                closeGlobalModal();
                showToast('저장되었습니다');
                await this.load();
            } else {
                const complexId = getEffectiveComplexId();
                if (!complexId) {
                    pickComplexForCreate(async (cxId) => {
                        data.complex_id = cxId;
                        try {
                            await API.instructors.create(data);
                            closeGlobalModal();
                            showToast('저장되었습니다');
                            await instructors.load();
                        }
                        catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
                    });
                    return;
                }
                data.complex_id = complexId;
                await API.instructors.create(data);
                closeGlobalModal();
                showToast('저장되었습니다');
                await this.load();
            }
        } catch(e) {
            console.error('[instructor] save 오류:', e);
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
            showToast('저장 실패: ' + e.message, 'error');
        }
    },
    deleteItem(id) {
        showConfirm('삭제 확인', '강사를 삭제하시겠습니까?', async () => {
            try { await API.instructors.delete(id); showToast('삭제되었습니다'); await this.load(); }
            catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    }
};

/** 커리큘럼 관리 */
const curricula = {
    data: [],
    async render() {
        const now = new Date();
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-calendar-alt"></i> 커리큘럼 관리</h2>
                <button class="btn-primary btn-sm" onclick="curricula.showForm()">
                    <i class="fas fa-plus"></i> 커리큘럼 등록
                </button>
            </div>
            <div id="curricList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load() {
        try {
            const res = await API.curricula.list({ complexId: getEffectiveComplexId() });
            this.data = res.data || [];
            this.renderList();
        } catch(e) { document.getElementById('curricList').innerHTML = `<p class="error-hint">${e.message}</p>`; }
    },
    renderList() {
        const c = document.getElementById('curricList');
        if (!this.data.length) { c.innerHTML = '<p class="empty-hint">등록된 커리큘럼이 없습니다</p>'; return; }
        c.innerHTML = this.data.map(cu => `
            <div class="list-item">
                ${cu.image_url ? `<img src="${cu.image_url}" class="item-thumb" alt="${cu.year}년 ${cu.month}월">` : ''}
                <div class="item-main">
                    <strong>${cu.year}년 ${cu.month}월 커리큘럼</strong>
                    <p>${cu.title || ''}</p>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" onclick="curricula.showForm('${cu.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-ghost dark btn-sm" onclick="curricula.deleteItem('${cu.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`).join('');
    },
    showForm(id) {
        const cu = id ? this.data.find(x => x.id === id) : null;
        const now = new Date();
        const body = `
            <div class="form-row">
                <div class="form-group"><label>년도</label><input type="number" id="cuYear" value="${cu?.year||now.getFullYear()}"></div>
                <div class="form-group"><label>월</label><input type="number" id="cuMonth" min="1" max="12" value="${cu?.month||(now.getMonth()+1)}"></div>
            </div>
            <div class="form-group"><label>제목</label><input type="text" id="cuTitle" value="${cu ? escHtml(cu.title||'') : ''}"></div>
            <div class="form-group"><label>내용</label><textarea id="cuContent" rows="5">${cu ? escHtml(cu.content||'') : ''}</textarea></div>
            <div class="form-group">
                <label>이미지 URL</label>
                <input type="text" id="cuImage" value="${cu ? escHtml(cu.image_url||'') : ''}" placeholder="https://...">
                <small>또는 파일 업로드:</small>
                <input type="file" id="cuImageFile" accept="image/*">
            </div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="curricula.save('${id||''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(cu ? '커리큘럼 수정' : '커리큘럼 등록', body, footer);
    },
    async save(id) {
        let imageUrl = document.getElementById('cuImage').value.trim();
        const fileInput = document.getElementById('cuImageFile');
        if (fileInput.files[0]) {
            try {
                const formData = new FormData();
                formData.append('image', fileInput.files[0]);
                const res = await fetch('/api/upload/image', { method: 'POST', body: formData });
                const result = await res.json();
                if (result.success) imageUrl = result.url;
            } catch(e) { showToast('이미지 업로드 실패', 'error'); return; }
        }
        try {
            const complexId = getEffectiveComplexId();
            if (!complexId) {
                pickComplexForCreate(async (cxId) => {
                    try {
                        await API.curricula.create({
                            complex_id: cxId,
                            year: parseInt(document.getElementById('cuYear').value),
                            month: parseInt(document.getElementById('cuMonth').value),
                            title: document.getElementById('cuTitle').value,
                            content: document.getElementById('cuContent').value,
                            image_url: imageUrl
                        });
                        closeGlobalModal();
                        showToast('저장되었습니다');
                        await curricula.load();
                    } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
                });
                return;
            }
            await API.curricula.create({
                complex_id: complexId,
                year: parseInt(document.getElementById('cuYear').value),
                month: parseInt(document.getElementById('cuMonth').value),
                title: document.getElementById('cuTitle').value,
                content: document.getElementById('cuContent').value,
                image_url: imageUrl
            });
            closeGlobalModal();
            showToast('저장되었습니다');
            await this.load();
        } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
    },
    deleteItem(id) {
        showConfirm('삭제 확인', '커리큘럼을 삭제하시겠습니까?', async () => {
            try { await API.curricula.delete(id); showToast('삭제되었습니다'); await this.load(); }
            catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    }
};
