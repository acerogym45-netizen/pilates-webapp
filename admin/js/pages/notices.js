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
        const body = `
            ${complexName ? `<p style="font-size:.85rem;color:#888;margin-bottom:8px"><i class="fas fa-building"></i> ${escHtml(complexName)}</p>` : ''}
            <input type="hidden" id="noticeComplexId" value="${complexId || ''}">
            <div class="form-group"><label>제목</label><input type="text" id="noticeTitle" value="${n ? escHtml(n.title) : ''}"></div>
            <div class="form-group"><label>내용</label><textarea id="noticeContent" rows="6">${n ? escHtml(n.content) : ''}</textarea></div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="noticePinned" ${n?.is_pinned ? 'checked' : ''}>
                    <span>상단 고정</span>
                </label>
            </div>
            ${n ? `<div class="form-group"><label class="checkbox-label"><input type="checkbox" id="noticeActive" ${n.is_active ? 'checked' : ''}><span>활성화</span></label></div>` : ''}`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="notices.save('${n?.id || ''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(title, body, footer);
    },
    async save(id) {
        const title   = document.getElementById('noticeTitle').value;
        const content = document.getElementById('noticeContent').value;
        if (!title || !content) { showToast('제목과 내용을 입력하세요', 'error'); return; }
        try {
            const data = { title, content, is_pinned: document.getElementById('noticePinned').checked };
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
