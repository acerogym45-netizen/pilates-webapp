/** 신청 관리 페이지 */
const applications = {
    data: [],
    filtered: [],
    currentFilter: 'all',
    searchQuery: '',

    async render() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-file-alt"></i> 신청 관리</h2>
                <div class="header-actions">
                    <button class="btn-secondary btn-sm" onclick="applications.exportCSV()">
                        <i class="fas fa-download"></i> CSV
                    </button>
                    <button class="btn-secondary btn-sm" onclick="applications.render()">
                        <i class="fas fa-sync"></i>
                    </button>
                </div>
            </div>

            <div class="filter-bar">
                <button class="filter-btn active" data-filter="all" onclick="applications.filter('all')">전체</button>
                <button class="filter-btn" data-filter="approved" onclick="applications.filter('approved')">승인</button>
                <button class="filter-btn" data-filter="waiting" onclick="applications.filter('waiting')">대기</button>
                <button class="filter-btn" data-filter="rejected" onclick="applications.filter('rejected')">거부</button>
                <button class="filter-btn" data-filter="cancelled" onclick="applications.filter('cancelled')">해지</button>
            </div>

            <div class="search-bar">
                <input type="text" id="appSearch" placeholder="이름, 동호수, 전화번호 검색..."
                       oninput="applications.search(this.value)">
            </div>

            <div id="appList" class="data-list">
                <div class="loading-mini"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
            </div>`;

        await this.load();
    },

    async load() {
        try {
            const res = await API.applications.list({ complexId: Admin.complex?.id, limit: 1000 });
            this.data = res.data || [];
            this.filtered = [...this.data];
            this.renderList();
        } catch (e) {
            document.getElementById('appList').innerHTML = `<p class="error-hint">데이터 로드 실패: ${e.message}</p>`;
        }
    },

    filter(status) {
        this.currentFilter = status;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.filter-btn[data-filter="${status}"]`)?.classList.add('active');
        this.applyFilters();
    },

    search(q) {
        this.searchQuery = q;
        this.applyFilters();
    },

    applyFilters() {
        let list = [...this.data];
        if (this.currentFilter !== 'all') list = list.filter(a => a.status === this.currentFilter);
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            list = list.filter(a =>
                (a.name || '').toLowerCase().includes(q) ||
                (a.dong || '').includes(q) ||
                (a.ho || '').includes(q) ||
                (a.phone || '').includes(q) ||
                (a.program_name || '').toLowerCase().includes(q)
            );
        }
        this.filtered = list;
        this.renderList();
    },

    renderList() {
        const container = document.getElementById('appList');
        if (!this.filtered.length) {
            container.innerHTML = '<p class="empty-hint">데이터가 없습니다</p>';
            return;
        }
        container.innerHTML = `
            <div class="list-summary">${this.filtered.length}건</div>
            ${this.filtered.map(a => `
                <div class="list-item" onclick="applications.showDetail('${a.id}')">
                    <div class="item-status">
                        <span class="status-badge status-${statusClass(a.status)}">${statusLabel(a.status)}</span>
                        ${a.waiting_order ? `<small>대기 ${a.waiting_order}번</small>` : ''}
                    </div>
                    <div class="item-main">
                        <strong>${a.dong} ${a.ho} | ${a.name}</strong>
                        <p>${a.program_name} ${a.preferred_time ? '| ' + a.preferred_time : ''}</p>
                        <small>${a.phone} | ${formatDate(a.created_at)}</small>
                    </div>
                    <i class="fas fa-chevron-right item-arrow"></i>
                </div>
            `).join('')}`;
    },

    async showDetail(id) {
        const a = this.data.find(x => x.id === id);
        if (!a) return;

        const bodyHtml = `
            <div class="detail-grid">
                <div class="detail-row"><label>상태</label><span class="status-badge status-${statusClass(a.status)}">${statusLabel(a.status)}</span></div>
                <div class="detail-row"><label>동/호수</label><span>${a.dong} ${a.ho}</span></div>
                <div class="detail-row"><label>이름</label><span>${a.name}</span></div>
                <div class="detail-row"><label>전화번호</label><span>${a.phone}</span></div>
                <div class="detail-row"><label>프로그램</label><span>${a.program_name}</span></div>
                <div class="detail-row"><label>희망 시간</label><span>${a.preferred_time || '-'}</span></div>
                <div class="detail-row"><label>신청일</label><span>${formatDate(a.created_at)}</span></div>
                ${a.notes ? `<div class="detail-row"><label>메모</label><span>${a.notes}</span></div>` : ''}
                ${a.signature_data ? `
                <div class="detail-row full">
                    <label>서명</label>
                    <img src="${a.signature_data}" alt="서명" style="max-width:200px;border:1px solid #eee;border-radius:6px">
                </div>` : ''}
            </div>`;

        const footerHtml = `
            <div class="modal-btn-group">
                <button class="btn-primary btn-sm" onclick="applications.editForm('${id}')">
                    <i class="fas fa-edit"></i> 수정
                </button>
                ${a.status === 'waiting' ? `
                <button class="btn-success btn-sm" onclick="applications.changeStatus('${id}','approved')">
                    <i class="fas fa-check"></i> 승인
                </button>` : ''}
                ${a.status === 'approved' ? `
                <button class="btn-warning btn-sm" onclick="applications.changeStatus('${id}','cancelled')">
                    <i class="fas fa-ban"></i> 해지 처리
                </button>` : ''}
                <button class="btn-danger btn-sm" onclick="applications.deleteItem('${id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </div>`;

        openGlobalModal(`<i class="fas fa-file-alt"></i> 신청 상세`, bodyHtml, footerHtml);
    },

    editForm(id) {
        const a = this.data.find(x => x.id === id);
        if (!a) return;

        const bodyHtml = `
            <div class="form-group"><label>동</label><input type="text" id="editDong" value="${escHtml(a.dong)}"></div>
            <div class="form-group"><label>호수</label><input type="text" id="editHo" value="${escHtml(a.ho)}"></div>
            <div class="form-group"><label>이름</label><input type="text" id="editName" value="${escHtml(a.name)}"></div>
            <div class="form-group"><label>전화번호</label><input type="tel" id="editPhone" value="${escHtml(a.phone)}"></div>
            <div class="form-group"><label>프로그램명</label><input type="text" id="editProgram" value="${escHtml(a.program_name)}"></div>
            <div class="form-group"><label>희망 시간</label><input type="text" id="editTime" value="${escHtml(a.preferred_time || '')}"></div>
            <div class="form-group">
                <label>상태</label>
                <select id="editStatus">
                    ${['approved','waiting','rejected','cancelled','expired','transferred','received'].map(s =>
                        `<option value="${s}" ${a.status===s?'selected':''}>${statusLabel(s)}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group"><label>메모</label><textarea id="editNotes" rows="3">${escHtml(a.notes || '')}</textarea></div>`;

        const footerHtml = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="applications.saveEdit('${id}')">
                <i class="fas fa-save"></i> 저장
            </button>`;

        openGlobalModal('<i class="fas fa-edit"></i> 신청 수정', bodyHtml, footerHtml);
    },

    async saveEdit(id) {
        try {
            await API.applications.update(id, {
                dong: document.getElementById('editDong').value,
                ho: document.getElementById('editHo').value,
                name: document.getElementById('editName').value,
                phone: document.getElementById('editPhone').value,
                program_name: document.getElementById('editProgram').value,
                preferred_time: document.getElementById('editTime').value,
                status: document.getElementById('editStatus').value,
                notes: document.getElementById('editNotes').value
            });
            closeGlobalModal();
            showToast('저장되었습니다');
            await this.load();
        } catch (e) { showToast('저장 실패: ' + e.message, 'error'); }
    },

    async changeStatus(id, status) {
        try {
            await API.applications.update(id, { status });
            closeGlobalModal();
            showToast(`상태가 "${statusLabel(status)}"으로 변경되었습니다`);
            await this.load();
            loadBadges();
        } catch (e) { showToast('변경 실패: ' + e.message, 'error'); }
    },

    deleteItem(id) {
        showConfirm('삭제 확인', '이 신청을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.', async () => {
            try {
                await API.applications.delete(id);
                closeGlobalModal();
                showToast('삭제되었습니다');
                await this.load();
            } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    },

    exportCSV() {
        const headers = ['신청일', '상태', '동', '호수', '이름', '전화번호', '프로그램', '희망시간', '대기순번'];
        const rows = this.filtered.map(a => ({
            '신청일': formatDate(a.created_at),
            '상태': statusLabel(a.status),
            '동': a.dong, '호수': a.ho, '이름': a.name, '전화번호': a.phone,
            '프로그램': a.program_name, '희망시간': a.preferred_time || '',
            '대기순번': a.waiting_order || ''
        }));
        downloadCSV(`신청목록_${new Date().toLocaleDateString('ko')}.csv`, rows, headers);
    }
};
