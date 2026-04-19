/** 해지 관리 */
const cancellations = {
    data: [],
    currentTab: 'cancel',   // 'cancel' | 'refund'
    currentStatus: '',

    async render() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-times-circle"></i> 해지 관리</h2>
                <button class="btn-secondary btn-sm" onclick="cancellations.reload()"><i class="fas fa-sync"></i></button>
            </div>

            <!-- 유형 탭: 해지 신청 / 환불 신청 -->
            <div class="type-tab-bar" style="display:flex;gap:8px;margin-bottom:10px">
                <button id="tabCancel" class="type-tab-btn active" onclick="cancellations.switchTab('cancel')">
                    <i class="fas fa-times-circle"></i> 해지 신청
                </button>
                <button id="tabRefund" class="type-tab-btn" onclick="cancellations.switchTab('refund')">
                    <i class="fas fa-file-invoice-dollar"></i> 환불 신청
                </button>
            </div>

            <!-- 상태 필터 -->
            <div class="filter-bar">
                <button class="filter-btn active" onclick="cancellations.filter(this,'')">전체</button>
                <button class="filter-btn" onclick="cancellations.filter(this,'pending')">대기중</button>
                <button class="filter-btn" onclick="cancellations.filter(this,'approved')">승인</button>
                <button class="filter-btn" onclick="cancellations.filter(this,'rejected')">거부</button>
            </div>
            <div id="cancelList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;

        this.applyTabStyle();
        await this.load();
    },

    applyTabStyle() {
        const style = document.getElementById('cancelTabStyle');
        if (style) return;
        const s = document.createElement('style');
        s.id = 'cancelTabStyle';
        s.textContent = `
            .type-tab-btn {
                flex:1; padding:9px 0; border:1.5px solid #d1d5db; border-radius:8px;
                background:#fff; font-size:.85rem; font-weight:600; cursor:pointer;
                color:#6b7280; transition:.15s;
            }
            .type-tab-btn.active {
                border-color: var(--color-primary, #4f46e5);
                background: var(--color-primary, #4f46e5);
                color:#fff;
            }
            .type-tab-btn:hover:not(.active) { border-color: var(--color-primary,#4f46e5); color: var(--color-primary,#4f46e5); }
            .badge-refund { background:#fff3cd; color:#856404; border:1px solid #ffc107; }
        `;
        document.head.appendChild(s);
    },

    switchTab(tab) {
        this.currentTab = tab;
        this.currentStatus = '';
        // 유형 탭 active
        document.getElementById('tabCancel')?.classList.toggle('active', tab === 'cancel');
        document.getElementById('tabRefund')?.classList.toggle('active', tab === 'refund');
        // 상태 필터 active 초기화
        document.querySelectorAll('.filter-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
        this.load();
    },

    reload() { this.render(); },

    async load(status = '') {
        this.currentStatus = status;
        try {
            const params = { complexId: getEffectiveComplexId(), request_type: this.currentTab };
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
        const isRefund = this.currentTab === 'refund';

        if (!list.length) {
            container.innerHTML = `<p class="empty-hint">${isRefund ? '환불 신청이 없습니다' : '해지 신청이 없습니다'}</p>`;
            return;
        }

        container.innerHTML = `<div class="list-summary">${list.length}건</div>` + list.map(c => `
            <div class="list-item" onclick="cancellations.showDetail('${c.id}')">
                <div class="item-status">
                    <span class="status-badge status-${statusClass(c.status)}">${statusLabel(c.status)}</span>
                    ${isRefund ? '<span class="status-badge badge-refund" style="margin-top:4px;display:block">환불</span>' : ''}
                </div>
                <div class="item-main">
                    <strong>${c.dong} ${c.ho} | ${c.name}</strong>
                    <p>${c.program_name || (isRefund ? '환불 신청' : '-')}</p>
                    <small>${c.phone} | ${formatDate(c.created_at)}</small>
                </div>
                <i class="fas fa-chevron-right item-arrow"></i>
            </div>`).join('');
    },

    showDetail(id) {
        const c = this.data.find(x => x.id === id);
        if (!c) return;
        const isRefund = (c.request_type === 'refund');

        // reason 필드에서 환불사유 파싱
        let reasonDisplay = c.reason || '-';
        let refundDetailDisplay = '';
        if (isRefund && c.reason) {
            const match = c.reason.match(/^\[환불사유:\s*(.+?)\]\n?([\s\S]*)$/);
            if (match) {
                reasonDisplay     = match[1].trim();
                refundDetailDisplay = match[2].trim();
            }
        }

        const body = `
            <div class="detail-grid">
                <div class="detail-row">
                    <label>유형</label>
                    <span>${isRefund
                        ? '<span class="status-badge badge-refund"><i class=\'fas fa-file-invoice-dollar\'></i> 환불 신청</span>'
                        : '<span class="status-badge status-default"><i class=\'fas fa-times-circle\'></i> 해지 신청</span>'
                    }</span>
                </div>
                <div class="detail-row"><label>상태</label><span class="status-badge status-${statusClass(c.status)}">${statusLabel(c.status)}</span></div>
                <div class="detail-row"><label>동/호수</label><span>${c.dong} ${c.ho}</span></div>
                <div class="detail-row"><label>이름</label><span>${c.name}</span></div>
                <div class="detail-row"><label>전화</label><span>${c.phone}</span></div>
                ${!isRefund ? `<div class="detail-row"><label>프로그램</label><span>${c.program_name || '-'}</span></div>` : ''}
                <div class="detail-row"><label>${isRefund ? '환불 사유' : '해지 사유'}</label><span>${reasonDisplay}</span></div>
                ${isRefund && refundDetailDisplay ? `<div class="detail-row full"><label>상세 내용</label><p style="white-space:pre-wrap">${refundDetailDisplay}</p></div>` : ''}
                ${isRefund ? `
                <div class="detail-row full" style="background:#fff5f5;border-radius:6px;padding:8px 10px;margin-top:4px">
                    <label style="color:#c53030"><i class="fas fa-info-circle"></i> 처리 안내</label>
                    <p style="font-size:.82rem;color:#742a2a;line-height:1.6">
                        환불 승인 시 결제금액의 <strong>10% 위약금</strong> 공제 후<br>
                        수강 횟수 × 20,000원 차감하여 환급<br>
                        <em>증빙서류 확인 필수 (진단서·비자 등)</em>
                    </p>
                </div>` : ''}
                <div class="detail-row"><label>신청일</label><span>${formatDate(c.created_at)}</span></div>
                ${c.processed_at ? `<div class="detail-row"><label>처리일</label><span>${formatDate(c.processed_at)}</span></div>` : ''}
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

        const title = isRefund
            ? '<i class="fas fa-file-invoice-dollar"></i> 환불 신청 상세'
            : '<i class="fas fa-times-circle"></i> 해지 상세';
        openGlobalModal(title, body, footer);
    },

    async updateStatus(id, status) {
        try {
            await API.cancellations.update(id, { status });
            closeGlobalModal();
            showToast(`"${statusLabel(status)}" 처리되었습니다`);
            await this.load(this.currentStatus);
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
                <div class="header-actions">
                    <button class="btn-secondary btn-sm" onclick="inquiries.showImportModal()">
                        <i class="fas fa-upload"></i> 가져오기
                    </button>
                    <button class="btn-secondary btn-sm" onclick="inquiries.exportCSV()">
                        <i class="fas fa-download"></i> 내보내기
                    </button>
                    <button class="btn-secondary btn-sm" onclick="inquiries.render()"><i class="fas fa-sync"></i></button>
                </div>
            </div>
            <div id="inqList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load() {
        try {
            const res = await API.inquiries.list({ complexId: getEffectiveComplexId(), isAdmin: 'true' });
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
    },

    exportCSV() {
        const headers = ['등록일', '이름', '동', '호수', '전화번호', '제목', '내용', '답변 여부', '답변'];
        const rows = this.data.map(q => ({
            '등록일': formatDate(q.created_at),
            '이름': q.name, '동': q.dong || '', '호수': q.ho || '',
            '전화번호': q.phone || '', '제목': q.title, '내용': q.content,
            '답변 여부': q.is_answered ? '답변완료' : '미답변', '답변': q.answer || ''
        }));
        downloadCSV(`문의목록_${new Date().toLocaleDateString('ko')}.csv`, rows, headers);
    },

    showImportModal() {
        const templateUrl = API.importCsv.templateUrl('inquiries');
        const body = `
            <div class="import-guide">
                <div class="import-step">
                    <span class="import-num">1</span>
                    <div>
                        <strong>CSV 템플릿 다운로드</strong>
                        <a href="${templateUrl}" download class="btn-secondary btn-sm"
                           style="display:inline-flex;align-items:center;gap:6px;margin-top:6px;text-decoration:none">
                            <i class="fas fa-file-csv"></i> 문의 템플릿 다운로드
                        </a>
                    </div>
                </div>
                <div class="import-step">
                    <span class="import-num">2</span>
                    <div>
                        <strong>CSV 파일 선택</strong>
                        <input type="file" id="importInqFile" accept=".csv" style="margin-top:8px;display:block">
                    </div>
                </div>
                <div class="import-tip">
                    <i class="fas fa-info-circle"></i>
                    <span>답변 컬럼이 있으면 자동으로 답변완료 처리됩니다</span>
                </div>
            </div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="inquiries.doImport()">
                <i class="fas fa-upload"></i> 가져오기 실행
            </button>`;
        openGlobalModal('<i class="fas fa-upload"></i> 문의 데이터 가져오기', body, footer);
    },

    async doImport() {
        const fileEl = document.getElementById('importInqFile');
        if (!fileEl?.files?.length) { showToast('CSV 파일을 선택하세요', 'error'); return; }
        const btnEl = document.querySelector('#globalModal .btn-primary');
        if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...'; }
        try {
            const result = await API.importCsv.inquiries(Admin.complex.id, fileEl.files[0]);
            closeGlobalModal();
            showToast(result.message, 'success');
            await this.load();
        } catch (e) {
            showToast('가져오기 실패: ' + e.message, 'error');
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-upload"></i> 가져오기 실행'; }
        }
    }
};
