/** 대시보드 페이지 v3.0 - 무인 피트니스 응대/접수/정산 시스템 */
const dashboard = {
    async render() {
        const isMaster = Admin.role === 'master';
        const selectedName = (isMaster && Admin.selectedComplexName && Admin.selectedComplexId)
            ? ` — ${Admin.selectedComplexName}` : '';
        const isAllView = isMaster && !Admin.selectedComplexId;

        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-chart-pie"></i> ${isAllView ? '통합 대시보드' : '대시보드' + selectedName}</h2>
                <div class="header-actions">
                    ${isAllView ? '<span class="dash-view-badge"><i class="fas fa-city"></i> 전체 단지 통합</span>' : ''}
                    <button class="btn-secondary btn-sm" onclick="dashboard.render()">
                        <i class="fas fa-sync"></i> 새로고침
                    </button>
                </div>
            </div>

            <!-- KPI 카드 그리드 -->
            <div id="dashKpiGrid" class="kpi-grid">
                <div class="kpi-card kpi-loading"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
            </div>

            <!-- 마스터 전체 보기: 단지별 카드 그리드 -->
            ${isAllView ? '<div id="complexCardsSection"></div>' : ''}

            <!-- 최근 활동 패널 -->
            <div class="dash-grid" style="margin-top:16px">
                <div class="dash-panel">
                    <div class="panel-header">
                        <h4><i class="fas fa-clock"></i> 최근 신청</h4>
                        <button class="panel-btn" onclick="navigate('applications')">전체보기</button>
                    </div>
                    <div id="recentApps" class="panel-body"></div>
                </div>
                <div class="dash-panel">
                    <div class="panel-header">
                        <h4><i class="fas fa-question-circle"></i> 미답변 문의</h4>
                        <button class="panel-btn" onclick="navigate('inquiries')">전체보기</button>
                    </div>
                    <div id="unansweredInq" class="panel-body"></div>
                </div>
                <div class="dash-panel">
                    <div class="panel-header">
                        <h4><i class="fas fa-ban"></i> 해지 대기</h4>
                        <button class="panel-btn" onclick="navigate('cancellations')">전체보기</button>
                    </div>
                    <div id="pendingCancels" class="panel-body"></div>
                </div>
                <div class="dash-panel">
                    <div class="panel-header">
                        <h4><i class="fas fa-link"></i> 입주민 바로가기</h4>
                    </div>
                    <div id="complexLinksPanel" class="panel-body" style="padding:12px"></div>
                </div>
            </div>`;

        await Promise.all([
            this.loadKpi(),
            this.loadRecent(),
            this.loadPendingCancels(),
            this.loadComplexLinks(),
            isAllView ? this.loadComplexCards() : Promise.resolve()
        ]);
    },

    /* ── KPI 카드 ───────────────────────────────────────────────────── */
    async loadKpi() {
        try {
            const effId = getEffectiveComplexId();
            const params = effId ? { complexId: effId } : {};
            const res = await API.stats.dashboard(params);
            const s = res.data;

            // 승인율 계산
            const approveRate = s.totalApps > 0
                ? Math.round((s.approved / s.totalApps) * 100)
                : 0;

            // 대기 비율 (처리 필요)
            const urgentCount = s.waiting + s.pendingCancel + s.unanswered;

            document.getElementById('dashKpiGrid').innerHTML = `
                <!-- Row 1: 핵심 접수 지표 -->
                <div class="kpi-card kpi-blue">
                    <div class="kpi-icon"><i class="fas fa-file-signature"></i></div>
                    <div class="kpi-body">
                        <div class="kpi-value">${s.totalApps}</div>
                        <div class="kpi-label">전체 신청</div>
                        <div class="kpi-sub">누적 총계</div>
                    </div>
                </div>
                <div class="kpi-card kpi-green">
                    <div class="kpi-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="kpi-body">
                        <div class="kpi-value">${s.approved}</div>
                        <div class="kpi-label">승인 완료</div>
                        <div class="kpi-sub">승인율 ${approveRate}%</div>
                    </div>
                </div>
                <div class="kpi-card kpi-yellow">
                    <div class="kpi-icon"><i class="fas fa-hourglass-half"></i></div>
                    <div class="kpi-body">
                        <div class="kpi-value">${s.waiting}</div>
                        <div class="kpi-label">승인 대기</div>
                        <div class="kpi-sub ${s.waiting > 0 ? 'kpi-sub-warn' : ''}">
                            ${s.waiting > 0 ? '⚠ 처리 필요' : '대기 없음'}
                        </div>
                    </div>
                </div>
                <div class="kpi-card kpi-red">
                    <div class="kpi-icon"><i class="fas fa-times-circle"></i></div>
                    <div class="kpi-body">
                        <div class="kpi-value">${s.rejected}</div>
                        <div class="kpi-label">거부</div>
                        <div class="kpi-sub">미승인 건수</div>
                    </div>
                </div>

                <!-- Row 2: 해지 / 문의 / 정산 -->
                <div class="kpi-card kpi-orange">
                    <div class="kpi-icon"><i class="fas fa-ban"></i></div>
                    <div class="kpi-body">
                        <div class="kpi-value">${s.pendingCancel}</div>
                        <div class="kpi-label">해지 대기</div>
                        <div class="kpi-sub ${s.pendingCancel > 0 ? 'kpi-sub-warn' : ''}">
                            ${s.pendingCancel > 0 ? '⚠ 처리 필요' : '없음'}
                        </div>
                    </div>
                </div>
                <div class="kpi-card kpi-purple">
                    <div class="kpi-icon"><i class="fas fa-comments"></i></div>
                    <div class="kpi-body">
                        <div class="kpi-value">${s.unanswered}</div>
                        <div class="kpi-label">미답변 문의</div>
                        <div class="kpi-sub ${s.unanswered > 0 ? 'kpi-sub-warn' : ''}">
                            ${s.unanswered > 0 ? '⚠ 답변 필요' : '모두 답변됨'}
                        </div>
                    </div>
                </div>
                <div class="kpi-card kpi-teal">
                    <div class="kpi-icon"><i class="fas fa-exclamation-triangle"></i></div>
                    <div class="kpi-body">
                        <div class="kpi-value">${urgentCount}</div>
                        <div class="kpi-label">처리 필요</div>
                        <div class="kpi-sub ${urgentCount > 0 ? 'kpi-sub-warn' : ''}">
                            ${urgentCount > 0 ? '즉시 처리 권고' : '처리 완료'}
                        </div>
                    </div>
                </div>
                <div class="kpi-card kpi-indigo">
                    <div class="kpi-icon"><i class="fas fa-users"></i></div>
                    <div class="kpi-body">
                        <div class="kpi-value">${s.approved}</div>
                        <div class="kpi-label">현재 수강생</div>
                        <div class="kpi-sub">활성 멤버</div>
                    </div>
                </div>`;

            loadBadges();
        } catch (e) {
            document.getElementById('dashKpiGrid').innerHTML = `<p class="error-hint"><i class="fas fa-exclamation-circle"></i> 통계 로드 실패: ${e.message}</p>`;
        }
    },

    /* ── 마스터 전용: 단지별 카드 그리드 ───────────────────────────── */
    async loadComplexCards() {
        const section = document.getElementById('complexCardsSection');
        if (!section) return;
        section.innerHTML = `
            <div class="complex-cards-header">
                <h3><i class="fas fa-city"></i> 단지별 현황</h3>
                <button class="btn-primary btn-sm" onclick="navigate('complexes')">
                    <i class="fas fa-cog"></i> 단지 관리
                </button>
            </div>
            <div id="complexCardsGrid" class="complex-cards-grid">
                <div class="loading-mini"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
            </div>`;

        try {
            const res = await API.complexes.list();
            const list = res.data || [];
            const grid = document.getElementById('complexCardsGrid');
            if (!list.length) { grid.innerHTML = '<p class="empty-hint">등록된 단지 없음</p>'; return; }

            // 각 단지 통계 병렬 로드
            const statsResults = await Promise.allSettled(
                list.map(cx => API.stats.dashboard({ complexId: cx.id }).catch(() => null))
            );

            const origin = window.location.origin;
            grid.innerHTML = list.map((cx, i) => {
                const st = statsResults[i].status === 'fulfilled' && statsResults[i].value
                    ? statsResults[i].value.data : null;
                const url = `${origin}/?complex=${cx.code}`;
                const urgentCount = st ? (st.waiting + st.pendingCancel + st.unanswered) : 0;
                const urgentClass = urgentCount > 0 ? 'complex-card-urgent' : '';

                return `
                    <div class="complex-card ${urgentClass}">
                        <div class="complex-card-top">
                            <div class="complex-card-info">
                                <div class="complex-card-name">${escHtml(cx.name)}</div>
                                <div class="complex-card-addr">${escHtml(cx.address || cx.code)}</div>
                            </div>
                            <span class="complex-card-status ${cx.is_active ? 'status-active' : 'status-inactive'}">
                                ${cx.is_active ? '운영 중' : '비활성'}
                            </span>
                        </div>

                        ${st ? `
                        <div class="complex-card-stats">
                            <div class="cstat"><span class="cstat-val ${st.waiting > 0 ? 'cstat-warn' : ''}">${st.waiting}</span><span class="cstat-label">대기</span></div>
                            <div class="cstat"><span class="cstat-val">${st.approved}</span><span class="cstat-label">승인</span></div>
                            <div class="cstat"><span class="cstat-val ${st.pendingCancel > 0 ? 'cstat-warn' : ''}">${st.pendingCancel}</span><span class="cstat-label">해지대기</span></div>
                            <div class="cstat"><span class="cstat-val ${st.unanswered > 0 ? 'cstat-warn' : ''}">${st.unanswered}</span><span class="cstat-label">미답변</span></div>
                        </div>
                        ${urgentCount > 0 ? `<div class="complex-card-alert"><i class="fas fa-exclamation-triangle"></i> 처리 필요 ${urgentCount}건</div>` : ''}
                        ` : '<div class="loading-mini" style="padding:8px"><i class="fas fa-spinner fa-spin"></i></div>'}

                        <div class="complex-card-actions">
                            <button class="btn-primary btn-sm" onclick="switchMasterComplex('${cx.id}');navigate('dashboard')">
                                <i class="fas fa-tachometer-alt"></i> 관리
                            </button>
                            <a href="${url}" target="_blank" class="btn-ghost btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px">
                                <i class="fas fa-external-link-alt"></i> 입주민 페이지
                            </a>
                        </div>
                    </div>`;
            }).join('');
        } catch(e) {
            const grid = document.getElementById('complexCardsGrid');
            if (grid) grid.innerHTML = `<p class="error-hint">단지 로드 실패: ${e.message}</p>`;
        }
    },

    /* ── 최근 신청 ─────────────────────────────────────────────────── */
    async loadRecent() {
        try {
            const effId = getEffectiveComplexId();
            const params = effId ? { complexId: effId } : {};
            const [appsRes, inqRes] = await Promise.all([
                API.applications.list({ ...params, limit: 5 }),
                API.inquiries.list({ ...params, isAdmin: 'true' })
            ]);

            const apps = appsRes.data || [];
            document.getElementById('recentApps').innerHTML = apps.length
                ? apps.map(a => `
                    <div class="recent-item" onclick="navigate('applications')">
                        <span class="status-dot dot-${statusClass(a.status)}"></span>
                        <div class="recent-info">
                            <strong>${escHtml(a.dong)} ${escHtml(a.ho)} ${escHtml(a.name)}</strong>
                            <small>${escHtml(a.program_name || '-')} | ${escHtml(a.preferred_time || '-')}</small>
                        </div>
                        <span class="status-badge status-${statusClass(a.status)}">${statusLabel(a.status)}</span>
                    </div>`).join('')
                : '<p class="empty-hint">신청 내역 없음</p>';

            const unanswered = (inqRes.data || []).filter(i => !i.answer).slice(0, 5);
            document.getElementById('unansweredInq').innerHTML = unanswered.length
                ? unanswered.map(q => `
                    <div class="recent-item" onclick="navigate('inquiries')">
                        <div class="recent-info">
                            <strong>${escHtml(q.title)}</strong>
                            <small>${escHtml(q.name)} | ${formatDate(q.created_at)}</small>
                        </div>
                        <i class="fas fa-chevron-right" style="color:#ccc;font-size:.8rem"></i>
                    </div>`).join('')
                : '<p class="empty-hint">미답변 문의 없음</p>';
        } catch (e) {}
    },

    /* ── 해지 대기 ─────────────────────────────────────────────────── */
    async loadPendingCancels() {
        try {
            const effId = getEffectiveComplexId();
            const params = { status: 'pending', limit: 5, ...(effId ? { complexId: effId } : {}) };
            const res = await API.cancellations.list(params);
            const items = res.data || [];
            document.getElementById('pendingCancels').innerHTML = items.length
                ? items.map(c => `
                    <div class="recent-item" onclick="navigate('cancellations')">
                        <div class="recent-info">
                            <strong>${escHtml(c.dong || '')} ${escHtml(c.ho || '')} ${escHtml(c.name || '')}</strong>
                            <small>${escHtml(c.program_name || '-')} | ${formatDate(c.created_at)}</small>
                        </div>
                        <span class="status-badge status-warning">대기</span>
                    </div>`).join('')
                : '<p class="empty-hint">해지 대기 없음</p>';
        } catch (e) {
            const el = document.getElementById('pendingCancels');
            if (el) el.innerHTML = '<p class="empty-hint">-</p>';
        }
    },

    /* ── 입주민 페이지 바로가기 ────────────────────────────────────── */
    async loadComplexLinks() {
        const panel = document.getElementById('complexLinksPanel');
        if (!panel) return;
        try {
            let complexList = [];
            if (Admin.role === 'master') {
                const effId = getMasterSelectedComplexId();
                const res = await API.complexes.list();
                const all = res.data || [];
                complexList = effId ? all.filter(c => c.id === effId) : all.slice(0, 3);
            } else if (Admin.complex?.id) {
                complexList = [Admin.complex];
            }
            if (!complexList.length) { panel.innerHTML = '<p class="empty-hint">등록된 단지 없음</p>'; return; }

            const origin = window.location.origin;
            panel.innerHTML = complexList.map(cx => {
                const url = `${origin}/?complex=${cx.code}`;
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=56x56&data=${encodeURIComponent(url)}`;
                return `
                    <div class="complex-link-card">
                        <img src="${qrUrl}" alt="QR" class="complex-link-qr">
                        <div class="complex-link-info">
                            <div class="complex-link-name">${escHtml(cx.name)}</div>
                            <div class="complex-link-code">/?complex=${escHtml(cx.code)}</div>
                        </div>
                        <div class="complex-link-actions">
                            <button class="btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${url}').then(()=>showToast('URL 복사됨'))">
                                <i class="fas fa-copy"></i>
                            </button>
                            <a href="${url}" target="_blank" class="btn-ghost btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        </div>
                    </div>`;
            }).join('');
        } catch(e) {
            panel.innerHTML = '<p class="empty-hint">-</p>';
        }
    }
};
