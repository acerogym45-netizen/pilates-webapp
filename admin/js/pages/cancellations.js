/** 해지 관리 */
const cancellations = {
    data: [],
    currentTab: 'cancel',   // 'cancel' | 'refund'
    currentStatus: '',

    async render() {
        const now    = new Date();
        const kst    = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const day    = kst.getUTCDate();
        const mon    = kst.getUTCMonth() + 1;
        const isCancelPeriod = day >= 3 && day <= 10;
        const isEnrollPeriod = day >= 20 && day <= 27;
        const nextMon = mon === 12 ? 1 : mon + 1;

        // ── 기간 안내 배너 ──
        let periodBannerHtml = '';
        if (isCancelPeriod) {
            periodBannerHtml = `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:9px;
                        background:#fff7ed;border:2px solid #f97316;margin-bottom:12px;font-size:.83rem;color:#9a3412">
                <i class="fas fa-exclamation-triangle" style="font-size:1.1rem;color:#f97316"></i>
                <span><strong>🔔 현재 해지 신청 기간 (${mon}월 3일 ~ 10일)</strong><br>
                <small style="opacity:.85">접수된 해지 신청은 당월 정상 수강 후 ${nextMon}월부터 해지 적용</small></span>
            </div>`;
        } else if (isEnrollPeriod) {
            periodBannerHtml = `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:9px;
                        background:#eff6ff;border:2px solid #3b82f6;margin-bottom:12px;font-size:.83rem;color:#1e40af">
                <i class="fas fa-calendar-check" style="font-size:1.1rem"></i>
                <span><strong>📝 현재 신규 등록 접수 기간 (${mon}월 20일 ~ 27일)</strong></span>
            </div>`;
        } else {
            const next = (day > 10 && day < 20)
                ? `다음 해지 신청: <strong>${mon}월 말 ~ ${nextMon}월 3~10일</strong> / 다음 등록 접수: <strong>${mon}월 20~27일</strong>`
                : `다음 해지 신청: <strong>${nextMon}월 3~10일</strong> / 다음 등록 접수: <strong>${nextMon}월 20~27일</strong>`;
            periodBannerHtml = `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;
                        background:#f9fafb;border:1px solid #e5e7eb;margin-bottom:12px;font-size:.8rem;color:#6b7280">
                <i class="fas fa-calendar-alt"></i><span>${next}</span>
            </div>`;
        }

        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-times-circle"></i> 해지 관리</h2>
                <button class="btn-secondary btn-sm" onclick="cancellations.reload()"><i class="fas fa-sync"></i></button>
            </div>

            ${periodBannerHtml}

            <!-- 관리 가이드 박스 -->
            <div id="cancelGuideBox" style="background:#f0fdf4;border:1.5px solid #22c55e;border-radius:10px;
                 padding:12px 14px;margin-bottom:14px;font-size:.8rem;color:#166534;line-height:1.75">
                <div style="font-weight:700;margin-bottom:6px"><i class="fas fa-info-circle"></i> 해지 관리 운영 가이드</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px">
                    <div>📅 <strong>등록 접수:</strong> 매월 20~27일</div>
                    <div>🚫 <strong>해지 신청:</strong> 매월 3~10일</div>
                    <div>🔄 <strong>해지 적용:</strong> 당월 수강 후 익월부터</div>
                    <div>⚡ <strong>미신청 시:</strong> 자동 재등록 (차월 수강료 청구)</div>
                </div>
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid #bbf7d0">
                    💡 <strong>누락 방지 팁:</strong> 접수 기간(3~10일) 종료 후 <em>미처리 대기 건</em>을 일괄 확인·승인하고,
                    승인된 해지 건은 익월 청구 명단에서 <strong>반드시 제외</strong>하세요.
                </div>
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
        if (document.getElementById('cancelTabStyle')) return;
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
            .badge-refund  { background:#fff3cd; color:#856404; border:1px solid #ffc107; }
            .badge-cancel  { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }
            .cancel-apply-date { font-size:.75rem; color:#059669; font-weight:600; }
        `;
        document.head.appendChild(s);
    },

    switchTab(tab) {
        this.currentTab = tab;
        this.currentStatus = '';
        document.getElementById('tabCancel')?.classList.toggle('active', tab === 'cancel');
        document.getElementById('tabRefund')?.classList.toggle('active', tab === 'refund');
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
        } catch (e) {
            document.getElementById('cancelList').innerHTML = `<p class="error-hint">${e.message}</p>`;
        }
    },

    filter(btn, status) {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.load(status);
    },

    // 접수일 기준 익월 해지 적용 예정일 계산
    calcApplyMonth(createdAt) {
        const d = new Date(createdAt);
        const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const applyMonth = kst.getUTCMonth() + 2; // 익월
        const applyYear  = applyMonth > 12
            ? kst.getUTCFullYear() + 1
            : kst.getUTCFullYear();
        const m = applyMonth > 12 ? 1 : applyMonth;
        return `${applyYear}년 ${m}월 1일`;
    },

    renderList(list) {
        const container = document.getElementById('cancelList');
        const isRefund = this.currentTab === 'refund';

        if (!list.length) {
            container.innerHTML = `<p class="empty-hint">${isRefund ? '환불 신청이 없습니다' : '해지 신청이 없습니다'}</p>`;
            return;
        }

        // 대기중 건수 요약
        const pendingCount = list.filter(c => c.status === 'pending').length;
        const summaryExtra = (!isRefund && pendingCount > 0)
            ? ` &nbsp;·&nbsp; <span style="color:#dc2626;font-weight:700">미처리 대기 ${pendingCount}건</span>`
            : '';

        container.innerHTML = `<div class="list-summary">${list.length}건${summaryExtra}</div>`
            + list.map(c => {
                const applyDate = (!isRefund) ? this.calcApplyMonth(c.created_at) : '';
                return `
                <div class="list-item" onclick="cancellations.showDetail('${c.id}')">
                    <div class="item-status">
                        <span class="status-badge status-${statusClass(c.status)}">${statusLabel(c.status)}</span>
                        ${isRefund ? '<span class="status-badge badge-refund" style="margin-top:4px;display:block">환불</span>'
                                   : '<span class="status-badge badge-cancel" style="margin-top:4px;display:block">해지</span>'}
                    </div>
                    <div class="item-main">
                        <strong>${c.dong} ${c.ho} | ${c.name}</strong>
                        <p>${c.program_name || (isRefund ? '환불 신청' : '해지 신청')}</p>
                        ${!isRefund && applyDate
                            ? `<span class="cancel-apply-date"><i class="fas fa-calendar-check"></i> 익월 해지 예정: ${applyDate}</span>`
                            : ''}
                        <small>${c.phone} | ${formatDate(c.created_at)}</small>
                    </div>
                    <i class="fas fa-chevron-right item-arrow"></i>
                </div>`;
            }).join('');
    },

    showDetail(id) {
        const c = this.data.find(x => x.id === id);
        if (!c) return;
        const isRefund = (c.request_type === 'refund');
        const applyDate = (!isRefund) ? this.calcApplyMonth(c.created_at) : null;

        // reason 파싱 (환불)
        let reasonDisplay = c.reason || '-';
        let refundDetailDisplay = '';
        if (isRefund && c.reason) {
            const match = c.reason.match(/^\[환불사유:\s*(.+?)\]\n?([\s\S]*)$/);
            if (match) {
                reasonDisplay       = match[1].trim();
                refundDetailDisplay = match[2].trim();
            }
        }

        // 첨부 서류 목록 렌더링 (doc_urls JSON 배열)
        let docSection = '';
        if (isRefund) {
            let docItems = [];
            try {
                const raw = c.doc_urls;
                if (Array.isArray(raw)) docItems = raw;
                else if (typeof raw === 'string' && raw) docItems = JSON.parse(raw);
            } catch(_) {}

            const docListHtml = docItems.length > 0
                ? docItems.map((d, i) => {
                    const name = d.name || `서류 ${i+1}`;
                    const url  = d.url  || '';
                    // URL을 절대경로로 변환 (admin 페이지에서도 올바르게 로드)
                    const absUrl = url && url.startsWith('/') ? (window.location.origin + url) : url;
                    const isImg = /\.(jpe?g|png|gif|webp)$/i.test(name);
                    const isPdf = /\.pdf$/i.test(name);
                    const icon  = isPdf
                        ? '<i class="fas fa-file-pdf" style="color:#dc2626;font-size:1.1rem"></i>'
                        : isImg
                            ? '<i class="fas fa-file-image" style="color:#2563eb;font-size:1.1rem"></i>'
                            : '<i class="fas fa-file" style="color:#6b7280;font-size:1.1rem"></i>';
                    // 이미지: 모달 내 직접 미리보기 (라이트박스) + 로드 실패 시 재시도 버튼
                    const preview = isImg && absUrl
                        ? `<div style="margin-top:8px;text-align:center">
                               <img src="${escHtml(absUrl)}" alt="${escHtml(name)}"
                                   id="doc-img-${i}"
                                   style="max-width:100%;max-height:280px;border-radius:8px;border:1px solid #e5e7eb;
                                          display:block;margin:0 auto;cursor:zoom-in;object-fit:contain;background:#f3f4f6"
                                   onclick="cancellations.openLightbox('${escHtml(absUrl)}','${escHtml(name)}')"
                                   onerror="this.style.display='none';document.getElementById('doc-err-${i}').style.display='flex'"
                               >
                               <div id="doc-err-${i}" style="display:none;flex-direction:column;align-items:center;gap:8px;
                                        margin-top:6px;padding:12px;background:#fef3c7;border:1px solid #fcd34d;
                                        border-radius:8px;font-size:.82rem;color:#92400e">
                                   <i class='fas fa-exclamation-triangle' style="font-size:1.2rem"></i>
                                   <span>이미지를 불러올 수 없습니다</span>
                                   <button onclick="cancellations.retryImage('doc-img-${i}','doc-err-${i}','${escHtml(absUrl)}')"
                                           style="background:#4f46e5;color:#fff;border:none;padding:5px 12px;border-radius:5px;
                                                  font-size:.78rem;cursor:pointer;font-weight:600">
                                       <i class="fas fa-redo"></i> 다시 시도
                                   </button>
                               </div>
                               <span style="font-size:.72rem;color:#9ca3af;margin-top:4px;display:block">
                                   클릭하면 크게 볼 수 있습니다
                               </span>
                           </div>`
                        : '';
                    const uploadedAt = d.uploaded_at ? formatDate(d.uploaded_at) : '';
                    return `
                    <div style="display:flex;flex-direction:column;gap:4px;background:#f9fafb;
                                border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px">
                        <div style="display:flex;align-items:center;gap:8px">
                            ${icon}
                            <span style="flex:1;font-size:.83rem;font-weight:600;color:#111827;
                                         word-break:break-all">${escHtml(name)}</span>
                            ${absUrl ? `<a href="${escHtml(absUrl)}" download="${escHtml(name)}"
                                        style="flex-shrink:0;font-size:.78rem;color:#4f46e5;text-decoration:none;
                                               background:#ede9fe;padding:3px 8px;border-radius:5px;font-weight:600"
                                        title="다운로드">
                                        <i class="fas fa-download"></i> 저장
                                    </a>` : ''}
                        </div>
                        ${uploadedAt ? `<span style="font-size:.73rem;color:#9ca3af;padding-left:24px">업로드: ${uploadedAt}</span>` : ''}
                        ${preview}
                    </div>`;
                }).join('')
                : `<div style="font-size:.82rem;color:#9ca3af;text-align:center;padding:12px 0">
                        <i class="fas fa-folder-open"></i> 첨부된 서류가 없습니다
                   </div>`;

            // 전체 다운로드(아카이브) 버튼
            const archiveBtn = docItems.length > 0
                ? `<button class="btn-secondary btn-sm"
                           onclick="cancellations.downloadArchive('${c.id}','${escHtml(c.name || '')}')"
                           style="margin-top:8px;width:100%">
                        <i class="fas fa-archive"></i> 전체 서류 ZIP 다운로드
                   </button>`
                : '';

            docSection = `
                <div class="detail-row full" style="border:1.5px solid #e0e7ff;border-radius:8px;padding:12px;margin-top:4px;background:#f5f3ff">
                    <label style="color:#4338ca;font-weight:700;margin-bottom:8px;display:block">
                        <i class="fas fa-paperclip"></i> 첨부 증빙서류
                        ${docItems.length > 0 ? `<span style="background:#4f46e5;color:#fff;font-size:.72rem;padding:2px 7px;border-radius:10px;margin-left:6px">${docItems.length}개</span>` : ''}
                    </label>
                    <div style="display:flex;flex-direction:column;gap:8px">${docListHtml}</div>
                    ${archiveBtn}
                </div>`;
        }

        const body = `
            <div class="detail-grid">
                <div class="detail-row">
                    <label>유형</label>
                    <span>${isRefund
                        ? '<span class="status-badge badge-refund"><i class=\'fas fa-file-invoice-dollar\'></i> 환불 신청</span>'
                        : '<span class="status-badge badge-cancel"><i class=\'fas fa-times-circle\'></i> 해지 신청</span>'
                    }</span>
                </div>
                <div class="detail-row"><label>상태</label>
                    <span class="status-badge status-${statusClass(c.status)}">${statusLabel(c.status)}</span>
                </div>
                <div class="detail-row"><label>동/호수</label><span>${c.dong} ${c.ho}</span></div>
                <div class="detail-row"><label>이름</label><span>${c.name}</span></div>
                <div class="detail-row"><label>전화</label><span>${c.phone}</span></div>
                ${!isRefund ? `<div class="detail-row"><label>프로그램</label><span>${c.program_name || '-'}</span></div>` : ''}
                <div class="detail-row"><label>${isRefund ? '환불 사유' : '해지 사유'}</label><span>${reasonDisplay}</span></div>
                ${isRefund && refundDetailDisplay
                    ? `<div class="detail-row full"><label>상세 내용</label><p style="white-space:pre-wrap">${refundDetailDisplay}</p></div>`
                    : ''}

                ${!isRefund ? `
                <div class="detail-row full" style="background:#f0fdf4;border-radius:6px;padding:10px 12px;margin-top:4px;border:1px solid #bbf7d0">
                    <label style="color:#166534"><i class="fas fa-calendar-check"></i> 해지 적용 예정일</label>
                    <p style="font-size:.92rem;color:#15803d;font-weight:700;margin-top:4px">${applyDate}</p>
                    <p style="font-size:.78rem;color:#6b7280;margin-top:2px">접수일 기준 익월 1일부터 해지 적용 · 당월은 정상 수강</p>
                </div>` : ''}

                ${isRefund ? `
                <div class="detail-row full" style="background:#fff5f5;border-radius:6px;padding:8px 10px;margin-top:4px;border:1px solid #fecaca">
                    <label style="color:#c53030"><i class="fas fa-info-circle"></i> 처리 안내</label>
                    <p style="font-size:.82rem;color:#742a2a;line-height:1.6">
                        환불 승인 시 결제금액의 <strong>10% 위약금</strong> 공제 후<br>
                        수강 횟수 × 20,000원 차감하여 환급<br>
                        <em>증빙서류 확인 필수 (진단서·비자 등)</em>
                    </p>
                </div>` : ''}

                ${docSection}

                <div class="detail-row"><label>신청일</label><span>${formatDate(c.created_at)}</span></div>
                ${c.processed_at ? `<div class="detail-row"><label>처리일</label><span>${formatDate(c.processed_at)}</span></div>` : ''}
            </div>`;

        const footer = c.status === 'pending' ? `
            <div class="modal-btn-group">
                <button class="btn-success btn-sm" onclick="cancellations.updateStatus('${c.id}','approved')">
                    <i class="fas fa-check"></i> 승인${!isRefund ? ` (${applyDate} 해지)` : ''}
                </button>
                <button class="btn-danger btn-sm" onclick="cancellations.updateStatus('${c.id}','rejected')">
                    <i class="fas fa-times"></i> 거부
                </button>
            </div>` : '';

        const title = isRefund
            ? '<i class="fas fa-file-invoice-dollar"></i> 환불 신청 상세'
            : '<i class="fas fa-times-circle"></i> 해지 신청 상세';
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
    },

    /**
     * 환불 서류 전체를 ZIP으로 다운로드 (브라우저 레벨 — JSZip 없이 개별 다운)
     * JSZip 미포함 환경이므로, 파일을 순차적으로 개별 다운로드하거나
     * 서버 /api/upload/refund-docs/list 에서 목록을 재조회해 개별 열기
     */
    async downloadArchive(cancellationId, requesterName) {
        try {
            const c = this.data.find(x => x.id === cancellationId);
            let docItems = [];
            try {
                const raw = c?.doc_urls;
                if (Array.isArray(raw)) docItems = raw;
                else if (typeof raw === 'string' && raw) docItems = JSON.parse(raw);
            } catch(_) {}

            if (docItems.length === 0) {
                // Storage에서 재조회 시도
                const complexCode = getEffectiveComplexId()
                    ? (window.Admin?.complex?.code || '')
                    : '';
                const listRes = await fetch(
                    `/api/upload/refund-docs/list?cancellation_id=${cancellationId}&complex_code=${complexCode}`
                );
                const listData = await listRes.json();
                if (listData.success && listData.files?.length > 0) {
                    docItems = listData.files.map(f => ({ url: f.url, name: f.name }));
                }
            }

            if (docItems.length === 0) {
                showToast('다운로드할 서류가 없습니다', 'error'); return;
            }

            showToast(`서류 ${docItems.length}개를 다운로드합니다...`);

            // 개별 파일 순차 다운로드 (브라우저 보안 정책상 동시 다운로드 제한 있음)
            for (let i = 0; i < docItems.length; i++) {
                const d = docItems[i];
                if (!d.url) continue;
                await new Promise(resolve => {
                    setTimeout(() => {
                        const a = document.createElement('a');
                        a.href = d.url;
                        a.download = d.name || `서류_${requesterName}_${i+1}`;
                        a.target = '_blank';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        resolve();
                    }, i * 600); // 600ms 간격으로 순차 다운로드
                });
            }
        } catch(e) {
            showToast('다운로드 실패: ' + e.message, 'error');
        }
    },

    /** 이미지 라이트박스 - 모달 내에서 크게 보기 */
    openLightbox(url, name) {
        // 기존 라이트박스 제거
        const old = document.getElementById('refundLightbox');
        if (old) old.remove();

        const lb = document.createElement('div');
        lb.id = 'refundLightbox';
        lb.style.cssText = `
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,0.88);z-index:99999;
            display:flex;align-items:center;justify-content:center;
            flex-direction:column;gap:12px;padding:20px;box-sizing:border-box;
        `;
        lb.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;
                        width:100%;max-width:900px;color:#fff;margin-bottom:4px">
                <span style="font-size:.9rem;font-weight:600;word-break:break-all;flex:1;margin-right:12px">
                    <i class="fas fa-image"></i> ${name}
                </span>
                <div style="display:flex;gap:8px;flex-shrink:0">
                    <a href="${url}" download="${name}"
                       style="background:#4f46e5;color:#fff;padding:6px 14px;border-radius:6px;
                              text-decoration:none;font-size:.82rem;font-weight:600">
                        <i class="fas fa-download"></i> 저장
                    </a>
                    <button onclick="document.getElementById('refundLightbox').remove()"
                            style="background:#374151;color:#fff;border:none;padding:6px 14px;
                                   border-radius:6px;cursor:pointer;font-size:.82rem;font-weight:600">
                        <i class="fas fa-times"></i> 닫기
                    </button>
                </div>
            </div>
            <div style="flex:1;display:flex;align-items:center;justify-content:center;
                        width:100%;max-width:900px;overflow:auto">
                <img src="${url}" alt="${name}"
                     style="max-width:100%;max-height:80vh;border-radius:8px;
                            object-fit:contain;box-shadow:0 4px 32px rgba(0,0,0,.5)"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='block'"
                >
                <div style="display:none;color:#fcd34d;text-align:center;padding:20px">
                    <i class="fas fa-exclamation-triangle" style="font-size:2rem"></i>
                    <p style="margin-top:8px">이미지를 불러올 수 없습니다</p>
                </div>
            </div>
            <p style="color:#9ca3af;font-size:.75rem;margin-top:4px">
                배경 클릭 또는 닫기 버튼으로 닫을 수 있습니다
            </p>`;
        // 배경 클릭 시 닫기
        lb.addEventListener('click', (e) => {
            if (e.target === lb) lb.remove();
        });
        document.body.appendChild(lb);
    },

    /** 이미지 로드 재시도 */
    retryImage(imgId, errId, url) {
        const img = document.getElementById(imgId);
        const err = document.getElementById(errId);
        if (!img) return;
        img.style.display = 'block';
        err.style.display = 'none';
        // 캐시 방지 파라미터 추가
        img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
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
