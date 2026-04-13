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
            const res = await API.notices.list({ complexId: Admin.complex?.id });
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
                    <small>${formatDate(n.created_at)}</small>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" onclick="notices.showForm('${n.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-ghost dark btn-sm" onclick="notices.deleteItem('${n.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`).join('');
    },
    showForm(id) {
        const n = id ? this.data.find(x => x.id === id) : null;
        const body = `
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
            <button class="btn-primary" onclick="notices.save('${id || ''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(n ? '공지 수정' : '새 공지 작성', body, footer);
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
                data.complex_id = Admin.complex?.id;
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
