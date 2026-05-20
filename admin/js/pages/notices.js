/** 공지사항 관리 */
const notices = {
    data: [],
    async render() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-bullhorn"></i> 공지사항 관리</h2>
                <button class="btn-primary btn-sm" onclick="notices.showForm()">
                    <i class="fas fa-plus"></i> 새 공지
                </button>
            </div>
            <div id="noticeList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load() {
        try {
            const params = {};
            params.complexId = getEffectiveComplexId(); if (!params.complexId) delete params.complexId;
            const res = await API.notices.list(params);
            this.data = res.data || [];
            this.renderList();
        } catch(e) { document.getElementById('noticeList').innerHTML = `<p class="error-hint">${e.message}</p>`; }
    },
    renderList() {
        const c = document.getElementById('noticeList');
        if (!this.data.length) { c.innerHTML = '<p class="empty-hint">공지사항이 없습니다</p>'; return; }
        c.innerHTML = this.data.map(n => `
            <div class="list-item">
                <div class="item-status">
                    ${n.is_pinned ? '<span class="status-badge status-warning"><i class="fas fa-thumbtack"></i></span>' : ''}
                    ${!n.is_active ? '<span class="status-badge status-muted">비활성</span>' : ''}
                    ${n.image_url ? '<span class="status-badge" style="background:#e8f5e9;color:#2e7d32"><i class="fas fa-image"></i></span>' : ''}
                </div>
                <div class="item-main">
                    <strong>${n.title}</strong>
                    <small>${n.complex_code ? `[${n.complex_code}] ` : ''}${formatDate(n.created_at)}</small>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" onclick="notices.showForm('${n.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-ghost dark btn-sm" onclick="notices.deleteItem('${n.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`).join('');
    },
    showForm(id) {
        const n = id ? this.data.find(x => x.id === id) : null;
        if (!id && !getEffectiveComplexId()) {
            // 마스터 관리자: 먼저 단지 선택
            pickComplexForCreate((complexId, complexName) => {
                notices._openNoticeForm(null, complexId, complexName);
            });
            return;
        }
        notices._openNoticeForm(n, getEffectiveComplexId());
    },
    _openNoticeForm(n, complexId, complexName) {
        const title = complexName ? `새 공지 작성 — ${complexName}` : (n ? '공지 수정' : '새 공지 작성');
        // 기존 이미지 미리보기 HTML
        const existingImageHtml = n?.image_url
            ? `<div id="noticeImagePreview" style="margin-top:8px">
                   <img src="${escHtml(n.image_url)}" alt="첨부 이미지"
                        style="max-width:100%;max-height:200px;border-radius:6px;border:1px solid #e0e0e0">
                   <button type="button" onclick="notices._removeImage()"
                           style="display:block;margin-top:4px;font-size:.8rem;color:#e53935;background:none;border:none;cursor:pointer">
                       <i class="fas fa-times-circle"></i> 이미지 제거
                   </button>
               </div>`
            : `<div id="noticeImagePreview" style="margin-top:8px;display:none"></div>`;

        const body = `
            ${complexName ? `<p style="font-size:.85rem;color:#888;margin-bottom:8px"><i class="fas fa-building"></i> ${escHtml(complexName)}</p>` : ''}
            <input type="hidden" id="noticeComplexId" value="${complexId || ''}">
            <input type="hidden" id="noticeImageUrl" value="${n?.image_url ? escHtml(n.image_url) : ''}">
            <div class="form-group"><label>제목</label><input type="text" id="noticeTitle" value="${n ? escHtml(n.title) : ''}"></div>
            <div class="form-group"><label>내용</label><textarea id="noticeContent" rows="6">${n ? escHtml(n.content) : ''}</textarea></div>
            <div class="form-group">
                <label>이미지 첨부 <span style="font-size:.8rem;color:#999">(선택 · JPG/PNG/GIF, 최대 5MB)</span></label>
                <div style="display:flex;gap:8px;align-items:center">
                    <label style="cursor:pointer">
                        <span class="btn-secondary btn-sm" style="padding:6px 14px;border-radius:6px;font-size:.85rem">
                            <i class="fas fa-image"></i> 파일 선택
                        </span>
                        <input type="file" id="noticeImageFile" accept="image/*"
                               style="display:none" onchange="notices._onImageSelected(this)">
                    </label>
                    <span id="noticeImageFileName" style="font-size:.85rem;color:#666"></span>
                    <span id="noticeImageUploadStatus" style="font-size:.82rem"></span>
                </div>
                ${existingImageHtml}
            </div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="noticePinned" ${n?.is_pinned ? 'checked' : ''}>
                    <span>상단 고정</span>
                </label>
            </div>
            ${n ? `<div class="form-group"><label class="checkbox-label"><input type="checkbox" id="noticeActive" ${n.is_active ? 'checked' : ''}><span>활성화</span></label></div>` : ''}`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" id="noticeSaveBtn" onclick="notices.save('${n?.id || ''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(title, body, footer);
    },

    // ── 이미지 파일 선택 핸들러 ──────────────────────────────
    async _onImageSelected(input) {
        const file = input.files[0];
        if (!file) return;

        // 크기 체크 (5MB)
        if (file.size > 5 * 1024 * 1024) {
            showToast('이미지 크기는 5MB 이하로 업로드하세요', 'error');
            input.value = '';
            return;
        }

        document.getElementById('noticeImageFileName').textContent = file.name;
        const statusEl = document.getElementById('noticeImageUploadStatus');
        const saveBtn  = document.getElementById('noticeSaveBtn');

        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:#1976d2"></i> 업로드 중...';
        if (saveBtn) saveBtn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/upload/image', { method: 'POST', body: formData });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || '업로드 실패');

            // hidden input에 URL 저장
            document.getElementById('noticeImageUrl').value = json.url;

            // 미리보기 갱신
            const preview = document.getElementById('noticeImagePreview');
            preview.style.display = '';
            preview.innerHTML = `
                <img src="${json.url}" alt="첨부 이미지"
                     style="max-width:100%;max-height:200px;border-radius:6px;border:1px solid #e0e0e0">
                <button type="button" onclick="notices._removeImage()"
                        style="display:block;margin-top:4px;font-size:.8rem;color:#e53935;background:none;border:none;cursor:pointer">
                    <i class="fas fa-times-circle"></i> 이미지 제거
                </button>`;

            statusEl.innerHTML = '<i class="fas fa-check-circle" style="color:#43a047"></i> 업로드 완료';
        } catch(e) {
            statusEl.innerHTML = `<span style="color:#e53935"><i class="fas fa-exclamation-circle"></i> ${e.message}</span>`;
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    },

    // ── 이미지 제거 ─────────────────────────────────────────
    _removeImage() {
        document.getElementById('noticeImageUrl').value = '';
        const preview = document.getElementById('noticeImagePreview');
        if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
        const fileInput = document.getElementById('noticeImageFile');
        if (fileInput) fileInput.value = '';
        const nameEl = document.getElementById('noticeImageFileName');
        if (nameEl) nameEl.textContent = '';
        const statusEl = document.getElementById('noticeImageUploadStatus');
        if (statusEl) statusEl.innerHTML = '';
    },

    // ── 저장 ────────────────────────────────────────────────
    async save(id) {
        const title   = document.getElementById('noticeTitle').value;
        const content = document.getElementById('noticeContent').value;
        if (!title || !content) { showToast('제목과 내용을 입력하세요', 'error'); return; }

        // 업로드 중 저장 방지 (버튼 disabled 상태 체크)
        const saveBtn = document.getElementById('noticeSaveBtn');
        if (saveBtn && saveBtn.disabled) { showToast('이미지 업로드 완료 후 저장하세요', 'warning'); return; }

        try {
            const imageUrlEl = document.getElementById('noticeImageUrl');
            const image_url  = imageUrlEl ? (imageUrlEl.value.trim() || null) : null;

            const data = { title, content, is_pinned: document.getElementById('noticePinned').checked, image_url };
            if (id) {
                const activeEl = document.getElementById('noticeActive');
                if (activeEl) data.is_active = activeEl.checked;
                await API.notices.update(id, data);
            } else {
                // 단지 ID: hidden input 우선, 없으면 Admin.complex.id
                const cxIdEl = document.getElementById('noticeComplexId');
                data.complex_id = (cxIdEl?.value) || getEffectiveComplexId();
                if (!data.complex_id) { showToast('단지를 선택하세요', 'error'); return; }
                await API.notices.create(data);
            }
            closeGlobalModal();
            showToast('저장되었습니다');
            await this.load();
        } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
    },
    deleteItem(id) {
        showConfirm('삭제 확인', '공지사항을 삭제하시겠습니까?', async () => {
            try { await API.notices.delete(id); showToast('삭제되었습니다'); await this.load(); }
            catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    }
};
