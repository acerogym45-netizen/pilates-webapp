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
        const hour = kst.getUTCHours();
        // 해지 신청 기간: 매월 22일 09:00 ~ 26일 09:00 KST (시간 단위 정밀 체크)
        const isCancelPeriod =
            (day === 22 && hour >= 9) ||
            (day > 22 && day < 26)   ||
            (day === 26 && hour < 9);
        // 등록 접수 기간 = 해지 신청 기간: 매월 22일 09:00 ~ 26일 09:00 KST
        const isEnrollPeriod = isCancelPeriod;
        const nextMon = mon === 12 ? 1 : mon + 1;

        // ── 기간 안내 배너 ──
        let periodBannerHtml = '';
        if (isCancelPeriod) {
            periodBannerHtml = `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:9px;
                        background:#fff7ed;border:2px solid #f97316;margin-bottom:12px;font-size:.83rem;color:#9a3412">
                <i class="fas fa-exclamation-triangle" style="font-size:1.1rem;color:#f97316"></i>
                <span><strong>🔔 현재 해지 신청 기간 (${mon}월 22일 09시 ~ 26일 09시)</strong><br>
                <small style="opacity:.85">접수 즉시 자동 승인 · 당월 정상 수강 후 ${nextMon}월부터 해지 적용</small></span>
            </div>`;
        } else if (isEnrollPeriod) {
            periodBannerHtml = `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:9px;
                        background:#eff6ff;border:2px solid #3b82f6;margin-bottom:12px;font-size:.83rem;color:#1e40af">
                <i class="fas fa-calendar-check" style="font-size:1.1rem"></i>
                <span><strong>📝 현재 신규 등록 접수 기간 (${mon}월 22일 09시 ~ 26일 09시)</strong></span>
            </div>`;
        } else {
            // 다음 기간 계산: 26일 09시 이후면 다음달 22일, 그 전이면 이번달 22일
            const isAfterClose = day > 26 || (day === 26 && hour >= 9);
            const isBeforeOpen  = day < 22 || (day === 22 && hour < 9);
            let next;
            // 등록 접수 = 해지 신청 기간으로 통일, 단일 표시
            if (isAfterClose) {
                // 26일 09시 이후 → 다음달
                next = `다음 등록 접수 · 해지 신청: <strong>${nextMon}월 22일 09시 ~ 26일 09시</strong>`;
            } else {
                // 이번달 22일 09시 전
                next = `다음 등록 접수 · 해지 신청: <strong>${mon}월 22일 09시 ~ 26일 09시</strong>`;
            }
            periodBannerHtml = `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;
                        background:#f9fafb;border:1px solid #e5e7eb;margin-bottom:12px;font-size:.8rem;color:#6b7280">
                <i class="fas fa-calendar-alt"></i><span>${next}</span>
            </div>`;
        }

        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-times-circle"></i> 해지 관리</h2>
                <div style="display:flex;gap:6px">
                    <button class="btn-primary btn-sm" onclick="cancellations.openNewCancelModal()">
                        <i class="fas fa-plus"></i> 해지신청 등록
                    </button>
                    <button class="btn-secondary btn-sm" onclick="cancellations.exportBillingCSV()" title="관리비 부과 현황 CSV">
                        <i class="fas fa-file-csv"></i> 관리비 내보내기
                    </button>
                    <button class="btn-secondary btn-sm" onclick="cancellations.exportListExcel()" title="해지/환불 목록 엑셀 다운로드">
                        <i class="fas fa-file-excel"></i> 목록 엑셀
                    </button>
                    <button class="btn-secondary btn-sm" onclick="cancellations.reload()"><i class="fas fa-sync"></i></button>
                </div>
            </div>

            ${periodBannerHtml}

            <!-- 관리 가이드 박스 (기간은 설정값으로 동적 업데이트) -->
            <div id="cancelGuideBox" style="background:#f0fdf4;border:1.5px solid #22c55e;border-radius:10px;
                 padding:12px 14px;margin-bottom:14px;font-size:.8rem;color:#166534;line-height:1.75">
                <div style="font-weight:700;margin-bottom:6px"><i class="fas fa-info-circle"></i> 해지 관리 운영 가이드</div>
                <div id="cancelGuideGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px">
                    <div>📅 <strong>등록 접수:</strong> <span id="guideEnrollPeriod">매월 22일 09시 ~ 26일 09시</span></div>
                    <div>🚫 <strong>해지 신청:</strong> <span id="guideCancelPeriod">매월 22일 09시 ~ 26일 09시</span></div>
                    <div>🔄 <strong>해지 적용:</strong> 당월 수강 후 익월부터</div>
                    <div>⚡ <strong>미신청 시:</strong> 자동 재등록 (차월 수강료 청구)</div>
                </div>
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid #bbf7d0">
                    💡 <strong>운영 안내:</strong> 해지 신청은 접수 즉시 자동 승인됩니다. 승인된 해지 건은 익월 청구 명단에서 <strong>반드시 제외</strong>하세요.
                </div>
            </div>

            <!-- 유형 탭: 해지 신청 / 중도해지 / 환불 신청 -->
            <div class="type-tab-bar" style="display:flex;gap:6px;margin-bottom:10px">
                <button id="tabCancel" class="type-tab-btn active" onclick="cancellations.switchTab('cancel')">
                    <i class="fas fa-times-circle"></i> 차월 해지
                </button>
                <button id="tabMidCancel" class="type-tab-btn" onclick="cancellations.switchTab('mid_cancel')">
                    <i class="fas fa-cut"></i> 중도 해지
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
        this._updateGuide(); // 운영 가이드 기간 동적 업데이트 (비동기, UI 블로킹 안 함)
    },

    // 운영 가이드 기간 표시를 신청기간 설정값으로 동적 업데이트
    async _updateGuide() {
        const complexId = getEffectiveComplexId();
        if (!complexId) return;

        // 일+시 포맷 헬퍼 (UTC → KST "N일 HH시" 문자열)
        const fmt = (utcStr) => {
            if (!utcStr) return null;
            const d = new Date(new Date(utcStr).getTime() + 9 * 60 * 60 * 1000);
            const day  = d.getUTCDate();
            const hour = String(d.getUTCHours()).padStart(2, '0');
            const min  = d.getUTCMinutes();
            return min > 0
                ? `${day}일 ${hour}시 ${String(min).padStart(2,'0')}분`
                : `${day}일 ${hour}시`;
        };

        // 기간 라벨 생성 헬퍼
        const periodLabel = (setting, cx) => {
            const mode = setting?.period_mode || 'auto';
            if (mode === 'always') return '상시 개방';
            if (mode === 'closed') return '항상 닫힘';
            if (mode === 'custom' && setting?.period_start && setting?.period_end) {
                return `매월 ${fmt(setting.period_start)} ~ ${fmt(setting.period_end)}`;
            }
            // auto: 단지 기본 기간 우선
            if (cx?.apply_period_enabled && cx?.apply_start && cx?.apply_end) {
                return `매월 ${fmt(cx.apply_start)} ~ ${fmt(cx.apply_end)}`;
            }
            return '매월 22일 09시 ~ 26일 09시'; // 기본값
        };

        try {
            const [r1, r2] = await Promise.all([
                fetch(`/api/complexes/${complexId}/apply-period`).then(r => r.json()),
                fetch(`/api/complexes/${complexId}/apply-settings`).then(r => r.json()),
            ]);

            const cx       = r1.success ? r1.data : null;
            const settings = r2.success ? (r2.data || []) : [];
            const byKey    = {};
            settings.forEach(s => { byKey[s.apply_type_key] = s; });

            // 등록 접수 = 신규 수강 신청('new') 기간
            const enrollLabel = periodLabel(byKey['new'], cx);
            // 해지 신청 = 차월 해지('cancel') 기간
            const cancelLabel = periodLabel(byKey['cancel'], cx);

            const elEnroll = document.getElementById('guideEnrollPeriod');
            const elCancel = document.getElementById('guideCancelPeriod');
            if (elEnroll) elEnroll.textContent = enrollLabel;
            if (elCancel) elCancel.textContent = cancelLabel;
        } catch (e) {
            // 실패해도 기본값(하드코딩)이 표시되므로 조용히 무시
            console.warn('[_updateGuide] 기간 조회 실패:', e.message);
        }
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
        document.getElementById('tabCancel')?.classList.toggle('active',    tab === 'cancel');
        document.getElementById('tabMidCancel')?.classList.toggle('active', tab === 'mid_cancel');
        document.getElementById('tabRefund')?.classList.toggle('active',    tab === 'refund');
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
        const isRefund    = this.currentTab === 'refund';
        const isMidCancel = this.currentTab === 'mid_cancel';
        const isCancel    = this.currentTab === 'cancel';

        const emptyMsg = isRefund ? '환불 신청이 없습니다'
                       : isMidCancel ? '중도 해지 신청이 없습니다'
                       : '해지 신청이 없습니다';
        if (!list.length) {
            container.innerHTML = `<p class="empty-hint">${emptyMsg}</p>`;
            return;
        }

        // 대기중 건수 요약
        const pendingCount = list.filter(c => c.status === 'pending').length;
        const summaryExtra = (!isRefund && pendingCount > 0)
            ? ` &nbsp;·&nbsp; <span style="color:#dc2626;font-weight:700">미처리 대기 ${pendingCount}건</span>`
            : '';

        // 탭별 배지 색상
        const typeBadge = isRefund
            ? '<span class="status-badge badge-refund" style="margin-top:4px;display:block">환불</span>'
            : isMidCancel
                ? '<span class="status-badge" style="margin-top:4px;display:block;background:#fef3c7;color:#92400e;border:1px solid #fbbf24">중도해지</span>'
                : '<span class="status-badge badge-cancel" style="margin-top:4px;display:block">차월해지</span>';

        container.innerHTML = `<div class="list-summary">${list.length}건${summaryExtra}</div>`
            + list.map(c => {
                const applyDate = isCancel ? this.calcApplyMonth(c.created_at) : '';
                return `
                <div class="list-item" onclick="cancellations.showDetail('${c.id}')">
                    <div class="item-status">
                        <span class="status-badge status-${statusClass(c.status)}">${statusLabel(c.status)}</span>
                        ${typeBadge}
                    </div>
                    <div class="item-main">
                        <strong>${c.dong} ${c.ho} | ${c.name}</strong>
                        <p>${c.program_name || emptyMsg}${!isRefund && c.preferred_time ? ` <span style="color:#6b7280;font-size:.8rem">(${c.preferred_time})</span>` : ''}</p>
                        ${isCancel && applyDate
                            ? `<span class="cancel-apply-date"><i class="fas fa-calendar-check"></i> 익월 해지 예정: ${applyDate}</span>`
                            : ''}
                        ${isMidCancel && c.termination_date
                            ? `<span class="cancel-apply-date" style="color:#92400e"><i class="fas fa-scissors"></i> 중도해지일: ${c.termination_date}</span>`
                            : ''}
                        <small>${c.phone} | ${formatDate(c.created_at)}</small>
                    </div>
                    <i class="fas fa-chevron-right item-arrow"></i>
                </div>`;
            }).join('');
    },

    showDetail(id) {
        try {
        const c = this.data.find(x => x.id === id);
        if (!c) {
            // data에 없으면 전체 목록 재조회 후 재시도
            this.load(this.currentStatus).then(() => {
                const c2 = this.data.find(x => x.id === id);
                if (c2) this.showDetail(id);
                else showToast('항목을 찾을 수 없습니다. 목록을 새로고침해 주세요.', 'error');
            });
            return;
        }
        const isRefund   = (c.request_type === 'refund');
        const isMidCancel = (c.request_type === 'mid_cancel');
        const applyDate = (!isRefund) ? this.calcApplyMonth(c.created_at) : '';  // null → '' 방어

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

        // 관리비 부과 정보 표시 (해지 승인 건) — body 구성 전에 먼저 계산
        let billingSection = '';
        if (!isRefund && c.status === 'approved') {
            const hasBilling = c.billing_amount > 0 || c.termination_month;
            billingSection = `
                <div class="detail-row full" style="background:${hasBilling ? '#f0fdf4' : '#fafafa'};
                     border:1.5px solid ${hasBilling ? '#22c55e' : '#e5e7eb'};
                     border-radius:8px;padding:12px;margin-top:4px">
                    <label style="color:${hasBilling ? '#15803d' : '#6b7280'};font-weight:700;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
                        <span><i class="fas fa-won-sign"></i> 관리비 부과 정보</span>
                        <button onclick="cancellations.showBillingModal('${c.id}')"
                                style="background:#4f46e5;color:#fff;border:none;padding:4px 10px;border-radius:5px;
                                       font-size:.75rem;cursor:pointer;font-weight:600">
                            <i class="fas fa-edit"></i> ${hasBilling ? '수정' : '입력'}
                        </button>
                    </label>
                    ${hasBilling ? `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.82rem">
                        <div>📅 해지처리월: <strong>${c.termination_month || '-'}</strong></div>
                        <div>📆 해지날짜: <strong>${c.termination_date || '-'}</strong></div>
                        <div>🏃 수강횟수: <strong>${c.attended_sessions ?? '-'}회</strong></div>
                        <div>📚 총수업횟수: <strong>${c.total_sessions_in_month ?? '-'}회</strong></div>
                        <div>💰 단가: <strong>₩${(c.session_fee || 0).toLocaleString()}</strong></div>
                        <div style="color:#dc2626;font-weight:700">🧾 청구금액: <strong>₩${(c.billing_amount || 0).toLocaleString()}</strong></div>
                    </div>
                    ${c.billing_memo ? `<div style="margin-top:6px;font-size:.8rem;color:#6b7280">메모: ${c.billing_memo}</div>` : ''}
                    <div style="margin-top:6px">
                        <span style="background:${c.billing_processed ? '#dcfce7' : '#fee2e2'};
                               color:${c.billing_processed ? '#15803d' : '#dc2626'};
                               padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:600">
                            ${c.billing_processed ? '✅ 청구완료' : '⏳ 미청구'}
                        </span>
                    </div>` : `
                    <div style="color:#9ca3af;font-size:.82rem;text-align:center;padding:8px 0">
                        <i class="fas fa-edit"></i> 수강 횟수와 단가를 입력하면 관리비가 자동 계산됩니다
                    </div>`}
                </div>`;
        }

        const body = `
            <div class="detail-grid">
                <div class="detail-row">
                    <label>유형</label>
                    <div style="display:flex;align-items:center;gap:8px">
                        <select id="detailTypeSelect"
                            onchange="cancellations.changeType('${c.id}', this.value)"
                            style="font-size:.82rem;padding:4px 8px;border:1.5px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-weight:600">
                            <option value="cancel"     ${c.request_type === 'cancel'     ? 'selected' : ''}>🗓 차월 해지</option>
                            <option value="mid_cancel" ${c.request_type === 'mid_cancel' ? 'selected' : ''}>✂️ 중도 해지</option>
                            <option value="refund"     ${c.request_type === 'refund'     ? 'selected' : ''}>💸 환불 신청</option>
                        </select>
                        <span style="font-size:.73rem;color:#9ca3af">변경 시 즉시 저장</span>
                    </div>
                </div>
                <div class="detail-row"><label>상태</label>
                    <span class="status-badge status-${statusClass(c.status)}">${statusLabel(c.status)}</span>
                </div>
                <!-- ── 수정 가능 정보 섹션 ─────────────────────────────── -->
                <div class="detail-row full" style="background:#fafafa;border:1.5px solid #e5e7eb;border-radius:10px;padding:14px;margin-top:2px">
                    <div style="font-weight:700;font-size:.85rem;color:#374151;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
                        <span><i class="fas fa-edit" style="color:#6366f1"></i> 신청 정보 수정</span>
                        <button onclick="cancellations._saveDetailEdit('${c.id}')"
                            style="background:#6366f1;color:#fff;border:none;padding:5px 14px;border-radius:6px;
                                   font-size:.78rem;font-weight:700;cursor:pointer">
                            <i class="fas fa-save"></i> 저장
                        </button>
                    </div>

                    <!-- 동/호수 + 이름 -->
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
                        <div>
                            <label style="font-size:.75rem;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">동</label>
                            <input id="editDong" value="${escHtml(c.dong||'')}" placeholder="101"
                                style="width:100%;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:6px;font-size:.88rem;box-sizing:border-box">
                        </div>
                        <div>
                            <label style="font-size:.75rem;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">호수</label>
                            <input id="editHo" value="${escHtml(c.ho||'')}" placeholder="1001"
                                style="width:100%;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:6px;font-size:.88rem;box-sizing:border-box">
                        </div>
                        <div>
                            <label style="font-size:.75rem;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">이름</label>
                            <input id="editName" value="${escHtml(c.name||'')}" placeholder="이름"
                                style="width:100%;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:6px;font-size:.88rem;box-sizing:border-box">
                        </div>
                    </div>

                    <!-- 전화번호 -->
                    <div style="margin-bottom:10px">
                        <label style="font-size:.75rem;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">전화번호</label>
                        <input id="editPhone" value="${escHtml(c.phone||'')}" placeholder="010-0000-0000" type="tel"
                            style="width:100%;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:6px;font-size:.88rem;box-sizing:border-box">
                    </div>

                    ${!isRefund ? `
                    <!-- 프로그램 조회 + 선택 -->
                    <div style="margin-bottom:8px">
                        <label style="font-size:.75rem;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">
                            프로그램 / 희망시간
                            <span style="font-weight:400;color:#9ca3af;margin-left:4px">— 조회 버튼으로 수강 목록에서 선택 가능</span>
                        </label>
                        <div style="display:flex;gap:6px;margin-bottom:6px">
                            <input id="editProgramName" value="${escHtml(c.program_name||'')}" placeholder="프로그램명 직접 입력"
                                style="flex:1;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:6px;font-size:.88rem">
                            <input id="editPreferredTime" value="${escHtml(c.preferred_time||'')}" placeholder="시간 (예: 월수 10시)"
                                style="width:130px;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:6px;font-size:.88rem">
                        </div>
                        <!-- 수강 목록 조회 버튼 -->
                        <button onclick="cancellations._lookupForEdit('${c.id}')"
                            id="editLookupBtn"
                            style="width:100%;padding:8px;background:#0ea5e9;color:#fff;border:none;border-radius:7px;
                                   font-size:.82rem;font-weight:700;cursor:pointer">
                            <i class="fas fa-search"></i> 동/호수로 수강 목록 조회 후 선택
                        </button>
                        <div id="editLookupResult" style="margin-top:6px;display:none"></div>
                    </div>` : ''}

                    <!-- 사유 -->
                    <div>
                        <label style="font-size:.75rem;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">
                            ${isRefund ? '환불 사유' : '해지 사유'}
                        </label>
                        <textarea id="editReason" rows="2"
                            style="width:100%;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:6px;
                                   font-size:.88rem;resize:vertical;box-sizing:border-box">${escHtml(c.reason||'')}</textarea>
                    </div>
                </div>
                <!-- ── 수정 섹션 끝 ─────────────────────────────────── -->

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

                ${billingSection}

                <div class="detail-row"><label>신청일</label><span>${formatDate(c.created_at)}</span></div>
                ${c.processed_at ? `<div class="detail-row"><label>처리일</label><span>${formatDate(c.processed_at)}</span></div>` : ''}
            </div>`;

        // 해지 승인 버튼 안내
        const hasAppId = !!c.application_id;
        const approveLabel = !isRefund ? `승인 (${applyDate} 해지)` : '승인';
        const approveConfirm = `confirm('해지 신청을 승인하시겠습니까?\\n\\n승인 시 수강 신청 목록에서도 자동으로 해지 처리됩니다.')`;

        const footer = `
            <div class="modal-btn-group" style="flex-wrap:wrap;gap:6px">
                ${c.status === 'pending' ? `
                <button class="btn-success btn-sm" onclick="if(${approveConfirm}) cancellations.updateStatus('${c.id}','approved')">
                    <i class="fas fa-check"></i> ${approveLabel}
                </button>
                <button class="btn-danger btn-sm" onclick="cancellations.updateStatus('${c.id}','rejected')">
                    <i class="fas fa-times"></i> 거부
                </button>` : ''}
                ${c.status === 'rejected' || c.status === 'approved' ? `
                <button class="btn-secondary btn-sm" onclick="if(confirm('대기중으로 되돌리시겠습니까?')) cancellations.updateStatus('${c.id}','pending')">
                    <i class="fas fa-undo"></i> 대기중으로 되돌리기
                </button>` : ''}
                ${!isRefund && c.status === 'approved' ? `
                <button onclick="cancellations.syncApplicationCancel('${c.id}')"
                    style="background:#f59e0b;color:#fff;border:none;padding:6px 14px;border-radius:7px;
                           font-size:.8rem;font-weight:700;cursor:pointer">
                    <i class="fas fa-sync-alt"></i> 신청 관리 해지 처리
                </button>
                <button class="btn-primary btn-sm" onclick="cancellations.showBillingModal('${c.id}')">
                    <i class="fas fa-won-sign"></i> 관리비 부과
                </button>` : ''}
            </div>`;

        const title = isRefund
            ? '<i class="fas fa-file-invoice-dollar"></i> 환불 신청 상세'
            : '<i class="fas fa-times-circle"></i> 해지 신청 상세';
        openGlobalModal(title, body, footer);
        } catch(err) {
            console.error('[cancellations] showDetail 오류:', err);
            alert('상세 정보를 표시하는 중 오류가 발생했습니다: ' + err.message);
        }
    },

    // 유형 변경 (차월해지 ↔ 중도해지 ↔ 환불)
    async changeType(id, newType) {
        const TYPE_LABELS = { cancel: '차월 해지', mid_cancel: '중도 해지', refund: '환불 신청' };
        try {
            await API.cancellations.update(id, { request_type: newType });
            // data 내부도 즉시 갱신
            const item = this.data.find(x => x.id === id);
            if (item) item.request_type = newType;
            showToast(`유형이 「${TYPE_LABELS[newType] || newType}」로 변경되었습니다`, 'success');
            await this.load(this.currentStatus);
            loadBadges();
        } catch(e) {
            showToast('유형 변경 실패: ' + e.message, 'error');
            // select 원복
            const sel = document.getElementById('detailTypeSelect');
            const orig = this.data.find(x => x.id === id);
            if (sel && orig) sel.value = orig.request_type;
        }
    },

    // ── 상세 모달: 동/호수로 수강 목록 조회 후 프로그램 선택 ────────────
    async _lookupForEdit(cancellationId) {
        const dong  = (document.getElementById('editDong')?.value  || '').trim();
        const ho    = (document.getElementById('editHo')?.value    || '').trim();
        const phone = (document.getElementById('editPhone')?.value || '').trim();
        if (!dong || !ho) { showToast('동과 호수를 먼저 입력하세요', 'error'); return; }

        const btn = document.getElementById('editLookupBtn');
        const resultEl = document.getElementById('editLookupResult');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...';
        resultEl.style.display = 'none';

        try {
            const cid    = getEffectiveComplexId();
            const params = new URLSearchParams({ complexId: cid, dong, ho });
            if (phone) params.append('phone', phone);

            const res  = await fetch(`/api/cancellations/lookup-programs?${params}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || '조회 실패');

            const list = json.data || [];
            if (!list.length) {
                resultEl.style.display = 'block';
                resultEl.innerHTML = `<div style="color:#dc2626;font-size:.82rem;padding:6px 0">
                    <i class="fas fa-exclamation-circle"></i> ${dong}동 ${ho}호에 수강 중인 프로그램이 없습니다.
                </div>`;
                return;
            }

            // 프로그램 선택 버튼 목록 렌더링
            const btns = list.map(p => {
                const timeLabel = p.preferred_time ? ` (${p.preferred_time})` : '';
                const already   = p.already_cancelled;
                // already_cancelled여도 항상 선택 가능 (관리자 수정 목적)
                return `<button
                    onclick="cancellations._applyEditLookup('${escHtml(p.program_name)}','${escHtml(p.preferred_time||'')}','${p.application_id||''}')"
                    style="display:block;width:100%;text-align:left;padding:8px 12px;margin-bottom:4px;
                           border:1.5px solid ${already ? '#f59e0b' : '#0ea5e9'};border-radius:7px;
                           background:${already ? '#fffbeb' : '#f0f9ff'};
                           color:${already ? '#92400e' : '#0c4a6e'};font-size:.85rem;font-weight:600;cursor:pointer">
                    <i class="fas fa-${already ? 'exclamation-triangle' : 'check-circle'}" style="margin-right:6px;color:${already ? '#f59e0b' : '#0ea5e9'}"></i>
                    ${escHtml(p.program_name)}${escHtml(timeLabel)}
                    ${already ? ' <span style="font-size:.73rem;color:#b45309">(해지 접수됨 — 클릭하여 선택 가능)</span>' : ''}
                </button>`;
            }).join('');

            resultEl.style.display = 'block';
            resultEl.innerHTML = `
                <div style="font-size:.78rem;color:#059669;font-weight:600;margin-bottom:6px">
                    <i class="fas fa-check-circle"></i> ${json.data[0]?.name || ''} — 수강 중 ${list.length}개 프로그램
                </div>
                ${btns}`;
        } catch(e) {
            resultEl.style.display = 'block';
            resultEl.innerHTML = `<div style="color:#dc2626;font-size:.82rem">
                <i class="fas fa-exclamation-triangle"></i> 조회 오류: ${e.message}
            </div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-search"></i> 동/호수로 수강 목록 조회 후 선택';
        }
    },

    // 수강 목록에서 선택 → 프로그램명/시간 input에 자동 채움
    _applyEditLookup(programName, preferredTime, applicationId) {
        const pEl = document.getElementById('editProgramName');
        const tEl = document.getElementById('editPreferredTime');
        if (pEl) pEl.value = programName;
        if (tEl) tEl.value = preferredTime;
        // 선택 결과 영역에 확인 표시
        const resultEl = document.getElementById('editLookupResult');
        if (resultEl) {
            resultEl.innerHTML = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;
                padding:7px 10px;font-size:.82rem;color:#166534;font-weight:600">
                <i class="fas fa-check-circle"></i> 선택됨: ${escHtml(programName)}${preferredTime ? ' (' + escHtml(preferredTime) + ')' : ''}
                <span style="font-size:.72rem;font-weight:400;color:#6b7280;margin-left:6px">위 저장 버튼으로 저장하세요</span>
            </div>`;
        }
        // application_id를 hidden으로 기억
        let hidEl = document.getElementById('editApplicationId');
        if (!hidEl) {
            hidEl = document.createElement('input');
            hidEl.type = 'hidden'; hidEl.id = 'editApplicationId';
            document.body.appendChild(hidEl);
        }
        hidEl.value = applicationId || '';
    },

    // ── 상세 모달: 수정 내용 저장 ────────────────────────────────────────
    async _saveDetailEdit(id) {
        const dong        = (document.getElementById('editDong')?.value        || '').trim();
        const ho          = (document.getElementById('editHo')?.value          || '').trim();
        const name        = (document.getElementById('editName')?.value        || '').trim();
        const phone       = (document.getElementById('editPhone')?.value       || '').trim();
        const programName = (document.getElementById('editProgramName')?.value || '').trim();
        const prefTime    = (document.getElementById('editPreferredTime')?.value|| '').trim();
        const reason      = (document.getElementById('editReason')?.value      || '').trim();
        const appId       = document.getElementById('editApplicationId')?.value || null;

        if (!dong || !ho || !name) { showToast('동, 호수, 이름은 필수입니다', 'error'); return; }

        try {
            const payload = { dong, ho, name, phone, reason };
            if (programName) payload.program_name   = programName;
            if (prefTime)    payload.preferred_time = prefTime;
            if (appId)       payload.application_id = appId;

            await API.cancellations.update(id, payload);

            // 로컬 data 즉시 갱신
            const item = this.data.find(x => x.id === id);
            if (item) Object.assign(item, payload);

            showToast('수정 내용이 저장되었습니다', 'success');
            closeGlobalModal();
            await this.load(this.currentStatus);
        } catch(e) {
            showToast('저장 실패: ' + e.message, 'error');
        }
    },

    async updateStatus(id, status) {
        try {
            const result = await API.cancellations.update(id, { status });
            closeGlobalModal();

            // 해지 승인 시: applications 자동 해지 처리 결과 안내
            if (status === 'approved') {
                const appCancel = result?.app_cancel;
                if (appCancel && appCancel.success) {
                    showToast(`해지 승인 완료 — 신청 목록에서도 자동 해지 처리되었습니다 ✓`, 'success');
                } else if (appCancel && !appCancel.success) {
                    // 승인은 됐지만 applications 자동 처리 실패 → 경고
                    showToast(`해지 승인 완료 (신청 목록 자동 해지 처리 실패 — 수동 확인 필요)`, 'warning');
                } else {
                    // application_id 없는 경우 (관리자 직접 등록 등)
                    showToast(`해지 승인 완료 (신청 목록 연결 없음)`, 'success');
                }
            } else {
                showToast(`"${statusLabel(status)}" 처리되었습니다`);
            }

            await this.load(this.currentStatus);
            loadBadges();
        } catch(e) { showToast('처리 실패: ' + e.message, 'error'); }
    },

    // ── 이미 승인된 해지 건의 신청 관리 해지 처리 (수동 동기화) ──────────
    async syncApplicationCancel(id) {
        const c = this.data.find(x => x.id === id);
        if (!c) return;

        const who = `${c.dong || ''}동 ${c.ho || ''}호 ${c.name || ''}`;
        if (!confirm(`[${who}]\n신청 관리 목록에서 해지 처리를 진행하시겠습니까?\n\n해당 수강 신청의 상태가 "해지"로 변경됩니다.`)) return;

        try {
            // status는 변경 없이 application_id 연동 처리만 트리거
            // → 서버에서 approved 상태 유지하면서 applications만 cancelled 처리
            const result = await API.cancellations.update(id, { status: 'approved' });
            const appCancel = result?.app_cancel;

            if (appCancel && appCancel.success) {
                showToast(`신청 관리 해지 처리 완료 ✓ (${appCancel.name || ''})`, 'success');
            } else if (appCancel && !appCancel.success) {
                // 매칭 실패 — 직접 안내
                showToast(
                    `자동 매칭 실패.\n\n신청 관리 메뉴에서 "${who}" 을(를) 직접 찾아 상태를 "해지"로 변경해 주세요.`,
                    'warning'
                );
            } else {
                showToast('처리되었습니다', 'success');
            }
            closeGlobalModal();
            await this.load(this.currentStatus);
        } catch(e) { showToast('처리 실패: ' + e.message, 'error'); }
    },

    // ── 해지 관리비 부과 모달 ────────────────────────────────
    showBillingModal(id) {
        const c = this.data.find(x => x.id === id);
        if (!c) return;

        // KST 기준 오늘 날짜
        const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        const todayStr = nowKst.toISOString().slice(0, 10);
        const thisMonth = nowKst.toISOString().slice(0, 7);

        const billingAmount = c.billing_amount || 0;
        const attendedSessions = c.attended_sessions || 0;
        const totalSessions = c.total_sessions_in_month || 0;
        const sessionFee = c.session_fee || 0;

        const body = `
            <div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:.82rem;color:#92400e">
                <i class="fas fa-info-circle"></i>
                <strong>관리비 부과 기준:</strong> 해지 처리 월의 실제 수강 횟수 × 1회 단가<br>
                <small>예) 4월 해지 처리 → 4월 수강 횟수 × 단가 = 청구 금액 → 5월 관리비에 부과</small>
            </div>
            <div class="detail-grid">
                <div class="detail-row"><label>이름</label><span>${c.name}</span></div>
                <div class="detail-row"><label>동/호수</label><span>${c.dong} ${c.ho}</span></div>
                <div class="detail-row"><label>프로그램</label><span>${c.program_name || '-'}</span></div>
                <div class="detail-row">
                    <label>해지 처리 월 <span style="color:#dc2626">*</span></label>
                    <input type="month" id="billingMonth" value="${c.termination_month || thisMonth}"
                           style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:.85rem;width:100%">
                </div>
                <div class="detail-row">
                    <label>해지 처리 날짜</label>
                    <input type="date" id="billingTermDate" value="${c.termination_date || todayStr}"
                           style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:.85rem;width:100%">
                </div>
                <div class="detail-row">
                    <label>해당 월 수강 횟수</label>
                    <input type="number" id="billingAttended" value="${attendedSessions}" min="0" max="31"
                           oninput="cancellations._calcBilling()"
                           style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:.85rem;width:100%"
                           placeholder="예) 8">
                </div>
                <div class="detail-row">
                    <label>해당 월 총 수업 횟수</label>
                    <input type="number" id="billingTotal" value="${totalSessions}" min="0" max="31"
                           style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:.85rem;width:100%"
                           placeholder="예) 12">
                </div>
                <div class="detail-row">
                    <label>1회 수강료 단가 (원)</label>
                    <input type="number" id="billingSessionFee" value="${sessionFee}" min="0" step="1000"
                           oninput="cancellations._calcBilling()"
                           style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:.85rem;width:100%"
                           placeholder="예) 25000">
                </div>
                <div class="detail-row full">
                    <label>계산된 청구 금액</label>
                    <div id="billingCalcResult" style="background:#f0fdf4;border:2px solid #22c55e;border-radius:8px;
                         padding:12px;text-align:center;font-size:1.2rem;font-weight:700;color:#15803d">
                        ₩${billingAmount.toLocaleString()}
                    </div>
                    <small style="color:#6b7280;margin-top:4px;display:block">수강 횟수 × 단가 자동 계산 | 아래에서 직접 수정 가능</small>
                </div>
                <div class="detail-row full">
                    <label>청구 금액 직접 입력 (원)</label>
                    <input type="number" id="billingAmount" value="${billingAmount}" min="0" step="1000"
                           style="border:1.5px solid #4f46e5;border-radius:6px;padding:8px;font-size:1rem;font-weight:700;width:100%"
                           placeholder="금액 직접 입력 가능">
                </div>
                <div class="detail-row full">
                    <label>청구 메모</label>
                    <textarea id="billingMemo" rows="2"
                              style="border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:.85rem;width:100%;resize:vertical"
                              placeholder="관리비 청구 관련 메모 (선택)">${c.billing_memo || ''}</textarea>
                </div>
                <div class="detail-row full">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                        <input type="checkbox" id="billingProcessed" ${c.billing_processed ? 'checked' : ''}
                               style="width:16px;height:16px;accent-color:#4f46e5">
                        <span>관리비 청구 완료 처리</span>
                    </label>
                </div>
            </div>`;

        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="cancellations.saveBilling('${id}')">
                <i class="fas fa-save"></i> 저장
            </button>`;

        openGlobalModal('<i class="fas fa-won-sign"></i> 관리비 부과 설정', body, footer);
    },

    /** 수강 횟수 × 단가 자동 계산 */
    _calcBilling() {
        const attended = parseInt(document.getElementById('billingAttended')?.value) || 0;
        const fee = parseInt(document.getElementById('billingSessionFee')?.value) || 0;
        const calc = attended * fee;
        const resultEl = document.getElementById('billingCalcResult');
        const amountEl = document.getElementById('billingAmount');
        if (resultEl) resultEl.textContent = `₩${calc.toLocaleString()}`;
        if (amountEl) amountEl.value = calc;
    },

    async saveBilling(id) {
        try {
            const payload = {
                termination_month:        document.getElementById('billingMonth')?.value || null,
                termination_date:         document.getElementById('billingTermDate')?.value || null,
                attended_sessions:        parseInt(document.getElementById('billingAttended')?.value) || 0,
                total_sessions_in_month:  parseInt(document.getElementById('billingTotal')?.value) || 0,
                session_fee:              parseInt(document.getElementById('billingSessionFee')?.value) || 0,
                billing_amount:           parseInt(document.getElementById('billingAmount')?.value) || 0,
                billing_memo:             document.getElementById('billingMemo')?.value || null,
                billing_processed:        document.getElementById('billingProcessed')?.checked || false,
            };
            await API.cancellations.update(id, payload);
            closeGlobalModal();
            showToast('관리비 부과 정보가 저장되었습니다');
            await this.load(this.currentStatus);
        } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
    },

    // ══════════════════════════════════════════════════════════
    // 관리자용 해지신청 등록 모달
    // ══════════════════════════════════════════════════════════
    _newCancelLookupResult: [],  // 조회된 수강 프로그램 목록

    openNewCancelModal() {
        this._newCancelLookupResult = [];
        const body = `
          <div style="margin-bottom:14px;background:#fef9e7;border:1.5px solid #f39c12;border-radius:10px;
               padding:11px 14px;font-size:.8rem;color:#7d5a00;line-height:1.6">
            <i class="fas fa-info-circle"></i>
            관리자는 기간 제한 없이 해지 신청을 등록할 수 있습니다.<br>
            동·호수·전화번호로 수강자를 조회한 뒤 프로그램을 선택하세요.
          </div>

          <!-- STEP 1: 본인 확인 조회 -->
          <div id="adminCancelStep1" style="background:#f0f9ff;border:1.5px solid #3b82f6;border-radius:10px;padding:14px;margin-bottom:12px">
            <div style="font-weight:700;font-size:.88rem;color:#1e40af;margin-bottom:10px">
              <i class="fas fa-search"></i> STEP 1 — 수강자 조회
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
              <div>
                <label style="font-size:.8rem;font-weight:600;color:#374151;display:block;margin-bottom:4px">동 <span style="color:#dc2626">*</span></label>
                <input type="text" id="adminCancelDong" placeholder="예: 101" inputmode="numeric"
                  style="width:100%;padding:8px 10px;border:1.5px solid #93c5fd;border-radius:7px;font-size:.9rem;box-sizing:border-box"
                  oninput="cancellations._resetAdminLookup()">
              </div>
              <div>
                <label style="font-size:.8rem;font-weight:600;color:#374151;display:block;margin-bottom:4px">호수 <span style="color:#dc2626">*</span></label>
                <input type="text" id="adminCancelHo" placeholder="예: 1001" inputmode="numeric"
                  style="width:100%;padding:8px 10px;border:1.5px solid #93c5fd;border-radius:7px;font-size:.9rem;box-sizing:border-box"
                  oninput="cancellations._resetAdminLookup()">
              </div>
            </div>
            <div style="margin-bottom:10px">
              <label style="font-size:.8rem;font-weight:600;color:#374151;display:block;margin-bottom:4px">전화번호</label>
              <input type="tel" id="adminCancelPhone" placeholder="010-0000-0000"
                style="width:100%;padding:8px 10px;border:1.5px solid #93c5fd;border-radius:7px;font-size:.9rem;box-sizing:border-box"
                oninput="cancellations._resetAdminLookup()">
            </div>
            <button id="adminCancelLookupBtn" onclick="cancellations._lookupAdminCancelPrograms()"
              style="width:100%;padding:10px;background:#3b82f6;color:#fff;border:none;border-radius:7px;
                     font-size:.9rem;font-weight:700;cursor:pointer">
              <i class="fas fa-search"></i> 수강 중인 프로그램 조회
            </button>
            <div id="adminCancelLookupMsg" style="margin-top:8px;font-size:.82rem;display:none"></div>
          </div>

          <!-- STEP 2: 프로그램 선택 + 사유 (조회 후 표시) -->
          <div id="adminCancelStep2" style="display:none;background:#f0fdf4;border:1.5px solid #22c55e;border-radius:10px;padding:14px">
            <div style="font-weight:700;font-size:.88rem;color:#166534;margin-bottom:10px">
              <i class="fas fa-check-circle"></i> STEP 2 — 프로그램 선택
            </div>
            <div id="adminCancelPersonInfo" style="font-size:.83rem;color:#374151;margin-bottom:10px;
                 background:#fff;border-radius:6px;padding:8px 10px;border:1px solid #d1fae5"></div>
            <div style="margin-bottom:10px">
              <label style="font-size:.8rem;font-weight:600;color:#374151;display:block;margin-bottom:4px">해지할 프로그램 <span style="color:#dc2626">*</span></label>
              <select id="adminCancelProgram"
                style="width:100%;padding:9px 10px;border:1.5px solid #22c55e;border-radius:7px;
                       font-size:.9rem;font-weight:600;box-sizing:border-box">
                <option value="">-- 선택 --</option>
              </select>
            </div>
            <div>
              <label style="font-size:.8rem;font-weight:600;color:#374151;display:block;margin-bottom:4px">해지 사유</label>
              <textarea id="adminCancelReason" rows="3" placeholder="해지 사유 (선택 입력)"
                style="width:100%;padding:8px 10px;border:1.5px solid #d1d5db;border-radius:7px;
                       font-size:.88rem;resize:vertical;box-sizing:border-box"></textarea>
            </div>
          </div>`;

        const footer = `
          <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
          <button class="btn-primary" id="adminCancelSubmitBtn"
            onclick="cancellations._submitAdminCancel()"
            style="display:none">
            <i class="fas fa-check"></i> 해지 신청 등록
          </button>`;

        openGlobalModal('<i class="fas fa-plus-circle"></i> 해지 신청 등록 (관리자)', body, footer);
    },

    _resetAdminLookup() {
        this._newCancelLookupResult = [];
        document.getElementById('adminCancelStep2').style.display = 'none';
        const submitBtn = document.getElementById('adminCancelSubmitBtn');
        if (submitBtn) submitBtn.style.display = 'none';
        const msg = document.getElementById('adminCancelLookupMsg');
        if (msg) { msg.style.display = 'none'; msg.innerHTML = ''; }
        const sel = document.getElementById('adminCancelProgram');
        if (sel) sel.innerHTML = '<option value="">-- 선택 --</option>';
        const reasonEl = document.getElementById('adminCancelReason');
        if (reasonEl) reasonEl.value = '';
    },

    async _lookupAdminCancelPrograms() {
        const dong  = (document.getElementById('adminCancelDong')?.value  || '').trim();
        const ho    = (document.getElementById('adminCancelHo')?.value    || '').trim();
        const phone = (document.getElementById('adminCancelPhone')?.value || '').trim();

        if (!dong || !ho) { showToast('동과 호수를 입력하세요', 'error'); return; }

        const btn = document.getElementById('adminCancelLookupBtn');
        const msg = document.getElementById('adminCancelLookupMsg');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 조회 중...';
        msg.style.display = 'none';

        try {
            const cid  = getEffectiveComplexId();
            const params = new URLSearchParams({ complexId: cid, dong, ho });
            if (phone) params.append('phone', phone);

            const res  = await fetch(`/api/cancellations/lookup-programs?${params}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || '조회 실패');

            const list          = json.data || [];
            const phoneMismatch = !!json.phone_mismatch;
            const phoneHint     = json.registered_phone_hint || '';
            this._newCancelLookupResult = list;

            if (!list.length) {
                msg.style.display = 'block';
                msg.style.color   = '#dc2626';
                msg.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${dong}동 ${ho}호에 수강 중인 프로그램을 찾을 수 없습니다.`;
                document.getElementById('adminCancelStep2').style.display = 'none';
                const submitBtn = document.getElementById('adminCancelSubmitBtn');
                if (submitBtn) submitBtn.style.display = 'none';
                return;
            }

            // 전화번호 불일치 경고 (관리자는 조회 진행 허용, 단 경고 표시)
            if (phoneMismatch) {
                msg.style.display = 'block';
                msg.style.color   = '#d97706';
                const hintText = phoneHint
                    ? `DB 등록 번호: <strong>${phoneHint}</strong>`
                    : '등록된 번호와 다릅니다';
                msg.innerHTML = `<i class="fas fa-exclamation-triangle"></i>
                    <strong>전화번호 불일치</strong> — ${hintText}<br>
                    <small style="color:#555">관리자 권한으로 조회 진행합니다.</small>`;
            } else {
                msg.style.display = 'none';
            }

            // 본인 정보 표시
            const person = list[0];
            const infoEl = document.getElementById('adminCancelPersonInfo');
            const phoneDisplay = phoneMismatch && phoneHint
                ? `<span style="color:#d97706">${phoneHint} <small>(불일치)</small></span>`
                : (person.phone || phone || '-');
            infoEl.innerHTML = `
              <span style="font-weight:700;color:#111">${person.name || '?'}</span>
              <span style="color:#6b7280;margin:0 6px">|</span>
              <span>${dong}동 ${ho}호</span>
              <span style="color:#6b7280;margin:0 6px">|</span>
              <span>${phoneDisplay}</span>
              <span style="display:block;margin-top:4px;font-size:.78rem;color:#059669">
                <i class="fas fa-check-circle"></i> 수강 중 ${list.length}개 프로그램 확인
              </span>`;

            // 드롭다운 채우기
            const sel = document.getElementById('adminCancelProgram');
            sel.innerHTML = '<option value="">-- 해지할 프로그램 선택 --</option>';
            list.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.application_id;
                opt.dataset.programName   = p.program_name;
                opt.dataset.preferredTime = p.preferred_time || '';
                opt.dataset.applicationId = p.application_id;
                const timeLabel = p.preferred_time ? ` (${p.preferred_time})` : '';
                if (p.already_cancelled) {
                    opt.textContent = `${p.program_name}${timeLabel} — 이미 해지 접수됨`;
                    opt.disabled    = true;
                    opt.style.color = '#9ca3af';
                } else {
                    opt.textContent = `${p.program_name}${timeLabel}`;
                }
                sel.appendChild(opt);
            });

            // 조회 가능한 것 1개면 자동 선택
            const available = list.filter(p => !p.already_cancelled);
            if (available.length === 1) {
                const onlyOpt = Array.from(sel.options).find(o => !o.disabled && o.value);
                if (onlyOpt) onlyOpt.selected = true;
            }

            document.getElementById('adminCancelStep2').style.display = 'block';
            const submitBtn = document.getElementById('adminCancelSubmitBtn');
            if (submitBtn) submitBtn.style.display = '';

        } catch(e) {
            msg.style.display = 'block';
            msg.style.color   = '#dc2626';
            msg.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 조회 오류: ${e.message}`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-search"></i> 수강 중인 프로그램 조회';
        }
    },

    async _submitAdminCancel() {
        const sel    = document.getElementById('adminCancelProgram');
        const reason = (document.getElementById('adminCancelReason')?.value || '').trim();
        const dong   = (document.getElementById('adminCancelDong')?.value  || '').trim();
        const ho     = (document.getElementById('adminCancelHo')?.value    || '').trim();

        if (!sel?.value) { showToast('해지할 프로그램을 선택하세요', 'error'); return; }

        const selectedOpt   = sel.options[sel.selectedIndex];
        const programName   = selectedOpt.dataset.programName  || sel.value;
        const applicationId = selectedOpt.dataset.applicationId || null;
        const person = this._newCancelLookupResult.find(p => p.application_id === sel.value)
                       || this._newCancelLookupResult[0] || {};

        const submitBtn = document.getElementById('adminCancelSubmitBtn');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 등록 중...'; }

        try {
            const preferredTime = selectedOpt.dataset.preferredTime || '';
            await API.cancellations.create({
                complex_id:     getEffectiveComplexId(),
                application_id: applicationId,
                source:         'admin',
                dong, ho,
                name:           person.name  || '',
                phone:          person.phone || (document.getElementById('adminCancelPhone')?.value || '').trim(),
                program_name:   programName,
                preferred_time: preferredTime,
                reason:         reason || '관리자 등록',
                request_type:   'cancel',
            });
            closeGlobalModal();
            showToast(`✅ ${person.name || dong + ' ' + ho} — ${programName} 해지 신청 등록 완료`, 'success');
            await this.load(this.currentStatus);
            loadBadges();
        } catch(e) {
            showToast('등록 실패: ' + e.message, 'error');
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-check"></i> 해지 신청 등록'; }
        }
    },

    /** 해지 관리비 현황 내보내기 (CSV) — 현재 탭이 cancel이어야 의미 있음 */
    async exportBillingCSV() {
        // 현재 탭이 refund면 cancel 탭 데이터를 별도로 조회
        let cancelList;
        if (this.currentTab !== 'cancel') {
            try {
                const res = await API.cancellations.list({ complexId: getEffectiveComplexId(), request_type: 'cancel', status: 'approved' });
                cancelList = (res.data || []).filter(c => c.request_type !== 'refund');
            } catch(e) { showToast('데이터 조회 실패: ' + e.message, 'error'); return; }
        } else {
            cancelList = this.data.filter(c => c.request_type !== 'refund' && c.status === 'approved');
        }
        if (!cancelList.length) { showToast('승인된 해지 건이 없습니다', 'error'); return; }

        const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        const headers = [
            '해지월', '이름', '동', '호수', '전화번호', '프로그램',
            '해지처리날짜', '수강횟수', '총수업횟수', '수강료단가', '청구금액',
            '청구메모', '청구완료여부', '신청일'
        ];
        const rows = cancelList.map(c => ({
            '해지월': c.termination_month || '',
            '이름': c.name,
            '동': c.dong,
            '호수': c.ho,
            '전화번호': fmtPhone(c.phone),
            '프로그램': c.program_name || '',
            '해지처리날짜': c.termination_date || '',
            '수강횟수': c.attended_sessions ?? '',
            '총수업횟수': c.total_sessions_in_month ?? '',
            '수강료단가': c.session_fee ?? '',
            '청구금액': c.billing_amount ?? '',
            '청구메모': c.billing_memo || '',
            '청구완료여부': c.billing_processed ? '완료' : '미처리',
            '신청일': formatDate(c.created_at),
        }));
        downloadCSV(`해지관리비_${nowKst.toISOString().slice(0,7)}.csv`, rows, headers);
        showToast(`${rows.length}건 CSV 다운로드 완료`);
    },

    /** ── 해지·환불 목록 전체 XLSX 추출 ─────────────────────────────
     *  차월해지 / 중도해지 / 환불 신청을 시트 3개로 분리해서 .xlsx 저장
     */
    async exportListExcel() {
        const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        const TYPE_LABEL   = { cancel: '차월 해지', mid_cancel: '중도 해지', refund: '환불 신청' };
        const STATUS_LABEL = { pending: '대기중', approved: '승인', rejected: '거부' };

        // ── 1. SheetJS 로드 ──────────────────────────────────────────
        await new Promise((resolve, reject) => {
            if (window.XLSX) { resolve(); return; }
            const s = document.createElement('script');
            s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
            s.onload  = resolve;
            s.onerror = () => reject(new Error('SheetJS 로드 실패'));
            document.head.appendChild(s);
        });
        const XLSX = window.XLSX;

        // ── 2. 전체 데이터 조회 ──────────────────────────────────────
        let cancelList = [], midList = [], refundList = [];
        try {
            showToast('데이터 조회 중...', 'info');
            const cxId = getEffectiveComplexId();
            const [r1, r2, r3] = await Promise.all([
                API.cancellations.list({ complexId: cxId, request_type: 'cancel' }),
                API.cancellations.list({ complexId: cxId, request_type: 'mid_cancel' }),
                API.cancellations.list({ complexId: cxId, request_type: 'refund' }),
            ]);
            cancelList = (r1.data || []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            midList    = (r2.data || []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            refundList = (r3.data || []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        } catch(e) {
            showToast('데이터 조회 실패: ' + e.message, 'error');
            return;
        }
        const total = cancelList.length + midList.length + refundList.length;
        if (!total) { showToast('내보낼 데이터가 없습니다', 'error'); return; }

        // ── 3. 시트 생성 헬퍼 ────────────────────────────────────────
        const CANCEL_HEADERS = ['상태','이름','동','호수','전화번호','프로그램','희망시간','사유',
                                '해지적용예정일','해지처리월','해지처리날짜',
                                '수강횟수','총수업횟수','수강료단가','청구금액','청구완료','신청일','처리일'];
        const REFUND_HEADERS  = ['상태','이름','동','호수','전화번호','사유','환불금액','신청일','처리일'];

        const makeCancelRows = (list) => list.map(c => {
            const applyDate = this.calcApplyMonth(c.created_at) || '';
            return [
                STATUS_LABEL[c.status]  || c.status,
                c.name || '',
                c.dong || '',
                c.ho   || '',
                fmtPhone(c.phone),
                c.program_name  || '',
                c.preferred_time || '',
                c.reason || '',
                applyDate,
                c.termination_month  || '',
                c.termination_date   || '',
                c.attended_sessions  ?? '',
                c.total_sessions_in_month ?? '',
                c.session_fee        ?? '',
                c.billing_amount     ?? '',
                c.billing_processed  ? '완료' : (c.billing_amount > 0 ? '미처리' : ''),
                formatDate(c.created_at),
                c.processed_at ? formatDate(c.processed_at) : '',
            ];
        });

        const makeRefundRows = (list) => list.map(c => [
            STATUS_LABEL[c.status] || c.status,
            c.name || '',
            c.dong || '',
            c.ho   || '',
            fmtPhone(c.phone),
            c.reason || '',
            c.refund_amount || '',
            formatDate(c.created_at),
            c.processed_at ? formatDate(c.processed_at) : '',
        ]);

        // 헤더행 스타일 적용 헬퍼
        const styledSheet = (headers, dataRows, sheetTitle) => {
            const aoa = [headers, ...dataRows];
            const ws  = XLSX.utils.aoa_to_sheet(aoa);
            // 컬럼 너비 자동 설정
            ws['!cols'] = headers.map((h, i) => {
                const maxLen = Math.max(
                    h.length,
                    ...dataRows.map(r => String(r[i] ?? '').length)
                );
                return { wch: Math.min(Math.max(maxLen + 2, 8), 30) };
            });
            // 헤더 셀 굵게 + 배경색
            headers.forEach((_, c) => {
                const ref = XLSX.utils.encode_cell({ r: 0, c });
                if (!ws[ref]) return;
                ws[ref].s = {
                    font:    { bold: true, color: { rgb: 'FFFFFF' } },
                    fill:    { fgColor: { rgb: '4F46E5' } },
                    alignment: { horizontal: 'center' },
                };
            });
            return ws;
        };

        // ── 4. 워크북 조립 ────────────────────────────────────────────
        const wb = XLSX.utils.book_new();

        const ws1 = styledSheet(CANCEL_HEADERS, makeCancelRows(cancelList),  '차월 해지');
        const ws2 = styledSheet(CANCEL_HEADERS, makeCancelRows(midList),     '중도 해지');
        const ws3 = styledSheet(REFUND_HEADERS, makeRefundRows(refundList),  '환불 신청');

        XLSX.utils.book_append_sheet(wb, ws1, `🗓 차월 해지(${cancelList.length}건)`);
        XLSX.utils.book_append_sheet(wb, ws2, `✂️ 중도 해지(${midList.length}건)`);
        XLSX.utils.book_append_sheet(wb, ws3, `💸 환불 신청(${refundList.length}건)`);

        // ── 5. 파일 저장 ──────────────────────────────────────────────
        const dateStr  = nowKst.toISOString().slice(0, 10);
        const fileName = `해지환불목록_${dateStr}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showToast(`총 ${total}건 XLSX 다운로드 완료 (차월 ${cancelList.length} / 중도 ${midList.length} / 환불 ${refundList.length})`, 'success');
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
                    <p>${q.name} ${q.dong ? '| ' + q.dong + ' ' + q.ho : ''}${q.phone ? ' | <a href="tel:' + q.phone.replace(/[^\d+]/g,'') + '" onclick="event.stopPropagation()" style="color:#4f46e5;text-decoration:none;font-weight:600">' + q.phone + '</a>' : ''}</p>
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
                ${q.phone ? `<div class="detail-row"><label>연락처</label><span><a href="tel:${q.phone.replace(/[^\d+]/g,'')}" style="color:#4f46e5;font-weight:600;text-decoration:none"><i class="fas fa-phone" style="margin-right:4px"></i>${q.phone}</a></span></div>` : ''}
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
            '전화번호': fmtPhone(q.phone), '제목': q.title, '내용': q.content,
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
