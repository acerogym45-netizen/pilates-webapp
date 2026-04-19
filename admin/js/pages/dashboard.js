/** 대시보드 페이지 */
const dashboard = {
    async render() {
        // 마스터 선택 단지 표시
        const selectedName = (Admin.role === 'master' && Admin.selectedComplexName)
            ? ` — ${Admin.selectedComplexName}` : '';

        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-chart-pie"></i> 대시보드${selectedName}</h2>
                <button class="btn-secondary btn-sm" onclick="dashboard.render()">
                    <i class="fas fa-sync"></i> 새로고침
                </button>
            </div>
            <div id="dashStats" class="stats-grid">
                <div class="stat-card loading-card"><i class="fas fa-spinner fa-spin"></i></div>
            </div>
            <div class="dash-grid">
                <div class="dash-panel">
                    <div class="panel-header"><h4><i class="fas fa-clock"></i> 최근 신청</h4></div>
                    <div id="recentApps" class="panel-body"></div>
                </div>
                <div class="dash-panel">
                    <div class="panel-header"><h4><i class="fas fa-exclamation-circle"></i> 미답변 문의</h4></div>
                    <div id="unansweredInq" class="panel-body"></div>
                </div>
            </div>
            <div id="complexLinksPanel"></div>`;
        
        await this.loadStats();
        await this.loadRecent();
        await this.loadComplexLinks();
    },

    async loadStats() {
        try {
            const effId = getEffectiveComplexId();
            const params = effId ? { complexId: effId } : {};
            const res = await API.stats.dashboard(params);
            const s = res.data;
            document.getElementById('dashStats').innerHTML = `
                <div class="stat-card">
                    <div class="stat-icon icon-primary"><i class="fas fa-file-alt"></i></div>
                    <div class="stat-info"><p>전체 신청</p><h3>${s.totalApps}</h3></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon icon-success"><i class="fas fa-check-circle"></i></div>
                    <div class="stat-info"><p>승인</p><h3>${s.approved}</h3></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon icon-warning"><i class="fas fa-hourglass-half"></i></div>
                    <div class="stat-info"><p>대기</p><h3>${s.waiting}</h3></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon icon-danger"><i class="fas fa-times-circle"></i></div>
                    <div class="stat-info"><p>거부</p><h3>${s.rejected}</h3></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon icon-warning"><i class="fas fa-ban"></i></div>
                    <div class="stat-info"><p>해지 대기</p><h3>${s.pendingCancel}</h3></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon icon-info"><i class="fas fa-comments"></i></div>
                    <div class="stat-info"><p>미답변 문의</p><h3>${s.unanswered}</h3></div>
                </div>`;
            loadBadges();
        } catch (e) {
            document.getElementById('dashStats').innerHTML = `<p class="error-hint">통계 로드 실패</p>`;
        }
    },

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
                            <strong>${a.dong} ${a.ho} ${a.name}</strong>
                            <small>${a.program_name} | ${a.preferred_time || '-'}</small>
                        </div>
                        <span class="status-badge status-${statusClass(a.status)}">${statusLabel(a.status)}</span>
                    </div>`).join('')
                : '<p class="empty-hint">신청 내역 없음</p>';

            const unanswered = (inqRes.data || []).filter(i => !i.answer).slice(0, 5);
            document.getElementById('unansweredInq').innerHTML = unanswered.length
                ? unanswered.map(q => `
                    <div class="recent-item" onclick="navigate('inquiries')">
                        <div class="recent-info">
                            <strong>${q.title}</strong>
                            <small>${q.name} | ${formatDate(q.created_at)}</small>
                        </div>
                    </div>`).join('')
                : '<p class="empty-hint">미답변 문의 없음</p>';
        } catch (e) {}
    },

    async loadComplexLinks() {
        const panel = document.getElementById('complexLinksPanel');
        if (!panel) return;
        try {
            let complexList = [];
            if (Admin.role === 'master') {
                // 마스터: 선택 단지 있으면 그것만, 없으면 전체
                const effId = getMasterSelectedComplexId();
                const res = await API.complexes.list();
                const all = res.data || [];
                complexList = effId ? all.filter(c => c.id === effId) : all;
            } else if (Admin.complex?.id) {
                complexList = [Admin.complex];
            }
            if (!complexList.length) { panel.innerHTML = ''; return; }

            const origin = window.location.origin;
            const cards = complexList.map(cx => {
                const url = `${origin}/?complex=${cx.code}`;
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(url)}`;
                return `
                    <div class="complex-link-card">
                        <img src="${qrUrl}" alt="QR" class="complex-link-qr">
                        <div class="complex-link-info">
                            <div class="complex-link-name">${escHtml(cx.name)}</div>
                            <div class="complex-link-code">코드: ${escHtml(cx.code)}</div>
                            <div class="complex-link-url">
                                <a href="${url}" target="_blank" class="complex-link-a">${url}</a>
                            </div>
                        </div>
                        <div class="complex-link-actions">
                            <button class="btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${url}').then(()=>showToast('URL 복사됨'))">
                                <i class="fas fa-copy"></i> URL 복사
                            </button>
                            <a href="${url}" target="_blank" class="btn-ghost btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px">
                                <i class="fas fa-external-link-alt"></i> 열기
                            </a>
                            <a href="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}"
                               download="qr-${cx.code}.png" class="btn-ghost btn-sm"
                               style="text-decoration:none;display:inline-flex;align-items:center;gap:4px">
                                <i class="fas fa-qrcode"></i> QR 저장
                            </a>
                        </div>
                    </div>`;
            }).join('');

            panel.innerHTML = `
                <div class="dash-panel" style="margin-top:16px">
                    <div class="panel-header">
                        <h4><i class="fas fa-link"></i> 입주민 페이지 바로가기
                            <span class="panel-badge">${complexList.length}개 단지</span>
                        </h4>
                    </div>
                    <div class="complex-links-grid">${cards}</div>
                </div>`;
        } catch (e) {
            panel.innerHTML = '';
        }
    }
};
