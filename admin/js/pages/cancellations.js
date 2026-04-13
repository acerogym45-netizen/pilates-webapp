/** 해지 관리 */
const cancellations = {
    data: [],
    async render() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-times-circle"></i> 해지 관리</h2>
                <button class="btn-secondary btn-sm" onclick="cancellations.render()"><i class="fas fa-sync"></i></button>
            </div>
            <div class="filter-bar">
                <button class="filter-btn active" onclick="cancellations.filter(this,'')">전체</button>
                <button class="filter-btn" onclick="cancellations.filter(this,'pending')">대기중</button>
                <button class="filter-btn" onclick="cancellations.filter(this,'approved')">승인</button>
                <button class="filter-btn" onclick="cancellations.filter(this,'rejected')">거부</button>
            </div>
            <div id="cancelList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load(status = '') {
        try {
            const params = { complexId: Admin.complex?.id };
            if (status) params.status = status;
            const res = await API.cancellations.list(params);
            this.data = res.data || [];
            this.renderList(this.data);
        } catch (e) { document.getElementById('cancelList').innerHTML = `<p class="error-hint">${e.message}</p>`; }
    },
    filter(btn, status) {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.load(status);
    },
    renderList(list) {
        const container = document.getElementById('cancelList');
        if (!list.length) { container.innerHTML = '<p class="empty-hint">해지 신청이 없습니다</p>'; return; }
        container.innerHTML = `<div class="list-summary">${list.length}건</div>` + list.map(c => `
            <div class="list-item" onclick="cancellations.showDetail('${c.id}')">
                <div class="item-status"><span class="status-badge status-${statusClass(c.status)}">${statusLabel(c.status)}</span></div>
                <div class="item-main">
                    <strong>${c.dong} ${c.ho} | ${c.name}</strong>
                    <p>${c.program_name || '-'}</p>
                    <small>${c.phone} | ${formatDate(c.created_at)}</small>
                </div>
                <i class="fas fa-chevron-right item-arrow"></i>
            </div>`).join('');
    },
    showDetail(id) {
        const c = this.data.find(x => x.id === id);
        if (!c) return;
        const body = `
            <div class="detail-grid">
                <div class="detail-row"><label>상태</label><span class="status-badge status-${statusClass(c.status)}">${statusLabel(c.status)}</span></div>
                <div class="detail-row"><label>동/호수</label><span>${c.dong} ${c.ho}</span></div>
                <div class="detail-row"><label>이름</label><span>${c.name}</span></div>
                <div class="detail-row"><label>전화</label><span>${c.phone}</span></div>
                <div class="detail-row"><label>프로그램</label><span>${c.program_name || '-'}</span></div>
                <div class="detail-row"><label>사유</label><span>${c.reason || '-'}</span></div>
                <div class="detail-row"><label>신청일</label><span>${formatDate(c.created_at)}</span></div>
            </div>`;
        const footer = c.status === 'pending' ? `
            <div class="modal-btn-group">
                <button class="btn-success btn-sm" onclick="cancellations.updateStatus('${c.id}','approved')">
                    <i class="fas fa-check"></i> 승인
                </button>
                <button class="btn-danger btn-sm" onclick="cancellations.updateStatus('${c.id}','rejected')">
                    <i class="fas fa-times"></i> 거부
                </button>
            </div>` : '';
        openGlobalModal('<i class="fas fa-times-circle"></i> 해지 상세', body, footer);
    },
    async updateStatus(id, status) {
        try {
            await API.cancellations.update(id, { status });
            closeGlobalModal();
            showToast(`해지 신청이 "${statusLabel(status)}" 처리되었습니다`);
            await this.load();
            loadBadges();
        } catch(e) { showToast('처리 실패: ' + e.message, 'error'); }
    }
};

/** 문의 관리 */
const inquiries = {
    data: [],
    async render() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-comments"></i> 문의 관리</h2>
                <button class="btn-secondary btn-sm" onclick="inquiries.render()"><i class="fas fa-sync"></i></button>
            </div>
            <div id="inqList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load() {
        try {
            const res = await API.inquiries.list({ complexId: Admin.complex?.id, isAdmin: 'true' });
            this.data = res.data || [];
            this.renderList();
        } catch(e) { document.getElementById('inqList').innerHTML = `<p class="error-hint">${e.message}</p>`; }
    },
    renderList() {
        const container = document.getElementById('inqList');
        if (!this.data.length) { container.innerHTML = '<p class="empty-hint">문의가 없습니다</p>'; return; }
        container.innerHTML = `<div class="list-summary">${this.data.length}건</div>` + this.data.map(q => `
            <div class="list-item ${!q.answer ? 'item-highlight' : ''}" onclick="inquiries.showDetail('${q.id}')">
                <div class="item-status">
                    ${q.answer ? '<span class="status-badge status-success">답변완료</span>' : '<span class="status-badge status-warning">미답변</span>'}
                </div>
                <div class="item-main">
                    <strong>${q.title}</strong>
                    <p>${q.name} ${q.dong ? '| ' + q.dong + ' ' + q.ho : ''}</p>
                    <small>${formatDate(q.created_at)}</small>
                </div>
                <i class="fas fa-chevron-right item-arrow"></i>
            </div>`).join('');
    },
    showDetail(id) {
        const q = this.data.find(x => x.id === id);
        if (!q) return;
        const body = `
            <div class="detail-grid">
                <div class="detail-row"><label>이름</label><span>${q.name}</span></div>
                ${q.dong ? `<div class="detail-row"><label>동/호수</label><span>${q.dong} ${q.ho}</span></div>` : ''}
                <div class="detail-row"><label>공개</label><span>${q.is_public ? '공개' : '비공개'}</span></div>
                <div class="detail-row full"><label>제목</label><span>${q.title}</span></div>
                <div class="detail-row full"><label>내용</label><p style="white-space:pre-wrap">${q.content}</p></div>
                ${q.answer ? `<div class="detail-row full"><label>기존 답변</label><p style="white-space:pre-wrap;color:#27ae60">${q.answer}</p></div>` : ''}
            </div>
            <div class="form-group" style="margin-top:16px">
                <label><i class="fas fa-reply"></i> 답변 작성</label>
                <textarea id="answerText" rows="4" placeholder="답변을 입력하세요">${q.answer || ''}</textarea>
            </div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="hideInquiry" ${q.is_hidden ? 'checked' : ''}>
                    <span>문의 숨김 처리</span>
                </label>
            </div>`;
        const footer = `
            <div class="modal-btn-group">
                <button class="btn-primary btn-sm" onclick="inquiries.saveAnswer('${id}')">
                    <i class="fas fa-save"></i> 저장
                </button>
                <button class="btn-danger btn-sm" onclick="inquiries.deleteItem('${id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </div>`;
        openGlobalModal('<i class="fas fa-comments"></i> 문의 상세', body, footer);
    },
    async saveAnswer(id) {
        try {
            await API.inquiries.update(id, {
                answer: document.getElementById('answerText').value,
                is_hidden: document.getElementById('hideInquiry').checked
            });
            closeGlobalModal();
            showToast('저장되었습니다');
            await this.load();
            loadBadges();
        } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
    },
    deleteItem(id) {
        showConfirm('삭제 확인', '이 문의를 삭제하시겠습니까?', async () => {
            try {
                await API.inquiries.delete(id);
                closeGlobalModal();
                showToast('삭제되었습니다');
                await this.load();
            } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    }
};
