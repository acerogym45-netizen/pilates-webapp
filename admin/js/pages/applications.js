/** 신청 관리 페이지 - v3.26 신청종류별설정+대기시스템 */
const applications = {
    data: [],
    filtered: [],
    currentFilter: 'all',
    searchQuery: '',
    filterProgram: '',   // 프로그램 필터
    filterTime: '',      // 시간대 필터
    filterDong: '',      // 동 필터

    async render() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-file-alt"></i> 신청 관리</h2>
                <div class="header-actions">
                    <button class="btn-primary btn-sm" onclick="applications.showAddModal()" style="background:#27ae60;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.85rem">
                        <i class="fas fa-plus"></i> 신청 추가
                    </button>
                    <button class="btn-sm" onclick="applications.showAttendanceModal()" style="background:#1abc9c;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.85rem">
                        <i class="fas fa-clipboard-list"></i> 출석부
                    </button>
                    <button class="btn-sm" onclick="applications.showTimetableModal()" style="background:#3498db;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.85rem">
                        <i class="fas fa-calendar-alt"></i> 시간표
                    </button>
                    <button class="btn-sm" id="applyPeriodBtn" onclick="applications.showApplyPeriodModal()" style="background:#8e44ad;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.85rem">
                        <i class="fas fa-clock"></i> 신청기간 설정
                    </button>
                    <button class="btn-sm" id="applySettingsBtn" onclick="applications.showApplySettingsModal()" style="background:#e67e22;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.85rem">
                        <i class="fas fa-sliders-h"></i> 신청 종류 설정
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

            <!-- ▼ 프로그램 현황 패널 (접이식) -->
            <div id="programStatusPanel" style="margin-bottom:12px;border:1px solid #e0e0e0;border-radius:10px;overflow:hidden">
                <div onclick="applications.toggleStatusPanel()"
                     style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#f8f9fa;cursor:pointer;user-select:none">
                    <span style="font-weight:600;font-size:.9rem;color:#2c3e50">
                        <i class="fas fa-chart-bar" style="color:#3498db;margin-right:6px"></i>
                        프로그램 현황
                        <span id="statusPanelBadge" style="font-size:.78rem;color:#666;font-weight:400;margin-left:6px"></span>
                    </span>
                    <span id="statusPanelChevron" style="color:#888;font-size:.85rem">
                        <i class="fas fa-chevron-down"></i>
                    </span>
                </div>
                <div id="statusPanelBody" style="display:none;padding:12px 16px;background:#fff">
                    <div class="loading-mini"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
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

            <div class="detail-filter-bar" id="detailFilterBar">
                <div class="detail-filter-group">
                    <label><i class="fas fa-dumbbell"></i> 프로그램</label>
                    <select id="filterProgram" onchange="applications.setDetailFilter('program', this.value)">
                        <option value="">전체</option>
                    </select>
                </div>
                <div class="detail-filter-group">
                    <label><i class="fas fa-clock"></i> 시간대</label>
                    <select id="filterTime" onchange="applications.setDetailFilter('time', this.value)">
                        <option value="">전체</option>
                    </select>
                </div>
                <div class="detail-filter-group">
                    <label><i class="fas fa-building"></i> 동</label>
                    <select id="filterDong" onchange="applications.setDetailFilter('dong', this.value)">
                        <option value="">전체</option>
                    </select>
                </div>
                <button class="btn-ghost btn-sm" onclick="applications.clearDetailFilters()" style="align-self:flex-end">
                    <i class="fas fa-times"></i> 초기화
                </button>
            </div>

            <div id="appList" class="data-list">
                <div class="loading-mini"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
            </div>`;

        await this.load();
        this.loadProgramStatus(); // 프로그램 현황 패널 비동기 로드
        // 신청기간 버튼 배지 비동기 갱신
        const _cid = getEffectiveComplexId();
        if (_cid) this._refreshApplyPeriodBadge(_cid);
        if (_cid) this._refreshApplySettingsBadge(_cid);
    },

    async load() {
        try {
            const params = { limit: 1000 };
            params.complexId = getEffectiveComplexId(); if (!params.complexId) delete params.complexId;
            const res = await API.applications.list(params);
            this.data = res.data || [];
            // ── 대기순번 동적 계산 (프로그램 + 희망시간 조합별, 신청일 오름차순) ──
            this._calcWaitingOrders();
            this.filtered = [...this.data];
            this._buildDetailFilterOptions();
            this.applyFilters();
        } catch (e) {
            document.getElementById('appList').innerHTML = `<p class="error-hint">데이터 로드 실패: ${e.message}</p>`;
        }
    },

    // ══════════════════════════════════════════════════
    //  프로그램 현황 패널
    // ══════════════════════════════════════════════════
    _statusPanelOpen: false,

    toggleStatusPanel() {
        this._statusPanelOpen = !this._statusPanelOpen;
        const body    = document.getElementById('statusPanelBody');
        const chevron = document.getElementById('statusPanelChevron');
        if (!body) return;
        body.style.display = this._statusPanelOpen ? 'block' : 'none';
        if (chevron) chevron.innerHTML = this._statusPanelOpen
            ? '<i class="fas fa-chevron-up"></i>'
            : '<i class="fas fa-chevron-down"></i>';
        if (this._statusPanelOpen && body.querySelector('.loading-mini')) {
            this.loadProgramStatus();
        }
    },

    async loadProgramStatus() {
        const body  = document.getElementById('statusPanelBody');
        const badge = document.getElementById('statusPanelBadge');
        if (!body) return;
        try {
            const params = {};
            const cid = getEffectiveComplexId();
            if (cid) params.complexId = cid;
            const res = await API.applications.programSummary(params);

            // 단지 미선택 경고
            if (res.warning) {
                body.innerHTML = `<p style="color:#e67e22;font-size:.85rem;text-align:center;padding:12px 0">
                    <i class="fas fa-exclamation-triangle"></i> ${res.warning}
                </p>`;
                if (badge) badge.textContent = '단지를 선택해주세요';
                return;
            }

            const list = res.data || [];

            // 뱃지: 총 승인 인원 합산
            const totalApproved = list.reduce((s, p) => s + p.total_approved, 0);
            const totalWaiting  = list.reduce((s, p) => s + p.total_waiting, 0);
            if (badge) badge.textContent = `승인 ${totalApproved}명 · 대기 ${totalWaiting}명`;

            if (!list.length) {
                body.innerHTML = '<p style="color:#999;font-size:.85rem;text-align:center;padding:12px 0">등록된 활성 프로그램이 없습니다</p>';
                return;
            }

            body.innerHTML = `
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
                    ${list.map(prog => {
                        const slotRows = (prog.slot_summary || []).map(s => {
                            // s.capacity를 기준으로 퍼센트 계산 (슬롯별 정원)
                            const cap = s.capacity || prog.capacity || 6;
                            const exceeded = s.exceeded || s.approved > cap; // 정원 초과 여부
                            const available = exceeded ? 0 : Math.max(0, cap - s.approved);
                            const pct = cap > 0 ? Math.min(100, Math.round(s.approved / cap * 100)) : 0;
                            const isFull = s.isFull || available === 0;
                            const barColor = exceeded ? '#8e44ad' : isFull ? '#e74c3c' : pct >= 80 ? '#e67e22' : '#27ae60';
                            const statusLabel = exceeded
                                ? `<span style="color:#8e44ad;font-size:.75rem">초과 ${s.approved - cap}명</span>`
                                : isFull
                                    ? '<span style="color:#e74c3c;font-size:.75rem">마감</span>'
                                    : `<span style="color:#27ae60;font-size:.75rem">여유 ${available}</span>`;
                            return `
                                <div style="margin-bottom:8px">
                                    <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:3px">
                                        <span style="color:#555">${s.slot}</span>
                                        <span style="font-weight:600;color:${barColor}">
                                            ${s.approved}/${cap}
                                            ${statusLabel}
                                            ${s.waiting > 0 ? ` <span style="color:#f39c12;font-size:.75rem">대기 ${s.waiting}</span>` : ''}
                                        </span>
                                    </div>
                                    <div style="height:6px;background:#eee;border-radius:3px;overflow:hidden">
                                        <div style="height:100%;width:${Math.min(pct,100)}%;background:${barColor};border-radius:3px;transition:width .3s"></div>
                                    </div>
                                </div>`;
                        }).join('');

                        const noSlot = !prog.slot_summary || prog.slot_summary.length === 0;
                        const feeText = prog.estimated_monthly_fee > 0
                            ? `<span style="font-size:.78rem;color:#8e44ad;font-weight:600">₩${prog.estimated_monthly_fee.toLocaleString()}/월</span>`
                            : '';

                        const isInactive = prog.is_active === false;
                        const cardBorder = isInactive ? '1px solid #f0c0c0' : '1px solid #e8ecef';
                        const cardBg     = isInactive ? '#fff8f8' : '#fff';
                        const inactiveBadge = isInactive
                            ? `<span style="font-size:.72rem;background:#fdecea;color:#c0392b;border-radius:4px;padding:2px 6px;margin-left:6px">비활성</span>`
                            : '';
                        return `
                            <div style="border:${cardBorder};border-radius:8px;padding:12px;background:${cardBg}">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                    <span style="font-weight:700;font-size:.88rem;color:#2c3e50">${prog.program_name}${inactiveBadge}</span>
                                    ${feeText}
                                </div>
                                <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
                                    <span style="font-size:.78rem;background:#e8f4fd;color:#2980b9;border-radius:4px;padding:2px 8px">승인 ${prog.total_approved}</span>
                                    ${prog.total_waiting > 0 ? `<span style="font-size:.78rem;background:#fef9e7;color:#f39c12;border-radius:4px;padding:2px 8px">대기 ${prog.total_waiting}</span>` : ''}
                                    ${prog.total_cancelled > 0 ? `<span style="font-size:.78rem;background:#fdedec;color:#c0392b;border-radius:4px;padding:2px 8px">해지 ${prog.total_cancelled}</span>` : ''}
                                </div>
                                ${noSlot
                                    ? `<p style="color:#aaa;font-size:.78rem;margin:0">시간대 정보 없음</p>`
                                    : slotRows
                                }
                            </div>`;
                    }).join('')}
                </div>
                <div style="margin-top:10px;text-align:right">
                    <button onclick="applications.loadProgramStatus()" style="font-size:.78rem;background:none;border:1px solid #ddd;border-radius:4px;padding:3px 10px;cursor:pointer;color:#666">
                        <i class="fas fa-sync-alt"></i> 새로고침
                    </button>
                </div>`;
        } catch (e) {
            if (body) body.innerHTML = `<p style="color:#e74c3c;font-size:.83rem">현황 로드 실패: ${e.message}</p>`;
        }
    },


    _buildDetailFilterOptions() {
        const programs = [...new Set(this.data.map(a => a.program_name).filter(Boolean))].sort();
        const times    = [...new Set(this.data.map(a => a.preferred_time).filter(Boolean))].sort();
        const dongs    = [...new Set(this.data.map(a => a.dong).filter(Boolean))]
            .sort((a, b) => {
                const na = parseInt(a), nb = parseInt(b);
                return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
            });

        const fill = (selId, items) => {
            const el = document.getElementById(selId);
            if (!el) return;
            const cur = el.value;
            el.innerHTML = '<option value="">전체</option>' +
                items.map(v => `<option value="${escHtml(v)}" ${v===cur?'selected':''}>${escHtml(v)}</option>`).join('');
        };
        fill('filterProgram', programs);
        fill('filterTime', times);
        fill('filterDong', dongs);
    },

    setDetailFilter(type, value) {
        if (type === 'program') this.filterProgram = value;
        else if (type === 'time') this.filterTime   = value;
        else if (type === 'dong')  this.filterDong  = value;
        this.applyFilters();
    },

    clearDetailFilters() {
        this.filterProgram = '';
        this.filterTime    = '';
        this.filterDong    = '';
        ['filterProgram','filterTime','filterDong'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        this.applyFilters();
    },

    /** 프로그램+희망시간별 대기 순번을 신청일 순서로 동적 계산하여 각 항목에 주입 */
    _calcWaitingOrders() {
        // 그룹: {program_name}|{preferred_time} 키로 대기자를 신청일 순 정렬
        const waitingMap = {}; // key → [{id, created_at}, ...]
        this.data.forEach(a => {
            if (a.status !== 'waiting') return;
            const key = `${a.program_name||''}|${a.preferred_time||''}`;
            if (!waitingMap[key]) waitingMap[key] = [];
            waitingMap[key].push(a);
        });
        // 신청일(created_at) 오름차순 정렬 후 순번 부여
        Object.values(waitingMap).forEach(list => {
            list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            list.forEach((a, i) => { a._waitingOrder = i + 1; });
        });
        // waiting이 아닌 항목은 초기화
        this.data.forEach(a => { if (a.status !== 'waiting') a._waitingOrder = null; });
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
        if (this.filterProgram) list = list.filter(a => a.program_name === this.filterProgram);
        if (this.filterTime)    list = list.filter(a => a.preferred_time === this.filterTime);
        if (this.filterDong)    list = list.filter(a => a.dong === this.filterDong);
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

                // 취소된 건: cancel_type으로 유형 배지 구분
                // pre_start/waiting = 입주민 신청 취소·변경
                // termination = 입주민 해지 신청 (cancellations 탭 경유)
                // admin = 관리자 직접 처리
                const cancelTypeBadge = (() => {
                    if (a.status !== 'cancelled') return '';
                    const cm = applications._parseCancelMeta(a.notes);
                    if (!cm) return '';
                    if (cm.cancelled_by === 'admin') {
                        return `<span style="font-size:.72rem;background:#7f8c8d;color:#fff;border-radius:4px;padding:1px 6px;margin-left:4px">관리자취소</span>`;
                    }
                    if (cm.cancel_type === 'termination') {
                        return `<span style="font-size:.72rem;background:#e74c3c;color:#fff;border-radius:4px;padding:1px 6px;margin-left:4px">입주민해지신청</span>`;
                    }
                    // pre_start or waiting = 입주민 직접 취소
                    return `<span style="font-size:.72rem;background:#e67e22;color:#fff;border-radius:4px;padding:1px 6px;margin-left:4px">입주민취소</span>`;
                })();

                // 변경 이력이 있는 건: 배지 표시
                const changeLogs = applications._parseChangeLogs(a.notes);
                const changedBadge = changeLogs.length > 0
                    ? `<span style="font-size:.72rem;background:#3498db;color:#fff;border-radius:4px;padding:1px 6px;margin-left:4px">입주민변경 ${changeLogs.length}회</span>`
                    : '';

                return `
                <div class="list-item" onclick="applications.showDetail('${a.id}')">
                    <div class="item-status">
                        <span class="status-badge status-${statusClass(a.status)}">${statusLabel(a.status)}</span>
                        ${a.status === 'waiting' && a._waitingOrder
                            ? `<span class="waiting-order-badge">대기 ${a._waitingOrder}번</span>`
                            : ''
                        }
                    </div>
                    <div class="item-main">
                        <strong>${a.dong} ${a.ho} | ${a.name}</strong>${transferBadge}${sessionsBadge}${cancelTypeBadge}${changedBadge}
                        <p>${a.program_name}${a.preferred_time ? ' | ' + a.preferred_time : ''}${a.monthly_fee ? ' | ₩' + parseInt(a.monthly_fee).toLocaleString() : ''}</p>
                        <small>${a.phone} | ${formatDate(a.created_at)}${a.transfer_date ? ' | 양도일: ' + a.transfer_date : ''}${(() => { const cm = applications._parseCancelMeta(a.notes); return cm ? ' | 취소: ' + formatDate(cm.cancelled_at) : ''; })()}</small>
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
                <div class="detail-row"><label>상태</label>
                    <span>
                        <span class="status-badge status-${statusClass(a.status)}">${statusLabel(a.status)}</span>
                        ${a.status === 'waiting' && a._waitingOrder
                            ? `<span class="waiting-order-badge" style="margin-left:6px">대기 ${a._waitingOrder}번</span>`
                            : ''}
                    </span>
                </div>
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
                ${(() => {
                    const cm = applications._parseCancelMeta(a.notes);
                    if (!cm) return '';
                    const typeLabel = (() => {
                        if (cm.cancelled_by === 'admin')         return '🔧 관리자 직접 취소';
                        if (cm.cancel_type  === 'termination')   return '🔴 입주민 해지 신청 (해지 신청 탭 경유)';
                        if (cm.cancel_type  === 'waiting')       return '🟡 입주민 대기 취소 (신청 취소·변경 탭)';
                        if (cm.cancel_type  === 'pre_start')     return '🟠 입주민 신청 철회 (신청 취소·변경 탭)';
                        return cm.cancel_reason || cm.cancel_type || '취소';
                    })();
                    return `
                        <div class="detail-row" style="background:#fff3f3;border-radius:6px;padding:6px 10px">
                            <label style="color:#c0392b">취소일시</label>
                            <span style="color:#c0392b;font-weight:600">${formatDate(cm.cancelled_at)}</span>
                        </div>
                        <div class="detail-row">
                            <label>취소 유형</label>
                            <span>${typeLabel}</span>
                        </div>`;
                })()}
                ${(() => {
                    const changeLogs = applications._parseChangeLogs(a.notes);
                    const editLogs   = applications._parseEditLogs(a.notes);
                    const allLogs    = [
                        ...changeLogs.map(l => ({ ...l, _type: 'change' })),
                        ...editLogs.map(l => ({ ...l, _type: 'edit' }))
                    ].sort((a, b) => new Date(a.changed_at || a.edited_at) - new Date(b.changed_at || b.edited_at));
                    if (!allLogs.length) return '';
                    const rows = allLogs.map((lg, i) => {
                        if (lg._type === 'change') {
                            const dateStr = new Date(lg.changed_at).toLocaleString('ko-KR', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
                            const lines = [];
                            if (lg.from_program !== lg.to_program) lines.push(`프로그램을 <b style="color:#991b1b">${escHtml(lg.from_program||'-')}</b>에서 <b style="color:#166534">${escHtml(lg.to_program||'-')}</b>으로 변경`);
                            if (lg.from_time !== lg.to_time) lines.push(`시간대를 <b style="color:#991b1b">${lg.from_time||'-'}</b>에서 <b style="color:#166534">${lg.to_time||'-'}</b>으로 변경`);
                            return `<div style="background:#f0f4ff;border-left:3px solid #4f46e5;border-radius:0 6px 6px 0;padding:8px 12px;margin-bottom:6px;font-size:.83rem">
                                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                                    <span style="font-weight:600;color:#4f46e5"><i class="fas fa-exchange-alt" style="margin-right:4px"></i>변경 이력 ${i+1}</span>
                                    <span style="color:#6b7280;font-size:.78rem">${dateStr}</span>
                                </div>
                                <div style="color:#374151;line-height:1.7">${lines.join('<br>')}</div>
                            </div>`;
                        } else {
                            // [수정] 이력 — 자연어로 표시
                            const dateStr = new Date(lg.edited_at).toLocaleString('ko-KR', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
                            const changes = Array.isArray(lg.changes) ? lg.changes : [];
                            const ua = (lg.user_agent || '');
                            const isMobile = /iPhone|Android|Mobile/i.test(ua);
                            const device = isMobile ? '📱 모바일' : (ua ? '🖥️ PC' : '알 수 없음');
                            const ipStr = lg.ip && lg.ip !== 'unknown' ? lg.ip : '알 수 없음';
                            const changeLines = changes.map(c => `• ${escHtml(c)}`).join('<br>');
                            return `<div style="background:#fff7ed;border-left:3px solid #ea580c;border-radius:0 6px 6px 0;padding:8px 12px;margin-bottom:6px;font-size:.83rem">
                                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                                    <span style="font-weight:600;color:#ea580c"><i class="fas fa-user-edit" style="margin-right:4px"></i>관리자 수정 ${i+1}</span>
                                    <span style="color:#6b7280;font-size:.78rem">${dateStr}</span>
                                </div>
                                <div style="color:#374151;line-height:1.8">${changeLines || '(변경 항목 없음)'}</div>
                                <div style="color:#9ca3af;font-size:.76rem;margin-top:4px;border-top:1px solid #fed7aa;padding-top:4px">${device} &nbsp;|&nbsp; IP: ${escHtml(ipStr)}</div>
                            </div>`;
                        }
                    }).join('');
                    return `<div class="detail-row full" style="margin-top:4px">
                        <label style="color:#4f46e5"><i class="fas fa-history"></i> 변경/수정 이력 (${allLogs.length}건)</label>
                        <div style="margin-top:6px">${rows}</div>
                    </div>`;
                })()}
${(() => {
                    // [수정],[변경],[취소],[삭제] JSON 블록 제거 후 순수 메모 텍스트만 표시
                    const cleanNotes = (a.notes || '')
                        .replace(/\[수정\]\s*\{[\s\S]*?\}(?=\n\[|\n?$)/g, '')
                        .replace(/\[변경\]\s*\{[\s\S]*?\}(?=\n\[|\n?$)/g, '')
                        .replace(/\[취소\]\s*\{[\s\S]*?\}(?=\n\[|\n?$)/g, '')
                        .replace(/\[삭제\]\s*\{[\s\S]*?\}(?=\n\[|\n?$)/g, '')
                        .trim();
                    return cleanNotes ? `<div class="detail-row"><label>메모</label><span style="white-space:pre-wrap;font-size:.82rem">${escHtml(cleanNotes)}</span></div>` : '';
                })()}
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
    //  수정 폼
    // ══════════════════════════════════════════════════
    async editForm(id) {
        const a = this.data.find(x => x.id === id);
        if (!a) return;

        // 활성 프로그램 목록 로드 (단지 필터)
        let progList = [];
        try {
            const complexId = getEffectiveComplexId();
            const res = await API.programs.list({ complexId, activeOnly: true, limit: 100 });
            progList = (res.data || []).filter(p => p.is_active !== false);
        } catch (e) { /* 실패해도 수동 입력 폴백 */ }

        // 현재 프로그램의 time_slots 찾기
        const curProg = progList.find(p => p.name === a.program_name);
        const curSlots = curProg ? (curProg.time_slots || []) : [];

        // 프로그램 드롭다운 옵션 생성
        const progOptions = progList.length
            ? `<option value="">-- 직접 입력 --</option>` +
              progList.map(p =>
                `<option value="${escHtml(p.name)}"
                    data-times="${escHtml(JSON.stringify(p.time_slots || []))}"
                    ${p.name === a.program_name ? 'selected' : ''}>${escHtml(p.name)}</option>`
              ).join('')
            : null;  // null이면 text input 폴백

        // 시간대 드롭다운 옵션 생성
        const buildTimeOptions = (slots, current) => {
            const hasMatch = slots.includes(current);
            let opts = `<option value="">-- 직접 입력 --</option>`;
            opts += slots.map(s =>
                `<option value="${escHtml(s)}" ${s === current ? 'selected' : ''}>${escHtml(s)}</option>`
            ).join('');
            // 현재값이 목록에 없으면 기타 항목 추가
            if (current && !hasMatch) {
                opts += `<option value="${escHtml(current)}" selected>${escHtml(current)} (현재값)</option>`;
            }
            return opts;
        };

        // 프로그램 선택 시 시간대 드롭다운 갱신 함수 (모달 내 inline)
        const programFieldHtml = progOptions
            ? `<select id="editProgram" onchange="applications._onEditProgramChange(this)"
                  style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:.9rem">
                  ${progOptions}
               </select>`
            : `<input type="text" id="editProgram" value="${escHtml(a.program_name)}">`;

        const timeFieldHtml = curSlots.length
            ? `<select id="editTime"
                  style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:.9rem">
                  ${buildTimeOptions(curSlots, a.preferred_time || '')}
               </select>`
            : `<input type="text" id="editTime" value="${escHtml(a.preferred_time || '')}" placeholder="예: 20:00">`;

        // 프로그램별 time_slots 맵 (JS에 인라인으로 주입)
        const slotsMapJson = JSON.stringify(
            Object.fromEntries(progList.map(p => [p.name, p.time_slots || []]))
        );

        const bodyHtml = `
            <script>applications._editSlotsMap = ${slotsMapJson};</script>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-group"><label>동</label><input type="text" id="editDong" value="${escHtml(a.dong)}"></div>
                <div class="form-group"><label>호수</label><input type="text" id="editHo" value="${escHtml(a.ho)}"></div>
                <div class="form-group"><label>이름</label><input type="text" id="editName" value="${escHtml(a.name)}"></div>
                <div class="form-group"><label>전화번호</label><input type="tel" id="editPhone" value="${escHtml(a.phone)}"></div>
            </div>
            <div class="form-group"><label>프로그램명</label>${programFieldHtml}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-group"><label>희망 시간</label>${timeFieldHtml}</div>
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

    // 프로그램 드롭다운 변경 시 시간대 드롭다운 갱신
    _onEditProgramChange(sel) {
        const progName = sel.value;
        const slots = (this._editSlotsMap || {})[progName] || [];
        const timeEl = document.getElementById('editTime');
        if (!timeEl) return;

        if (slots.length) {
            // select로 교체
            if (timeEl.tagName === 'INPUT') {
                const newSel = document.createElement('select');
                newSel.id = 'editTime';
                newSel.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:.9rem';
                timeEl.parentNode.replaceChild(newSel, timeEl);
            }
            const tSel = document.getElementById('editTime');
            tSel.innerHTML = `<option value="">-- 시간대 선택 --</option>` +
                slots.map(s => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('');
        } else {
            // 시간대 없는 프로그램 → input으로 교체
            if (timeEl.tagName === 'SELECT') {
                const inp = document.createElement('input');
                inp.type = 'text'; inp.id = 'editTime';
                inp.placeholder = '시간대 없음 또는 직접 입력';
                inp.style.cssText = 'width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:.9rem';
                timeEl.parentNode.replaceChild(inp, timeEl);
            } else {
                timeEl.value = '';
                timeEl.placeholder = '시간대 없음 또는 직접 입력';
            }
        }
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
        // ── cancelled 직접 변경 사전 경고 ─────────────────────────────────────
        // 서버에서 cancellations 테이블 확인 후 차단하지만, 클라이언트에서도
        // 한 번 더 확인 대화상자를 띄워 실수 방지 (2026-04-30 사례 재발 방지)
        if (status === 'cancelled') {
            const a = this.data.find(x => x.id === id);
            const name = a ? `${a.name} (${a.dong || ''} ${a.ho || ''})` : id;
            const confirmed = await new Promise(resolve => {
                showConfirm(
                    '⚠️ 해지 처리 확인',
                    `${name} 을(를) 직접 해지 처리하려 합니다.\n\n` +
                    `반드시 [해지 관리 탭]에서 해지 신청이 먼저 등록되어 있어야 합니다.\n` +
                    `시간대/요일 변경자를 해지로 처리하는 실수를 주의하세요.\n\n` +
                    `계속하시겠습니까?`,
                    () => resolve(true),
                    () => resolve(false)
                );
            });
            if (!confirmed) return;
        }

        try {
            await API.applications.update(id, { status });
            closeGlobalModal();
            showToast(`상태가 "${statusLabel(status)}"으로 변경되었습니다`);
            await this.load();
            loadBadges();
        } catch (e) {
            // 서버 차단 응답 (blocked: true) 시 상세 안내
            let msg = e.message || '변경 실패';
            if (msg.includes('[차단]')) {
                showToast(msg, 'error');
            } else {
                showToast('변경 실패: ' + msg, 'error');
            }
        }
    },

    // 취소 메타데이터 파싱 (notes 컬럼에서 [취소] JSON 블록 추출)
    _parseCancelMeta(notes) {
        if (!notes) return null;
        try {
            const m = notes.match(/\[취소\]\s*(\{[^}]+\})/s);
            if (m) return JSON.parse(m[1]);
        } catch(e) {}
        return null;
    },

    // 변경 이력 전체 파싱 (notes 컬럼에서 [변경] JSON 블록들 배열로 추출)
    _parseChangeLogs(notes) {
        if (!notes) return [];
        const logs = [];
        try {
            // 중첩 중괄호를 지원하는 파싱: [변경] 이후 첫 { 부터 매칭되는 } 까지
            const re = /\[변경\]\s*(\{)/g;
            let m;
            while ((m = re.exec(notes)) !== null) {
                let depth = 0, start = m.index + m[0].length - 1, i = start;
                for (; i < notes.length; i++) {
                    if (notes[i] === '{') depth++;
                    else if (notes[i] === '}') { depth--; if (depth === 0) break; }
                }
                try { logs.push({ ...JSON.parse(notes.slice(start, i + 1)), _type: 'change' }); } catch(e) {}
            }
        } catch(e) {}
        return logs;
    },

    // 관리자 수정 이력 파싱 (notes 컬럼에서 [수정] JSON 블록들 배열로 추출)
    _parseEditLogs(notes) {
        if (!notes) return [];
        const logs = [];
        try {
            const re = /\[수정\]\s*(\{)/g;
            let m;
            while ((m = re.exec(notes)) !== null) {
                let depth = 0, start = m.index + m[0].length - 1, i = start;
                for (; i < notes.length; i++) {
                    if (notes[i] === '{') depth++;
                    else if (notes[i] === '}') { depth--; if (depth === 0) break; }
                }
                try { logs.push({ ...JSON.parse(notes.slice(start, i + 1)), _type: 'edit' }); } catch(e) {}
            }
        } catch(e) {}
        return logs;
    },

    deleteItem(id) {
        const a = this.data.find(x => x.id === id);
        const name = a ? `${a.dong || ''}${a.ho || ''} ${a.name || ''}` : id;
        showConfirm('완전 삭제 확인',
            `「${name.trim()}」 신청을 완전히 삭제합니다.\n\n삭제된 데이터는 복구할 수 없습니다.\n계속하시겠습니까?`,
            async () => {
                try {
                    // force=true: DB에서 완전 삭제 (소프트 삭제 아님)
                    await fetch(`/api/applications/${id}?force=true`, { method: 'DELETE' });
                    closeGlobalModal();
                    showToast('삭제되었습니다');
                    await this.load();
                } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
            }
        );
    },

    exportCSV() {
        const headers = ['신청일', '상태', '동', '호수', '이름', '전화번호', '프로그램', '희망시간', '대기순번', '월수강료', '총횟수', '잔여횟수', '양도일', '취소일시', '메모'];
        const rows = this.filtered.map(a => {
            const cm = this._parseCancelMeta(a.notes);
            return {
            '신청일': formatDate(a.created_at),
            '상태': statusLabel(a.status),
            '동': a.dong, '호수': a.ho, '이름': a.name, '전화번호': fmtPhone(a.phone),
            '프로그램': a.program_name, '희망시간': a.preferred_time || '',
            '대기순번': a.status === 'waiting' ? (a._waitingOrder || '') : '',
            '월수강료': a.monthly_fee || '',
            '총횟수': a.total_sessions || '',
            '잔여횟수': a.remaining_sessions != null ? a.remaining_sessions : '',
            '양도일': a.transfer_date || '',
            '취소일시': cm ? formatDate(cm.cancelled_at) : '',
            '메모': a.notes || ''
        };});
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
                            <span>동일 항목(동·호수·이름·프로그램) 덮어쓰기 (UPDATE)</span>
                        </label>
                        <p class="terms-note">※ 체크 해제 시: 중복 여부 관계없이 모두 신규 추가<br>※ 체크 시: 동일 항목은 업데이트, 없는 항목은 신규 추가</p>
                    </div>
                </div>
                <div class="import-tip">
                    <i class="fas fa-info-circle"></i>
                    <span>상태값: 승인 / 대기 / 거부 / 해지 / 만료 / 이관 / 접수 / 양도 / 양수<br>
                    💡 엑셀 저장 시: <b>다른 이름으로 저장 → CSV UTF-8 (쉼표로 분리)</b><br>
                    ※ EUC-KR(일반 CSV)도 자동 인식되어 업로드 가능합니다</span>
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
        const complexId = getEffectiveComplexId();
        if (!complexId) { showToast('단지 정보가 없습니다. 단지 코드로 로그인해주세요', 'error'); return; }
        const btnEl = document.querySelector('#globalModal .btn-primary');
        if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...'; }
        try {
            const result = await API.importCsv.applications(complexId, file, overwrite);
            closeGlobalModal();
            // 디버그: skip 이유가 있으면 추가 표시
            if (result.skipped > 0 && result.debug?.skipReasons?.length) {
                showToast(result.message + '\n[skip 원인] ' + result.debug.skipReasons[0], 'warning');
                console.warn('[CSV import debug]', result.debug);
            } else {
                showToast(result.message, result.inserted > 0 ? 'success' : 'warning');
            }
            await this.load();
            loadBadges();
        } catch (e) {
            showToast('가져오기 실패: ' + e.message, 'error');
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-upload"></i> 가져오기 실행'; }
        }
    },

    // ══════════════════════════════════════════════════
    //  관리자 직접 신청 추가 (중복 허용)
    // ══════════════════════════════════════════════════
    async showAddModal() {
        // 프로그램 목록 먼저 로드
        let programOptions = '<option value="">-- 프로그램 선택 --</option>';
        try {
            const complexId = getEffectiveComplexId();
            const res = await API.programs.list({ complexId, limit: 100 });
            const programs = res.data || [];
            programOptions += programs.map(p =>
                `<option value="${escHtml(p.id)}" data-name="${escHtml(p.name)}" data-times="${escHtml(JSON.stringify(p.time_slots || []))}">${escHtml(p.name)}</option>`
            ).join('');
        } catch (e) { /* 프로그램 없어도 수동 입력 가능 */ }

        const body = `
            <div style="background:#e8f8f0;border:1px solid #27ae60;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:.85rem">
                <i class="fas fa-info-circle" style="color:#27ae60"></i>
                <strong>관리자 직접 추가</strong> — 중복 수강 신청도 허용됩니다.<br>
                <span style="color:#888">기존 입주민 정보를 검색하거나 직접 입력하세요.</span>
            </div>

            <!-- 기존 입주민 검색 -->
            <div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:14px">
                <label style="font-size:.85rem;font-weight:600;display:block;margin-bottom:8px">
                    <i class="fas fa-search"></i> 기존 입주민 검색 (선택 시 자동 입력)
                </label>
                <div style="display:flex;gap:8px;align-items:center">
                    <input type="text" id="addSearchQuery" placeholder="이름 또는 동호수 입력..."
                        style="flex:1;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:.88rem"
                        oninput="applications._searchExistingResident(this.value)">
                </div>
                <div id="addSearchResults" style="margin-top:8px;max-height:160px;overflow-y:auto;display:none;border:1px solid #e0e0e0;border-radius:6px;background:#fff"></div>
            </div>

            <!-- 입주민 정보 -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                <div class="form-group" style="margin:0">
                    <label style="font-size:.82rem;color:#666">동 *</label>
                    <input type="text" id="addDong" placeholder="예: 101">
                </div>
                <div class="form-group" style="margin:0">
                    <label style="font-size:.82rem;color:#666">호수 *</label>
                    <input type="text" id="addHo" placeholder="예: 1201">
                </div>
                <div class="form-group" style="margin:0">
                    <label style="font-size:.82rem;color:#666">이름 *</label>
                    <input type="text" id="addName" placeholder="이름">
                </div>
                <div class="form-group" style="margin:0">
                    <label style="font-size:.82rem;color:#666">전화번호 *</label>
                    <input type="tel" id="addPhone" placeholder="010-0000-0000">
                </div>
            </div>

            <!-- 프로그램 선택 -->
            <div class="form-group" style="margin-bottom:10px">
                <label style="font-size:.82rem;color:#666">프로그램 *</label>
                <select id="addProgram" onchange="applications._onAddProgramChange(this)">
                    ${programOptions}
                </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                <div class="form-group" style="margin:0">
                    <label style="font-size:.82rem;color:#666">희망 시간</label>
                    <select id="addTime">
                        <option value="">-- 시간 선택 --</option>
                    </select>
                </div>
                <div class="form-group" style="margin:0">
                    <label style="font-size:.82rem;color:#666">상태</label>
                    <select id="addStatus">
                        <option value="approved">승인</option>
                        <option value="waiting">대기</option>
                    </select>
                </div>
            </div>
            <div class="form-group" style="margin-bottom:10px">
                <label style="font-size:.82rem;color:#666">메모 (관리자 메모)</label>
                <textarea id="addNotes" rows="2" placeholder="예: 중복 수강 희망 (관리자 직접 추가)"></textarea>
            </div>

            <!-- 기존 수강 현황 표시 영역 -->
            <div id="addExistingInfo" style="display:none;background:#fff8e1;border:1px solid #f39c12;border-radius:8px;padding:10px 14px;font-size:.83rem">
                <strong><i class="fas fa-exclamation-triangle" style="color:#f39c12"></i> 현재 수강 중인 프로그램</strong>
                <div id="addExistingList" style="margin-top:6px"></div>
            </div>`;

        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" style="background:#27ae60" onclick="applications.doAdd()">
                <i class="fas fa-plus"></i> 신청 추가
            </button>`;

        openGlobalModal('<i class="fas fa-user-plus"></i> 신청 직접 추가', body, footer);
    },

    // 기존 입주민 검색 (현재 로드된 data에서 실시간 검색)
    _searchExistingResident(query) {
        const container = document.getElementById('addSearchResults');
        if (!container) return;
        if (!query || query.trim().length < 1) { container.style.display = 'none'; return; }

        const q = query.trim().toLowerCase();
        // 중복 제거: dong+ho+name+phone 기준 unique 입주민 목록
        const seen = new Set();
        const residents = [];
        this.data.forEach(a => {
            const key = `${a.dong}|${a.ho}|${a.name}|${a.phone}`;
            if (seen.has(key)) return;
            if (
                (a.name || '').toLowerCase().includes(q) ||
                (a.dong || '').includes(q) ||
                (a.ho || '').includes(q) ||
                (a.phone || '').includes(q)
            ) {
                seen.add(key);
                residents.push(a);
            }
        });

        if (!residents.length) {
            container.innerHTML = '<div style="padding:10px;color:#999;font-size:.83rem;text-align:center">검색 결과 없음</div>';
            container.style.display = 'block';
            return;
        }

        container.innerHTML = residents.slice(0, 10).map(a => `
            <div onclick="applications._fillResidentInfo('${escHtml(a.dong)}','${escHtml(a.ho)}','${escHtml(a.name)}','${escHtml(a.phone)}')"
                style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:.85rem;display:flex;justify-content:space-between;align-items:center"
                onmouseover="this.style.background='#f0f9f4'" onmouseout="this.style.background=''">
                <span><strong>${escHtml(a.dong)}동 ${escHtml(a.ho)}호</strong> ${escHtml(a.name)}</span>
                <span style="color:#888;font-size:.8rem">${escHtml(a.phone)}</span>
            </div>`).join('');
        container.style.display = 'block';
    },

    // 선택한 입주민 정보 자동 입력 + 기존 수강 현황 표시
    async _fillResidentInfo(dong, ho, name, phone) {
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal('addDong', dong);
        setVal('addHo', ho);
        setVal('addName', name);
        setVal('addPhone', phone);

        // 검색창 초기화
        const searchInput = document.getElementById('addSearchQuery');
        if (searchInput) searchInput.value = `${dong}동 ${ho}호 ${name}`;
        const resultsDiv = document.getElementById('addSearchResults');
        if (resultsDiv) resultsDiv.style.display = 'none';

        // 기존 수강 현황 표시
        const existing = this.data.filter(a =>
            a.dong === dong && a.ho === ho && a.name === name && a.phone === phone &&
            (a.status === 'approved' || a.status === 'waiting')
        );
        const infoDiv  = document.getElementById('addExistingInfo');
        const listDiv  = document.getElementById('addExistingList');
        if (infoDiv && listDiv) {
            if (existing.length > 0) {
                listDiv.innerHTML = existing.map(a =>
                    `<div style="padding:3px 0">
                        <span class="status-badge status-${statusClass(a.status)}" style="font-size:.75rem">${statusLabel(a.status)}</span>
                        <strong style="margin-left:4px">${escHtml(a.program_name)}</strong>
                        ${a.preferred_time ? `<span style="color:#666;margin-left:4px">${escHtml(a.preferred_time)}</span>` : ''}
                    </div>`
                ).join('');
                infoDiv.style.display = 'block';
            } else {
                infoDiv.style.display = 'none';
            }
        }
    },

    // 프로그램 선택 시 시간대 드롭다운 자동 갱신
    _onAddProgramChange(select) {
        const opt = select.options[select.selectedIndex];
        const timesRaw = opt?.getAttribute('data-times') || '[]';
        let times = [];
        try { times = JSON.parse(timesRaw); } catch (e) { times = []; }

        const timeSelect = document.getElementById('addTime');
        if (!timeSelect) return;
        if (!times.length) {
            timeSelect.innerHTML = '<option value="">-- 시간 없음 (직접 입력 불가) --</option>';
            return;
        }
        timeSelect.innerHTML = '<option value="">-- 시간 선택 --</option>' +
            times.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');
    },

    // 신청 추가 실행
    async doAdd() {
        const dong    = document.getElementById('addDong')?.value?.trim();
        const ho      = document.getElementById('addHo')?.value?.trim();
        const name    = document.getElementById('addName')?.value?.trim();
        const phone   = document.getElementById('addPhone')?.value?.trim();
        const progEl  = document.getElementById('addProgram');
        const programId   = progEl?.value || '';
        const programName = progEl?.options[progEl.selectedIndex]?.getAttribute('data-name') || progEl?.value || '';
        const preferred_time = document.getElementById('addTime')?.value?.trim() || '';
        const status  = document.getElementById('addStatus')?.value || 'approved';
        const notes   = document.getElementById('addNotes')?.value?.trim() || '';

        if (!dong || !ho || !name || !phone) {
            showToast('동·호수·이름·전화번호는 필수입니다', 'error'); return;
        }
        if (!programName) {
            showToast('프로그램을 선택하거나 입력하세요', 'error'); return;
        }

        const complexId = getEffectiveComplexId();
        if (!complexId) { showToast('단지 정보가 없습니다', 'error'); return; }

        const btnEl = document.querySelector('#globalModal .btn-primary');
        if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...'; }

        try {
            const payload = {
                complex_id: complexId,
                dong, ho, name, phone,
                program_id: programId || undefined,
                program_name: programName,
                preferred_time: preferred_time || undefined,
                status,
                notes,
                admin_bypass: true   // 중복 차단 우회
            };
            await API.applications.create(payload);
            closeGlobalModal();
            showToast(`✅ ${name} 님의 "${programName}" 신청이 추가되었습니다`, 'success');
            await this.load();
            loadBadges();
        } catch (e) {
            showToast('신청 추가 실패: ' + e.message, 'error');
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-plus"></i> 신청 추가'; }
        }
    },

    // ─────────────────────────────────────────────────────────────────────
    //  출석부 모달  (v3.5 - 달력+체크박스 일괄선택)
    // ─────────────────────────────────────────────────────────────────────

    // 동/호수 중복 suffix 방지
    _fmtDongHo(dong, ho) {
        const d = String(dong || '').replace(/동$/, '');
        const h = String(ho   || '').replace(/호$/, '');
        return d && h ? d + '동 ' + h + '호' : (d || String(ho||''));
    },

    // 전화번호 뒷 4자리만
    _fmtPhoneLast4(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (!digits) return '-';
        return '****-' + digits.slice(-4);
    },

    // 요일명
    _dowName(dateObj) {
        return ['일','월','화','수','목','금','토'][dateObj.getDay()];
    },
    // ── 프로그램명에서 수업 요일 번호 배열 추출 ──────────────────────────
    // 반환: [0~6 배열] (0=일,1=월,...,6=토), 감지 불가 시 []
    // 예: "월6:1 그룹수업" → [1]
    //     "화목 필라테스"  → [2,4]
    //     "수금반"         → [3,5]
    //     "월수금"         → [1,3,5]
    _parseProgramDows(name) {
        if (!name) return [];
        // Step 1: 'X요일' → 'X' 로 정규화 (월요일→월, 수요일→수 등)
        let n = name.replace(/s/g, '')
            .replace(/월요일/g,'월').replace(/화요일/g,'화')
            .replace(/수요일/g,'수').replace(/목요일/g,'목')
            .replace(/금요일/g,'금').replace(/토요일/g,'토')
            .replace(/일요일/g,'일');
        // Step 2: 요일이 아닌 단어에서 오탐 제거
        // '수' 뒤에 업/강/련/영/준/행/시/학/료 가 오면 요일 아님
        n = n.replace(/수(?=업|강|련|영|준|행|시|학|료)/g, '');
        // '월' 뒤에 세/별/간/급/납/정/수 가 오면 요일 아님 (월세, 월정액 등)
        n = n.replace(/월(?=세|별|간|급|납|정)/g, '');
        // Step 3: 복합 패턴 (긴 것 먼저)
        const PATTERNS = [
            { re: /월.*수.*금|월수금/,  dows: [1,3,5] },
            { re: /화.*목.*토|화목토/,  dows: [2,4,6] },
            { re: /월.*수/,             dows: [1,3]   },
            { re: /화.*목|목.*화/,      dows: [2,4]   },
            { re: /수.*금/,             dows: [3,5]   },
            { re: /월.*금/,             dows: [1,5]   },
            { re: /화.*금/,             dows: [2,5]   },
            { re: /목.*토/,             dows: [4,6]   },
        ];
        for (const p of PATTERNS) {
            if (p.re.test(n)) return p.dows;
        }
        // Step 4: 단일 요일
        if (/월/.test(n)) return [1];
        if (/화/.test(n)) return [2];
        if (/수/.test(n)) return [3];
        if (/목/.test(n)) return [4];
        if (/금/.test(n)) return [5];
        if (/토/.test(n)) return [6];
        if (/일/.test(n)) return [0];
        return [];
    },

    // ── 감지된 요일로 현재 달력 월의 날짜 자동 선택 ───────────────────
    _autoSelectDatesByDow(dows) {
        const sel = document.getElementById('attCalMonth');
        if (!sel || !dows.length) return;
        const [yr, mo] = sel.value.split('-').map(Number);
        const lastDate = new Date(yr, mo, 0).getDate();
        const dates = [];
        for (let d = 1; d <= lastDate; d++) {
            const date = new Date(yr, mo-1, d);
            if (dows.includes(date.getDay())) {
                dates.push(yr + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0'));
            }
        }
        applications._attCustomDates = dates;
        applications._attAutoDows = dows;  // 월 변경 시 재사용
    },

    // 날짜 레이블: "4/7(월)"
    _dateLabel(dateStr) {           // dateStr = 'YYYY-MM-DD'
        const [y, m, d] = dateStr.split('-').map(Number);
        const dow = new Date(y, m-1, d).getDay();
        return m + '/' + d + '(' + ['일','월','화','수','목','금','토'][dow] + ')';
    },

    // ── 달력 렌더 ──────────────────────────────────────────────────────
    _renderCalendar() {
        const sel = document.getElementById('attCalMonth');
        if (!sel) return;
        const [yr, mo] = sel.value.split('-').map(Number);  // 1-based month
        const checked  = applications._attCustomDates || [];  // ['YYYY-MM-DD', ...]
        const autoDows = applications._attAutoDows   || [];  // 자동감지 요일

        const firstDay = new Date(yr, mo-1, 1).getDay();   // 0=일
        const lastDate = new Date(yr, mo, 0).getDate();
        const DOW_NAMES  = ['일','월','화','수','목','금','토'];
        const DOW_COLORS = ['#e74c3c','#444','#444','#444','#444','#444','#2980b9'];

        // ── 자동감지 요일 뱃지
        let autoBadge = '';
        if (autoDows.length) {
            const dowBadges = autoDows.map(d => {
                const fc  = DOW_COLORS[d];
                const bg2 = (d===0) ? '#fdecea' : (d===6) ? '#eaf3fb' : '#e8f8f0';
                const bc  = (d===0) ? '#f1aaa5' : (d===6) ? '#aed6f1' : '#a9dfbf';
                return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:.76rem;font-weight:700;' +
                    'background:' + bg2 + ';border:1px solid ' + bc + ';color:' + fc + '">' + DOW_NAMES[d] + '</span>';
            }).join('');
            autoBadge = '<div style="display:flex;align-items:center;gap:5px;margin-bottom:8px;padding:6px 10px;' +
                'background:#f0fdf8;border:1px solid #c3e6cb;border-radius:6px;flex-wrap:wrap">' +
                '<i class="fas fa-magic" style="color:#1abc9c;font-size:.8rem"></i>' +
                '<span style="font-size:.78rem;color:#555;font-weight:600">프로그램 수업 요일 자동감지:</span>' +
                dowBadges +
                '<span style="font-size:.75rem;color:#999;margin-left:2px">(수동으로 추가/해제 가능)</span>' +
                '</div>';
        }

        // ── 달력 테이블 (헤더 없음 – 셀마다 날짜+요일 표시)
        let html = autoBadge;
        html += '<table style="border-collapse:collapse;width:100%;table-layout:fixed;margin-bottom:2px">';
        html += '<tbody>';

        let dayNum = 1;
        for (let row = 0; row < 6 && dayNum <= lastDate; row++) {
            html += '<tr>';
            for (let col = 0; col < 7; col++) {
                if (row === 0 && col < firstDay) {
                    html += '<td style="padding:2px"><div style="height:48px"></div></td>';
                } else if (dayNum > lastDate) {
                    html += '<td style="padding:2px"><div style="height:48px"></div></td>';
                } else {
                    const mm  = String(mo).padStart(2,'0');
                    const dd  = String(dayNum).padStart(2,'0');
                    const key = yr + '-' + mm + '-' + dd;
                    const isChecked = checked.includes(key);
                    const dow = col;  // 0=일,6=토
                    const isHol = dow === 0;
                    const isSat = dow === 6;
                    const bg  = isChecked ? '#1abc9c' : '#f9f9f9';
                    const fg  = isChecked ? '#fff' : DOW_COLORS[dow];
                    const bdr = isChecked ? '2px solid #16a085' : '1px solid #e0e0e0';
                    const dowLabel = DOW_NAMES[dow];
                    const numWeight = isChecked ? '700' : '600';
                    const dowOpacity = isChecked ? '1' : (isHol || isSat ? '1' : '.65');
                    html += '<td style="padding:2px">' +
                        '<label style="display:flex;flex-direction:column;align-items:center;justify-content:center;' +
                        'height:48px;border-radius:7px;cursor:pointer;background:' + bg + ';border:' + bdr + ';' +
                        'color:' + fg + ';user-select:none;line-height:1.2;transition:all .1s">' +
                        '<input type="checkbox" value="' + key + '" ' + (isChecked?'checked':'') +
                        ' onchange="applications._onCalCheck(this)"' +
                        ' style="position:absolute;opacity:0;width:0;height:0">' +
                        '<span style="font-size:.92rem;font-weight:' + numWeight + '">' + dayNum + '</span>' +
                        '<span style="font-size:.7rem;font-weight:500;opacity:' + dowOpacity + '">' + dowLabel + '</span>' +
                        '</label></td>';
                    dayNum++;
                }
            }
            html += '</tr>';
        }
        html += '</tbody></table>';

        // ── 요일 일괄 선택 버튼
        const btnBase = 'padding:5px 9px;border:1px solid #ddd;border-radius:5px;font-size:.78rem;cursor:pointer;font-weight:600';
        html += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;align-items:center;padding:6px 4px 2px;border-top:1px solid #eee">' +
            '<span style="font-size:.75rem;color:#999;font-weight:600;white-space:nowrap">일괄 선택:</span>' +
            [0,1,2,3,4,5,6].map(d => {
                const fc   = DOW_COLORS[d];
                const bg2  = (d===0) ? '#fff5f5' : (d===6) ? '#f0f6ff' : '#f8f8f8';
                const bdrExtra = autoDows.includes(d)
                    ? ';border-color:' + (d===0?'#e74c3c':d===6?'#2980b9':'#1abc9c') + ';border-width:1.5px'
                    : '';
                return '<button onclick="applications._selectByDow(' + yr + ',' + mo + ',' + d + ')" ' +
                    'style="' + btnBase + ';color:' + fc + ';background:' + bg2 + bdrExtra + '">' +
                    DOW_NAMES[d] + '</button>';
            }).join('') +
            (autoDows.length
                ? '<button onclick="applications._autoReselect()" ' +
                  'style="' + btnBase + ';background:#e8f8f0;color:#1e8449;border-color:#a9dfbf;margin-left:2px">' +
                  '<i class="fas fa-magic" style="font-size:.72rem"></i> 자동선택</button>'
                : '') +
            '<button onclick="applications._selectAllMonth(' + yr + ',' + mo + ')" ' +
            'style="' + btnBase + ';background:#eafaf1;color:#1e8449;border-color:#a9dfbf">전체선택</button>' +
            '<button onclick="applications._clearCalMonth(' + yr + ',' + mo + ')" ' +
            'style="' + btnBase + ';background:#fdf2f2;color:#c0392b;border-color:#f5c6cb;margin-left:2px">전체해제</button>' +
            '</div>';

        // ── 선택된 날짜 태그
        const tags = checked.slice().sort().map(k => {
            const [ky, km, kd] = k.split('-').map(Number);
            const kdow = new Date(ky, km-1, kd).getDay();
            const tagFg  = kdow === 0 ? '#c0392b' : kdow === 6 ? '#2471a3' : '#1e8449';
            const tagBg  = kdow === 0 ? '#fdecea' : kdow === 6 ? '#eaf3fb' : '#e8f8f0';
            const tagBdr = kdow === 0 ? '#f1aaa5' : kdow === 6 ? '#aed6f1' : '#a9dfbf';
            const label  = applications._dateLabel(k);
            return '<span style="display:inline-flex;align-items:center;gap:2px;background:' + tagBg + ';border:1px solid ' + tagBdr + ';' +
                'border-radius:4px;padding:3px 7px;font-size:.8rem;color:' + tagFg + ';font-weight:600">' + label +
                '<button onclick="applications._removeCalDate(\'' + k + '\')" ' +
                'style="background:none;border:none;cursor:pointer;color:#bbb;font-size:.85rem;padding:0 0 0 3px;line-height:1">&times;</button></span>';
        }).join('');

        const calDiv = document.getElementById('attCalGrid');
        if (calDiv) calDiv.innerHTML = html;
        const tagsDiv = document.getElementById('attCalTags');
        if (tagsDiv) {
            tagsDiv.innerHTML = checked.length
                ? tags
                : '<span style="color:#bbb;font-size:.82rem">선택된 날짜 없음</span>';
        }

        // ── 카운트 업데이트
        const countEl = document.getElementById('attDateCount');
        if (countEl) countEl.textContent = checked.length ? '(' + checked.length + '회 선택됨)' : '(날짜를 선택하세요)';
    },

    _onCalCheck(cb) {
        if (!applications._attCustomDates) applications._attCustomDates = [];
        if (cb.checked) {
            if (!applications._attCustomDates.includes(cb.value))
                applications._attCustomDates.push(cb.value);
        } else {
            applications._attCustomDates = applications._attCustomDates.filter(d => d !== cb.value);
        }
        applications._attCustomDates.sort();
        applications._renderCalendar();
        applications._renderAttendancePreview();
    },

    _removeCalDate(key) {
        applications._attCustomDates = (applications._attCustomDates || []).filter(d => d !== key);
        applications._renderCalendar();
        applications._renderAttendancePreview();
    },

    _selectByDow(yr, mo, dow) {
        if (!applications._attCustomDates) applications._attCustomDates = [];
        const lastDate = new Date(yr, mo, 0).getDate();
        for (let d = 1; d <= lastDate; d++) {
            const date = new Date(yr, mo-1, d);
            if (date.getDay() === dow) {
                const key = yr + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0');
                if (!applications._attCustomDates.includes(key))
                    applications._attCustomDates.push(key);
            }
        }
        applications._attCustomDates.sort();
        applications._renderCalendar();
        applications._renderAttendancePreview();
    },

    _selectAllMonth(yr, mo) {
        if (!applications._attCustomDates) applications._attCustomDates = [];
        const lastDate = new Date(yr, mo, 0).getDate();
        for (let d = 1; d <= lastDate; d++) {
            const key = yr + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0');
            if (!applications._attCustomDates.includes(key))
                applications._attCustomDates.push(key);
        }
        applications._attCustomDates.sort();
        applications._renderCalendar();
        applications._renderAttendancePreview();
    },

    _clearCalMonth(yr, mo) {
        const mm = String(mo).padStart(2,'0');
        const prefix = yr + '-' + mm + '-';
        applications._attCustomDates = (applications._attCustomDates || []).filter(d => !d.startsWith(prefix));
        applications._renderCalendar();
        applications._renderAttendancePreview();
    },

    // ── 자동감지 요일로 재선택 (월 변경 후 재적용용)
    _autoReselect() {
        const dows = applications._attAutoDows || [];
        if (!dows.length) return;
        applications._autoSelectDatesByDow(dows);
        applications._renderCalendar();
        applications._renderAttendancePreview();
    },

    // ── 프로그램 선택 변경 핸들러 (자동 요일 감지 + 날짜 재선택)
    _onAttProgramChange() {
        const prog = document.getElementById('attProgram')?.value || '';
        const dows = applications._parseProgramDows(prog);
        if (dows.length) {
            applications._autoSelectDatesByDow(dows);
        } else {
            applications._attAutoDows    = [];
            // 날짜는 초기화하지 않고 유지
        }
        applications._renderCalendar();
        applications._renderAttendancePreview();
    },

    // ── 월 변경 핸들러 (자동감지 요일이 있으면 재계산, 없으면 초기화)
    _onAttMonthChange() {
        const dows = applications._attAutoDows || [];
        if (dows.length) {
            applications._autoSelectDatesByDow(dows);
        } else {
            applications._attCustomDates = [];
        }
        applications._renderCalendar();
        applications._renderAttendancePreview();
    },

    // ── 출석부 모달 진입점 ─────────────────────────────────────────────
    async showAttendanceModal() {
        const complexId = getEffectiveComplexId();
        if (!complexId) { showToast('단지를 먼저 선택해주세요', 'error'); return; }

        openGlobalModal(
            '<i class="fas fa-clipboard-list" style="color:#1abc9c"></i> 출석부 다운로드',
            '<div style="text-align:center;padding:30px">' +
            '<i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#1abc9c"></i>' +
            '<p style="margin-top:12px;color:#666">승인 회원 목록을 불러오는 중...</p></div>',
            ''
        );

        try {
            const res  = await API.applications.list({ complexId, status: 'approved', limit: 500 });
            const apps = res.data || res.applications || [];

            if (!apps.length) {
                document.getElementById('globalModalBody').innerHTML =
                    '<p style="padding:20px;text-align:center;color:#999">승인된 회원이 없습니다.</p>';
                return;
            }

            const programs = [...new Set(apps.map(a => a.program_name).filter(Boolean))].sort();
            const times    = [...new Set(apps.map(a => a.preferred_time).filter(Boolean))].sort();
            const complexName = Admin.role === 'master'
                ? (Admin.selectedComplexName || '단지') : (Admin.complex?.name || '단지');

            const now = new Date();
            const defaultMonth = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

            applications._attCustomDates = [];
            applications._attAutoDows    = [];  // 자동감지 요일 초기화
            applications._attApps        = apps;
            applications._attComplexName = complexName;

            const progOpts = programs.map(p => '<option value="' + p + '">' + p + '</option>').join('');
            const timeOpts = times.map(t => '<option value="' + t + '">' + t + '</option>').join('');

            const body =
                // ── 필터 행
                '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">' +
                  '<div style="display:flex;flex-direction:column;gap:4px">' +
                    '<label style="font-size:.8rem;color:#666;font-weight:600">프로그램</label>' +
                    '<select id="attProgram" onchange="applications._onAttProgramChange()" style="padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:.88rem;min-width:200px">' +
                    '<option value="">-- 전체 프로그램 --</option>' + progOpts + '</select></div>' +
                  '<div style="display:flex;flex-direction:column;gap:4px">' +
                    '<label style="font-size:.8rem;color:#666;font-weight:600">시간대</label>' +
                    '<select id="attTime" onchange="applications._renderAttendancePreview()" style="padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:.88rem;min-width:130px">' +
                    '<option value="">-- 전체 시간 --</option>' + timeOpts + '</select></div>' +
                  '<button onclick="applications._renderAttendancePreview()" style="padding:7px 14px;background:#1abc9c;color:#fff;border:none;border-radius:6px;font-size:.85rem;cursor:pointer;height:34px;align-self:flex-end">' +
                  '<i class="fas fa-search"></i> 조회</button></div>' +

                // ── 달력 패널
                '<div style="background:#f8fffe;border:1px solid #a9dfbf;border-radius:8px;padding:12px 14px;margin-bottom:12px">' +
                  '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
                    '<div style="font-size:.85rem;font-weight:700;color:#1e8449">' +
                      '<i class="fas fa-calendar-check"></i> 수업 날짜 선택 ' +
                      '<span id="attDateCount" style="font-weight:400;color:#888;font-size:.8rem"></span></div>' +
                    '<div style="display:flex;align-items:center;gap:6px">' +
                      '<label style="font-size:.8rem;color:#555;font-weight:600">월 선택</label>' +
                      '<input type="month" id="attCalMonth" value="' + defaultMonth + '" ' +
                        'onchange="applications._onAttMonthChange()" ' +
                        'style="padding:4px 8px;border:1px solid #a9dfbf;border-radius:6px;font-size:.85rem;color:#1e8449;font-weight:600">' +
                    '</div></div>' +
                  '<div id="attCalGrid" style="margin-bottom:10px"></div>' +
                  '<div style="font-size:.78rem;color:#888;font-weight:600;margin-bottom:5px">선택된 수업 날짜</div>' +
                  '<div id="attCalTags" style="display:flex;flex-wrap:wrap;gap:5px;min-height:28px;padding:5px 6px;' +
                    'background:#fff;border:1px solid #d5f5e3;border-radius:6px">' +
                    '<span style="color:#bbb;font-size:.82rem">선택된 날짜 없음</span></div></div>' +

                // ── 미리보기
                '<div id="attendancePreview" style="max-height:310px;overflow-y:auto;border:1px solid #eee;border-radius:8px;padding:4px">' +
                  '<p style="padding:18px;text-align:center;color:#aaa;font-size:.9rem">프로그램 또는 시간대를 선택하면 미리보기가 표시됩니다.</p></div>';

            const footer =
                '<button class="btn-secondary" onclick="closeGlobalModal()">닫기</button>' +
                '<button class="btn-primary" onclick="applications._downloadAttendancePDF()" style="background:#1abc9c;border-color:#1abc9c">' +
                '<i class="fas fa-file-pdf"></i> PDF 다운로드</button>';

            document.getElementById('globalModalBody').innerHTML = body;
            document.getElementById('globalModalFooter').innerHTML = footer;

            if (programs.length) {
                document.getElementById('attProgram').value = programs[0];
                applications._onAttProgramChange();  // 첫 프로그램 자동감지 + 달력 렌더
            } else {
                applications._renderCalendar();
            }

        } catch (e) {
            document.getElementById('globalModalBody').innerHTML =
                '<p style="padding:20px;text-align:center;color:#e74c3c">불러오기 실패: ' + e.message + '</p>';
        }
    },

    // ── 미리보기 렌더 ──────────────────────────────────────────────────
    _renderAttendancePreview() {
        const prog        = document.getElementById('attProgram')?.value || '';
        const time        = document.getElementById('attTime')?.value   || '';
        const apps        = applications._attApps || [];
        const rawDates    = (applications._attCustomDates || []).slice().sort();
        const dateCols    = rawDates.length
            ? rawDates.map(k => applications._dateLabel(k))
            : ['1회','2회','3회','4회'];

        let filtered = apps;
        if (prog) filtered = filtered.filter(a => a.program_name === prog);
        if (time) filtered = filtered.filter(a => a.preferred_time === time);

        const container = document.getElementById('attendancePreview');
        if (!container) return;

        const countEl = document.getElementById('attDateCount');
        if (countEl) countEl.textContent = rawDates.length
            ? '(' + rawDates.length + '회 선택됨)'
            : '(날짜를 선택하세요)';

        if (!filtered.length) {
            container.innerHTML = '<p style="padding:18px;text-align:center;color:#999">해당 조건의 회원이 없습니다.</p>';
            return;
        }

        const groups = {};
        filtered.forEach(a => {
            const key = (a.program_name||'미지정') + '__' + (a.preferred_time||'미지정');
            if (!groups[key]) groups[key] = { program: a.program_name||'프로그램 미지정', time: a.preferred_time||'시간 미지정', members: [] };
            groups[key].members.push(a);
        });

        const sortM = arr => arr.sort((a, b) => {
            const da = String(a.dong||'').replace(/동$/,''), db = String(b.dong||'').replace(/동$/,'');
            if (da !== db) return da.localeCompare(db,'ko',{numeric:true});
            return String(a.ho||'').replace(/호$/,'').localeCompare(String(b.ho||'').replace(/호$/,''),'ko',{numeric:true});
        });

        let html = '';
        Object.values(groups).forEach(g => {
            sortM(g.members);
            const thDates = dateCols.map(d =>
                '<th style="padding:5px 2px;border:1px solid #d5f5e3;text-align:center;min-width:46px;font-size:.74rem;white-space:nowrap">' + d + '</th>'
            ).join('');
            const rows = g.members.map((m, i) =>
                '<tr style="background:' + (i%2===0?'#fff':'#f5fdfc') + '">' +
                '<td style="padding:6px 6px;border:1px solid #e8f8f5;text-align:center;color:#aaa;font-size:.8rem">' + (i+1) + '</td>' +
                '<td style="padding:6px 8px;border:1px solid #e8f8f5;text-align:center;white-space:nowrap">' + applications._fmtDongHo(m.dong,m.ho) + '</td>' +
                '<td style="padding:6px 8px;border:1px solid #e8f8f5;text-align:center;font-weight:600">' + (m.name||'') + '</td>' +
                '<td style="padding:6px 8px;border:1px solid #e8f8f5;text-align:center;color:#888;font-size:.8rem">' + applications._fmtPhoneLast4(m.phone) + '</td>' +
                dateCols.map(() => '<td style="border:1px solid #e8f8f5;min-width:46px"></td>').join('') +
                '<td style="border:1px solid #e8f8f5;min-width:44px"></td></tr>'
            ).join('');
            html +=
                '<div style="margin-bottom:18px">' +
                '<div style="background:#1abc9c;color:#fff;padding:7px 14px;border-radius:6px 6px 0 0;font-weight:700;font-size:.9rem">' +
                g.program + ' · ' + g.time +
                (rawDates.length ? '<span style="font-weight:400;opacity:.85;font-size:.8rem;margin-left:6px">월 ' + rawDates.length + '회</span>' : '') +
                '<span style="float:right;font-size:.82rem;opacity:.9">' + g.members.length + '명</span></div>' +
                '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.82rem;min-width:460px">' +
                '<thead><tr style="background:#f0fdf9">' +
                '<th style="padding:6px;border:1px solid #d5f5e3;text-align:center;width:30px">No.</th>' +
                '<th style="padding:6px 8px;border:1px solid #d5f5e3;text-align:center;min-width:76px">동/호수</th>' +
                '<th style="padding:6px 8px;border:1px solid #d5f5e3;text-align:center;min-width:54px">이름</th>' +
                '<th style="padding:6px 8px;border:1px solid #d5f5e3;text-align:center;min-width:64px">연락처</th>' +
                thDates +
                '</tr></thead>' +
                '<tbody>' + rows + '</tbody></table></div></div>';
        });
        container.innerHTML = html;
    },

    // ── PDF 다운로드 (v3.24 - 요일별 1슬라이드, 높이 초과 시 자동 분할) ──────
    _downloadAttendancePDF() {
        const prog        = document.getElementById('attProgram')?.value || '';
        const time        = document.getElementById('attTime')?.value   || '';
        const apps        = applications._attApps || [];
        const complexName = applications._attComplexName || '';
        const manualDates = (applications._attCustomDates || []).slice().sort();
        const calMonthEl  = document.getElementById('attCalMonth');
        const calMonthVal = calMonthEl ? calMonthEl.value : '';
        const [calYr, calMo] = calMonthVal ? calMonthVal.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth()+1];

        let filtered = apps;
        if (prog) filtered = filtered.filter(a => a.program_name === prog);
        if (time) filtered = filtered.filter(a => a.preferred_time === time);
        if (!filtered.length) { showToast('출력할 회원이 없습니다','error'); return; }

        // ── 1단계: 프로그램명+시간 단위로 세부 그룹화
        const timeGroups = {};
        filtered.forEach(a => {
            const key = (a.program_name||'') + '__' + (a.preferred_time||'');
            if (!timeGroups[key]) timeGroups[key] = { program: a.program_name||'프로그램 미지정', time: a.preferred_time||'시간 미지정', members: [] };
            timeGroups[key].members.push(a);
        });

        // ── 2단계: 프로그램명 기준으로 상위 그룹화
        const progGroups = {};
        Object.values(timeGroups).forEach(tg => {
            const pname = tg.program;
            if (!progGroups[pname]) progGroups[pname] = { program: pname, timeSlots: [] };
            progGroups[pname].timeSlots.push(tg);
        });

        const monthLabel = calYr + '년 ' + calMo + '월';

        // 그룹별 날짜 계산
        const getGroupDates = (programName) => {
            const dows = applications._parseProgramDows(programName);
            if (!dows.length) return manualDates.length ? manualDates : null;
            if (manualDates.length) {
                const f2 = manualDates.filter(k => {
                    const [y,m,d] = k.split('-').map(Number);
                    return dows.includes(new Date(y,m-1,d).getDay());
                });
                return f2.length ? f2 : null;
            }
            const lastDate = new Date(calYr, calMo, 0).getDate();
            const dates = [];
            for (let d = 1; d <= lastDate; d++) {
                const date = new Date(calYr, calMo-1, d);
                if (dows.includes(date.getDay()))
                    dates.push(calYr + '-' + String(calMo).padStart(2,'0') + '-' + String(d).padStart(2,'0'));
            }
            return dates.length ? dates : null;
        };

        const sortM = arr => arr.sort((a, b) => {
            const da = String(a.dong||'').replace(/동$/,''), db = String(b.dong||'').replace(/동$/,'');
            if (da !== db) return da.localeCompare(db,'ko',{numeric:true});
            return String(a.ho||'').replace(/호$/,'').localeCompare(String(b.ho||'').replace(/호$/,''),'ko',{numeric:true});
        });

        // 프로그램 정렬 (요일 우선순위)
        const getDowPriority = (programName) => {
            const dows = applications._parseProgramDows(programName);
            if (!dows.length) return 99;
            const first = Math.min(...dows);
            return first === 0 ? 98 : first;
        };
        const sortedProgGroups = Object.values(progGroups).sort((a, b) =>
            getDowPriority(a.program) - getDowPriority(b.program)
        );
        sortedProgGroups.forEach(pg => {
            pg.timeSlots.sort((a, b) => (a.time||'').localeCompare(b.time||'', 'ko'));
        });

        // ── 시간대 블록 하나의 HTML + 예상 높이(mm) 반환 ──────────────────
        // 실측 기반 높이 (96dpi: 1px=0.2646mm)
        // 시간대 헤더 div: 10pt폰트(13.3px)*1.4 + padding8px = 26.6px ≈ 7.0mm
        // 테이블 헤더 tr: 7.5pt폰트(10px)*1.2 + padding8px = 20px ≈ 5.3mm
        // 데이터 행: height:22px셀 + border공유 = 23px ≈ 6.1mm
        // 타이틀바: 12pt폰트(16px)*1.4 + padding6px + border2px = 30.4px ≈ 8.0mm
        const ROW_H_MM     = 6.1;   // 데이터 행 1개 실측 높이(mm)
        const SLOT_HEAD_MM = 7.0;   // 시간대 헤더 div 높이(mm)
        const TBL_HEAD_MM  = 5.3;   // 테이블 헤더 tr 높이(mm)
        const tsBlockHtml = (ts, dateCols, dateMm, isFirst) => {
            sortM(ts.members);
            const rows = ts.members.map((m, i) =>
                '<tr style="' + (i%2 ? 'background:#f5fdfb' : '') + '">' +
                '<td style="padding:3px 2px;border:1px solid #ccc;text-align:center;font-size:7.5pt;color:#999;width:8mm">' + (i+1) + '</td>' +
                '<td style="padding:3px 4px;border:1px solid #ccc;text-align:center;font-size:8pt;white-space:nowrap;width:22mm">' + applications._fmtDongHo(m.dong,m.ho) + '</td>' +
                '<td style="padding:3px 4px;border:1px solid #ccc;text-align:center;font-size:9.5pt;font-weight:bold;width:16mm">' + (m.name||'') + '</td>' +
                '<td style="padding:3px 4px;border:1px solid #ccc;text-align:center;font-size:7.5pt;color:#555;width:16mm">' + applications._fmtPhoneLast4(m.phone) + '</td>' +
                dateCols.map(() => '<td style="border:1px solid #ccc;height:22px;width:' + dateMm + 'mm"></td>').join('') +
                '</tr>'
            ).join('');
            const thDates = dateCols.map(d =>
                '<th style="padding:3px 1px;text-align:center;border:1px solid #bbb;font-size:7pt;width:' + dateMm + 'mm;white-space:nowrap">' + d + '</th>'
            ).join('');
            const html =
                '<div style="' + (!isFirst ? 'margin-top:4mm;' : '') + '">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;' +
                'background:#1abc9c;color:#fff;padding:4px 8px;border-radius:3px 3px 0 0">' +
                '<span style="font-size:10pt;font-weight:700">' + ts.time + '</span>' +
                '<span style="font-size:8pt;opacity:.9">' + ts.members.length + '명</span></div>' +
                '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
                '<thead><tr style="background:#e8f8f2">' +
                '<th style="padding:4px 2px;text-align:center;border:1px solid #bbb;width:8mm;font-size:7.5pt">No.</th>' +
                '<th style="padding:4px 3px;text-align:center;border:1px solid #bbb;width:22mm;font-size:8pt">동/호수</th>' +
                '<th style="padding:4px 3px;text-align:center;border:1px solid #bbb;width:16mm;font-size:8.5pt">이름</th>' +
                '<th style="padding:4px 3px;text-align:center;border:1px solid #bbb;width:16mm;font-size:7.5pt">연락처</th>' +
                thDates +
                '</tr></thead><tbody>' + rows + '</tbody></table></div>';
            // 예상 높이(mm): 간격 + 시간대헤더 + 테이블헤더 + 행당 높이
            const estimatedMm = (!isFirst ? 4 : 0) + SLOT_HEAD_MM + TBL_HEAD_MM + ts.members.length * ROW_H_MM;
            return { html, estimatedMm };
        };

        // ── page-block 생성: 각 프로그램을 슬라이드로, 넘치면 자동 분할 ──
        // A4 가로 210mm - page-block padding(8mm*2) = 194mm 사용 가능
        // html2canvas가 scrollHeight 기준으로 캡처 후 ratio fit하므로
        // 194mm 이하면 A4에 꽉 차게, 초과 시 축소됨
        const PAGE_H_MM  = 194;  // page-block 내부 실사용 높이(mm)
        const TITLE_H_MM = 8.0;  // 프로그램 타이틀바 높이(mm)

        let printContent = '';

        sortedProgGroups.forEach(pg => {
            const groupRaw  = getGroupDates(pg.program) || [];
            const dateCols  = groupRaw.length ? groupRaw.map(k => applications._dateLabel(k)) : ['1회','2회','3회','4회'];
            const dateMm    = Math.max(9, Math.floor(185 / dateCols.length));
            const totalMembers = pg.timeSlots.reduce((s, ts) => s + ts.members.length, 0);

            // 슬라이드 분할: 시간대를 순서대로 쌓으면서 PAGE_H_MM 초과 시 새 슬라이드
            let slides = [];          // 슬라이드 배열 [ [{html,mm}, ...], ... ]
            let curSlide = [];        // 현재 슬라이드에 쌓인 블록들
            let curH = TITLE_H_MM;   // 현재 슬라이드 누적 높이 (타이틀 포함)

            pg.timeSlots.forEach((ts) => {
                const isFirstInSlide = curSlide.length === 0;
                const block = tsBlockHtml(ts, dateCols, dateMm, isFirstInSlide);

                if (!isFirstInSlide && curH + block.estimatedMm > PAGE_H_MM) {
                    // 현재 슬라이드 저장 후 새 슬라이드 시작
                    slides.push(curSlide);
                    curSlide = [];
                    curH = TITLE_H_MM;
                    // 새 슬라이드에서의 첫 블록이므로 isFirst=true 로 재생성
                    const blockNew = tsBlockHtml(ts, dateCols, dateMm, true);
                    curSlide.push(blockNew);
                    curH += blockNew.estimatedMm;
                } else {
                    curSlide.push(block);
                    curH += block.estimatedMm;
                }
            });
            if (curSlide.length) slides.push(curSlide);

            // 슬라이드 → page-block HTML
            slides.forEach((blocks, si) => {
                const slideLabel = slides.length > 1 ? ' (' + (si+1) + '/' + slides.length + ')' : '';
                printContent +=
                    '<div class="page-block">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-end;' +
                    'margin-bottom:4px;border-bottom:2px solid #1abc9c;padding-bottom:3px">' +
                    '<span style="font-size:12pt;font-weight:bold;color:#1e8449">' +
                    pg.program + slideLabel + '</span>' +
                    '<span style="font-size:8pt;color:#888">' + monthLabel +
                    ' &nbsp;|&nbsp; 총 <strong style="color:#333">' + totalMembers + '</strong>명' +
                    ' | 인당 <strong style="color:#333">' + dateCols.length + '</strong>회</span></div>' +
                    blocks.map(b => b.html).join('') +
                    '</div>';
            });
        });

        const win = window.open('','_blank','width=1150,height=820');
        if (!win) { showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.','error'); return; }
        const attTitle = complexName + ' 출석부';
        win.document.write(
            '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
            '<title>' + attTitle + ' ' + monthLabel + '</title>' +
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>' +
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>' +
            '<style>' +
            '*{box-sizing:border-box}' +
            'body{font-family:\'Malgun Gothic\',\'맑은 고딕\',Arial,sans-serif;margin:0;padding:0;color:#111;background:#f0f0f0}' +
            '.page-block{width:277mm;padding:8mm 10mm;background:#fff;margin:0 auto 4mm;box-shadow:0 1px 4px rgba(0,0,0,.1)}'  /* min-height 제거: 내용만큼만 높이 */ +
            'table{border-collapse:collapse}' +
            '@media print{body{background:#fff}.page-block{box-shadow:none;margin:0;page-break-after:always}}' +
            '<\/style>' +
            '<script>async function downloadPDF(){' +
            'var btn=document.getElementById(\'dlBtn\');btn.disabled=true;btn.textContent=\'생성 중...\';' +
            'var blocks=document.querySelectorAll(\'.page-block\');' +
            'var pdf=new window.jspdf.jsPDF({orientation:\'landscape\',unit:\'mm\',format:\'a4\'});' +
            'var pw=pdf.internal.pageSize.getWidth();var ph=pdf.internal.pageSize.getHeight();' +
            'var margin=8;' +
            'for(var i=0;i<blocks.length;i++){' +
            'var el=blocks[i];' +
            // html2canvas 전에 블록 너비를 A4 가로 픽셀 기준으로 고정
            'var origW=el.style.width;el.style.width=\'277mm\';' +
            'var bw=el.scrollWidth;var bh=el.scrollHeight;' +
            'var canvas=await html2canvas(el,{scale:2.5,useCORS:true,logging:false,backgroundColor:\'#ffffff\',' +
            'width:bw,height:bh,windowWidth:bw,windowHeight:bh,scrollX:0,scrollY:0});' +
            'el.style.width=origW;' +
            'var iw=canvas.width;var ih=canvas.height;' +
            'var aw=pw-margin*2;var ah=ph-margin*2;' +
            'var ratio=Math.min(aw/iw, ah/ih);' +  // 가로·세로 모두 맞춤
            'var cx=margin+(aw-iw*ratio)/2;var cy=margin;' +
            'if(i>0)pdf.addPage(\'a4\',\'landscape\');' +
            'pdf.addImage(canvas.toDataURL(\'image/jpeg\',0.95),\'JPEG\',cx,cy,iw*ratio,ih*ratio);' +
            '}' +
            'pdf.save(\'출석부_' + monthLabel + '.pdf\');' +
            'btn.disabled=false;btn.textContent=\'📥 PDF 다운로드\';}<\/script>' +
            '</head><body>' +
            '<div style="position:sticky;top:0;z-index:99;background:#fff;text-align:right;' +
            'padding:6px 10mm;border-bottom:1px solid #eee">' +
            '<span style="font-size:9pt;color:#888;margin-right:12px">' + attTitle + ' ' + monthLabel + '</span>' +
            '<button id="dlBtn" onclick="downloadPDF()" style="padding:7px 18px;background:#1abc9c;' +
            'color:#fff;border:none;border-radius:6px;font-size:10.5pt;cursor:pointer;margin-right:8px">📥 PDF 다운로드</button>' +
            '<button onclick="window.close()" style="padding:7px 13px;background:#95a5a6;' +
            'color:#fff;border:none;border-radius:6px;font-size:10.5pt;cursor:pointer">닫기</button></div>' +
            printContent + '</body></html>'
        );
        win.document.close();
        win.focus();
    },

    // ══════════════════════════════════════════════════════════════════
    // 시간표 달력 PDF  (v3.12 전면 재설계)
    // ══════════════════════════════════════════════════════════════════

    // ── 한국 공휴일 (연도별 고정 공휴일 + 주요 연도 음력 환산 포함)
    _getKoreanHolidays(yr) {
        const h = {};
        const add = (m, d, name) => { h[yr + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0')] = name; };
        // 고정 공휴일
        add(1,1,'신정'); add(3,1,'삼일절'); add(5,5,'어린이날');
        add(6,6,'현충일'); add(8,15,'광복절'); add(10,3,'개천절');
        add(10,9,'한글날'); add(12,25,'성탄절');
        // 연도별 음력 공휴일 (2024~2027)
        const lunar = {
            2024: { seol:[[2,9],[2,10],[2,12]], chuseok:[[9,16],[9,17],[9,18]], buddha:[5,15], memorial:[4,10] },
            2025: { seol:[[1,28],[1,29],[1,30]], chuseok:[[10,5],[10,6],[10,7]], buddha:[5,5], memorial:[4,9] },
            2026: { seol:[[2,16],[2,17],[2,19]], chuseok:[[9,24],[9,25],[9,26]], buddha:[5,24], memorial:[4,15] },
            2027: { seol:[[2,6],[2,7],[2,8]],   chuseok:[[9,14],[9,15],[9,16]], buddha:[5,13], memorial:[4,11] },
        };
        if (lunar[yr]) {
            lunar[yr].seol.forEach(([m,d]) => add(m,d,'설날'));
            lunar[yr].chuseok.forEach(([m,d]) => add(m,d,'추석'));
            add(...lunar[yr].buddha, '부처님오신날');
        }
        return h;
    },

    // ── 시간표 달력 렌더 (모달 내부용)
    _renderTtCalendar() {
        const sel = document.getElementById('ttCalMonth');
        if (!sel) return;
        const [yr, mo] = sel.value.split('-').map(Number);
        const checked  = applications._ttCustomDates || [];
        const holidays = applications._ttHolidays    || {};

        // 요일별 강좌 목록 미리계산
        const apps = applications._ttApps || [];
        const programsByDow = {}; // dow -> [{program, time}]
        const seen = new Set();
        apps.forEach(a => {
            const k = (a.program_name||'') + '__' + (a.preferred_time||'');
            if (seen.has(k)) return; seen.add(k);
            const dows = applications._parseProgramDows(a.program_name||'');
            dows.forEach(dow => {
                if (!programsByDow[dow]) programsByDow[dow] = [];
                programsByDow[dow].push({ program: a.program_name||'', time: a.preferred_time||'' });
            });
        });

        const firstDay = new Date(yr, mo-1, 1).getDay();
        const lastDate = new Date(yr, mo, 0).getDate();
        const DOW_NAMES  = ['일','월','화','수','목','금','토'];
        const DOW_COLORS = ['#e74c3c','#444','#444','#444','#444','#444','#2980b9'];

        // 헤더
        const headerHtml = DOW_NAMES.map((n, i) =>
            '<th style="padding:4px 0;text-align:center;font-size:.75rem;color:' + DOW_COLORS[i] + ';border-bottom:1px solid #ddd;width:14.28%">' + n + '</th>'
        ).join('');

        // 셀
        let cellIdx = 0, rows = '', row = '<tr>';
        for (let i = 0; i < firstDay; i++) { row += '<td></td>'; cellIdx++; }
        for (let d = 1; d <= lastDate; d++) {
            const dow     = new Date(yr, mo-1, d).getDay();
            const key     = yr + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0');
            const isSel   = checked.includes(key);
            const isHol   = !!holidays[key];
            const isSun   = dow === 0;
            const isSat   = dow === 6;
            const isRed   = isHol || isSun;
            const holName = holidays[key] || '';
            const numCol  = isSel ? '#fff' : (isRed ? '#e74c3c' : (isSat ? '#2980b9' : '#333'));
            const bgCol   = isSel ? '#3498db' : (isRed ? '#fff5f5' : '#fff');
            const border  = isSel ? '2px solid #2980b9' : (isRed ? '1px solid #f5c6c6' : '1px solid #e8e8e8');

            // 해당 요일에 개설되는 강좌 미리보기 (최대 3개)
            const dowPrograms = programsByDow[dow] || [];
            const progHtml = isSel ? dowPrograms.slice(0,3).map(g =>
                '<div style="font-size:.55rem;color:' + (isSel?'rgba(255,255,255,0.9)':'#1a5276') + ';line-height:1.3;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:left;padding:0 1px">' +
                g.time + '</div>'
            ).join('') : '';

            row +=
                '<td style="padding:1px;text-align:center;vertical-align:top">' +
                '<label style="display:block;cursor:pointer;border-radius:4px;border:' + border + ';background:' + bgCol + ';padding:3px 2px;min-height:38px">' +
                '<input type="checkbox" style="display:none" ' + (isSel?'checked':'') +
                    ' onchange="applications._onTtCalCheck(this,\'' + key + '\')">' +
                '<div style="font-size:.82rem;font-weight:700;color:' + numCol + ';line-height:1.2">' + d + '</div>' +
                (holName ? '<div style="font-size:.58rem;color:' + (isSel?'rgba(255,255,255,0.9)':'#e74c3c') + ';line-height:1;overflow:hidden;white-space:nowrap">' + holName + '</div>' : '') +
                (dowPrograms.length && !isSel ? '<div style="font-size:.58rem;color:#888;line-height:1.2;margin-top:1px">' + dowPrograms.length + '개강좌</div>' : '') +
                progHtml +
                '</label></td>';
            cellIdx++;
            if (cellIdx % 7 === 0) { row += '</tr>'; rows += row; row = '<tr>'; }
        }
        if (cellIdx % 7 !== 0) {
            while (cellIdx % 7 !== 0) { row += '<td></td>'; cellIdx++; }
            row += '</tr>'; rows += row;
        }

        const grid = document.getElementById('ttCalGrid');
        if (grid) grid.innerHTML =
            '<table style="width:100%;border-collapse:collapse"><thead><tr>' + headerHtml + '</tr></thead><tbody>' + rows + '</tbody></table>';

        // 태그 업데이트
        const tags = document.getElementById('ttCalTags');
        if (tags) {
            const sorted = [...checked].sort();
            if (sorted.length) {
                tags.innerHTML = sorted.map(k => {
                    const [y,m,dd] = k.split('-').map(Number);
                    const dow2 = new Date(y,m-1,dd).getDay();
                    const isH  = !!holidays[k] || dow2===0;
                    const isS  = dow2===6;
                    const col  = isH?'#e74c3c':(isS?'#2980b9':'#2c3e50');
                    const bg   = isH?'#fdecea':(isS?'#eaf3fb':'#f0f4f8');
                    const lbl  = m+'/'+dd+'('+['일','월','화','수','목','금','토'][dow2]+')';
                    return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:10px;background:'+bg+';border:1px solid '+col+';font-size:.75rem;color:'+col+'">' +
                        lbl + '<button onclick="applications._removeTtDate(\''+k+'\')" style="border:none;background:none;cursor:pointer;font-size:.8rem;color:'+col+';padding:0;line-height:1">×</button></span>';
                }).join('');
            } else {
                tags.innerHTML = '<span style="color:#bbb;font-size:.82rem">선택된 날짜 없음</span>';
            }
        }
        const cnt = document.getElementById('ttDateCount');
        if (cnt) cnt.textContent = checked.length ? '(' + checked.length + '일 선택됨)' : '';
    },

    _onTtCalCheck(cb, key) {
        const arr = applications._ttCustomDates || [];
        if (cb.checked) { if (!arr.includes(key)) arr.push(key); }
        else { const i = arr.indexOf(key); if (i > -1) arr.splice(i,1); }
        applications._ttCustomDates = arr.sort();
        applications._renderTtCalendar();
    },

    _removeTtDate(key) {
        applications._ttCustomDates = (applications._ttCustomDates || []).filter(k => k !== key);
        applications._renderTtCalendar();
    },

    _selectTtByDow(yr, mo, dow) {
        const last = new Date(yr, mo, 0).getDate();
        const arr  = applications._ttCustomDates || [];
        for (let d = 1; d <= last; d++) {
            if (new Date(yr, mo-1, d).getDay() === dow) {
                const k = yr + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0');
                if (!arr.includes(k)) arr.push(k);
            }
        }
        applications._ttCustomDates = arr.sort();
        applications._renderTtCalendar();
    },

    _onTtMonthChange() {
        const sel = document.getElementById('ttCalMonth');
        if (!sel) return;
        applications._ttMonth = sel.value;
        const [yr, mo] = sel.value.split('-').map(Number);
        applications._ttHolidays = applications._getKoreanHolidays(yr);
        // 새 월에 맞춰 프로그램 요일 기반 날짜 자동 재선택
        const apps = applications._ttApps || [];
        const groups = {};
        apps.forEach(a => {
            const k = (a.program_name||'') + '__' + (a.preferred_time||'');
            if (!groups[k]) groups[k] = { program: a.program_name||'미지정', time: a.preferred_time||'미지정' };
        });
        const lastDate = new Date(yr, mo, 0).getDate();
        const autoSelected = new Set();
        Object.values(groups).forEach(g => {
            const dows = applications._parseProgramDows(g.program);
            for (let d = 1; d <= lastDate; d++) {
                if (dows.includes(new Date(yr, mo-1, d).getDay()))
                    autoSelected.add(yr + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0'));
            }
        });
        applications._ttCustomDates = [...autoSelected].sort();
        applications._renderTtCalendar();
    },

    async showTimetableModal() {
        const complexId = getEffectiveComplexId();
        if (!complexId) { showToast('단지를 먼저 선택해주세요','error'); return; }

        openGlobalModal(
            '<i class="fas fa-calendar-alt" style="color:#3498db"></i> 시간표 PDF 출력',
            '<div style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin fa-2x" style="color:#3498db"></i><p style="margin-top:12px;color:#666">강좌 목록을 불러오는 중...</p></div>',
            ''
        );

        let apps = [];
        try {
            const res = await API.applications.list({ complexId, status: 'approved', limit: 500 });
            apps = res.data || res.applications || res || [];
        } catch(e) { showToast('데이터 로드 실패','error'); return; }

        if (!apps.length) {
            document.getElementById('globalModalBody').innerHTML = '<p style="text-align:center;padding:30px;color:#888">승인된 회원이 없습니다.</p>';
            return;
        }

        const complexName = Admin.role === 'master'
            ? (Admin.selectedComplexName || '단지') : (Admin.complex?.name || '단지');
        const now = new Date();
        const defaultMonth = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
        const [initYr] = defaultMonth.split('-').map(Number);

        applications._ttApps         = apps;
        applications._ttComplexName  = complexName;
        applications._ttMonth        = defaultMonth;
        applications._ttCustomDates  = [];
        applications._ttHolidays     = applications._getKoreanHolidays(initYr);

        // 프로그램별 요일 자동 감지 → 해당 월 날짜 자동 선택
        const groups = {};
        apps.forEach(a => {
            const k = (a.program_name||'') + '__' + (a.preferred_time||'');
            if (!groups[k]) groups[k] = { program: a.program_name||'미지정', time: a.preferred_time||'미지정' };
        });
        const [initYr2, initMo] = defaultMonth.split('-').map(Number);
        const lastDate = new Date(initYr2, initMo, 0).getDate();
        const autoSelected = new Set();
        Object.values(groups).forEach(g => {
            const dows = applications._parseProgramDows(g.program);
            for (let d = 1; d <= lastDate; d++) {
                if (dows.includes(new Date(initYr2, initMo-1, d).getDay()))
                    autoSelected.add(initYr2 + '-' + String(initMo).padStart(2,'0') + '-' + String(d).padStart(2,'0'));
            }
        });
        applications._ttCustomDates = [...autoSelected].sort();

        // 강좌 목록 (모달 내 미리보기)
        const DOW_KR = ['일','월','화','수','목','금','토'];
        const comboRows = Object.values(groups).map(g => {
            const dows = applications._parseProgramDows(g.program);
            const dowStr = dows.length ? dows.map(d => DOW_KR[d]).join('·') : '?';
            return '<tr style="border-bottom:1px solid #f0f0f0">' +
                '<td style="padding:4px 8px;font-size:.82rem">' + g.program + '</td>' +
                '<td style="padding:4px 8px;font-size:.82rem;color:#555">' + g.time + '</td>' +
                '<td style="padding:4px 8px;font-size:.82rem;color:#3498db;text-align:center">' + dowStr + '</td></tr>';
        }).join('');

        const body =
            // ── 월 선택 + 달력
            '<div style="background:#f0f7ff;border:1px solid #bee3f8;border-radius:8px;padding:10px 14px;margin-bottom:10px">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
            '<div style="font-size:.85rem;font-weight:700;color:#1a5276"><i class="fas fa-calendar-check"></i> 수업 날짜 선택 ' +
            '<span id="ttDateCount" style="font-weight:400;color:#888;font-size:.8rem"></span></div>' +
            '<div style="display:flex;align-items:center;gap:6px">' +
            '<label style="font-size:.8rem;color:#555">월:</label>' +
            '<input type="month" id="ttCalMonth" value="' + defaultMonth + '" onchange="applications._onTtMonthChange()" ' +
            'style="padding:4px 8px;border:1px solid #bee3f8;border-radius:6px;font-size:.85rem;color:#1a5276;font-weight:600"></div></div>' +
            '<div id="ttCalGrid" style="margin-bottom:8px"></div>' +
            '<div style="font-size:.78rem;color:#888;font-weight:600;margin-bottom:4px">선택된 날짜</div>' +
            '<div id="ttCalTags" style="display:flex;flex-wrap:wrap;gap:4px;min-height:26px;padding:4px 6px;background:#fff;border:1px solid #bee3f8;border-radius:6px">' +
            '<span style="color:#bbb;font-size:.82rem">선택된 날짜 없음</span></div></div>' +
            // ── 강좌 목록 참고
            '<details style="margin-top:2px"><summary style="font-size:.82rem;color:#888;cursor:pointer;padding:4px 0">강좌 목록 (참고)</summary>' +
            '<div style="background:#f8f9fa;border-radius:6px;padding:8px 10px;margin-top:6px">' +
            '<table style="width:100%;border-collapse:collapse">' +
            '<thead><tr style="background:#eee"><th style="padding:4px 8px;text-align:left;font-size:.78rem">프로그램</th>' +
            '<th style="padding:4px 8px;text-align:left;font-size:.78rem">시간</th>' +
            '<th style="padding:4px 8px;text-align:center;font-size:.78rem">수업요일</th></tr></thead>' +
            '<tbody>' + comboRows + '</tbody></table></div></details>';

        const footer =
            '<button onclick="closeGlobalModal()" style="padding:8px 18px;background:#95a5a6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.9rem;margin-right:8px">닫기</button>' +
            '<button onclick="applications._downloadTimetablePDF()" style="padding:8px 20px;background:#3498db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.9rem"><i class="fas fa-calendar-alt"></i> 시간표 PDF 다운로드</button>';

        document.getElementById('globalModalBody').innerHTML = body;
        document.getElementById('globalModalFooter').innerHTML = footer;
        // 달력 초기 렌더
        applications._renderTtCalendar();
    },

    _downloadTimetablePDF() {
        const monthVal = applications._ttMonth || (new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0'));
        const [yr, mo] = monthVal.split('-').map(Number);
        const complexName = applications._ttComplexName || '';
        const apps        = applications._ttApps || [];
        const holidays    = applications._ttHolidays || applications._getKoreanHolidays(yr);
        // 선택된 날짜 (없으면 자동 계산)
        let selDates = (applications._ttCustomDates || []).slice().sort();
        if (!selDates.length) { showToast('날짜를 선택해주세요','error'); return; }

        // 강좌별 그룹화 - 프로그램명 기준 중복 제거 (시간표에서는 시간 미표시)
        const groups = {};
        apps.forEach(a => {
            const k = (a.program_name||'').trim();
            if (!groups[k]) groups[k] = { program: k||'미지정' };
        });
        const sortedGroups = Object.values(groups).sort((a,b) => {
            const pa = (() => { const d = applications._parseProgramDows(a.program); return d.length ? Math.min(...d.map(x=>x===0?98:x)) : 99; })();
            const pb = (() => { const d = applications._parseProgramDows(b.program); return d.length ? Math.min(...d.map(x=>x===0?98:x)) : 99; })();
            return pa !== pb ? pa - pb : a.program.localeCompare(b.program);
        });

        const monthLabel = yr + '년 ' + mo + '월';
        const DOW_KR     = ['일','월','화','수','목','금','토'];

        // ── 달력 그리기
        const firstDay = new Date(yr, mo-1, 1).getDay();
        const lastDate = new Date(yr, mo, 0).getDate();

        // 날짜별 강좌 목록 (선택된 날짜만, 요일로 매칭)
        const dayClasses = {};
        selDates.forEach(key => {
            const [y,m,d] = key.split('-').map(Number);
            const dow = new Date(y,m-1,d).getDay();
            const matched = sortedGroups.filter(g => {
                const dows = applications._parseProgramDows(g.program);
                return dows.includes(dow);
            });
            if (matched.length) dayClasses[d] = matched;
        });

        // 달력 헤더
        const DOW_COLORS_HD = ['#e74c3c','#444','#444','#444','#444','#444','#2980b9'];
        const DOW_BG_HD     = ['#fdecea','#f5f5f5','#f5f5f5','#f5f5f5','#f5f5f5','#f5f5f5','#eaf3fb'];
        const dowHeaders = DOW_KR.map((n,i) =>
            '<th style="padding:5px 2px;text-align:center;font-size:9pt;font-weight:700;color:' + DOW_COLORS_HD[i] + ';background:' + DOW_BG_HD[i] + ';border:1px solid #ddd;width:14.28%">' + n + '</th>'
        ).join('');

        // 달력 행 수 계산 → 셀 높이 동적 산출 (landscape A4 유효높이 ~170mm, 헤더 ~22mm 제외)
        const totalRows = Math.ceil((firstDay + lastDate) / 7);
        const cellH = Math.floor((170 - 22) / totalRows) + 'mm';

        // 달력 셀
        let cellIdx = 0, calRows = '', row = '<tr>';
        for (let i = 0; i < firstDay; i++) {
            row += '<td style="border:1px solid #eee;height:' + cellH + ';background:#fafafa"></td>';
            cellIdx++;
        }
        for (let d = 1; d <= lastDate; d++) {
            const dow     = new Date(yr, mo-1, d).getDay();
            const dateKey = yr + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0');
            const isHol   = !!holidays[dateKey];
            const isSun   = dow === 0;
            const isSat   = dow === 6;
            const isRed   = isHol || isSun;
            const numColor = isRed ? '#e74c3c' : (isSat ? '#2980b9' : '#222');
            const cellBg   = isRed ? '#fff8f8' : (isSat ? '#f8faff' : '#fff');
            const isSel    = selDates.includes(dateKey);
            const classes  = dayClasses[d] || [];
            const holName  = holidays[dateKey] || '';

            // 강좌 블록 (선택 날짜에만, 프로그램명만 표시)
            const classHtml = (isSel && classes.length) ? classes.map(g =>
                '<div style="margin:1px 1px;padding:1px 3px;background:#e8f4fd;border-left:2.5px solid #3498db;border-radius:2px;font-size:6.5pt;line-height:1.35;font-weight:700;color:#1a5276;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' +
                g.program + '</div>'
            ).join('') : '';

            row +=
                '<td style="border:1px solid #ddd;height:' + cellH + ';vertical-align:top;padding:2px;background:' + cellBg + '">' +
                '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:0 2px 1px">' +
                '<span style="font-size:9pt;font-weight:700;color:' + numColor + '">' + d + '</span>' +
                (holName ? '<span style="font-size:5.5pt;color:#e74c3c;font-weight:600;white-space:nowrap">' + holName + '</span>' : '') +
                '</div>' +
                classHtml + '</td>';
            cellIdx++;
            if (cellIdx % 7 === 0) { row += '</tr>'; calRows += row; row = '<tr>'; }
        }
        if (cellIdx % 7 !== 0) {
            while (cellIdx % 7 !== 0) { row += '<td style="border:1px solid #eee;height:' + cellH + ';background:#fafafa"></td>'; cellIdx++; }
            row += '</tr>'; calRows += row;
        }

        // 범례 섹션 삭제됨

        const content =
            '<div style="text-align:center;border-bottom:2.5px solid #3498db;padding-bottom:6px;margin-bottom:8px;position:relative">' +
            '<div style="font-size:15pt;font-weight:bold;color:#1a252f">' + complexName + '</div>' +
            '<div style="font-size:10.5pt;color:#3498db;font-weight:600;margin-top:1px">' + monthLabel + ' 강좌 시간표</div>' +
            '<div style="position:absolute;right:0;bottom:6px;font-size:7pt;color:#aaa">출력일: ' + new Date().toLocaleDateString('ko-KR') + '</div></div>' +
            '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
            '<thead><tr>' + dowHeaders + '</tr></thead>' +
            '<tbody>' + calRows + '</tbody></table>';

        const win = window.open('','_blank','width=1130,height=820');
        if (!win) { showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.','error'); return; }
        win.document.write('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
            '<title>' + complexName + ' 시간표 ' + monthLabel + '</title>' +
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>' +
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>' +
            '<style>*{box-sizing:border-box}' +
            'body{font-family:\'Malgun Gothic\',\'맑은 고딕\',Arial,sans-serif;margin:8mm 12mm;color:#111}' +
            'table{border-collapse:collapse}' +
            '.dl-btn{padding:7px 18px;color:#fff;border:none;border-radius:6px;font-size:10.5pt;cursor:pointer;margin-right:6px}' +
            '</style>' +
            '<script>' +
            'function captureCanvas(cb){' +
            '  var el=document.getElementById(\'printArea\');' +
            '  html2canvas(el,{scale:2,useCORS:true,logging:false}).then(cb);' +
            '}' +
            'function downloadPDF(){' +
            '  var btn=document.getElementById(\'dlBtnPdf\');btn.disabled=true;btn.textContent=\'생성 중...\';' +
            '  captureCanvas(function(canvas){' +
            '    var pdf=new window.jspdf.jsPDF({orientation:\'landscape\',unit:\'mm\',format:\'a4\'});' +
            '    var pw=pdf.internal.pageSize.getWidth();var ph=pdf.internal.pageSize.getHeight();' +
            '    var iw=canvas.width;var ih=canvas.height;' +
            '    var ratio=Math.min(pw/iw,ph/ih);' +
            '    var cx=(pw-iw*ratio)/2;var cy=(ph-ih*ratio)/2;' +
            '    pdf.addImage(canvas.toDataURL(\'image/jpeg\',0.95),\'JPEG\',cx,cy,iw*ratio,ih*ratio);' +
            '    pdf.save(\'시간표_' + monthLabel + '.pdf\');' +
            '    btn.disabled=false;btn.textContent=\'📥 PDF 다운로드\';' +
            '  });' +
            '}' +
            'function downloadIMG(){' +
            '  var btn=document.getElementById(\'dlBtnImg\');btn.disabled=true;btn.textContent=\'생성 중...\';' +
            '  captureCanvas(function(canvas){' +
            '    var a=document.createElement(\'a\');' +
            '    a.href=canvas.toDataURL(\'image/png\');' +
            '    a.download=\'시간표_' + monthLabel + '.png\';' +
            '    document.body.appendChild(a);a.click();document.body.removeChild(a);' +
            '    btn.disabled=false;btn.textContent=\'🖼 이미지 다운로드\';' +
            '  });' +
            '}' +
            '<\/script>' +
            '</head><body>' +
            '<div style="text-align:right;margin-bottom:8px">' +
            '<button id="dlBtnPdf" class="dl-btn" onclick="downloadPDF()" style="background:#3498db">📥 PDF 다운로드</button>' +
            '<button id="dlBtnImg" class="dl-btn" onclick="downloadIMG()" style="background:#27ae60">🖼 이미지 다운로드</button>' +
            '<button class="dl-btn" onclick="window.print()" style="background:#8e44ad">🖨 인쇄</button>' +
            '<button onclick="window.close()" style="padding:7px 13px;background:#95a5a6;color:#fff;border:none;border-radius:6px;font-size:10.5pt;cursor:pointer">닫기</button></div>' +
            '<div id="printArea">' + content + '</div></body></html>');
        win.document.close();
        win.focus();
    },

    // ════════════════════════════════════════════════════════════
    // 신청기간 설정 모달 — 신청 종류별 개별 기간 설정 통합
    // ════════════════════════════════════════════════════════════
    async showApplyPeriodModal() {
        const complexId = getEffectiveComplexId();
        if (!complexId) { showToast('단지를 먼저 선택하세요', 'error'); return; }

        // 신청기간 전역 설정 + 신청 종류별 설정 동시 조회
        let globalData = null, typeData = null;
        try {
            const [r1, r2] = await Promise.all([
                fetch(`/api/complexes/${complexId}/apply-period`).then(r => r.json()),
                fetch(`/api/complexes/${complexId}/apply-settings`).then(r => r.json()),
            ]);
            if (r1.success) globalData = r1.data;
            if (r2.success) typeData   = r2.data;
        } catch(e) { showToast('설정 조회 실패: ' + e.message, 'error'); return; }

        // UTC → KST {day, hour, minute} 파싱
        const toKst = (utcStr) => {
            if (!utcStr) return { day: '', hour: '', minute: '00' };
            const d = new Date(new Date(utcStr).getTime() + 9 * 60 * 60 * 1000);
            return {
                day:    String(d.getUTCDate()),
                hour:   String(d.getUTCHours()),
                minute: String(d.getUTCMinutes()).padStart(2, '0'),
            };
        };

        // 신청 종류 정의
        const APPLY_TYPES = [
            { key: 'global',     label: '전체 기본 기간',    icon: 'fa-globe',               color: '#8e44ad' },
            { key: 'new',        label: '신규 수강 신청',    icon: 'fa-user-plus',            color: '#2980b9' },
            { key: 'waiting',    label: '대기 신청',         icon: 'fa-clock',                color: '#16a085' },
            { key: 'cancel',     label: '차월 해지',         icon: 'fa-times-circle',         color: '#c0392b' },
            { key: 'mid_cancel', label: '중도 해지',         icon: 'fa-cut',                  color: '#e67e22' },
            { key: 'refund',     label: '환불 신청',         icon: 'fa-file-invoice-dollar',  color: '#7f8c8d' },
        ];

        // 각 타입의 현재 설정 매핑
        const typeMap = {};
        (typeData || []).forEach(t => { typeMap[t.apply_type_key] = t; });

        // 탭 버튼 렌더링
        const tabBtns = APPLY_TYPES.map((t, i) => {
            // 열림 상태
            let isOpen = false;
            if (t.key === 'global') {
                isOpen = globalData?.is_open || false;
            } else {
                isOpen = typeMap[t.key]?.is_open || false;
            }
            const dot = isOpen
                ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#10b981;margin-left:4px;vertical-align:middle"></span>`
                : `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#d1d5db;margin-left:4px;vertical-align:middle"></span>`;
            return `<button id="aptab-${t.key}"
                onclick="applications._switchPeriodTab('${t.key}')"
                style="white-space:nowrap;padding:7px 12px;border:1.5px solid ${i===0?t.color:'#d1d5db'};border-radius:20px;
                       background:${i===0?t.color:'#fff'};color:${i===0?'#fff':'#6b7280'};
                       font-size:.78rem;font-weight:600;cursor:pointer;transition:.15s;flex-shrink:0">
                <i class="fas ${t.icon}" style="font-size:.72rem"></i> ${t.label}${dot}
            </button>`;
        }).join('');

        // 각 탭 패널 렌더링
        const tabPanels = APPLY_TYPES.map((t, i) => {
            if (t.key === 'global') {
                // 전체 기본 기간 패널 (기존 UI)
                const cur = globalData;
                const curMode = !cur?.apply_period_enabled ? 'auto'
                              : (cur.apply_start || cur.apply_end) ? 'custom' : 'always';
                return `<div id="appanel-global" style="display:${i===0?'block':'none'}">
                    <div style="font-size:.82rem;color:#6b7280;margin-bottom:12px;padding:8px 12px;background:#f5f3ff;border-radius:8px">
                        <i class="fas fa-info-circle" style="color:#8e44ad"></i>
                        각 신청 종류의 기간 모드가 <strong>"단지 기본기간 따름"</strong>으로 설정된 경우 이 기간이 적용됩니다.
                    </div>
                    ${this._renderPeriodModeCards('global', curMode, toKst(cur?.apply_start), toKst(cur?.apply_end), '#8e44ad')}
                </div>`;
            } else {
                const s = typeMap[t.key] || {};
                const pm = s.period_mode || 'auto';
                return `<div id="appanel-${t.key}" style="display:none">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                        <span style="font-size:.82rem;color:#6b7280">
                            이 신청 종류만 별도 기간을 지정하거나, 단지 기본기간을 따를 수 있습니다.
                        </span>
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex-shrink:0;margin-left:10px">
                            <span style="font-size:.78rem;color:#6b7280">${s.is_enabled!==false?'ON':'OFF'}</span>
                            <div style="position:relative;width:38px;height:21px" onclick="applications._togglePeriodTypeEnabled('${t.key}')">
                                <div id="pet-track-${t.key}" style="width:38px;height:21px;border-radius:11px;background:${s.is_enabled!==false?'#10b981':'#d1d5db'};transition:.2s"></div>
                                <div id="pet-thumb-${t.key}" style="position:absolute;top:2px;left:${s.is_enabled!==false?'19px':'2px'};width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:.2s"></div>
                            </div>
                        </label>
                    </div>
                    ${this._renderPeriodModeCards(t.key, pm, toKst(s.period_start), toKst(s.period_end), t.color)}
                </div>`;
            }
        }).join('');

        const body = `
        <div style="margin-bottom:14px;overflow-x:auto;padding-bottom:4px">
            <div style="display:flex;gap:6px;min-width:max-content">
                ${tabBtns}
            </div>
        </div>
        <div id="applyPeriodPanels" style="min-height:200px">
            ${tabPanels}
        </div>
        <p style="font-size:.78rem;color:#9ca3af;margin-top:10px">
            <i class="fas fa-info-circle"></i> 저장 후 입주민 페이지에 즉시 반영됩니다.
        </p>`;

        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-ghost" style="color:#e53935;border-color:#e53935"
                    onclick="applications._resetApplyPeriod('${complexId}')">
                <i class="fas fa-undo"></i> 전체 기본값 복귀
            </button>
            <button class="btn-primary" style="background:#8e44ad"
                    onclick="applications._saveApplyPeriodAll('${complexId}')">
                <i class="fas fa-save"></i> 저장
            </button>`;

        openGlobalModal('<i class="fas fa-clock"></i> 신청기간 설정', body, footer);

        // 초기 탭 활성화
        this._switchPeriodTab('global');
        // 초기 모드 카드 스타일 적용
        APPLY_TYPES.forEach(t => {
            const initMode = t.key === 'global'
                ? (!globalData?.apply_period_enabled ? 'auto' : (globalData.apply_start||globalData.apply_end) ? 'custom' : 'always')
                : (typeMap[t.key]?.period_mode || 'auto');
            this._onPeriodModeChange(t.key, initMode);
        });

        // APPLY_TYPES를 모달 컨텍스트에 저장 (저장 시 참조)
        this._applyPeriodTypes = APPLY_TYPES;
    },

    // 기간 모드 라디오 카드 렌더링 (재사용)
    _renderPeriodModeCards(key, currentMode, startVal, endVal, accentColor) {
        const modes = [
            { value: 'auto',   label: '단지 기본기간 따름',  desc: '전체 기본 기간 탭 설정 적용',           show: key !== 'global' },
            { value: 'auto',   label: '자동 (기본값)',        desc: '매월 22일 09:00 ~ 26일 09:00 KST',      show: key === 'global' },
            { value: 'always', label: '상시 개방',            desc: '기간 제한 없이 항상 신청 가능',          show: true },
            { value: 'closed', label: '항상 닫힘',            desc: '이 신청 종류는 현재 접수 중단',          show: key !== 'global' },
            { value: 'custom', label: '직접 설정',            desc: '시작일~종료일을 직접 지정',              show: true },
        ].filter(m => m.show);

        const cards = modes.map(m => `
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:9px 12px;
                          border:2px solid ${currentMode===m.value?accentColor:'#e5e7eb'};border-radius:8px;
                          background:${currentMode===m.value?'rgba(0,0,0,.03)':'#fff'};transition:.15s"
                   id="pmc-${key}-${m.value}">
                <input type="radio" name="pm-${key}" value="${m.value}"
                       ${currentMode===m.value?'checked':''}
                       onchange="applications._onPeriodModeChange('${key}','${m.value}')"
                       style="margin:0;accent-color:${accentColor}">
                <span>
                    <strong style="font-size:.87rem">${m.label}</strong><br>
                    <small style="color:#9ca3af">${m.desc}</small>
                </span>
            </label>`).join('');

        const isCustom = currentMode === 'custom';
        return `
        <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px">
            ${cards}
        </div>
        <div id="pmcustom-${key}" style="display:${isCustom?'block':'none'};
             background:#f9fafb;border-radius:8px;padding:12px;border:1px solid #e5e7eb">
            ${this._renderDayTimeRow('pmstart', key, accentColor, '시작', startVal)}
            ${this._renderDayTimeRow('pmend',   key, '#e74c3c',    '종료', endVal)}
        </div>`;
    },

    // 일+시+분 select 행 렌더링
    _renderDayTimeRow(prefix, key, color, label, kstObj) {
        const d  = kstObj?.day    || '';
        const h  = kstObj?.hour   || '';
        const m  = kstObj?.minute || '00';

        const dayOpts  = ['<option value="">일</option>',
            ...Array.from({length:31}, (_,i) => `<option value="${i+1}" ${String(i+1)===String(d)?'selected':''}>${i+1}일</option>`)].join('');
        const hourOpts = ['<option value="">시</option>',
            ...Array.from({length:24}, (_,i) => `<option value="${i}" ${String(i)===String(h)?'selected':''}>${String(i).padStart(2,'0')}시</option>`)].join('');
        const minOpts  = ['00','10','20','30','40','50'].map(v =>
            `<option value="${v}" ${v===m?'selected':''}>${v}분</option>`).join('');

        const selStyle = 'padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:.85rem;background:#fff;cursor:pointer';
        return `
        <div style="margin-bottom:8px">
            <label style="font-size:.78rem;font-weight:600;color:#374151;display:block;margin-bottom:5px">
                <i class="fas fa-calendar-${label==='시작'?'check':'times'}" style="color:${color}"></i>
                ${label} 일시 (KST)
            </label>
            <div style="display:flex;gap:6px;align-items:center">
                <select id="${prefix}-${key}-day"  style="${selStyle};flex:1">${dayOpts}</select>
                <select id="${prefix}-${key}-hour" style="${selStyle};flex:1">${hourOpts}</select>
                <select id="${prefix}-${key}-min"  style="${selStyle};flex:1">${minOpts}</select>
            </div>
        </div>`;
    },

    // 탭 전환
    _switchPeriodTab(key) {
        const COLORS = {
            global:'#8e44ad', new:'#2980b9', waiting:'#16a085',
            cancel:'#c0392b', mid_cancel:'#e67e22', refund:'#7f8c8d'
        };
        const TYPES = ['global','new','waiting','cancel','mid_cancel','refund'];
        TYPES.forEach(k => {
            const btn = document.getElementById(`aptab-${k}`);
            const panel = document.getElementById(`appanel-${k}`);
            const isActive = k === key;
            if (btn) {
                btn.style.background  = isActive ? (COLORS[k]||'#8e44ad') : '#fff';
                btn.style.color       = isActive ? '#fff' : '#6b7280';
                btn.style.borderColor = isActive ? (COLORS[k]||'#8e44ad') : '#d1d5db';
            }
            if (panel) panel.style.display = isActive ? 'block' : 'none';
        });
    },

    // 기간 모드 변경 시 카드 스타일 + custom 입력 표시
    _onPeriodModeChange(key, mode) {
        const COLORS = {
            global:'#8e44ad', new:'#2980b9', waiting:'#16a085',
            cancel:'#c0392b', mid_cancel:'#e67e22', refund:'#7f8c8d'
        };
        const accent = COLORS[key] || '#8e44ad';
        ['auto','always','closed','custom'].forEach(m => {
            const lbl = document.getElementById(`pmc-${key}-${m}`);
            if (!lbl) return;
            const sel = m === mode;
            lbl.style.borderColor = sel ? accent : '#e5e7eb';
            lbl.style.background  = sel ? 'rgba(0,0,0,.03)' : '#fff';
        });
        const customDiv = document.getElementById(`pmcustom-${key}`);
        if (customDiv) customDiv.style.display = mode === 'custom' ? 'block' : 'none';
    },

    // 신청 종류별 ON/OFF 토글
    _togglePeriodTypeEnabled(key) {
        const track = document.getElementById(`pet-track-${key}`);
        const thumb = document.getElementById(`pet-thumb-${key}`);
        if (!track) return;
        const cur = track.style.background === 'rgb(16, 185, 129)';
        const next = !cur;
        track.style.background = next ? '#10b981' : '#d1d5db';
        thumb.style.left = next ? '19px' : '2px';
        track.dataset.on = next ? '1' : '0';
        // ON/OFF 텍스트 업데이트
        const lbl = track.parentElement?.previousElementSibling;
        if (lbl) lbl.textContent = next ? 'ON' : 'OFF';
    },

    // 일+시+분 select → UTC ISO 변환
    _readDayTime(prefix, key) {
        const day  = document.getElementById(`${prefix}-${key}-day`)?.value;
        const hour = document.getElementById(`${prefix}-${key}-hour`)?.value;
        const min  = document.getElementById(`${prefix}-${key}-min`)?.value || '00';
        if (!day || hour === '' || hour === undefined) return null;
        // 현재 KST 연월 기준으로 조합
        // ※ "+09:00" offset을 명시해야 브라우저가 UTC로 직접 변환 (-9h 이중적용 방지)
        const nowKst = new Date(Date.now() + 9*60*60*1000);
        const year   = nowKst.getUTCFullYear();
        const month  = nowKst.getUTCMonth() + 1;
        const kstStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T`
                     + `${String(hour).padStart(2,'0')}:${min}:00+09:00`;
        return new Date(kstStr).toISOString();
    },

    // 전체 저장 (전역 기간 + 신청 종류별 기간)
    async _saveApplyPeriodAll(complexId) {
        // ── [1] 전역 기본 기간 저장 ──────────────────────────────
        const globalMode = document.querySelector('input[name="pm-global"]:checked')?.value;
        let apply_period_enabled = false, apply_start = null, apply_end = null;

        if (globalMode === 'always') {
            apply_period_enabled = true;
        } else if (globalMode === 'custom') {
            const sv = this._readDayTime('pmstart', 'global');
            const ev = this._readDayTime('pmend',   'global');
            if (!sv || !ev) { showToast('전체 기본 기간: 시작일·시간을 모두 선택하세요', 'error'); return; }
            apply_start = sv; apply_end = ev;
            if (new Date(apply_start) >= new Date(apply_end)) {
                showToast('전체 기본 기간: 종료 일시가 시작 일시보다 이후여야 합니다', 'error'); return;
            }
            apply_period_enabled = true;
        }

        try {
            const r1 = await fetch(`/api/complexes/${complexId}/apply-period`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apply_period_enabled, apply_start, apply_end })
            });
            const j1 = await r1.json();
            if (!j1.success) throw new Error(j1.error || '전역 기간 저장 실패');
        } catch(e) { showToast('저장 실패: ' + e.message, 'error'); return; }

        // ── [2] 신청 종류별 기간 저장 ───────────────────────────
        const TYPE_KEYS = ['new', 'waiting', 'cancel', 'mid_cancel', 'refund'];
        const settings = TYPE_KEYS.map(key => {
            const modeRadio  = document.querySelector(`input[name="pm-${key}"]:checked`);
            const periodMode = modeRadio?.value || 'auto';
            const track      = document.getElementById(`pet-track-${key}`);
            const isEnabled  = track ? (track.dataset.on === '1' || track.style.background === 'rgb(16, 185, 129)') : true;
            const sv = periodMode === 'custom' ? this._readDayTime('pmstart', key) : null;
            const ev = periodMode === 'custom' ? this._readDayTime('pmend',   key) : null;
            return {
                apply_type_key: key,
                is_enabled:     isEnabled,
                period_mode:    periodMode,
                period_start:   sv,
                period_end:     ev,
            };
        });

        try {
            const r2 = await fetch(`/api/complexes/${complexId}/apply-settings`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings })
            });
            const j2 = await r2.json();
            if (!j2.success) throw new Error(j2.error || '신청 종류 기간 저장 실패');
        } catch(e) { showToast('저장 실패: ' + e.message, 'error'); return; }

        closeGlobalModal();
        showToast('신청기간 설정이 저장되었습니다', 'success');
        this._refreshApplyPeriodBadge(complexId);
        this._refreshApplySettingsBadge(complexId);
    },

    _onApplyModeChange(value) {
        // 하위 호환 (구버전 참조 방어)
        this._onPeriodModeChange('global', value);
    },

    async _saveApplyPeriod(complexId) {
        // 하위 호환 — 전체 저장으로 위임
        await this._saveApplyPeriodAll(complexId);
    },

    async _resetApplyPeriod(complexId) {
        showConfirm('기본값 복귀', '모든 신청기간 설정을 기본값(매월 22~26일)으로 초기화하시겠습니까?', async () => {
            try {
                const res = await fetch(`/api/complexes/${complexId}/apply-period`, { method: 'DELETE' });
                const json = await res.json();
                if (!json.success) throw new Error(json.error);
                closeGlobalModal();
                showToast('기본값으로 초기화되었습니다');
                this._refreshApplyPeriodBadge(complexId);
            } catch(e) { showToast('초기화 실패: ' + e.message, 'error'); }
        });
    },

    // 상단 버튼 배지(열림/닫힘 표시) 갱신
    async _refreshApplyPeriodBadge(complexId) {
        try {
            const res  = await fetch(`/api/complexes/${complexId}/apply-period`);
            const json = await res.json();
            if (!json.success) return;
            const btn = document.getElementById('applyPeriodBtn');
            if (!btn) return;
            if (json.data.is_open) {
                btn.style.background = '#27ae60';
                btn.innerHTML = '<i class="fas fa-lock-open"></i> 신청기간 설정 <span style="font-size:.72rem;vertical-align:middle;background:rgba(255,255,255,.25);padding:1px 6px;border-radius:10px">열림</span>';
            } else {
                btn.style.background = '#8e44ad';
                btn.innerHTML = '<i class="fas fa-clock"></i> 신청기간 설정';
            }
        } catch(_) {}
    },

    // ════════════════════════════════════════════════════════════
    // 신청 종류 설정 모달
    // ════════════════════════════════════════════════════════════
    async showApplySettingsModal() {
        const complexId = getEffectiveComplexId();
        if (!complexId) { showToast('단지를 먼저 선택하세요', 'error'); return; }

        let current = null;
        try {
            const res = await fetch(`/api/complexes/${complexId}/apply-settings`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            current = json;
        } catch(e) { showToast('설정 조회 실패: ' + e.message, 'error'); return; }

        const toKstInput = (utcStr) => {
            if (!utcStr) return '';
            const d = new Date(new Date(utcStr).getTime() + 9 * 60 * 60 * 1000);
            return d.toISOString().slice(0, 16);
        };

        const PERIOD_MODE_LABEL = { auto: '단지 기본기간 따름', always: '상시 개방', closed: '항상 닫힘', custom: '직접 설정' };

        // 개별 신청 종류 행 렌더링
        const renderTypeRow = (s) => {
            const isCustom = s.period_mode === 'custom';
            const openBadge = s.is_open
                ? `<span style="font-size:.7rem;background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:8px;font-weight:600">열림</span>`
                : `<span style="font-size:.7rem;background:#fee2e2;color:#991b1b;padding:1px 6px;border-radius:8px;font-weight:600">닫힘</span>`;
            return `
            <div class="apply-type-row" id="atr-${s.apply_type_key}"
                 style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:10px;background:${s.is_enabled ? '#fff' : '#f9fafb'}">
                <!-- 헤더 행: 이름 + 열림상태 + ON/OFF 토글 -->
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${s.is_enabled ? '12px' : '0'}">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-weight:600;font-size:.92rem">${s.label}</span>
                        ${s.is_enabled ? openBadge : ''}
                    </div>
                    <!-- ON/OFF 토글 스위치 -->
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                        <span style="font-size:.8rem;color:#6b7280">${s.is_enabled ? 'ON' : 'OFF'}</span>
                        <div style="position:relative;width:44px;height:24px" onclick="applications._toggleApplyType('${s.apply_type_key}')">
                            <div style="width:44px;height:24px;border-radius:12px;background:${s.is_enabled ? '#10b981' : '#d1d5db'};transition:background .2s"></div>
                            <div style="position:absolute;top:2px;left:${s.is_enabled ? '22px' : '2px'};width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .2s"></div>
                        </div>
                    </label>
                </div>
                <!-- 기간 설정 (is_enabled=true일 때만 표시) -->
                <div id="atr-detail-${s.apply_type_key}" style="${s.is_enabled ? '' : 'display:none'}">
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                        ${['auto','always','closed','custom'].map(m => `
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:.82rem;
                                      padding:4px 10px;border-radius:16px;border:1px solid ${s.period_mode===m ? '#e67e22' : '#d1d5db'};
                                      background:${s.period_mode===m ? '#fff3e0' : '#f9fafb'};color:${s.period_mode===m ? '#c05c0a' : '#6b7280'};font-weight:${s.period_mode===m ? '600' : '400'};">
                            <input type="radio" name="pm-${s.apply_type_key}" value="${m}" ${s.period_mode===m?'checked':''}
                                   onchange="applications._onApplyTypeModeChange('${s.apply_type_key}','${m}')"
                                   style="margin:0;accent-color:#e67e22">
                            ${PERIOD_MODE_LABEL[m]}
                        </label>`).join('')}
                    </div>
                    <!-- 직접 설정: 날짜 입력 -->
                    <div id="atr-custom-${s.apply_type_key}" style="${isCustom ? '' : 'display:none'};display:${isCustom?'flex':'none'};gap:8px;align-items:center;flex-wrap:wrap">
                        <div style="flex:1;min-width:160px">
                            <label style="font-size:.78rem;color:#6b7280;display:block;margin-bottom:2px">시작</label>
                            <input type="datetime-local" id="atr-start-${s.apply_type_key}"
                                   value="${toKstInput(s.period_start)}"
                                   style="width:100%;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:.82rem">
                        </div>
                        <div style="flex:1;min-width:160px">
                            <label style="font-size:.78rem;color:#6b7280;display:block;margin-bottom:2px">종료</label>
                            <input type="datetime-local" id="atr-end-${s.apply_type_key}"
                                   value="${toKstInput(s.period_end)}"
                                   style="width:100%;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:.82rem">
                        </div>
                    </div>
                </div>
            </div>`;
        };

        // 단지 전체 설정 (대기 시스템, 자동승인)
        const cx = current.complex || {};
        const globalSection = `
        <div style="border:1px solid #dbeafe;border-radius:10px;padding:14px 16px;background:#eff6ff;margin-bottom:16px">
            <div style="font-weight:700;font-size:.9rem;color:#1d4ed8;margin-bottom:12px">
                <i class="fas fa-cog"></i> 단지 전체 설정
            </div>
            <!-- 일괄 ON/OFF -->
            <div style="display:flex;gap:8px;margin-bottom:14px">
                <button onclick="applications._bulkToggleApplyTypes(true)"
                        style="flex:1;padding:6px;background:#10b981;color:#fff;border:none;border-radius:7px;font-size:.82rem;cursor:pointer;font-weight:600">
                    <i class="fas fa-check-circle"></i> 전체 ON
                </button>
                <button onclick="applications._bulkToggleApplyTypes(false)"
                        style="flex:1;padding:6px;background:#ef4444;color:#fff;border:none;border-radius:7px;font-size:.82rem;cursor:pointer;font-weight:600">
                    <i class="fas fa-times-circle"></i> 전체 OFF
                </button>
            </div>
            <!-- 대기 시스템 -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                <div>
                    <span style="font-weight:600;font-size:.88rem">대기 시스템</span>
                    <div style="font-size:.78rem;color:#6b7280">정원 마감 시 대기 접수 허용 + 자동 SMS 플로우</div>
                </div>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                    <span id="waitingEnabledLbl" style="font-size:.8rem;color:#6b7280">${cx.waiting_enabled ? 'ON' : 'OFF'}</span>
                    <div style="position:relative;width:44px;height:24px" onclick="applications._toggleWaitingEnabled()">
                        <div id="waitingEnabledTrack" style="width:44px;height:24px;border-radius:12px;background:${cx.waiting_enabled ? '#10b981' : '#d1d5db'};transition:background .2s"></div>
                        <div id="waitingEnabledThumb" style="position:absolute;top:2px;left:${cx.waiting_enabled ? '22px' : '2px'};width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .2s"></div>
                    </div>
                </label>
            </div>
            <!-- 대기 응답 제한시간 -->
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <span style="font-size:.88rem;font-weight:600;white-space:nowrap">대기 응답 제한</span>
                <select id="waitingTimeoutSel" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:.85rem">
                    ${[1,2,3,6,12,24].map(h => `<option value="${h}" ${cx.waiting_timeout_hours==h?'selected':''}>${h}시간</option>`).join('')}
                </select>
                <span style="font-size:.8rem;color:#6b7280">이내 미응답 시 다음 순번으로 이동</span>
            </div>
            <!-- 자동 승인 -->
            <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                    <span style="font-weight:600;font-size:.88rem">신규 신청 자동 승인</span>
                    <div style="font-size:.78rem;color:#6b7280">OFF 시 관리자 수동 승인 필요 (received 상태로 접수)</div>
                </div>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                    <span id="autoApproveLbl" style="font-size:.8rem;color:#6b7280">${cx.auto_approve !== false ? 'ON' : 'OFF'}</span>
                    <div style="position:relative;width:44px;height:24px" onclick="applications._toggleAutoApprove()">
                        <div id="autoApproveTrack" style="width:44px;height:24px;border-radius:12px;background:${cx.auto_approve !== false ? '#10b981' : '#d1d5db'};transition:background .2s"></div>
                        <div id="autoApproveThumb" style="position:absolute;top:2px;left:${cx.auto_approve !== false ? '22px' : '2px'};width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .2s"></div>
                    </div>
                </label>
            </div>
        </div>`;

        const body = `
        <div id="applySettingsForm" style="max-height:65vh;overflow-y:auto;padding-right:4px">
            ${globalSection}
            <div style="font-weight:700;font-size:.9rem;color:#374151;margin-bottom:10px">
                <i class="fas fa-list-ul"></i> 신청 종류별 설정
            </div>
            ${(current.data || []).map(renderTypeRow).join('')}
        </div>`;

        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="applications._saveApplySettings('${complexId}')">
                <i class="fas fa-save"></i> 저장
            </button>`;

        openGlobalModal('<i class="fas fa-sliders-h"></i> 신청 종류 설정', body, footer);
    },

    // 개별 신청 종류 ON/OFF 토글 (DOM 즉시 업데이트)
    _toggleApplyType(key) {
        const row  = document.getElementById(`atr-${key}`);
        const detail = document.getElementById(`atr-detail-${key}`);
        const track  = row?.querySelector('.at-track-' + key);
        if (!row) return;

        // 현재 상태 파악: 토글 thumb 위치로 판단
        const thumb = row.querySelector('[id]');
        // data attribute로 상태 추적
        const cur = row.dataset.enabled !== 'false';
        const next = !cur;
        row.dataset.enabled = next ? 'true' : 'false';
        row.style.background = next ? '#fff' : '#f9fafb';

        // thumb/track 갱신 — 직접 querySelector로 찾기
        const allDivs = row.querySelectorAll('div[style*="border-radius:12px"]');
        const allThumbs = row.querySelectorAll('div[style*="border-radius:50%"]');
        const toggleTrack = allDivs[0];
        const toggleThumb = allThumbs[0];
        if (toggleTrack) toggleTrack.style.background = next ? '#10b981' : '#d1d5db';
        if (toggleThumb) toggleThumb.style.left = next ? '22px' : '2px';

        // ON/OFF 텍스트
        const lbl = row.querySelector('span[style*="font-size:.8rem"]');
        if (lbl) lbl.textContent = next ? 'ON' : 'OFF';

        // detail 표시/숨김
        if (detail) detail.style.display = next ? '' : 'none';

        // 헤더 행 margin-bottom
        const header = row.querySelector('div[style*="margin-bottom"]');
        if (header) header.style.marginBottom = next ? '12px' : '0';
    },

    // 기간 모드 변경 (custom 입력 표시/숨김)
    _onApplyTypeModeChange(key, mode) {
        const customDiv = document.getElementById(`atr-custom-${key}`);
        if (customDiv) customDiv.style.display = mode === 'custom' ? 'flex' : 'none';
        // 라디오 버튼 스타일 갱신
        const row = document.getElementById(`atr-${key}`);
        if (!row) return;
        row.querySelectorAll(`input[name="pm-${key}"]`).forEach(radio => {
            const lbl = radio.parentElement;
            const sel = radio.value === mode;
            lbl.style.borderColor = sel ? '#e67e22' : '#d1d5db';
            lbl.style.background  = sel ? '#fff3e0' : '#f9fafb';
            lbl.style.color       = sel ? '#c05c0a' : '#6b7280';
            lbl.style.fontWeight  = sel ? '600' : '400';
        });
    },

    // 일괄 ON/OFF
    _bulkToggleApplyTypes(enable) {
        const keys = ['new', 'waiting', 'cancel', 'mid_cancel', 'refund'];
        keys.forEach(key => {
            const row = document.getElementById(`atr-${key}`);
            if (!row) return;
            const cur = row.dataset.enabled !== 'false';
            if (cur !== enable) this._toggleApplyType(key);
        });
    },

    // 대기 시스템 토글
    _toggleWaitingEnabled() {
        const track = document.getElementById('waitingEnabledTrack');
        const thumb = document.getElementById('waitingEnabledThumb');
        const lbl   = document.getElementById('waitingEnabledLbl');
        if (!track) return;
        const cur  = track.style.background === 'rgb(16, 185, 129)';
        const next = !cur;
        track.style.background = next ? '#10b981' : '#d1d5db';
        thumb.style.left = next ? '22px' : '2px';
        lbl.textContent  = next ? 'ON' : 'OFF';
        track.dataset.on = next ? '1' : '0';
    },

    // 자동 승인 토글
    _toggleAutoApprove() {
        const track = document.getElementById('autoApproveTrack');
        const thumb = document.getElementById('autoApproveThumb');
        const lbl   = document.getElementById('autoApproveLbl');
        if (!track) return;
        const cur  = track.style.background === 'rgb(16, 185, 129)';
        const next = !cur;
        track.style.background = next ? '#10b981' : '#d1d5db';
        thumb.style.left = next ? '22px' : '2px';
        lbl.textContent  = next ? 'ON' : 'OFF';
        track.dataset.on = next ? '1' : '0';
    },

    // 저장
    async _saveApplySettings(complexId) {
        const keys = ['new', 'waiting', 'cancel', 'mid_cancel', 'refund'];

        // 각 신청 종류 설정 수집
        const settings = keys.map(key => {
            const row = document.getElementById(`atr-${key}`);
            const isEnabled   = !row || row.dataset.enabled !== 'false';
            const selectedRadio = row?.querySelector(`input[name="pm-${key}"]:checked`);
            const periodMode  = selectedRadio?.value || 'auto';
            const startEl     = document.getElementById(`atr-start-${key}`);
            const endEl       = document.getElementById(`atr-end-${key}`);
            // datetime-local 값(KST)을 UTC로 변환 — "+09:00" suffix 붙여 이중변환 방지
            const toUtc = (v) => {
                if (!v) return null;
                return new Date(v + ':00+09:00').toISOString();
            };
            return {
                apply_type_key: key,
                is_enabled:     isEnabled,
                period_mode:    periodMode,
                period_start:   periodMode === 'custom' && startEl?.value ? toUtc(startEl.value) : null,
                period_end:     periodMode === 'custom' && endEl?.value   ? toUtc(endEl.value)   : null,
            };
        });

        // 단지 전체 설정
        const waitingTrack = document.getElementById('waitingEnabledTrack');
        const autoTrack    = document.getElementById('autoApproveTrack');
        const timeoutSel   = document.getElementById('waitingTimeoutSel');
        const waiting_enabled       = waitingTrack ? (waitingTrack.dataset.on === '1' || waitingTrack.style.background === 'rgb(16, 185, 129)') : false;
        const auto_approve          = autoTrack    ? (autoTrack.dataset.on    === '1' || autoTrack.style.background    === 'rgb(16, 185, 129)') : true;
        const waiting_timeout_hours = timeoutSel   ? parseInt(timeoutSel.value) : 3;

        try {
            const res = await fetch(`/api/complexes/${complexId}/apply-settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings, waiting_enabled, auto_approve, waiting_timeout_hours }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            closeGlobalModal();
            showToast('신청 종류 설정이 저장되었습니다', 'success');
            this._refreshApplySettingsBadge(complexId);
        } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
    },

    // 신청 종류 설정 버튼 배지 갱신
    async _refreshApplySettingsBadge(complexId) {
        try {
            const res  = await fetch(`/api/complexes/${complexId}/apply-settings`);
            const json = await res.json();
            if (!json.success) return;
            const btn = document.getElementById('applySettingsBtn');
            if (!btn) return;
            const openCount = (json.data || []).filter(s => s.is_open && s.is_enabled).length;
            const total     = (json.data || []).length;
            const cx        = json.complex || {};
            const waitingOn = cx.waiting_enabled ? ' · 대기ON' : '';
            btn.innerHTML = `<i class="fas fa-sliders-h"></i> 신청 종류 설정 <span style="font-size:.7rem;background:rgba(255,255,255,.25);padding:1px 6px;border-radius:10px">${openCount}/${total} 열림${waitingOn}</span>`;
            btn.style.background = openCount > 0 ? '#27ae60' : '#e67e22';
        } catch(_) {}
    },
};