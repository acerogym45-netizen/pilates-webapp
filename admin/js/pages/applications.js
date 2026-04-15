/** 신청 관리 페이지 - v2.3 양도/양수 + 관리비 계산기 */
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
                    <button class="btn-fee btn-sm" onclick="applications.showFeeCalc()" style="background:#f39c12;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.85rem">
                        <i class="fas fa-calculator"></i> 관리비 계산기
                    </button>
                    <button class="btn-secondary btn-sm" onclick="applications.showImportModal()">
                        <i class="fas fa-upload"></i> 가져오기
                    </button>
                    <button class="btn-secondary btn-sm" onclick="applications.exportCSV()">
                        <i class="fas fa-download"></i> 내보내기
                    </button>
                    <button class="btn-secondary btn-sm" onclick="applications.render()">
                        <i class="fas fa-sync"></i>
                    </button>
                </div>
            </div>

            <div class="filter-bar">
                <button class="filter-btn active" data-filter="all"         onclick="applications.filter('all')">전체</button>
                <button class="filter-btn" data-filter="approved"           onclick="applications.filter('approved')">승인</button>
                <button class="filter-btn" data-filter="waiting"            onclick="applications.filter('waiting')">대기</button>
                <button class="filter-btn" data-filter="rejected"           onclick="applications.filter('rejected')">거부</button>
                <button class="filter-btn" data-filter="cancelled"          onclick="applications.filter('cancelled')">해지</button>
                <button class="filter-btn" data-filter="transferred"        onclick="applications.filter('transferred')">양도</button>
                <button class="filter-btn" data-filter="received"           onclick="applications.filter('received')">양수</button>
            </div>

            <div class="search-bar">
                <input type="text" id="appSearch" placeholder="이름, 동호수, 전화번호, 프로그램 검색..."
                       oninput="applications.search(this.value)">
            </div>

            <div id="appList" class="data-list">
                <div class="loading-mini"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
            </div>`;

        await this.load();
    },

    async load() {
        try {
            const params = { limit: 1000 };
            if (Admin.complex?.id) params.complexId = Admin.complex.id;
            const res = await API.applications.list(params);
            this.data = res.data || [];
            this.filtered = [...this.data];
            this.applyFilters();
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

    search(q) { this.searchQuery = q; this.applyFilters(); },

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
            ${this.filtered.map(a => {
                const isTransfer = a.status === 'transferred' || a.status === 'received';
                const transferBadge = a.status === 'transferred'
                    ? `<span style="font-size:.75rem;background:#9b59b6;color:#fff;border-radius:4px;padding:1px 6px;margin-left:4px">양도</span>`
                    : a.status === 'received'
                    ? `<span style="font-size:.75rem;background:#1abc9c;color:#fff;border-radius:4px;padding:1px 6px;margin-left:4px">양수</span>`
                    : '';
                const sessionsBadge = a.remaining_sessions != null
                    ? `<span style="font-size:.75rem;background:#e8f4fd;color:#2980b9;border:1px solid #bce0f9;border-radius:4px;padding:1px 6px;margin-left:4px">잔여 ${a.remaining_sessions}회</span>`
                    : '';
                return `
                <div class="list-item" onclick="applications.showDetail('${a.id}')">
                    <div class="item-status">
                        <span class="status-badge status-${statusClass(a.status)}">${statusLabel(a.status)}</span>
                        ${a.waiting_order ? `<small>대기 ${a.waiting_order}번</small>` : ''}
                    </div>
                    <div class="item-main">
                        <strong>${a.dong} ${a.ho} | ${a.name}</strong>${transferBadge}${sessionsBadge}
                        <p>${a.program_name}${a.preferred_time ? ' | ' + a.preferred_time : ''}${a.monthly_fee ? ' | ₩' + parseInt(a.monthly_fee).toLocaleString() : ''}</p>
                        <small>${a.phone} | ${formatDate(a.created_at)}${a.transfer_date ? ' | 양도일: ' + a.transfer_date : ''}</small>
                    </div>
                    <i class="fas fa-chevron-right item-arrow"></i>
                </div>`;
            }).join('')}`;
    },

    async showDetail(id) {
        const a = this.data.find(x => x.id === id);
        if (!a) return;

        // 양도 연계 정보 조회
        let transferInfo = '';
        if (a.status === 'transferred' && a.transfer_to) {
            const to = this.data.find(x => x.id === a.transfer_to);
            if (to) transferInfo = `<div class="detail-row" style="background:#fef9e7;border-radius:6px;padding:6px 10px">
                <label>양수자</label>
                <span>${to.dong} ${to.ho} | ${to.name} | ${to.phone} 
                <button onclick="applications.showDetail('${to.id}')" style="font-size:.78rem;background:#9b59b6;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;margin-left:6px">보기</button>
                </span></div>`;
        }
        if (a.status === 'received' && a.transfer_from) {
            const from = this.data.find(x => x.id === a.transfer_from);
            if (from) transferInfo = `<div class="detail-row" style="background:#eafaf1;border-radius:6px;padding:6px 10px">
                <label>양도자</label>
                <span>${from.dong} ${from.ho} | ${from.name} | ${from.phone}
                <button onclick="applications.showDetail('${from.id}')" style="font-size:.78rem;background:#1abc9c;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;margin-left:6px">보기</button>
                </span></div>`;
        }

        const bodyHtml = `
            <div class="detail-grid">
                <div class="detail-row"><label>상태</label><span class="status-badge status-${statusClass(a.status)}">${statusLabel(a.status)}</span></div>
                <div class="detail-row"><label>동/호수</label><span>${a.dong} ${a.ho}</span></div>
                <div class="detail-row"><label>이름</label><span>${a.name}</span></div>
                <div class="detail-row"><label>전화번호</label><span>${a.phone}</span></div>
                <div class="detail-row"><label>프로그램</label><span>${a.program_name}</span></div>
                <div class="detail-row"><label>희망 시간</label><span>${a.preferred_time || '-'}</span></div>
                ${a.monthly_fee ? `<div class="detail-row"><label>월 수강료</label><span>₩${parseInt(a.monthly_fee).toLocaleString()}</span></div>` : ''}
                ${a.total_sessions != null ? `<div class="detail-row"><label>당월 총 횟수</label><span>${a.total_sessions}회</span></div>` : ''}
                ${a.remaining_sessions != null ? `<div class="detail-row"><label>잔여 횟수</label><span style="font-weight:600;color:#2980b9">${a.remaining_sessions}회</span></div>` : ''}
                ${a.transfer_date ? `<div class="detail-row"><label>양도일</label><span>${a.transfer_date}</span></div>` : ''}
                ${a.transfer_memo ? `<div class="detail-row"><label>양도 메모</label><span>${a.transfer_memo}</span></div>` : ''}
                ${transferInfo}
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
                <button class="btn-warning btn-sm" onclick="applications.showTransferModal('${id}')">
                    <i class="fas fa-exchange-alt"></i> 양도 처리
                </button>
                <button class="btn-warning btn-sm" onclick="applications.changeStatus('${id}','cancelled')">
                    <i class="fas fa-ban"></i> 해지
                </button>` : ''}
                <button class="btn-danger btn-sm" onclick="applications.deleteItem('${id}')">
                    <i class="fas fa-trash"></i> 삭제
                </button>
            </div>`;

        openGlobalModal(`<i class="fas fa-file-alt"></i> 신청 상세`, bodyHtml, footerHtml);
    },

    // ══════════════════════════════════════════════════
    //  양도 처리 모달
    // ══════════════════════════════════════════════════
    showTransferModal(id) {
        const a = this.data.find(x => x.id === id);
        if (!a) return;

        const today = new Date().toISOString().slice(0, 10);
        const body = `
            <div style="background:#fef9e7;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:.88rem">
                <i class="fas fa-info-circle" style="color:#f39c12"></i>
                <strong>${a.dong} ${a.ho} ${a.name}</strong> 님의 <strong>${a.program_name}</strong> 수강권을 양도합니다.
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                <div>
                    <h4 style="font-size:.88rem;color:#666;margin-bottom:10px"><i class="fas fa-arrow-right"></i> 양도자 (현재)</h4>
                    <p style="font-size:.85rem;color:#333">${a.dong} ${a.ho} | ${a.name}<br>${a.phone}</p>
                </div>
                <div>
                    <h4 style="font-size:.88rem;color:#1abc9c;margin-bottom:10px"><i class="fas fa-arrow-right"></i> 양수자 (입주민)</h4>
                    <div class="form-group" style="margin:0"><input type="text" id="trDong" placeholder="동 *" style="margin-bottom:4px"></div>
                    <div class="form-group" style="margin:0"><input type="text" id="trHo"   placeholder="호수 *" style="margin-bottom:4px"></div>
                    <div class="form-group" style="margin:0"><input type="text" id="trName" placeholder="이름 *" style="margin-bottom:4px"></div>
                    <div class="form-group" style="margin:0"><input type="tel"  id="trPhone" placeholder="전화번호 *"></div>
                </div>
            </div>

            <hr style="margin:12px 0;border:1px solid #f0f0f0">

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="form-group">
                    <label>잔여 횟수 * <small style="color:#999">(관리비 계산 기준)</small></label>
                    <input type="number" id="trRemaining" min="0" max="31" placeholder="예: 5"
                           oninput="applications._calcTransferFee()">
                </div>
                <div class="form-group">
                    <label>양도일 *</label>
                    <input type="date" id="trDate" value="${today}">
                </div>
            </div>

            ${a.monthly_fee ? `
            <div id="transferFeePreview" style="background:#f0fff4;border:1px solid #2ecc71;border-radius:8px;padding:10px 14px;margin-bottom:12px;display:none;font-size:.85rem">
                <strong><i class="fas fa-calculator"></i> 관리비 자동 계산</strong>
                <div id="transferFeeDetail" style="margin-top:6px"></div>
            </div>` : ''}

            <div class="form-group">
                <label>양도 메모 (특이사항)</label>
                <textarea id="trMemo" rows="2" placeholder="예: 출산 예정, 부상 등"></textarea>
            </div>`;

        // 숨겨진 필드로 원본 정보 전달
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" style="background:#9b59b6" onclick="applications.doTransfer('${id}')">
                <i class="fas fa-exchange-alt"></i> 양도/양수 처리
            </button>`;

        openGlobalModal(`<i class="fas fa-exchange-alt"></i> 양도/양수 처리`, body, footer);

        // monthly_fee 전달용
        document.getElementById('trRemaining')?.setAttribute('data-monthly-fee', a.monthly_fee || 0);
        document.getElementById('trRemaining')?.setAttribute('data-total-sessions', a.total_sessions || 0);
    },

    _calcTransferFee() {
        const rem = parseInt(document.getElementById('trRemaining')?.value) || 0;
        const fee = parseInt(document.getElementById('trRemaining')?.getAttribute('data-monthly-fee')) || 0;
        const total = parseInt(document.getElementById('trRemaining')?.getAttribute('data-total-sessions')) || 0;
        const preview = document.getElementById('transferFeePreview');
        const detail  = document.getElementById('transferFeeDetail');
        if (!preview || !detail || !fee || !total || rem === 0) {
            if (preview) preview.style.display = 'none';
            return;
        }
        const perSession = Math.round(fee / total);
        const refund = Math.max(0, rem * perSession - Math.round(fee * 0.1));
        const receiverFee = rem * perSession;
        detail.innerHTML = `
            <table style="width:100%;font-size:.82rem;border-collapse:collapse">
                <tr><td style="padding:3px 0;color:#666">회당 단가</td><td style="text-align:right;font-weight:600">₩${perSession.toLocaleString()}</td></tr>
                <tr><td style="padding:3px 0;color:#666">잔여 ${rem}회 × ₩${perSession.toLocaleString()}</td><td style="text-align:right">₩${(rem*perSession).toLocaleString()}</td></tr>
                <tr style="color:#e74c3c"><td style="padding:3px 0">위약금 (수강료 10%)</td><td style="text-align:right">-₩${Math.round(fee*0.1).toLocaleString()}</td></tr>
                <tr style="border-top:1px solid #2ecc71;font-weight:700;color:#27ae60">
                    <td style="padding:5px 0">양도자 환불액</td><td style="text-align:right">₩${refund.toLocaleString()}</td>
                </tr>
                <tr style="color:#1abc9c"><td style="padding:3px 0">양수자 납부액</td><td style="text-align:right">₩${receiverFee.toLocaleString()}</td></tr>
            </table>`;
        preview.style.display = 'block';
    },

    async doTransfer(id) {
        const dong  = document.getElementById('trDong')?.value?.trim();
        const ho    = document.getElementById('trHo')?.value?.trim();
        const name  = document.getElementById('trName')?.value?.trim();
        const phone = document.getElementById('trPhone')?.value?.trim();
        const rem   = document.getElementById('trRemaining')?.value;
        const date  = document.getElementById('trDate')?.value;
        const memo  = document.getElementById('trMemo')?.value?.trim();

        if (!dong || !ho || !name || !phone) { showToast('양수자 동·호수·이름·전화번호를 입력하세요', 'error'); return; }
        if (!rem)  { showToast('잔여 횟수를 입력하세요', 'error'); return; }

        try {
            const res = await API.applications.transfer(id, {
                new_dong: dong, new_ho: ho, new_name: name, new_phone: phone,
                remaining_sessions: parseInt(rem),
                transfer_date: date,
                transfer_memo: memo
            });
            closeGlobalModal();
            showToast('✅ 양도/양수 처리 완료', 'success');
            await this.load();
        } catch (e) { showToast('양도 처리 실패: ' + e.message, 'error'); }
    },

    // ══════════════════════════════════════════════════
    //  관리비 계산기 모달
    // ══════════════════════════════════════════════════
    showFeeCalc() {
        const body = `
            <div style="font-size:.85rem;color:#666;margin-bottom:14px">
                <i class="fas fa-info-circle"></i>
                당월 실제 개설 횟수 기준으로 관리비를 계산합니다.
                횟수가 부족한 경우(공휴일 등) 3회·7회 단축 운영 시 금액도 확인할 수 있습니다.
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="form-group">
                    <label>월 수강료 (원) *</label>
                    <input type="number" id="fcFee" placeholder="예: 180000" oninput="applications._doFeeCalc()">
                </div>
                <div class="form-group">
                    <label>당월 총 개설 횟수 *</label>
                    <input type="number" id="fcTotal" placeholder="예: 8 또는 9" min="1" max="31" oninput="applications._doFeeCalc()">
                </div>
                <div class="form-group">
                    <label>출석 횟수</label>
                    <input type="number" id="fcAttended" placeholder="0" min="0" oninput="applications._doFeeCalc()">
                </div>
                <div class="form-group">
                    <label>노쇼 횟수 <small style="color:#e74c3c">(사전연락없이 결석)</small></label>
                    <input type="number" id="fcAbsent" placeholder="0" min="0" oninput="applications._doFeeCalc()">
                </div>
            </div>

            <div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:12px">
                <label style="font-size:.85rem;font-weight:600;display:flex;align-items:center;gap:8px;cursor:pointer">
                    <input type="checkbox" id="fcIsTransfer" onchange="applications._toggleTransferCalc()">
                    <span>양도/양수 잔여 횟수 계산 포함</span>
                </label>
                <div id="fcTransferArea" style="display:none;margin-top:10px">
                    <div class="form-group">
                        <label>잔여 횟수</label>
                        <input type="number" id="fcRemaining" placeholder="0" min="0" oninput="applications._doFeeCalc()">
                    </div>
                </div>
            </div>

            <div id="feeCalcResult" style="display:none;background:#fff;border:2px solid #667eea;border-radius:10px;padding:14px">
                <h4 style="font-size:.9rem;color:#667eea;margin-bottom:10px"><i class="fas fa-receipt"></i> 계산 결과</h4>
                <div id="feeCalcDetail"></div>
            </div>`;

        openGlobalModal('<i class="fas fa-calculator"></i> 관리비 계산기', body);
    },

    _toggleTransferCalc() {
        const checked = document.getElementById('fcIsTransfer')?.checked;
        document.getElementById('fcTransferArea').style.display = checked ? 'block' : 'none';
        this._doFeeCalc();
    },

    async _doFeeCalc() {
        const fee    = parseInt(document.getElementById('fcFee')?.value) || 0;
        const total  = parseInt(document.getElementById('fcTotal')?.value) || 0;
        if (!fee || !total) { document.getElementById('feeCalcResult').style.display = 'none'; return; }

        const attended  = parseInt(document.getElementById('fcAttended')?.value) || 0;
        const absent    = parseInt(document.getElementById('fcAbsent')?.value)   || 0;
        const isTransfer = document.getElementById('fcIsTransfer')?.checked;
        const remaining = parseInt(document.getElementById('fcRemaining')?.value) || 0;

        try {
            const res = await API.applications.feeCalc({
                monthly_fee: fee, total_sessions: total,
                attended_sessions: attended, absent_sessions: absent,
                is_transfer: isTransfer, remaining_sessions: remaining
            });
            const d = res.data;
            const detail = document.getElementById('feeCalcDetail');
            const result = document.getElementById('feeCalcResult');

            detail.innerHTML = `
                <table style="width:100%;font-size:.85rem;border-collapse:collapse">
                    <tr style="background:#f8f9fa">
                        <th style="padding:6px 8px;text-align:left;font-weight:600;border-radius:4px 0 0 4px">항목</th>
                        <th style="padding:6px 8px;text-align:right;font-weight:600">금액</th>
                    </tr>
                    <tr><td style="padding:5px 8px;color:#555">월 수강료</td><td style="text-align:right">₩${d.monthly_fee.toLocaleString()}</td></tr>
                    <tr><td style="padding:5px 8px;color:#555">당월 총 횟수</td><td style="text-align:right">${d.total_sessions}회</td></tr>
                    <tr style="background:#edf7ff"><td style="padding:5px 8px;font-weight:600">회당 단가</td><td style="text-align:right;font-weight:600">₩${d.per_session_fee.toLocaleString()}</td></tr>
                    ${attended || absent ? `
                    <tr><td style="padding:5px 8px;color:#555">출석 ${d.attended_sessions}회 + 노쇼 ${d.absent_sessions}회 × 회당</td><td style="text-align:right">₩${d.base_fee.toLocaleString()}</td></tr>
                    ${d.absent_sessions > 0 ? `<tr style="color:#e74c3c"><td style="padding:5px 8px">노쇼 패널티 (${d.absent_sessions}회 × ₩15,000)</td><td style="text-align:right">+₩${d.nosho_penalty.toLocaleString()}</td></tr>` : ''}
                    <tr style="background:#fef9e7;font-weight:700;font-size:.92rem">
                        <td style="padding:6px 8px">청구 관리비</td>
                        <td style="text-align:right;color:#e67e22">₩${d.total_fee.toLocaleString()}</td>
                    </tr>` : ''}
                    <tr style="border-top:1px dashed #ddd">
                        <td style="padding:5px 8px;color:#888;font-size:.8rem">3회 단축 운영 시</td>
                        <td style="text-align:right;color:#888;font-size:.8rem">₩${d.short_3_sessions.toLocaleString()}</td>
                    </tr>
                    <tr>
                        <td style="padding:5px 8px;color:#888;font-size:.8rem">7회 단축 운영 시</td>
                        <td style="text-align:right;color:#888;font-size:.8rem">₩${d.short_7_sessions.toLocaleString()}</td>
                    </tr>
                    ${isTransfer && remaining > 0 ? `
                    <tr style="border-top:2px solid #9b59b6;margin-top:4px">
                        <td colspan="2" style="padding:5px 8px;font-weight:600;color:#9b59b6;font-size:.88rem">양도/양수 계산</td>
                    </tr>
                    <tr><td style="padding:5px 8px;color:#555">잔여 ${remaining}회 × ₩${d.per_session_fee.toLocaleString()}</td><td style="text-align:right">₩${(remaining * d.per_session_fee).toLocaleString()}</td></tr>
                    <tr style="color:#e74c3c"><td style="padding:5px 8px">위약금 (수강료 10%)</td><td style="text-align:right">-₩${Math.round(d.monthly_fee*0.1).toLocaleString()}</td></tr>
                    <tr style="background:#f0fff4;font-weight:700;color:#27ae60">
                        <td style="padding:6px 8px">양도자 환불액</td>
                        <td style="text-align:right">₩${d.transfer_refund.toLocaleString()}</td>
                    </tr>
                    <tr style="color:#1abc9c">
                        <td style="padding:5px 8px">양수자 납부액</td>
                        <td style="text-align:right;font-weight:600">₩${d.transfer_fee.toLocaleString()}</td>
                    </tr>` : ''}
                </table>`;
            result.style.display = 'block';
        } catch (e) { /* 조용히 실패 */ }
    },

    // ══════════════════════════════════════════════════
    //  수정 폼
    // ══════════════════════════════════════════════════
    editForm(id) {
        const a = this.data.find(x => x.id === id);
        if (!a) return;

        const bodyHtml = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-group"><label>동</label><input type="text" id="editDong" value="${escHtml(a.dong)}"></div>
                <div class="form-group"><label>호수</label><input type="text" id="editHo" value="${escHtml(a.ho)}"></div>
                <div class="form-group"><label>이름</label><input type="text" id="editName" value="${escHtml(a.name)}"></div>
                <div class="form-group"><label>전화번호</label><input type="tel" id="editPhone" value="${escHtml(a.phone)}"></div>
            </div>
            <div class="form-group"><label>프로그램명</label><input type="text" id="editProgram" value="${escHtml(a.program_name)}"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-group"><label>희망 시간</label><input type="text" id="editTime" value="${escHtml(a.preferred_time || '')}"></div>
                <div class="form-group">
                    <label>상태</label>
                    <select id="editStatus">
                        ${['approved','waiting','rejected','cancelled','expired','transferred','received'].map(s =>
                            `<option value="${s}" ${a.status===s?'selected':''}>${statusLabel(s)}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                <div class="form-group">
                    <label>월 수강료 (원)</label>
                    <input type="number" id="editFee" value="${a.monthly_fee || ''}" placeholder="예: 180000">
                </div>
                <div class="form-group">
                    <label>당월 총 횟수</label>
                    <input type="number" id="editTotal" value="${a.total_sessions || ''}" placeholder="예: 8">
                </div>
                <div class="form-group">
                    <label>잔여 횟수</label>
                    <input type="number" id="editRemaining" value="${a.remaining_sessions ?? ''}" placeholder="미입력 가능">
                </div>
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
            const monthly_fee     = document.getElementById('editFee')?.value;
            const total_sessions  = document.getElementById('editTotal')?.value;
            const remaining_sessions = document.getElementById('editRemaining')?.value;
            await API.applications.update(id, {
                dong: document.getElementById('editDong').value,
                ho:   document.getElementById('editHo').value,
                name: document.getElementById('editName').value,
                phone:document.getElementById('editPhone').value,
                program_name: document.getElementById('editProgram').value,
                preferred_time: document.getElementById('editTime').value,
                status:   document.getElementById('editStatus').value,
                notes:    document.getElementById('editNotes').value,
                monthly_fee:     monthly_fee     ? parseInt(monthly_fee)     : undefined,
                total_sessions:  total_sessions  ? parseInt(total_sessions)  : undefined,
                remaining_sessions: remaining_sessions !== '' ? parseInt(remaining_sessions) : undefined
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
        const headers = ['신청일', '상태', '동', '호수', '이름', '전화번호', '프로그램', '희망시간', '대기순번', '월수강료', '총횟수', '잔여횟수', '양도일', '메모'];
        const rows = this.filtered.map(a => ({
            '신청일': formatDate(a.created_at),
            '상태': statusLabel(a.status),
            '동': a.dong, '호수': a.ho, '이름': a.name, '전화번호': a.phone,
            '프로그램': a.program_name, '희망시간': a.preferred_time || '',
            '대기순번': a.waiting_order || '',
            '월수강료': a.monthly_fee || '',
            '총횟수': a.total_sessions || '',
            '잔여횟수': a.remaining_sessions != null ? a.remaining_sessions : '',
            '양도일': a.transfer_date || '',
            '메모': a.notes || ''
        }));
        downloadCSV(`신청목록_${new Date().toLocaleDateString('ko')}.csv`, rows, headers);
    },

    showImportModal() {
        const templateUrl = API.importCsv.templateUrl('applications');
        const body = `
            <div class="import-guide">
                <div class="import-step">
                    <span class="import-num">1</span>
                    <div>
                        <strong>CSV 템플릿 다운로드</strong>
                        <p>아래 버튼으로 양식을 받아 데이터를 채워주세요</p>
                        <a href="${templateUrl}" download class="btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:6px;margin-top:6px;text-decoration:none">
                            <i class="fas fa-file-csv"></i> 신청 템플릿 다운로드
                        </a>
                    </div>
                </div>
                <div class="import-step">
                    <span class="import-num">2</span>
                    <div>
                        <strong>CSV 파일 선택</strong>
                        <input type="file" id="importCsvFile" accept=".csv" style="margin-top:8px;display:block">
                    </div>
                </div>
                <div class="import-step">
                    <span class="import-num">3</span>
                    <div>
                        <strong>중복 처리 방식</strong>
                        <label class="checkbox-label" style="margin-top:8px;display:flex;align-items:center;gap:8px;font-weight:normal">
                            <input type="checkbox" id="importOverwrite">
                            <span>동일 동·호수·프로그램 기존 데이터 덮어쓰기</span>
                        </label>
                        <p class="terms-note">※ 체크 해제 시 중복 항목은 건너뜁니다</p>
                    </div>
                </div>
                <div class="import-tip">
                    <i class="fas fa-info-circle"></i>
                    <span>상태값: 승인 / 대기 / 거부 / 해지 / 만료 / 이관 / 접수 / 양도 / 양수</span>
                </div>
            </div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="applications.doImport()">
                <i class="fas fa-upload"></i> 가져오기 실행
            </button>`;
        openGlobalModal('<i class="fas fa-upload"></i> 신청 데이터 가져오기', body, footer);
    },

    async doImport() {
        const fileEl = document.getElementById('importCsvFile');
        const overwrite = document.getElementById('importOverwrite')?.checked || false;
        if (!fileEl?.files?.length) { showToast('CSV 파일을 선택하세요', 'error'); return; }
        const file = fileEl.files[0];
        const complexId = Admin.complex?.id;
        if (!complexId) { showToast('단지 정보가 없습니다. 단지 코드로 로그인해주세요', 'error'); return; }
        const btnEl = document.querySelector('#globalModal .btn-primary');
        if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...'; }
        try {
            const result = await API.importCsv.applications(complexId, file, overwrite);
            closeGlobalModal();
            showToast(result.message, 'success');
            await this.load();
            loadBadges();
        } catch (e) {
            showToast('가져오기 실패: ' + e.message, 'error');
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-upload"></i> 가져오기 실행'; }
        }
    }
};
