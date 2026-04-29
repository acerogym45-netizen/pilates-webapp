/** 신청 관리 페이지 - v3.10 시간표달력형PDF수정+선택값저장방식 */
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
                    <button class="btn-fee btn-sm" onclick="applications.showFeeCalc()" style="background:#f39c12;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.85rem">
                        <i class="fas fa-calculator"></i> 관리비 계산기
                    </button>
                    <button class="btn-sm" onclick="applications.showSettlement()" style="background:#8e44ad;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.85rem">
                        <i class="fas fa-won-sign"></i> 수강료 정산
                    </button>
                    <button class="btn-sm" onclick="applications.showAttendanceModal()" style="background:#1abc9c;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.85rem">
                        <i class="fas fa-clipboard-list"></i> 출석부
                    </button>
                    <button class="btn-sm" onclick="applications.showTimetableModal()" style="background:#3498db;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.85rem">
                        <i class="fas fa-calendar-alt"></i> 시간표
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

                        return `
                            <div style="border:1px solid #e8ecef;border-radius:8px;padding:12px;background:#fff">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                    <span style="font-weight:700;font-size:.88rem;color:#2c3e50">${prog.program_name}</span>
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

    // ══════════════════════════════════════════════════
    //  수강료 정산 모달 (탭: 정산현황 / 횟수입력)
    // ══════════════════════════════════════════════════
    _settlementData: [],
    _settlementTab: 'view',   // 'view' | 'edit'

    async showSettlement() {
        openGlobalModal('<i class="fas fa-won-sign"></i> 수강료 정산 현황',
            '<div class="loading-mini" style="padding:30px 0;text-align:center"><i class="fas fa-spinner fa-spin"></i> 불러오는 중...</div>',
            `<button class="btn-secondary" onclick="closeGlobalModal()">닫기</button>
             <button class="btn-primary" id="settlementActionBtn" onclick="applications._exportSettlementCSV()" style="background:#8e44ad">
                <i class="fas fa-download"></i> CSV 내보내기
             </button>`
        );
        this._settlementTab = 'view';
        await this._loadSettlementData();
    },

    async _loadSettlementData() {
        const modalBody = document.querySelector('#globalModal .modal-body');
        if (modalBody) modalBody.innerHTML = '<div class="loading-mini" style="padding:30px 0;text-align:center"><i class="fas fa-spinner fa-spin"></i> 불러오는 중...</div>';
        try {
            const params = {};
            const cid = getEffectiveComplexId();
            if (cid) params.complexId = cid;
            const res = await API.applications.feeSettlement(params);
            // 단지 미선택 경고
            if (res.warning) {
                const mb = document.querySelector('#globalModal .modal-body');
                if (mb) mb.innerHTML = `<div style="padding:30px;text-align:center;color:#e67e22">
                    <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:10px;display:block"></i>
                    <strong>${res.warning}</strong><br>
                    <span style="font-size:.85rem;color:#888;margin-top:6px;display:block">단지 코드로 로그인하거나 마스터에서 단지를 선택해주세요.</span>
                </div>`;
                return;
            }
            this._settlementData = res.data || [];
            this._renderSettlement(res.summary || {});
        } catch (e) {
            const mb = document.querySelector('#globalModal .modal-body');
            if (mb) mb.innerHTML = `<p style="color:#e74c3c">데이터 로드 실패: ${e.message}</p>`;
        }
    },

    _renderSettlement(sum) {
        const modalBody = document.querySelector('#globalModal .modal-body');
        if (!modalBody) return;
        const list = this._settlementData;
        const tab  = this._settlementTab;

        // ── 탭 전환 버튼 업데이트 ──
        const actionBtn = document.getElementById('settlementActionBtn');
        if (actionBtn) {
            if (tab === 'edit') {
                actionBtn.innerHTML = '<i class="fas fa-save"></i> 저장';
                actionBtn.onclick = () => applications._saveSessionInputs();
                actionBtn.style.background = '#27ae60';
            } else {
                actionBtn.innerHTML = '<i class="fas fa-download"></i> CSV 내보내기';
                actionBtn.onclick = () => applications._exportSettlementCSV();
                actionBtn.style.background = '#8e44ad';
            }
        }

        // ── 요약 카드 ──
        const summaryHtml = `
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
                <div style="background:#e8f4fd;border-radius:8px;padding:10px;text-align:center">
                    <div style="font-size:1.4rem;font-weight:700;color:#2980b9">${sum.total_approved||0}</div>
                    <div style="font-size:.78rem;color:#666">전체 수강생</div>
                </div>
                <div style="background:#e8f8f0;border-radius:8px;padding:10px;text-align:center">
                    <div style="font-size:1.4rem;font-weight:700;color:#27ae60">${sum.has_fee||0}</div>
                    <div style="font-size:.78rem;color:#666">수강료 확인</div>
                </div>
                <div style="background:#fdf3f3;border-radius:8px;padding:10px;text-align:center">
                    <div style="font-size:1.4rem;font-weight:700;color:#e74c3c">${sum.no_fee||0}</div>
                    <div style="font-size:.78rem;color:#666">수강료 미설정</div>
                </div>
                <div style="background:#f5eeff;border-radius:8px;padding:10px;text-align:center">
                    <div style="font-size:1.1rem;font-weight:700;color:#8e44ad">₩${(sum.total_billing||0).toLocaleString()}</div>
                    <div style="font-size:.78rem;color:#666">부과금액 합계</div>
                </div>
            </div>`;

        // ── 탭 헤더 ──
        const tabHtml = `
            <div style="display:flex;border-bottom:2px solid #e8ecef;margin-bottom:12px">
                <button onclick="applications._switchSettlementTab('view')"
                    style="padding:8px 18px;border:none;background:none;cursor:pointer;font-size:.88rem;font-weight:600;
                           border-bottom:${tab==='view'?'2px solid #8e44ad':'2px solid transparent'};
                           color:${tab==='view'?'#8e44ad':'#888'};margin-bottom:-2px">
                    <i class="fas fa-list"></i> 정산 현황
                </button>
                <button onclick="applications._switchSettlementTab('edit')"
                    style="padding:8px 18px;border:none;background:none;cursor:pointer;font-size:.88rem;font-weight:600;
                           border-bottom:${tab==='edit'?'2px solid #27ae60':'2px solid transparent'};
                           color:${tab==='edit'?'#27ae60':'#888'};margin-bottom:-2px">
                    <i class="fas fa-pencil-alt"></i> 횟수 입력
                </button>
            </div>`;

        // ── 프로그램별 그룹 ──
        const byProg = {};
        list.forEach(a => {
            const k = a.program_name || '(미분류)';
            if (!byProg[k]) byProg[k] = [];
            byProg[k].push(a);
        });

        let tableHtml = '';

        if (tab === 'view') {
            // ── 정산 현황 탭 ──
            const infoHtml = `
                <div style="background:#e8f4fd;border:1px solid #b3d7f5;border-radius:6px;padding:7px 12px;margin-bottom:10px;font-size:.8rem;color:#1a5276">
                    <i class="fas fa-info-circle"></i>
                    <span style="color:#2980b9;font-weight:600">(기본)</span> 표시: 프로그램 기본 수강료 자동 적용 | 개인 수정값 우선 적용됩니다.
                </div>
                ${(sum.no_fee||0) > 0 ? `
                <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:7px 12px;margin-bottom:10px;font-size:.8rem;color:#7d5000">
                    <i class="fas fa-exclamation-triangle"></i>
                    수강료 미설정 <strong>${sum.no_fee}명</strong> — 프로그램 관리에서 기본 수강료 입력하거나 신청 수정에서 직접 입력하세요.
                </div>` : ''}`;

            const rows = Object.entries(byProg).map(([prog, members]) => {
                const progBilling = members.reduce((s, a) => s + (a.billing_amount || 0), 0);
                const memberRows = members.map(a => {
                    const feeColor = a.fee_source === 'manual' ? '#2c3e50' : a.fee_source === 'program' ? '#2980b9' : '#e74c3c';
                    const feeLabel = a.effective_fee
                        ? `<span style="color:${feeColor}">₩${parseInt(a.effective_fee).toLocaleString()}${a.fee_source==='program'?'<sup style="font-size:.7rem;color:#7f8c8d">(기본)</sup>':''}</span>`
                        : `<span style="color:#e74c3c;font-weight:600">미설정</span>`;
                    const sessLabel = a.total_sessions != null
                        ? `${a.total_sessions}회 / <span style="color:#e67e22;font-weight:600">${a.attended_sessions != null ? a.attended_sessions+'회' : '-'}</span>`
                        : '<span style="color:#f39c12">미입력</span>';
                    const billLabel = a.billing_amount != null
                        ? `<strong style="color:#8e44ad">₩${parseInt(a.billing_amount).toLocaleString()}</strong>`
                        : '<span style="color:#aaa">-</span>';
                    return `<tr style="font-size:.82rem;border-bottom:1px solid #f0f0f0">
                        <td style="padding:5px 8px;white-space:nowrap">${a.dong} ${a.ho}</td>
                        <td style="padding:5px 8px;white-space:nowrap">${a.name}</td>
                        <td style="padding:5px 8px;color:#555;white-space:nowrap">${fmtPhone(a.phone||'')}</td>
                        <td style="padding:5px 8px;color:#666;font-size:.78rem">${a.program_name}${a.preferred_time?' '+a.preferred_time:''}</td>
                        <td style="padding:5px 8px;text-align:center;color:#555;font-size:.78rem">${sessLabel}</td>
                        <td style="padding:5px 8px;text-align:right">${feeLabel}</td>
                        <td style="padding:5px 8px;text-align:right">${billLabel}</td>
                    </tr>`;
                }).join('');
                return `<tr style="background:#f0f4ff">
                    <td colspan="4" style="padding:7px 8px;font-weight:700;font-size:.85rem;color:#3a3a8c">
                        <i class="fas fa-dumbbell" style="margin-right:5px"></i>${escHtml(prog)}
                        <span style="font-size:.78rem;color:#666;font-weight:400;margin-left:6px">${members.length}명</span>
                    </td>
                    <td style="padding:7px 8px;font-size:.75rem;color:#888;text-align:center">총횟수/수강횟수</td>
                    <td style="padding:7px 8px;font-size:.75rem;color:#888;text-align:right">수강료</td>
                    <td style="padding:7px 8px;text-align:right;font-weight:700;color:#8e44ad">${progBilling>0?'₩'+progBilling.toLocaleString():'-'}</td>
                </tr>${memberRows}`;
            }).join('');

            tableHtml = `${infoHtml}
                <div style="max-height:380px;overflow-y:auto;border:1px solid #e8ecef;border-radius:6px">
                    <table style="width:100%;border-collapse:collapse">
                        <thead style="position:sticky;top:0;background:#f8f9fa;z-index:1">
                            <tr style="font-size:.8rem;color:#555">
                                <th style="padding:7px 8px;text-align:left;font-weight:600">동/호수</th>
                                <th style="padding:7px 8px;text-align:left;font-weight:600">이름</th>
                                <th style="padding:7px 8px;text-align:left;font-weight:600">전화번호</th>
                                <th style="padding:7px 8px;text-align:left;font-weight:600">수강 프로그램</th>
                                <th style="padding:7px 8px;text-align:center;font-weight:600;white-space:nowrap">총횟수/수강횟수</th>
                                <th style="padding:7px 8px;text-align:right;font-weight:600">수강료</th>
                                <th style="padding:7px 8px;text-align:right;font-weight:600">부과금액</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;

        } else {
            // ── 횟수 입력 탭 ──
            const editGuide = `
                <div style="background:#e8f8f0;border:1px solid #a9dfbf;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:.8rem;color:#1e6e3b">
                    <i class="fas fa-pencil-alt"></i>
                    출석부 기준으로 <strong>총 횟수</strong>(이번 달 총 수업 수)와 <strong>수강 횟수</strong>(실제 출석 횟수)를 입력하세요.
                    <b>부과금액 = 수강 횟수 × 회당가(수강료 ÷ 총횟수)</b>로 자동 계산됩니다.
                    입력 후 <b>저장</b> 버튼을 누르면 일괄 반영됩니다. (빈 칸은 변경하지 않음)
                </div>`;

            const editRows = Object.entries(byProg).map(([prog, members]) => {
                const memberRows = members.map(a => {
                    const feeColor = a.fee_source === 'manual' ? '#2c3e50' : a.fee_source === 'program' ? '#2980b9' : '#e74c3c';
                    const feeDisp = a.effective_fee
                        ? `₩${parseInt(a.effective_fee).toLocaleString()}${a.fee_source==='program'?'<span style="font-size:.7rem;color:#7f8c8d">(기본)</span>':''}`
                        : '<span style="color:#e74c3c">미설정</span>';
                    return `<tr style="font-size:.82rem;border-bottom:1px solid #f0f0f0" data-id="${a.id}">
                        <td style="padding:5px 8px;white-space:nowrap">${a.dong} ${a.ho}</td>
                        <td style="padding:5px 8px;white-space:nowrap">${a.name}</td>
                        <td style="padding:5px 8px;white-space:nowrap;color:#555;font-size:.78rem">${fmtPhone(a.phone||'')}</td>
                        <td style="padding:5px 8px;color:#666;font-size:.78rem">${a.program_name}${a.preferred_time?' '+a.preferred_time:''}</td>
                        <td style="padding:5px 8px;text-align:right;color:${feeColor};font-size:.78rem">${feeDisp}</td>
                        <td style="padding:5px 6px;text-align:center">
                            <input type="number" min="0" max="31"
                                class="sess-total-input"
                                data-id="${a.id}"
                                value="${a.total_sessions != null ? a.total_sessions : ''}"
                                placeholder="총횟수"
                                oninput="applications._previewBilling('${a.id}')"
                                style="width:62px;padding:3px 5px;border:1px solid #ddd;border-radius:4px;font-size:.82rem;text-align:center">
                        </td>
                        <td style="padding:5px 6px;text-align:center">
                            <input type="number" min="0" max="31"
                                class="sess-attended-input"
                                data-id="${a.id}"
                                value="${a.attended_sessions != null ? a.attended_sessions : ''}"
                                placeholder="수강"
                                oninput="applications._previewBilling('${a.id}')"
                                style="width:62px;padding:3px 5px;border:1px solid #ddd;border-radius:4px;font-size:.82rem;text-align:center">
                        </td>
                        <td style="padding:5px 8px;text-align:right;font-size:.8rem" id="billing-preview-${a.id}">
                            ${a.billing_amount != null ? '<strong style="color:#8e44ad">₩'+parseInt(a.billing_amount).toLocaleString()+'</strong>' : '<span style="color:#aaa">-</span>'}
                        </td>
                    </tr>`;
                }).join('');
                return `<tr style="background:#f0f4ff">
                    <td colspan="4" style="padding:7px 8px;font-weight:700;font-size:.85rem;color:#3a3a8c">
                        <i class="fas fa-dumbbell" style="margin-right:5px"></i>${escHtml(prog)}
                        <span style="font-size:.78rem;color:#666;font-weight:400;margin-left:6px">${members.length}명</span>
                    </td>
                    <td style="padding:7px 8px;font-size:.75rem;color:#888;text-align:right">수강료</td>
                    <td style="padding:7px 8px;font-size:.75rem;color:#2980b9;text-align:center;font-weight:600">총 횟수</td>
                    <td style="padding:7px 8px;font-size:.75rem;color:#e67e22;text-align:center;font-weight:600">수강 횟수</td>
                    <td style="padding:7px 8px;font-size:.75rem;color:#8e44ad;text-align:right;font-weight:600">부과금액</td>
                </tr>${memberRows}`;
            }).join('');

            tableHtml = `${editGuide}
                <div style="max-height:380px;overflow-y:auto;border:1px solid #e8ecef;border-radius:6px">
                    <table style="width:100%;border-collapse:collapse">
                        <thead style="position:sticky;top:0;background:#f8f9fa;z-index:1">
                            <tr style="font-size:.8rem;color:#555">
                                <th style="padding:7px 8px;text-align:left;font-weight:600">동/호수</th>
                                <th style="padding:7px 8px;text-align:left;font-weight:600">이름</th>
                                <th style="padding:7px 8px;text-align:left;font-weight:600">전화번호</th>
                                <th style="padding:7px 8px;text-align:left;font-weight:600">수강 프로그램</th>
                                <th style="padding:7px 8px;text-align:right;font-weight:600">수강료</th>
                                <th style="padding:7px 8px;text-align:center;font-weight:600;color:#2980b9">총 횟수 ✏️</th>
                                <th style="padding:7px 8px;text-align:center;font-weight:600;color:#e67e22">수강 횟수 ✏️</th>
                                <th style="padding:7px 8px;text-align:right;font-weight:600;color:#8e44ad">부과금액</th>
                            </tr>
                        </thead>
                        <tbody>${editRows}</tbody>
                    </table>
                </div>`;
        }

        modalBody.innerHTML = summaryHtml + tabHtml + tableHtml;
    },

    _switchSettlementTab(tab) {
        this._settlementTab = tab;
        // 마지막 summary는 재조회 없이 기존 데이터 사용
        const list = this._settlementData;
        const totalBilling = list.reduce((s,a) => s+(a.billing_amount||0), 0);
        const sum = {
            total_approved: list.length,
            has_fee:  list.filter(a=>a.effective_fee).length,
            no_fee:   list.filter(a=>!a.effective_fee).length,
            total_billing: totalBilling
        };
        this._renderSettlement(sum);
    },

    // 입력 중 부과금액 미리보기 (수강횟수 × 회당가)
    _previewBilling(id) {
        const a = this._settlementData.find(x => x.id === id);
        if (!a) return;
        const totalEl    = document.querySelector(`.sess-total-input[data-id="${id}"]`);
        const attendedEl = document.querySelector(`.sess-attended-input[data-id="${id}"]`);
        const previewEl  = document.getElementById(`billing-preview-${id}`);
        if (!previewEl) return;

        const total    = parseInt(totalEl?.value);
        const attended = parseInt(attendedEl?.value);
        const fee      = a.effective_fee;

        if (fee && !isNaN(total) && total > 0 && !isNaN(attended)) {
            const perSession = Math.round(fee / total);          // 회당가 = 수강료 ÷ 총횟수
            const billing    = Math.max(0, attended) * perSession; // 부과금액 = 수강횟수 × 회당가
            previewEl.innerHTML = `<strong style="color:#8e44ad">₩${billing.toLocaleString()}</strong><div style="font-size:.72rem;color:#aaa">${attended}회×₩${perSession.toLocaleString()}</div>`;
        } else {
            previewEl.innerHTML = '<span style="color:#aaa">-</span>';
        }
    },

    // 일괄 저장 (수강 횟수 직접 입력 → remaining = total - attended 로 변환 저장)
    async _saveSessionInputs() {
        const rows = [];
        document.querySelectorAll('.sess-total-input').forEach(el => {
            const id          = el.getAttribute('data-id');
            const attendedEl  = document.querySelector(`.sess-attended-input[data-id="${id}"]`);
            const totalStr    = el.value.trim();
            const attendedStr = attendedEl ? attendedEl.value.trim() : '';
            if (totalStr !== '' || attendedStr !== '') {
                const total    = totalStr !== '' ? parseInt(totalStr) : null;
                const attended = attendedStr !== '' ? parseInt(attendedStr) : null;
                // DB에는 remaining_sessions = total - attended 로 저장
                const remaining = (total != null && attended != null)
                    ? Math.max(0, total - attended)
                    : null;
                rows.push({
                    id,
                    total_sessions:     total != null ? String(total) : '',
                    remaining_sessions: remaining != null ? String(remaining) : ''
                });
            }
        });

        if (!rows.length) { showToast('변경된 값이 없습니다', 'error'); return; }

        const btn = document.getElementById('settlementActionBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

        try {
            const res = await API.applications.bulkSessions({ rows });
            if (res.success) {
                showToast(`✅ ${res.updated}명 저장 완료`, 'success');
                await this._loadSettlementData();   // 새로고침
            } else {
                showToast(`저장 실패: ${res.errors?.[0]?.msg||'오류'}`, 'error');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
            }
        } catch (e) {
            showToast('저장 오류: ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
        }
    },

    _exportSettlementCSV() {
        if (!this._settlementData || !this._settlementData.length) {
            showToast('데이터가 없습니다', 'error'); return;
        }
        const headers = ['프로그램', '동', '호수', '이름', '전화번호', '시간대', '수강료', '총횟수', '수강횟수', '부과금액', '수강료출처'];
        const rows = this._settlementData.map(a => ({
            '프로그램':   a.program_name || '',
            '동':         a.dong || '',
            '호수':       a.ho || '',
            '이름':       a.name || '',
            '전화번호':   fmtPhone(a.phone || ''),
            '시간대':     a.preferred_time || '',
            '수강료':     a.effective_fee || '',
            '총횟수':     a.total_sessions || '',
            '수강횟수':   a.attended_sessions != null ? a.attended_sessions : '',
            '부과금액':   a.billing_amount != null ? a.billing_amount : '',
            '수강료출처': a.fee_source === 'manual' ? '직접입력' : a.fee_source === 'program' ? '프로그램기본값' : '미설정'
        }));
        downloadCSV(`수강료정산_${new Date().toLocaleDateString('ko')}.csv`, rows, headers);
        showToast('CSV 다운로드 완료', 'success');
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
                        <strong>${a.dong} ${a.ho} | ${a.name}</strong>${transferBadge}${sessionsBadge}
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
                ${(() => { const cm = applications._parseCancelMeta(a.notes); return cm ? `<div class="detail-row" style="background:#fff3f3;border-radius:6px;padding:6px 10px"><label style="color:#c0392b">취소일시</label><span style="color:#c0392b;font-weight:600">${formatDate(cm.cancelled_at)}</span></div><div class="detail-row"><label>취소 유형</label><span>${cm.cancel_reason || (cm.cancel_type === 'waiting' ? '대기 취소' : '승인 신청 취소')}</span></div>` : ''; })()}
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
        try {
            await API.applications.update(id, { status });
            closeGlobalModal();
            showToast(`상태가 "${statusLabel(status)}"으로 변경되었습니다`);
            await this.load();
            loadBadges();
        } catch (e) { showToast('변경 실패: ' + e.message, 'error'); }
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
        const isCancelled = a && a.status === 'cancelled';
        const confirmMsg = isCancelled
            ? '⚠️ 이미 해지된 신청입니다.\n\n수강 기록 보존을 위해 삭제 대신 해지(cancelled) 상태로 유지하는 것을 권장합니다.\n\n그래도 완전히 삭제하시겠습니까?'
            : '⚠️ 신청을 완전 삭제하면 수강 기록도 사라져 관리비 부과 근거가 없어집니다.\n\n취소 처리(해지)는 상태 변경 버튼을 이용하세요.\n\n그래도 완전히 삭제하시겠습니까?';
        showConfirm('삭제 확인', confirmMsg, async () => {
            try {
                await API.applications.delete(id);
                closeGlobalModal();
                showToast('삭제되었습니다');
                await this.load();
            } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
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
                '<th style="padding:6px;border:1px solid #d5f5e3;text-align:center;min-width:44px">서명</th></tr></thead>' +
                '<tbody>' + rows + '</tbody></table></div></div>';
        });
        container.innerHTML = html;
    },

    // ── PDF 다운로드 ───────────────────────────────────────────────────
    _downloadAttendancePDF() {
        const prog        = document.getElementById('attProgram')?.value || '';
        const time        = document.getElementById('attTime')?.value   || '';
        const apps        = applications._attApps || [];
        const complexName = applications._attComplexName || '';
        // 달력에서 수동 선택한 날짜 (기준)
        const manualDates = (applications._attCustomDates || []).slice().sort();
        // 월 정보: 달력 월 selector
        const calMonthEl  = document.getElementById('attCalMonth');
        const calMonthVal = calMonthEl ? calMonthEl.value : '';
        const [calYr, calMo] = calMonthVal ? calMonthVal.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth()+1];

        let filtered = apps;
        if (prog) filtered = filtered.filter(a => a.program_name === prog);
        if (time) filtered = filtered.filter(a => a.preferred_time === time);
        if (!filtered.length) { showToast('출력할 회원이 없습니다','error'); return; }

        const groups = {};
        filtered.forEach(a => {
            const key = (a.program_name||'') + '__' + (a.preferred_time||'');
            if (!groups[key]) groups[key] = { program: a.program_name||'프로그램 미지정', time: a.preferred_time||'시간 미지정', members: [] };
            groups[key].members.push(a);
        });

        const monthLabel = calYr + '년 ' + calMo + '월';

        // 그룹별 날짜 계산 함수
        // - 달력에서 수동 선택한 날짜가 있으면 해당 요일과 교집합으로 필터
        // - 없으면 프로그램명에서 요일 감지 후 해당월 날짜 자동 계산
        const getGroupDates = (programName) => {
            const dows = applications._parseProgramDows(programName);
            if (!dows.length) {
                // 요일 감지 불가: 수동 선택 날짜 그대로 사용, 없으면 빈 4컬럼
                return manualDates.length ? manualDates : null;
            }
            if (manualDates.length) {
                // 수동 선택 날짜 중 해당 요일만 필터
                const filtered2 = manualDates.filter(k => {
                    const [y,m,d] = k.split('-').map(Number);
                    return dows.includes(new Date(y,m-1,d).getDay());
                });
                return filtered2.length ? filtered2 : null;
            }
            // 수동 선택 없음: 해당 월에서 요일에 맞는 날짜 자동 계산
            const lastDate = new Date(calYr, calMo, 0).getDate();
            const dates = [];
            for (let d = 1; d <= lastDate; d++) {
                const date = new Date(calYr, calMo-1, d);
                if (dows.includes(date.getDay())) {
                    dates.push(calYr + '-' + String(calMo).padStart(2,'0') + '-' + String(d).padStart(2,'0'));
                }
            }
            return dates.length ? dates : null;
        };

        const sortM = arr => arr.sort((a, b) => {
            const da = String(a.dong||'').replace(/동$/,''), db = String(b.dong||'').replace(/동$/,'');
            if (da !== db) return da.localeCompare(db,'ko',{numeric:true});
            return String(a.ho||'').replace(/호$/,'').localeCompare(String(b.ho||'').replace(/호$/,''),'ko',{numeric:true});
        });

        let printContent = '';
        Object.values(groups).forEach((g, gi) => {
            sortM(g.members);
            // 그룹별 날짜 계산
            const groupRaw  = getGroupDates(g.program) || [];
            const dateCols  = groupRaw.length
                ? groupRaw.map(k => applications._dateLabel(k))
                : ['1회','2회','3회','4회'];
            // A4 landscape ~247mm 유효. 고정열: No(10)+동호(24)+이름(18)+연락처(18)+서명(16)=86mm → 나머지 161mm를 날짜열로
            // A4 landscape: 고정열 No(8)+동호(22)+이름(16)+연락처(16)=62mm → 나머지 185mm를 날짜열로 (서명 제거)
            const dateMm = Math.max(9, Math.floor(185 / dateCols.length));
            const thDates = dateCols.map(d =>
                '<th style="padding:3px 1px;text-align:center;border:1px solid #bbb;font-size:7pt;width:' + dateMm + 'mm;white-space:nowrap">' + d + '</th>'
            ).join('');
            const rows = g.members.map((m, i) =>
                '<tr style="' + (i%2?'background:#f0fdf8':'') + '">' +
                '<td style="padding:3px 2px;border:1px solid #ccc;text-align:center;font-size:7.5pt;color:#999">' + (i+1) + '</td>' +
                '<td style="padding:3px 4px;border:1px solid #ccc;text-align:center;font-size:8pt;white-space:nowrap">' + applications._fmtDongHo(m.dong,m.ho) + '</td>' +
                '<td style="padding:3px 4px;border:1px solid #ccc;text-align:center;font-size:9.5pt;font-weight:bold">' + (m.name||'') + '</td>' +
                '<td style="padding:3px 4px;border:1px solid #ccc;text-align:center;font-size:7.5pt;color:#555">' + applications._fmtPhoneLast4(m.phone) + '</td>' +
                dateCols.map(() => '<td style="border:1px solid #ccc;height:22px;width:' + dateMm + 'mm"></td>').join('') +
                '</tr>'
            ).join('');
            // 그룹 구분: 첫 번째는 여백 없음, 이후는 위쪽 구분선+여백
            printContent +=
                '<div style="' + (gi>0?'margin-top:8mm;border-top:2px solid #1abc9c;padding-top:4mm':'') + '">' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:3px;border-bottom:1.5px solid #1abc9c;padding-bottom:3px">' +
                '<div>' +
                '<span style="font-size:11pt;font-weight:bold;color:#1e8449">' + g.program + '</span>' +
                '<span style="font-size:9.5pt;color:#555;margin-left:8px">' + g.time + '</span>' +
                '<span style="font-size:8pt;color:#888;margin-left:6px">· ' + monthLabel + '</span></div>' +
                '<div style="font-size:8pt;color:#666;text-align:right">총 <strong>' + g.members.length + '</strong>명 | 인당 <strong>' + dateCols.length + '</strong>회</div></div>' +
                '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
                '<thead><tr style="background:#1abc9c;color:#fff">' +
                '<th style="padding:4px 2px;text-align:center;border:1px solid #bbb;width:8mm;font-size:7.5pt">No.</th>' +
                '<th style="padding:4px 3px;text-align:center;border:1px solid #bbb;width:22mm;font-size:8pt">동/호수</th>' +
                '<th style="padding:4px 3px;text-align:center;border:1px solid #bbb;width:16mm;font-size:8.5pt">이름</th>' +
                '<th style="padding:4px 3px;text-align:center;border:1px solid #bbb;width:16mm;font-size:7.5pt">연락처</th>' +
                thDates +
                '</tr></thead>' +
                '<tbody>' + rows + '</tbody></table></div>';
        });  // ← forEach 종료 (버그수정: win.open을 루프 밖으로)

        const win = window.open('','_blank','width=1150,height=780');
        if (!win) { showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.','error'); return; }
        // 출석부 제목 (단지명 + 출석부)
        const attTitle = complexName + ' 출석부';
        win.document.write('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
            '<title>' + attTitle + ' ' + monthLabel + '</title>' +
            '<style>*{box-sizing:border-box}' +
            'body{font-family:\'Malgun Gothic\',\'맑은 고딕\',Arial,sans-serif;margin:6mm 8mm;color:#111}' +
            '@media print{body{margin:0}@page{size:A4 landscape;margin:8mm 10mm}.no-print{display:none!important}}' +
            'table{border-collapse:collapse}</style></head><body>' +
            '<div class="no-print" style="text-align:right;margin-bottom:8px">' +
            '<button onclick="window.print()" style="padding:7px 18px;background:#1abc9c;color:#fff;border:none;border-radius:6px;font-size:10.5pt;cursor:pointer;margin-right:8px">🖨️ 인쇄 / PDF 저장</button>' +
            '<button onclick="window.close()" style="padding:7px 13px;background:#95a5a6;color:#fff;border:none;border-radius:6px;font-size:10.5pt;cursor:pointer">닫기</button></div>' +
            // 상단 공통 헤더 (인쇄 시 포함)
            '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:5px;border-bottom:2.5px solid #1abc9c;padding-bottom:3px">' +
            '<div style="font-size:14pt;font-weight:bold;color:#111">' + attTitle + '</div>' +
            '<div style="font-size:7.5pt;color:#888">출력일: ' + new Date().toLocaleDateString('ko-KR') + ' &nbsp;|&nbsp; ' + monthLabel + '</div></div>' +
            printContent + '</body></html>');
        win.document.close();
        win.focus();
    },

    // ══════════════════════════════════════════════════════════════════
    // 시간표 달력 PDF
    // ══════════════════════════════════════════════════════════════════
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

        // 프로그램+시간 조합 목록
        const combos = {};
        apps.forEach(a => {
            const k = (a.program_name||'') + '__' + (a.preferred_time||'');
            if (!combos[k]) combos[k] = { program: a.program_name||'미지정', time: a.preferred_time||'미지정', count: 0 };
            combos[k].count++;
        });

        applications._ttApps = apps;
        applications._ttComplexName = complexName;

        const comboRows = Object.values(combos).map(c =>
            '<tr style="border-bottom:1px solid #f0f0f0">' +
            '<td style="padding:6px 10px;font-size:.88rem">' + c.program + '</td>' +
            '<td style="padding:6px 10px;font-size:.88rem;color:#555">' + c.time + '</td>' +
            '<td style="padding:6px 10px;font-size:.88rem;text-align:center;color:#1abc9c;font-weight:600">' + c.count + '명</td></tr>'
        ).join('');

        // 스타일 선택값 초기화 (DOM 대신 변수에 저장)
        applications._ttStyle = applications._ttStyle || 'calendar';
        applications._ttMonth = defaultMonth;

        const body =
            '<div style="padding:4px 0 8px">' +
            '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">' +
            '<label style="font-size:.88rem;color:#555">출력 월:</label>' +
            '<input type="month" id="ttMonth" value="' + defaultMonth + '" onchange="applications._ttMonth=this.value" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:.88rem">' +
            '<label style="font-size:.88rem;color:#555;margin-left:10px">표시 스타일:</label>' +
            '<select id="ttStyle" onchange="applications._ttStyle=this.value" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:.88rem">' +
            '<option value="calendar"' + (applications._ttStyle==='calendar'?' selected':'') + '>달력형</option>' +
            '<option value="list"' + (applications._ttStyle==='list'?' selected':'') + '>목록형</option>' +
            '</select></div>' +
            '<div style="background:#f8f9fa;border-radius:8px;padding:10px 14px;margin-bottom:10px">' +
            '<div style="font-size:.82rem;color:#888;margin-bottom:6px">개설 강좌 목록 (승인 회원 기준)</div>' +
            '<table style="width:100%;border-collapse:collapse">' +
            '<thead><tr style="background:#eee"><th style="padding:5px 10px;text-align:left;font-size:.82rem">프로그램</th>' +
            '<th style="padding:5px 10px;text-align:left;font-size:.82rem">시간</th>' +
            '<th style="padding:5px 10px;text-align:center;font-size:.82rem">수강인원</th></tr></thead>' +
            '<tbody>' + comboRows + '</tbody></table></div></div>';

        const footer =
            '<button onclick="closeGlobalModal()" style="padding:8px 18px;background:#95a5a6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.9rem;margin-right:8px">닫기</button>' +
            '<button onclick="applications._downloadTimetablePDF()" style="padding:8px 20px;background:#3498db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.9rem"><i class="fas fa-calendar-alt"></i> 시간표 PDF 다운로드</button>';

        document.getElementById('globalModalBody').innerHTML = body;
        document.getElementById('globalModalFooter').innerHTML = footer;
    },

    _downloadTimetablePDF() {
        // DOM 대신 변수에서 읽음 (select value 재생성 버그 방지)
        const monthVal = applications._ttMonth || (new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0'));
        const printStyle = applications._ttStyle || 'calendar';
        const [yr, mo] = monthVal.split('-').map(Number);
        const complexName = applications._ttComplexName || '';
        const apps = applications._ttApps || [];

        // 강좌별 그룹화
        const groups = {};
        apps.forEach(a => {
            const k = (a.program_name||'') + '__' + (a.preferred_time||'');
            if (!groups[k]) groups[k] = { program: a.program_name||'미지정', time: a.preferred_time||'미지정', members: [] };
            groups[k].members.push(a);
        });

        const monthLabel = yr + '년 ' + mo + '월';
        const DOW_KR = ['일','월','화','수','목','금','토'];
        const DOW_COLOR = ['#e74c3c','#2c3e50','#2c3e50','#2c3e50','#2c3e50','#2c3e50','#2980b9'];
        const DOW_BG    = ['#fdecea','#f8f9fa','#f8f9fa','#f8f9fa','#f8f9fa','#f8f9fa','#eaf3fb'];

        // 달력 날짜 → 해당일의 강좌 목록 매핑
        const firstDay = new Date(yr, mo-1, 1).getDay();
        const lastDate = new Date(yr, mo, 0).getDate();

        // 날짜별 강좌 계산
        const dayClasses = {};  // key: day(1~31), value: [{program, time, count}]
        Object.values(groups).forEach(g => {
            const dows = applications._parseProgramDows(g.program);
            if (!dows.length) return;
            for (let d = 1; d <= lastDate; d++) {
                const dow = new Date(yr, mo-1, d).getDay();
                if (dows.includes(dow)) {
                    if (!dayClasses[d]) dayClasses[d] = [];
                    dayClasses[d].push({ program: g.program, time: g.time, count: g.members.length });
                }
            }
        });

        let content = '';

        if (printStyle === 'calendar') {
            // ── 달력형 ──────────────────────────────────────────
            const cellH = 90; // px (화면용, 인쇄는 mm)
            let calRows = '';
            let cellIdx = 0;
            let row = '<tr>';
            // 첫 주 빈 칸
            for (let i = 0; i < firstDay; i++) {
                row += '<td style="border:1px solid #e0e0e0;height:24mm;vertical-align:top;background:#fafafa"></td>';
                cellIdx++;
            }
            for (let d = 1; d <= lastDate; d++) {
                const dow = new Date(yr, mo-1, d).getDay();
                const isSun = dow === 0, isSat = dow === 6;
                const dayColor = isSun ? '#e74c3c' : (isSat ? '#2980b9' : '#2c3e50');
                const classes = dayClasses[d] || [];
                const classHtml = classes.map(c => {
                    const progDows = applications._parseProgramDows(c.program);
                    const dotColor = '#1abc9c';
                    return '<div style="margin:1px 2px;padding:2px 4px;background:#e8faf5;border-left:3px solid #1abc9c;border-radius:2px;font-size:7pt;line-height:1.3;overflow:hidden">' +
                        '<div style="font-weight:600;color:#0e6655;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + c.program + '</div>' +
                        '<div style="color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + c.time + ' · ' + c.count + '명</div></div>';
                }).join('');
                row += '<td style="border:1px solid #e0e0e0;height:24mm;vertical-align:top;padding:2px">' +
                    '<div style="font-size:9pt;font-weight:700;color:' + dayColor + ';padding:1px 3px 2px">' + d + '</div>' +
                    classHtml + '</td>';
                cellIdx++;
                if (cellIdx % 7 === 0) {
                    row += '</tr>';
                    calRows += row;
                    row = '<tr>';
                }
            }
            // 마지막 주 나머지 칸
            if (cellIdx % 7 !== 0) {
                while (cellIdx % 7 !== 0) {
                    row += '<td style="border:1px solid #e0e0e0;height:24mm;vertical-align:top;background:#fafafa"></td>';
                    cellIdx++;
                }
                row += '</tr>';
                calRows += row;
            }

            const dowHeaders = DOW_KR.map((d, i) =>
                '<th style="padding:6px 2px;text-align:center;font-size:9pt;color:' + DOW_COLOR[i] + ';background:' + DOW_BG[i] + ';border:1px solid #e0e0e0;width:14.28%">' + d + '</th>'
            ).join('');

            // 강좌 범례
            const legendItems = Object.values(groups).map(g =>
                '<span style="display:inline-flex;align-items:center;margin:2px 5px 2px 0;font-size:7.5pt">' +
                '<span style="display:inline-block;width:10px;height:10px;background:#1abc9c;border-radius:2px;margin-right:3px"></span>' +
                g.program + ' ' + g.time + ' (' + g.members.length + '명)</span>'
            ).join('');

            content =
                '<div style="margin-bottom:8mm">' +
                // 헤더
                '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #3498db;padding-bottom:5px;margin-bottom:8px">' +
                '<div>' +
                '<div style="font-size:16pt;font-weight:bold;color:#1a252f">' + complexName + '</div>' +
                '<div style="font-size:11pt;color:#3498db;font-weight:600;margin-top:1px">' + monthLabel + ' 강좌 시간표</div>' +
                '</div>' +
                '<div style="text-align:right;font-size:7.5pt;color:#888">출력일: ' + new Date().toLocaleDateString('ko-KR') + '</div>' +
                '</div>' +
                // 달력
                '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
                '<thead><tr>' + dowHeaders + '</tr></thead>' +
                '<tbody>' + calRows + '</tbody></table>' +
                // 범례
                '<div style="margin-top:6px;padding:5px 8px;background:#f0faf8;border:1px solid #d1f0e8;border-radius:6px">' +
                '<span style="font-size:7.5pt;color:#888;margin-right:6px">강좌:</span>' + legendItems + '</div>' +
                '</div>';

        } else {
            // ── 목록형 ──────────────────────────────────────────
            // 요일별로 강좌를 정리
            const byDow = { 1:[], 2:[], 3:[], 4:[], 5:[], 6:[], 0:[] };
            Object.values(groups).forEach(g => {
                const dows = applications._parseProgramDows(g.program);
                dows.forEach(d => { byDow[d].push(g); });
                if (!dows.length) byDow[1].push(g); // 요일 불명 → 월요일
            });
            const dowOrder = [1,2,3,4,5,6,0];
            let listHtml = '';
            dowOrder.forEach(dow => {
                if (!byDow[dow].length) return;
                const dColor = DOW_COLOR[dow];
                listHtml += '<div style="margin-bottom:8px">' +
                    '<div style="background:' + (dow===0?'#e74c3c':(dow===6?'#2980b9':'#3498db')) + ';color:#fff;padding:5px 12px;border-radius:6px 6px 0 0;font-size:10pt;font-weight:700">' +
                    DOW_KR[dow] + '요일 강좌</div>' +
                    '<table style="width:100%;border-collapse:collapse">' +
                    '<thead><tr style="background:#f0f4f8">' +
                    '<th style="padding:5px 10px;text-align:left;border:1px solid #dde;font-size:8pt">프로그램</th>' +
                    '<th style="padding:5px 10px;text-align:left;border:1px solid #dde;font-size:8pt">시간</th>' +
                    '<th style="padding:5px 10px;text-align:center;border:1px solid #dde;font-size:8pt">수강 인원</th>' +
                    '</tr></thead><tbody>';
                byDow[dow].forEach((g, i) => {
                    listHtml +=
                        '<tr style="' + (i%2?'background:#fafafa':'') + '">' +
                        '<td style="padding:6px 10px;border:1px solid #dde;font-size:9pt">' + g.program + '</td>' +
                        '<td style="padding:6px 10px;border:1px solid #dde;font-size:9pt;color:#555">' + g.time + '</td>' +
                        '<td style="padding:6px 10px;border:1px solid #dde;font-size:9pt;text-align:center;color:#1abc9c;font-weight:600">' + g.members.length + '명</td></tr>';
                });
                listHtml += '</tbody></table></div>';
            });
            content =
                '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #3498db;padding-bottom:5px;margin-bottom:10px">' +
                '<div><div style="font-size:16pt;font-weight:bold;color:#1a252f">' + complexName + '</div>' +
                '<div style="font-size:11pt;color:#3498db;font-weight:600;margin-top:1px">' + monthLabel + ' 강좌 시간표</div></div>' +
                '<div style="text-align:right;font-size:7.5pt;color:#888">출력일: ' + new Date().toLocaleDateString('ko-KR') + '</div></div>' +
                listHtml;
        }

        const win = window.open('','_blank','width=820,height=1060');
        if (!win) { showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.','error'); return; }
        win.document.write('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
            '<title>' + complexName + ' 시간표 ' + monthLabel + '</title>' +
            '<style>*{box-sizing:border-box}' +
            'body{font-family:\'Malgun Gothic\',\'맑은 고딕\',Arial,sans-serif;margin:10mm 12mm;color:#111}' +
            '@media print{body{margin:0}@page{size:A4 portrait;margin:10mm 12mm}.no-print{display:none!important}}' +
            'table{border-collapse:collapse}' +
            'td,th{word-break:break-all}</style></head><body>' +
            '<div class="no-print" style="text-align:right;margin-bottom:10px">' +
            '<button onclick="window.print()" style="padding:8px 20px;background:#3498db;color:#fff;border:none;border-radius:6px;font-size:11pt;cursor:pointer;margin-right:8px">🖨️ 인쇄 / PDF 저장</button>' +
            '<button onclick="window.close()" style="padding:8px 14px;background:#95a5a6;color:#fff;border:none;border-radius:6px;font-size:11pt;cursor:pointer">닫기</button></div>' +
            content + '</body></html>');
        win.document.close();
        win.focus();
    },
};