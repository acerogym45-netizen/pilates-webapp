/** 공지사항 관리 — 다중 이미지 슬라이드 지원 */
const notices = {
    data: [],
    // 현재 편집 중인 이미지 URL 배열 (최대 10장)
    _editImages: [],

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
        c.innerHTML = this.data.map(n => {
            const imgCount = Array.isArray(n.images) ? n.images.length : (n.image_url ? 1 : 0);
            return `
            <div class="list-item">
                <div class="item-status">
                    ${n.is_pinned ? '<span class="status-badge status-warning"><i class="fas fa-thumbtack"></i></span>' : ''}
                    ${!n.is_active ? '<span class="status-badge status-muted">비활성</span>' : ''}
                    ${imgCount > 0 ? `<span class="status-badge" style="background:#e8f5e9;color:#2e7d32"><i class="fas fa-images"></i> ${imgCount}</span>` : ''}
                </div>
                <div class="item-main">
                    <strong>${n.title}</strong>
                    <small>${n.complex_code ? `[${n.complex_code}] ` : ''}${formatDate(n.created_at)}</small>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" onclick="notices.showForm('${n.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-ghost dark btn-sm" onclick="notices.deleteItem('${n.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
    },

    showForm(id) {
        const n = id ? this.data.find(x => x.id === id) : null;
        if (!id && !getEffectiveComplexId()) {
            pickComplexForCreate((complexId, complexName) => {
                notices._openNoticeForm(null, complexId, complexName);
            });
            return;
        }
        notices._openNoticeForm(n, getEffectiveComplexId());
    },

    _openNoticeForm(n, complexId, complexName) {
        // 기존 이미지 배열 초기화
        this._editImages = Array.isArray(n?.images) && n.images.length > 0
            ? [...n.images]
            : (n?.image_url ? [n.image_url] : []);

        const title = complexName ? `새 공지 작성 — ${complexName}` : (n ? '공지 수정' : '새 공지 작성');

        const body = `
            ${complexName ? `<p style="font-size:.85rem;color:#888;margin-bottom:8px"><i class="fas fa-building"></i> ${escHtml(complexName)}</p>` : ''}
            <input type="hidden" id="noticeComplexId" value="${complexId || ''}">
            <div class="form-group"><label>제목</label><input type="text" id="noticeTitle" value="${n ? escHtml(n.title) : ''}"></div>
            <div class="form-group"><label>내용</label><textarea id="noticeContent" rows="6">${n ? escHtml(n.content) : ''}</textarea></div>

            <!-- ── 다중 이미지 업로드 ── -->
            <div class="form-group">
                <label>이미지 첨부
                    <span style="font-size:.8rem;color:#999">(최대 10장 · JPG/PNG/GIF, 장당 5MB)</span>
                </label>

                <!-- 이미지 썸네일 목록 -->
                <div id="noticeImageList" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;min-height:10px"></div>

                <!-- 추가 버튼 -->
                <div id="noticeAddImageBtn" style="display:inline-block">
                    <label style="cursor:pointer">
                        <span class="btn-secondary btn-sm" style="padding:6px 14px;border-radius:6px;font-size:.85rem">
                            <i class="fas fa-plus"></i> 이미지 추가
                        </span>
                        <input type="file" id="noticeImageFile" accept="image/*" multiple
                               style="display:none" onchange="notices._onImagesSelected(this)">
                    </label>
                    <span id="noticeImageUploadStatus" style="font-size:.82rem;margin-left:8px"></span>
                </div>
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
        // 초기 썸네일 렌더
        this._renderImageList();
    },

    // ── 썸네일 목록 렌더 ────────────────────────────────────
    _renderImageList() {
        const container = document.getElementById('noticeImageList');
        const addBtn    = document.getElementById('noticeAddImageBtn');
        if (!container) return;

        container.innerHTML = this._editImages.map((url, i) => `
            <div style="position:relative;width:90px;height:90px;border-radius:6px;overflow:hidden;border:1px solid #ddd;flex-shrink:0">
                <img src="${escHtml(url)}" style="width:100%;height:100%;object-fit:cover;display:block">
                <!-- 삭제 버튼 -->
                <button onclick="notices._removeImageAt(${i})"
                        style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">
                    <i class="fas fa-times"></i>
                </button>
                <!-- 순서 이동 -->
                <div style="position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;background:rgba(0,0,0,.4);padding:2px 4px">
                    ${i > 0 ? `<button onclick="notices._moveImage(${i},-1)" style="background:none;border:none;color:#fff;font-size:.65rem;cursor:pointer;padding:0">◀</button>` : '<span style="width:14px"></span>'}
                    <span style="color:#fff;font-size:.65rem">${i+1}/${this._editImages.length}</span>
                    ${i < this._editImages.length-1 ? `<button onclick="notices._moveImage(${i},1)" style="background:none;border:none;color:#fff;font-size:.65rem;cursor:pointer;padding:0">▶</button>` : '<span style="width:14px"></span>'}
                </div>
            </div>`).join('');

        // 10장 초과 시 추가 버튼 숨김
        if (addBtn) addBtn.style.display = this._editImages.length >= 10 ? 'none' : 'inline-block';
    },

    // ── 이미지 파일 선택 (multiple) ─────────────────────────
    async _onImagesSelected(input) {
        const files = Array.from(input.files || []);
        if (!files.length) return;

        const remain = 10 - this._editImages.length;
        if (remain <= 0) { showToast('이미지는 최대 10장까지 추가할 수 있습니다', 'warning'); input.value = ''; return; }

        const toUpload = files.slice(0, remain);
        const statusEl = document.getElementById('noticeImageUploadStatus');
        const saveBtn  = document.getElementById('noticeSaveBtn');
        if (saveBtn) saveBtn.disabled = true;

        let done = 0;
        for (const file of toUpload) {
            if (file.size > 5 * 1024 * 1024) { showToast(`${file.name}: 5MB 이하만 업로드 가능`, 'error'); continue; }

            if (statusEl) statusEl.innerHTML = `<i class="fas fa-spinner fa-spin" style="color:#1976d2"></i> 업로드 중 (${done+1}/${toUpload.length})...`;

            try {
                // 이미지 리사이즈 (instructors._resizeImage 재사용)
                let uploadFile = file;
                if (typeof instructors !== 'undefined' && instructors._resizeImage) {
                    try { uploadFile = await instructors._resizeImage(file, 1200, 1200, 0.85); } catch(_) {}
                }
                const formData = new FormData();
                formData.append('image', uploadFile);
                const res  = await fetch('/api/upload/image', { method: 'POST', body: formData });
                const json = await res.json();
                if (!json.success) throw new Error(json.error || '업로드 실패');
                this._editImages.push(json.url);
                done++;
            } catch(e) {
                showToast(`${file.name} 업로드 실패: ${e.message}`, 'error');
            }
        }

        input.value = '';
        if (saveBtn) saveBtn.disabled = false;
        if (statusEl) {
            if (done > 0) {
                statusEl.innerHTML = `<i class="fas fa-check-circle" style="color:#43a047"></i> ${done}장 업로드 완료`;
                setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 2500);
            } else {
                statusEl.innerHTML = '';
            }
        }
        this._renderImageList();
    },

    // ── 특정 인덱스 이미지 삭제 ─────────────────────────────
    _removeImageAt(idx) {
        this._editImages.splice(idx, 1);
        this._renderImageList();
    },

    // ── 순서 이동 (dir: -1 앞으로, +1 뒤로) ────────────────
    _moveImage(idx, dir) {
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= this._editImages.length) return;
        [this._editImages[idx], this._editImages[newIdx]] = [this._editImages[newIdx], this._editImages[idx]];
        this._renderImageList();
    },

    // ── 저장 ────────────────────────────────────────────────
    async save(id) {
        const title   = document.getElementById('noticeTitle').value.trim();
        const content = document.getElementById('noticeContent').value.trim();
        if (!title || !content) { showToast('제목과 내용을 입력하세요', 'error'); return; }

        const saveBtn = document.getElementById('noticeSaveBtn');
        if (saveBtn && saveBtn.disabled) { showToast('이미지 업로드 완료 후 저장하세요', 'warning'); return; }

        try {
            const images    = [...this._editImages];
            const image_url = images[0] || null;

            const data = {
                title, content,
                is_pinned: document.getElementById('noticePinned').checked,
                images,
                image_url
            };
            if (id) {
                const activeEl = document.getElementById('noticeActive');
                if (activeEl) data.is_active = activeEl.checked;
                await API.notices.update(id, data);
            } else {
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
