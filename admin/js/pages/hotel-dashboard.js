/**
 * admin/js/pages/hotel-dashboard.js
 * 호텔 모드 운영 대시보드 — 관리자 전용
 *
 * 설계 원칙:
 *   - venue_type='hotel' 단지에서만 데이터 조회
 *   - Feature Flag(ENABLE_HOTEL_MODE) OFF 시 화면 자체에서 안내 표시
 *   - 기존 admin 라우팅·메뉴 미수정 — 독립 객체(hotelDashboard)로 격리
 *   - 운영 집계 데이터만 표시 (실시간 인원/혼잡도 위젯 금지)
 *   - 다른 단지(아파트) 데이터 혼합 없음
 *
 * 위젯 6개:
 *   W-1 오늘의 PT 예약 수
 *   W-2 이번 주 무료 클래스 신청 수
 *   W-3 이번 달 결제 합계 (리프레시 PT)
 *   W-4 만료 임박 회원 수 (D-7 이내)
 *   W-5 신규 회원 가입 수 (이번 달)
 *   W-6 다가오는 PT 예약 목록 (다음 7일)
 *
 * ⚠️  실시간 인원 / 혼잡도 위젯 없음 (운영 원칙)
 *
 * 사용 방법:
 *   admin/index.html 에서 <script src="...hotel-dashboard.js"> 추가 후
 *   navigate('hotel-dashboard') 호출 → hotelDashboard.render() 진입
 *
 * 단계: D-1 / 작성일: 2026-06-07
 */

'use strict';

/* ────────────────────────────────────────────────────────────────────
   hotelDashboard — 기존 페이지 객체(dashboard, applications 등)와
   동일한 패턴으로 작성. 전역 네임스페이스에 등록.
   ──────────────────────────────────────────────────────────────────── */
const hotelDashboard = {

    // ── 선택된 호텔 단지 ──────────────────────────────────────────
    /** @type {{ id: string, name: string, code: string }|null} */
    selectedComplex: null,

    // ── KST 날짜 유틸 ────────────────────────────────────────────
    /**
     * 현재 KST 기준 YYYY-MM-DD 문자열
     * @returns {string}
     */
    _todayKST() {
        const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const y   = kst.getUTCFullYear();
        const m   = String(kst.getUTCMonth() + 1).padStart(2, '0');
        const d   = String(kst.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    /**
     * 이번 주 월요일 YYYY-MM-DD (KST)
     * @returns {string}
     */
    _weekStartKST() {
        const kst  = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const dow  = kst.getUTCDay(); // 0=일, 1=월 ...
        const diff = dow === 0 ? -6 : 1 - dow; // 월요일까지의 offset
        const mon  = new Date(kst.getTime() + diff * 86400000);
        return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth()+1).padStart(2,'0')}-${String(mon.getUTCDate()).padStart(2,'0')}`;
    },

    /**
     * 이번 달 1일 YYYY-MM-DD (KST)
     * @returns {string}
     */
    _monthStartKST() {
        const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
        return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-01`;
    },

    /**
     * N일 후 YYYY-MM-DD (KST)
     * @param {number} n
     * @returns {string}
     */
    _dateAfterKST(n) {
        const kst = new Date(Date.now() + 9 * 60 * 60 * 1000 + n * 86400000);
        return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-${String(kst.getUTCDate()).padStart(2,'0')}`;
    },

    // ── XSS 방어 ─────────────────────────────────────────────────
    _esc(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    // ── 숫자 포맷 ────────────────────────────────────────────────
    _fmtMoney(n) {
        if (n == null || isNaN(n)) return '—';
        return Number(n).toLocaleString('ko-KR') + '원';
    },

    // ── 페이지 진입점 ─────────────────────────────────────────────
    async render() {
        const contentEl = document.getElementById('pageContent');
        if (!contentEl) return;

        // Feature Flag 체크 (서버 플래그를 클라이언트에서 직접 알 수 없으므로
        // 첫 API 호출 실패 시 안내 메시지로 처리)
        contentEl.innerHTML = this._skeletonHtml();

        // venue_type='hotel' 단지 목록 조회
        await this._loadHotelComplexList();
    },

    // ── 스켈레톤 HTML ─────────────────────────────────────────────
    _skeletonHtml() {
        return `
        <div class="page-header">
            <h2><i class="fas fa-hotel"></i> 호텔 운영 대시보드</h2>
            <div class="header-actions">
                <button class="btn-secondary btn-sm" onclick="hotelDashboard.render()">
                    <i class="fas fa-sync"></i> 새로고침
                </button>
            </div>
        </div>
        <div id="hotelDashContent">
            <div class="hd-loading"><i class="fas fa-spinner fa-spin"></i> 호텔 단지 목록을 불러오는 중...</div>
        </div>`;
    },

    // ── Step 1: 호텔 단지 목록 조회 ──────────────────────────────
    async _loadHotelComplexList() {
        const wrap = document.getElementById('hotelDashContent');
        if (!wrap) return;

        try {
            const res  = await API.complexes.list();
            const all  = res.data || [];

            // venue_type='hotel' 필터
            const hotels = all.filter(cx => cx.venue_type === 'hotel');

            if (!hotels.length) {
                wrap.innerHTML = this._noHotelHtml();
                return;
            }

            // 단지 1개면 바로 선택, 2개 이상이면 선택 UI
            if (hotels.length === 1) {
                this.selectedComplex = {
                    id:   hotels[0].id,
                    name: hotels[0].name,
                    code: hotels[0].code,
                };
                wrap.innerHTML = this._mainLayoutHtml(hotels);
                await this._loadAllWidgets();
            } else {
                // 이미 선택된 단지가 있으면 유지
                if (!this.selectedComplex) {
                    this.selectedComplex = {
                        id:   hotels[0].id,
                        name: hotels[0].name,
                        code: hotels[0].code,
                    };
                }
                wrap.innerHTML = this._mainLayoutHtml(hotels);
                await this._loadAllWidgets();
            }
        } catch (e) {
            // Feature Flag OFF 또는 API 오류
            wrap.innerHTML = this._flagOffHtml(e.message);
        }
    },

    // ── 메인 레이아웃 HTML ────────────────────────────────────────
    _mainLayoutHtml(hotels) {
        const cx = this.selectedComplex;
        const selectorHtml = hotels.length > 1
            ? `<div class="hd-complex-selector">
                <label class="hd-selector-label"><i class="fas fa-hotel"></i> 호텔 단지</label>
                <select class="hd-select" id="hotelComplexSelect" onchange="hotelDashboard._onComplexChange(this.value)">
                    ${hotels.map(h =>
                        `<option value="${this._esc(h.id)}"
                             data-name="${this._esc(h.name)}"
                             data-code="${this._esc(h.code)}"
                             ${h.id === cx.id ? 'selected' : ''}>
                            ${this._esc(h.name)} (${this._esc(h.code)})
                        </option>`
                    ).join('')}
                </select>
               </div>`
            : `<div class="hd-complex-badge"><i class="fas fa-hotel"></i> ${this._esc(cx.name)}</div>`;

        return `
        <!-- 단지 선택 바 -->
        ${selectorHtml}

        <!-- 운영 데이터 주의 배너 -->
        <div class="hd-ops-notice">
            <i class="fas fa-shield-alt"></i>
            운영 집계 데이터입니다 — 개별 고객 식별 정보는 신청 관리 메뉴에서 확인하세요.
        </div>

        <!-- KPI 카드 그리드 (위젯 W-1 ~ W-5) -->
        <div class="hd-kpi-grid" id="hotelKpiGrid">
            ${this._kpiSkeletonHtml()}
        </div>

        <!-- 위젯 W-6: 다가오는 PT 예약 목록 -->
        <div class="hd-panel" id="hotelUpcomingPanel">
            <div class="hd-panel-header">
                <h4><i class="fas fa-calendar-check"></i> 다가오는 PT 예약 (다음 7일)</h4>
                <button class="hd-panel-btn" onclick="navigate('applications')">
                    신청 관리에서 전체 보기 →
                </button>
            </div>
            <div class="hd-panel-body" id="hotelUpcomingBody">
                <div class="hd-loading"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
            </div>
        </div>`;
    },

    // ── KPI 스켈레톤 5개 ──────────────────────────────────────────
    _kpiSkeletonHtml() {
        return Array.from({ length: 5 }, () =>
            `<div class="hd-kpi-card hd-kpi-loading">
                <div class="hd-kpi-icon"><i class="fas fa-spinner fa-spin"></i></div>
                <div class="hd-kpi-body">
                    <div class="hd-kpi-value">…</div>
                    <div class="hd-kpi-label">로딩 중</div>
                </div>
             </div>`
        ).join('');
    },

    // ── Step 2: 전체 위젯 로드 ────────────────────────────────────
    async _loadAllWidgets() {
        // 위젯 1~5 병렬, 위젯 6 별도
        const [kpiResult, upcomingResult] = await Promise.allSettled([
            this._loadKpiWidgets(),
            this._loadUpcomingPt(),
        ]);

        if (kpiResult.status === 'rejected') {
            const grid = document.getElementById('hotelKpiGrid');
            if (grid) grid.innerHTML = `<p class="hd-error"><i class="fas fa-exclamation-circle"></i> KPI 로드 실패: ${this._esc(kpiResult.reason?.message)}</p>`;
        }
        if (upcomingResult.status === 'rejected') {
            const body = document.getElementById('hotelUpcomingBody');
            if (body) body.innerHTML = `<p class="hd-error"><i class="fas fa-exclamation-circle"></i> 예약 목록 로드 실패</p>`;
        }
    },

    // ── 단지 변경 핸들러 ─────────────────────────────────────────
    _onComplexChange(complexId) {
        const sel = document.getElementById('hotelComplexSelect');
        if (!sel) return;
        const opt = sel.options[sel.selectedIndex];
        this.selectedComplex = {
            id:   complexId,
            name: opt.dataset.name || '',
            code: opt.dataset.code || '',
        };
        // KPI + 예약 목록 재로드
        const grid = document.getElementById('hotelKpiGrid');
        const body = document.getElementById('hotelUpcomingBody');
        if (grid) grid.innerHTML = this._kpiSkeletonHtml();
        if (body) body.innerHTML = '<div class="hd-loading"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>';
        this._loadAllWidgets();
    },

    // ── W-1 ~ W-5: KPI 카드 데이터 조회 ─────────────────────────
    /**
     * 기존 API.applications.list() 활용 (complexId 필터 + 날짜 범위 필터)
     * 서버의 /api/applications 엔드포인트가 complexId 파라미터를 지원하므로
     * venue_type='hotel' 단지 ID를 그대로 필터로 사용.
     */
    async _loadKpiWidgets() {
        const cx = this.selectedComplex;
        if (!cx) return;

        const today      = this._todayKST();
        const weekStart  = this._weekStartKST();
        const monthStart = this._monthStartKST();
        const day7After  = this._dateAfterKST(7);

        // 4개 쿼리 병렬 실행
        const [ptTodayRes, classWeekRes, allMonthRes, membersRes] = await Promise.allSettled([

            // W-1: 오늘의 PT 예약 (리프레시 PT, preferred_date=today)
            API.applications.list({
                complexId:    cx.id,
                program_name: '리프레시 PT',
                status:       'approved',
                dateFrom:     today,
                dateTo:       today,
                limit:        1000,
            }),

            // W-2: 이번 주 무료 클래스 신청 (승인 상태, 이번 주 월~일)
            API.applications.list({
                complexId: cx.id,
                status:    'approved',
                dateFrom:  weekStart,
                dateTo:    day7After,
                limit:     1000,
            }),

            // W-3·W-4·W-5용: 이번 달 전체 승인 신청
            API.applications.list({
                complexId: cx.id,
                status:    'approved',
                dateFrom:  monthStart,
                dateTo:    today,
                limit:     1000,
            }),

            // W-4: 만료 임박 회원 — expiry_date 범위 조회 (D-7 이내)
            API.applications.list({
                complexId: cx.id,
                status:    'approved',
                expiryFrom: today,
                expiryTo:   day7After,
                limit:      1000,
            }),
        ]);

        // 결과 추출 (실패 시 빈 배열)
        const ptToday   = ptTodayRes.status  === 'fulfilled' ? (ptTodayRes.value.data  || []) : [];
        const classWeek = classWeekRes.status === 'fulfilled' ? (classWeekRes.value.data || []) : [];
        const allMonth  = allMonthRes.status  === 'fulfilled' ? (allMonthRes.value.data  || []) : [];
        const members   = membersRes.status   === 'fulfilled' ? (membersRes.value.data   || []) : [];

        // W-1: 오늘 PT 예약 수
        const w1 = ptToday.length;

        // W-2: 이번 주 무료 클래스 신청 수
        //   (리프레시 PT 제외 = 무료 클래스)
        const w2 = classWeek.filter(a => a.program_name !== '리프레시 PT').length;

        // W-3: 이번 달 결제 합계 (리프레시 PT 건수 × 40,000)
        const PT_BASE_PRICE = 40000;
        const ptMonthCount  = allMonth.filter(a => a.program_name === '리프레시 PT').length;
        const w3 = ptMonthCount * PT_BASE_PRICE;

        // W-4: 만료 임박 회원 수 (D-7 이내)
        const w4 = members.length;

        // W-5: 이번 달 신규 회원 (이번 달 approved 신청 중 고유 phone 수)
        const uniquePhones = new Set(allMonth.map(a => a.phone).filter(Boolean));
        const w5 = uniquePhones.size;

        // KPI 카드 렌더링
        const grid = document.getElementById('hotelKpiGrid');
        if (!grid) return;

        grid.innerHTML = `
            <!-- W-1: 오늘 PT 예약 수 -->
            <div class="hd-kpi-card hd-kpi-blue">
                <div class="hd-kpi-icon"><i class="fas fa-dumbbell"></i></div>
                <div class="hd-kpi-body">
                    <div class="hd-kpi-value">${w1}</div>
                    <div class="hd-kpi-label">오늘 PT 예약</div>
                    <div class="hd-kpi-sub">${today} 기준</div>
                </div>
            </div>

            <!-- W-2: 이번 주 무료 클래스 신청 수 -->
            <div class="hd-kpi-card hd-kpi-green">
                <div class="hd-kpi-icon"><i class="fas fa-users"></i></div>
                <div class="hd-kpi-body">
                    <div class="hd-kpi-value">${w2}</div>
                    <div class="hd-kpi-label">이번 주 클래스 신청</div>
                    <div class="hd-kpi-sub">${weekStart} 이후</div>
                </div>
            </div>

            <!-- W-3: 이번 달 결제 합계 -->
            <div class="hd-kpi-card hd-kpi-gold">
                <div class="hd-kpi-icon"><i class="fas fa-won-sign"></i></div>
                <div class="hd-kpi-body">
                    <div class="hd-kpi-value hd-kpi-value-sm">${this._fmtMoney(w3)}</div>
                    <div class="hd-kpi-label">이번 달 PT 매출 추정</div>
                    <div class="hd-kpi-sub">${ptMonthCount}건 × ₩40,000</div>
                </div>
            </div>

            <!-- W-4: 만료 임박 회원 수 -->
            <div class="hd-kpi-card ${w4 > 0 ? 'hd-kpi-orange' : 'hd-kpi-muted'}">
                <div class="hd-kpi-icon"><i class="fas fa-clock"></i></div>
                <div class="hd-kpi-body">
                    <div class="hd-kpi-value">${w4}</div>
                    <div class="hd-kpi-label">만료 임박 회원</div>
                    <div class="hd-kpi-sub ${w4 > 0 ? 'hd-kpi-sub-warn' : ''}">
                        ${w4 > 0 ? '⚠ D-7 이내' : 'D-7 이내 없음'}
                    </div>
                </div>
            </div>

            <!-- W-5: 이번 달 신규 회원 수 -->
            <div class="hd-kpi-card hd-kpi-purple">
                <div class="hd-kpi-icon"><i class="fas fa-user-plus"></i></div>
                <div class="hd-kpi-body">
                    <div class="hd-kpi-value">${w5}</div>
                    <div class="hd-kpi-label">이번 달 신규 회원</div>
                    <div class="hd-kpi-sub">${monthStart} 이후</div>
                </div>
            </div>`;
    },

    // ── W-6: 다가오는 PT 예약 목록 (다음 7일) ────────────────────
    /**
     * ⚠️ 실시간 인원/혼잡도 표시 금지
     * 예약 건수 집계 + 날짜·시각·트레이너만 표시
     */
    async _loadUpcomingPt() {
        const cx = this.selectedComplex;
        if (!cx) return;

        const body = document.getElementById('hotelUpcomingBody');
        if (!body) return;

        const today    = this._todayKST();
        const day7After = this._dateAfterKST(7);

        try {
            const res  = await API.applications.list({
                complexId:    cx.id,
                program_name: '리프레시 PT',
                status:       'approved',
                dateFrom:     today,
                dateTo:       day7After,
                limit:        100,
            });
            const items = res.data || [];

            if (!items.length) {
                body.innerHTML = '<p class="hd-empty"><i class="fas fa-calendar"></i> 다음 7일 PT 예약 없음</p>';
                return;
            }

            // 날짜·시각 기준 정렬
            items.sort((a, b) => {
                const da = (a.preferred_date || '') + (a.preferred_time || '');
                const db = (b.preferred_date || '') + (b.preferred_time || '');
                return da < db ? -1 : da > db ? 1 : 0;
            });

            body.innerHTML = `
                <table class="hd-table">
                    <thead>
                        <tr>
                            <th>날짜</th>
                            <th>시각</th>
                            <th>이름</th>
                            <th>트레이너</th>
                            <th>상태</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(a => `
                            <tr>
                                <td>${this._esc(a.preferred_date || '—')}</td>
                                <td>${this._esc(a.preferred_time || '—')}</td>
                                <td>${this._esc(a.name || '—')}</td>
                                <td>${this._esc(a.instructor_name || a.instructor_id || '—')}</td>
                                <td><span class="hd-status-badge hd-status-${this._esc(a.status)}">
                                    ${this._esc(a.status === 'approved' ? '확정' : a.status || '—')}
                                </span></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
                <p class="hd-table-foot">총 ${items.length}건 · 클릭하여 신청 관리에서 수정 가능</p>`;
        } catch (e) {
            body.innerHTML = `<p class="hd-error"><i class="fas fa-exclamation-circle"></i> 예약 목록 로드 실패: ${this._esc(e.message)}</p>`;
        }
    },

    // ── Feature Flag OFF / 호텔 단지 없음 안내 HTML ──────────────
    _flagOffHtml(errMsg) {
        return `
        <div class="hd-flag-off">
            <div class="hd-flag-off-icon"><i class="fas fa-toggle-off"></i></div>
            <h3>호텔 모드 비활성화 또는 접근 오류</h3>
            <p>
                ENABLE_HOTEL_MODE 환경변수가 <code>false</code>이거나<br>
                API 접근 중 오류가 발생했습니다.
            </p>
            ${errMsg ? `<p class="hd-error-detail">${this._esc(errMsg)}</p>` : ''}
            <p>활성화 방법: <code>.env</code> 에서 <code>ENABLE_HOTEL_MODE=true</code> 설정 후 서버 재시작</p>
        </div>`;
    },

    _noHotelHtml() {
        return `
        <div class="hd-flag-off">
            <div class="hd-flag-off-icon"><i class="fas fa-hotel"></i></div>
            <h3>등록된 호텔 단지 없음</h3>
            <p>
                <code>venue_type = 'hotel'</code> 인 단지가 없습니다.<br>
                단지 관리에서 신규 단지를 추가하고 venue_type을 <code>hotel</code>로 설정하세요.
            </p>
        </div>`;
    },
};

/* ── 전역 navigate() 연동 가이드 ────────────────────────────────────
   기존 admin-app.js 의 navigate() 함수에 아래 케이스를 추가하세요
   (admin-app.js 직접 수정이 금지된 경우, 운영자가 수동 추가):

   case 'hotel-dashboard':
       hotelDashboard.render();
       break;

   사이드바 메뉴 항목 예시 (admin/index.html 에 추가):
   <li data-page="hotel-dashboard" onclick="navigate('hotel-dashboard')">
       <i class="fas fa-hotel"></i> <span>호텔 대시보드</span>
   </li>
   ────────────────────────────────────────────────────────────────── */
