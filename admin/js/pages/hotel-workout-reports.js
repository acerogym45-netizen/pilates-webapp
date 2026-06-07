/**
 * admin/js/pages/hotel-workout-reports.js
 * 회원 운동 리포트 작성 — 트레이너용 admin 페이지 객체
 *
 * 진입 흐름:
 *   1. venue_type='hotel' 단지 목록 노출 → 단지 선택
 *   2. 회원 검색 (이름 또는 휴대폰 뒤 4자리)
 *   3. 회원 선택 → 좌우 분할 화면
 *      좌측: 해당 회원 기존 리포트 목록 (phase 순)
 *      우측: 신규 리포트 입력 폼
 *   4. 저장 → POST /api/hotel/workout-reports
 *   5. 저장 후 PDF 버튼 → POST /api/hotel/workout-reports/:id/pdf-url
 *
 * 설계 원칙:
 *   - venue_type='hotel' 단지만 노출 (API.complexes.list() 필터)
 *   - Feature Flag 비활성화 시 안내 화면 노출
 *   - 기존 admin-app.js, admin.css, api.js 수정 없음
 *   - CSS 네임스페이스: .wr-* (admin.css 완전 격리)
 *   - XSS 방어: 내부 _e() 사용 (admin-app.js의 escHtml 대용, 독립)
 *   - 혼잡도 / 실시간 인원 / check-in 기능 없음
 *   - 별도 알림 강제 없음 — 회원 마이페이지(C-3)에서 자동 노출
 *
 * 운영자 연동 안내:
 *   admin/index.html 사이드바 메뉴에 아래 항목 추가:
 *     <a href="#" onclick="navigate('hotel-workout-reports')">운동 리포트</a>
 *   admin-app.js의 pageMap에 아래 항목 추가:
 *     'hotel-workout-reports': hotelWorkoutReports
 *   hotel-workout-reports.css를 admin/index.html <head>에 <link> 추가
 *
 * 단계: D-3 / 작성일: 2026-06-07
 */

/* global API */

const hotelWorkoutReports = (() => {

    // ── 상태 ──────────────────────────────────────────────────────
    let _selectedComplex    = null;   // { id, name }
    let _selectedMember     = null;   // { application_id, name, phone }
    let _reports            = [];     // 현재 회원의 리포트 목록
    let _savedReportId      = null;   // 최근 저장된 리포트 ID (PDF 버튼용)
    let _searchQuery        = '';
    let _memberResults      = [];

    /** FMS 7동작 정의 */
    const FMS_MOVEMENTS = [
        { key: 'deep_squat',             label: 'Deep Squat',              label_ko: '딥 스쿼트' },
        { key: 'hurdle_step',            label: 'Hurdle Step',             label_ko: '허들 스텝' },
        { key: 'inline_lunge',           label: 'In-line Lunge',           label_ko: '인라인 런지' },
        { key: 'shoulder_mobility',      label: 'Shoulder Mobility',       label_ko: '어깨 유연성' },
        { key: 'active_slr',             label: 'Active SLR',              label_ko: '능동 하지 거상' },
        { key: 'trunk_stability_pushup', label: 'Trunk Stability Push-up', label_ko: '몸통 안정성 푸쉬업' },
        { key: 'rotary_stability',       label: 'Rotary Stability',        label_ko: '회전 안정성' },
    ];

    /** 인바디 필드 정의 */
    const INBODY_FIELDS = [
        { key: 'weight',              label: '체중',       unit: 'kg',   step: '0.1' },
        { key: 'skeletal_muscle',     label: '골격근량',   unit: 'kg',   step: '0.1' },
        { key: 'body_fat_pct',        label: '체지방률',   unit: '%',    step: '0.1' },
        { key: 'body_water',          label: '체수분',     unit: 'L',    step: '0.1' },
        { key: 'bmi',                 label: 'BMI',        unit: '',     step: '0.1' },
        { key: 'basal_metabolic_rate',label: '기초대사량', unit: 'kcal', step: '1'   },
    ];


    // ── XSS 방어 유틸 ─────────────────────────────────────────────
    /**
     * HTML 이스케이프 — admin-app.js의 escHtml()과 동일 로직
     * 이 파일 내에서만 사용하는 독립 유틸 (api.js / admin-app.js 비의존)
     * @param {*} str
     * @returns {string}
     */
    function _e(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }


    // ── fetch 유틸 (hotel 네임스페이스 직접 호출) ─────────────────
    /**
     * /api/hotel/workout-reports/* 직접 fetch
     * js/api.js에 hotel 네임스페이스 없으므로 이 파일에서 직접 처리
     *
     * @param {'GET'|'POST'} method
     * @param {string}       path    예) '', '/:id', '/:id/pdf-url'
     * @param {object|null}  body
     * @returns {Promise<object>}
     */
    async function _api(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body != null) opts.body = JSON.stringify(body);

        const res = await fetch('/api/hotel/workout-reports' + path, opts);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        return json;
    }

    /**
     * /api/hotel/members-search 대신 /api/applications 직접 검색
     * API.applications.list()를 사용해 complex_id + 검색어로 필터
     *
     * @param {string} complexId
     * @param {string} query  이름 또는 phone_last4 (4자리)
     * @returns {Promise<Array>}
     */
    async function _searchMembers(complexId, query) {
        const params = { complexId, limit: 50 };
        const res = await API.applications.list(params);
        const all = (res.data || []);

        if (!query.trim()) return all.slice(0, 30);

        const q = query.trim().toLowerCase();
        return all.filter(a => {
            const name  = (a.name  || '').toLowerCase();
            const phone = (a.phone || '').replace(/\D/g, '');
            return name.includes(q) || phone.endsWith(q);
        }).slice(0, 30);
    }


    // ── 스켈레톤 ──────────────────────────────────────────────────
    function _skeletonHtml() {
        return `
            <div class="wr-skeleton">
                <div class="wr-sk-bar wr-sk-bar--title"></div>
                <div class="wr-sk-bar wr-sk-bar--row"></div>
                <div class="wr-sk-bar wr-sk-bar--row"></div>
                <div class="wr-sk-bar wr-sk-bar--row wr-sk-bar--short"></div>
            </div>`;
    }

    function _flagOffHtml(msg) {
        return `
            <div class="wr-notice wr-notice--warn">
                <span class="wr-notice__icon">⚠️</span>
                <div>
                    <strong>운동 리포트 기능이 비활성화되어 있습니다</strong>
                    <p>${_e(msg || 'ENABLE_HOTEL_MEMBER_PAGE=true 로 활성화하세요')}</p>
                </div>
            </div>`;
    }

    function _noHotelHtml() {
        return `
            <div class="wr-notice wr-notice--info">
                <span class="wr-notice__icon">ℹ️</span>
                <div>
                    <strong>hotel 단지가 없습니다</strong>
                    <p>venue_type이 'hotel'인 단지를 먼저 등록하세요.</p>
                </div>
            </div>`;
    }


    // ── 단지 선택 화면 ────────────────────────────────────────────
    /**
     * hotel 단지 목록을 불러와 선택 카드 렌더
     */
    async function _loadHotelComplexList() {
        const el = document.getElementById('wr-root');
        if (!el) return;

        el.innerHTML = _skeletonHtml();

        try {
            const res    = await API.complexes.list();
            const hotels = (res.data || []).filter(cx => cx.venue_type === 'hotel');

            if (hotels.length === 0) {
                el.innerHTML = _noHotelHtml();
                return;
            }

            el.innerHTML = `
                <div class="wr-complex-select">
                    <h2 class="wr-complex-select__title">단지 선택</h2>
                    <p class="wr-complex-select__sub">운동 리포트를 작성할 호텔 단지를 선택하세요</p>
                    <div class="wr-complex-grid">
                        ${hotels.map(cx => `
                            <button
                                class="wr-complex-card"
                                data-id="${_e(cx.id)}"
                                data-name="${_e(cx.name)}"
                                onclick="hotelWorkoutReports._selectComplex('${_e(cx.id)}', '${_e(cx.name)}')"
                            >
                                <span class="wr-complex-card__icon">🏨</span>
                                <span class="wr-complex-card__name">${_e(cx.name)}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>`;

        } catch (e) {
            el.innerHTML = _flagOffHtml(e.message);
        }
    }

    /**
     * 단지 선택 후 회원 검색 화면으로 전환
     */
    function _selectComplex(complexId, complexName) {
        _selectedComplex = { id: complexId, name: complexName };
        _selectedMember  = null;
        _reports         = [];
        _savedReportId   = null;
        _searchQuery     = '';
        _memberResults   = [];
        _renderMemberSearch();
    }


    // ── 회원 검색 화면 ────────────────────────────────────────────
    function _renderMemberSearch() {
        const el = document.getElementById('wr-root');
        if (!el) return;

        el.innerHTML = `
            <div class="wr-member-search">
                <div class="wr-breadcrumb">
                    <button class="wr-btn wr-btn--ghost" onclick="hotelWorkoutReports._loadHotelComplexList()">
                        ← 단지 선택
                    </button>
                    <span class="wr-breadcrumb__sep">›</span>
                    <span class="wr-breadcrumb__current">${_e(_selectedComplex.name)}</span>
                </div>

                <div class="wr-search-box">
                    <input
                        id="wr-member-query"
                        class="wr-search-box__input"
                        type="text"
                        placeholder="이름 또는 휴대폰 뒤 4자리 입력..."
                        value="${_e(_searchQuery)}"
                        oninput="hotelWorkoutReports._onSearchInput(this.value)"
                        onkeydown="if(event.key==='Enter') hotelWorkoutReports._doSearch()"
                    />
                    <button
                        class="wr-btn wr-btn--primary wr-search-box__btn"
                        onclick="hotelWorkoutReports._doSearch()"
                    >
                        검색
                    </button>
                </div>

                <div id="wr-member-results" class="wr-member-results">
                    <p class="wr-member-results__hint">이름이나 휴대폰 뒤 4자리로 검색하세요</p>
                </div>
            </div>`;

        // 포커스
        const input = document.getElementById('wr-member-query');
        if (input) input.focus();
    }

    function _onSearchInput(val) {
        _searchQuery = val;
    }

    async function _doSearch() {
        _searchQuery = (document.getElementById('wr-member-query') || {}).value || _searchQuery;
        const resultEl = document.getElementById('wr-member-results');
        if (!resultEl) return;

        resultEl.innerHTML = '<p class="wr-member-results__loading">검색 중...</p>';

        try {
            const members = await _searchMembers(_selectedComplex.id, _searchQuery);
            _memberResults = members;

            if (members.length === 0) {
                resultEl.innerHTML = '<p class="wr-member-results__empty">검색 결과가 없습니다</p>';
                return;
            }

            resultEl.innerHTML = `
                <ul class="wr-member-list">
                    ${members.map((m, i) => `
                        <li class="wr-member-item" onclick="hotelWorkoutReports._selectMember(${i})">
                            <span class="wr-member-item__name">${_e(m.name)}</span>
                            <span class="wr-member-item__phone">${_e(_maskPhone(m.phone))}</span>
                            <span class="wr-member-item__program">${_e(m.program_name || '')}</span>
                            <span class="wr-member-item__arrow">›</span>
                        </li>
                    `).join('')}
                </ul>`;

        } catch (e) {
            resultEl.innerHTML = `<p class="wr-member-results__error">${_e(e.message)}</p>`;
        }
    }

    /** 전화번호 마스킹: 010-****-1234 형태로 가운데 숨김 */
    function _maskPhone(phone) {
        if (!phone) return '-';
        const digits = String(phone).replace(/\D/g, '');
        if (digits.length === 11) {
            return `${digits.slice(0, 3)}-****-${digits.slice(7)}`;
        }
        return phone;
    }

    /**
     * 회원 선택 → 좌우 분할 화면 진입
     */
    async function _selectMember(idx) {
        const m = _memberResults[idx];
        if (!m) return;

        _selectedMember  = { application_id: m.id, name: m.name, phone: m.phone };
        _savedReportId   = null;
        _renderSplitLayout();
        _loadReportList();
        _renderForm();
    }


    // ── 좌우 분할 레이아웃 ────────────────────────────────────────
    function _renderSplitLayout() {
        const el = document.getElementById('wr-root');
        if (!el) return;

        el.innerHTML = `
            <div class="wr-split">
                <!-- 헤더 -->
                <div class="wr-split__header">
                    <div class="wr-breadcrumb">
                        <button class="wr-btn wr-btn--ghost" onclick="hotelWorkoutReports._loadHotelComplexList()">
                            ← 단지 선택
                        </button>
                        <span class="wr-breadcrumb__sep">›</span>
                        <button class="wr-btn wr-btn--ghost" onclick="hotelWorkoutReports._renderMemberSearch()">
                            ${_e(_selectedComplex.name)}
                        </button>
                        <span class="wr-breadcrumb__sep">›</span>
                        <span class="wr-breadcrumb__current">${_e(_selectedMember.name)}</span>
                    </div>
                    <div class="wr-member-badge">
                        <span class="wr-member-badge__icon">👤</span>
                        <span>${_e(_selectedMember.name)}</span>
                        <span class="wr-member-badge__phone">${_e(_maskPhone(_selectedMember.phone))}</span>
                    </div>
                </div>

                <!-- 분할 패널 -->
                <div class="wr-split__body">
                    <!-- 좌측: 기존 리포트 목록 -->
                    <aside class="wr-panel wr-panel--list" id="wr-report-list-panel">
                        <h3 class="wr-panel__title">기존 리포트</h3>
                        <div id="wr-report-list">
                            ${_skeletonHtml()}
                        </div>
                    </aside>

                    <!-- 우측: 신규 입력 폼 -->
                    <section class="wr-panel wr-panel--form" id="wr-form-panel">
                        <h3 class="wr-panel__title">신규 리포트 작성</h3>
                        <div id="wr-form-container"></div>
                    </section>
                </div>
            </div>`;
    }


    // ── 좌측: 리포트 목록 ─────────────────────────────────────────
    async function _loadReportList() {
        const listEl = document.getElementById('wr-report-list');
        if (!listEl || !_selectedMember) return;

        try {
            const data = await _api('GET', `?application_id=${encodeURIComponent(_selectedMember.application_id)}`);
            _reports = data.reports || [];
            _renderReportList();
        } catch (e) {
            if (listEl) {
                listEl.innerHTML = `<p class="wr-list__error">${_e(e.message)}</p>`;
            }
        }
    }

    function _renderReportList() {
        const listEl = document.getElementById('wr-report-list');
        if (!listEl) return;

        if (_reports.length === 0) {
            listEl.innerHTML = `
                <div class="wr-list__empty">
                    <span>📋</span>
                    <p>아직 작성된 리포트가 없습니다</p>
                </div>`;
            _updatePhaseInput(_reports.length + 1);
            return;
        }

        listEl.innerHTML = `
            <ul class="wr-report-list">
                ${_reports.map(r => `
                    <li class="wr-report-item" onclick="hotelWorkoutReports._viewReport('${_e(r.id)}')">
                        <div class="wr-report-item__phase">Phase ${_e(r.phase)}</div>
                        <div class="wr-report-item__date">${_e(_formatDate(r.created_at))}</div>
                        <div class="wr-report-item__pdf">
                            ${r.pdf_url
                                ? `<span class="wr-badge wr-badge--pdf">PDF</span>`
                                : `<span class="wr-badge wr-badge--no-pdf">미생성</span>`
                            }
                        </div>
                        <span class="wr-report-item__arrow">›</span>
                    </li>
                `).join('')}
            </ul>`;

        _updatePhaseInput(_reports.length + 1);
    }

    function _formatDate(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function _updatePhaseInput(val) {
        const phaseEl = document.getElementById('wr-phase');
        if (phaseEl) phaseEl.value = val;
    }

    /** 기존 리포트 상세 보기 (읽기 전용 모달) */
    async function _viewReport(reportId) {
        try {
            const data   = await _api('GET', `/${encodeURIComponent(reportId)}`);
            const report = data.report;
            _renderDetailModal(report);
        } catch (e) {
            alert(`리포트 조회 실패: ${e.message}`);
        }
    }

    function _renderDetailModal(report) {
        const existing = document.getElementById('wr-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id    = 'wr-modal-overlay';
        overlay.className = 'wr-modal-overlay';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        const fmsRows = FMS_MOVEMENTS.map(mv => {
            const score = (report.fms_scores || {})[mv.key];
            return `
                <tr class="wr-detail-fms__row">
                    <td class="wr-detail-fms__label">${_e(mv.label_ko)}</td>
                    <td class="wr-detail-fms__en">${_e(mv.label)}</td>
                    <td class="wr-detail-fms__score">
                        ${score != null
                            ? `<span class="wr-fms-score wr-fms-score--${score}">${score}점</span>`
                            : '<span class="wr-fms-score--empty">-</span>'
                        }
                    </td>
                </tr>`;
        }).join('');

        const fmsTotal = FMS_MOVEMENTS.reduce((acc, mv) => {
            const v = (report.fms_scores || {})[mv.key];
            return acc + (v != null ? Number(v) : 0);
        }, 0);

        const inbodyRows = INBODY_FIELDS.map(f => {
            const val = (report.inbody_data || {})[f.key];
            return `
                <tr>
                    <td class="wr-detail-inbody__label">${_e(f.label)}</td>
                    <td class="wr-detail-inbody__val">
                        ${val != null ? `${_e(val)} ${_e(f.unit)}` : '-'}
                    </td>
                </tr>`;
        }).join('');

        overlay.innerHTML = `
            <div class="wr-modal" role="dialog" aria-modal="true">
                <div class="wr-modal__header">
                    <h3 class="wr-modal__title">Phase ${_e(report.phase)} 리포트 상세</h3>
                    <button class="wr-modal__close" onclick="document.getElementById('wr-modal-overlay').remove()">✕</button>
                </div>
                <div class="wr-modal__body">
                    <div class="wr-modal__date">작성일: ${_e(_formatDate(report.created_at))}</div>

                    <h4 class="wr-modal__section-title">FMS 7동작 점수</h4>
                    <table class="wr-detail-fms">
                        <thead>
                            <tr>
                                <th>동작 (한글)</th>
                                <th>동작 (영문)</th>
                                <th>점수</th>
                            </tr>
                        </thead>
                        <tbody>${fmsRows}</tbody>
                        <tfoot>
                            <tr class="wr-detail-fms__total">
                                <td colspan="2">합계</td>
                                <td>${fmsTotal}점 / 21점</td>
                            </tr>
                        </tfoot>
                    </table>

                    <h4 class="wr-modal__section-title">인바디 데이터</h4>
                    <table class="wr-detail-inbody">
                        <tbody>${inbodyRows}</tbody>
                    </table>

                    ${report.trainer_comment ? `
                        <h4 class="wr-modal__section-title">트레이너 코멘트</h4>
                        <p class="wr-detail-comment">${_e(report.trainer_comment)}</p>
                    ` : ''}

                    ${report.pdf_url ? `
                        <div class="wr-modal__pdf">
                            <a href="${_e(report.pdf_url)}" target="_blank" rel="noopener" class="wr-btn wr-btn--pdf">
                                📄 PDF 보기
                            </a>
                        </div>
                    ` : ''}
                </div>
            </div>`;

        document.body.appendChild(overlay);
    }


    // ── 우측: 신규 입력 폼 ────────────────────────────────────────
    function _renderForm() {
        const formEl = document.getElementById('wr-form-container');
        if (!formEl) return;

        const nextPhase = _reports.length + 1;

        const fmsGrid = FMS_MOVEMENTS.map((mv, i) => `
            <tr class="wr-fms-row" id="wr-fms-row-${i}">
                <td class="wr-fms-row__label">
                    <span class="wr-fms-row__ko">${_e(mv.label_ko)}</span>
                    <span class="wr-fms-row__en">${_e(mv.label)}</span>
                </td>
                ${[0, 1, 2, 3].map(score => `
                    <td class="wr-fms-row__cell">
                        <label class="wr-fms-radio">
                            <input
                                type="radio"
                                name="fms_${_e(mv.key)}"
                                value="${score}"
                                class="wr-fms-radio__input"
                                onchange="hotelWorkoutReports._onFmsChange('${_e(mv.key)}', ${score}, ${i})"
                            />
                            <span class="wr-fms-radio__mark wr-fms-radio__mark--${score}">${score}</span>
                        </label>
                    </td>
                `).join('')}
                <td class="wr-fms-row__selected" id="wr-fms-selected-${i}">—</td>
            </tr>
        `).join('');

        const inbodyFields = INBODY_FIELDS.map(f => `
            <div class="wr-inbody-field">
                <label class="wr-inbody-field__label" for="wr-inbody-${_e(f.key)}">
                    ${_e(f.label)}${f.unit ? ` <span class="wr-inbody-field__unit">(${_e(f.unit)})</span>` : ''}
                </label>
                <input
                    id="wr-inbody-${_e(f.key)}"
                    type="number"
                    step="${_e(f.step)}"
                    min="0"
                    class="wr-inbody-field__input"
                    placeholder="미입력 시 빈칸"
                />
            </div>
        `).join('');

        formEl.innerHTML = `
            <form id="wr-report-form" onsubmit="return false;">

                <!-- Phase -->
                <div class="wr-form-row">
                    <label class="wr-form-label" for="wr-phase">리포트 회차 (Phase)</label>
                    <input
                        id="wr-phase"
                        type="number"
                        min="1"
                        class="wr-form-input wr-form-input--phase"
                        value="${nextPhase}"
                    />
                    <span class="wr-form-hint">자동 입력됨 — 필요 시 수정 가능</span>
                </div>

                <!-- FMS 7동작 -->
                <div class="wr-form-section">
                    <h4 class="wr-form-section__title">FMS 7동작 점수</h4>
                    <p class="wr-form-section__desc">각 동작을 수행하고 0~3점으로 평가합니다 (미입력 허용)</p>
                    <div class="wr-fms-grid-wrap">
                        <table class="wr-fms-grid">
                            <thead>
                                <tr>
                                    <th class="wr-fms-grid__th-move">동작</th>
                                    <th class="wr-fms-grid__th-score">0점</th>
                                    <th class="wr-fms-grid__th-score">1점</th>
                                    <th class="wr-fms-grid__th-score">2점</th>
                                    <th class="wr-fms-grid__th-score">3점</th>
                                    <th class="wr-fms-grid__th-selected">선택</th>
                                </tr>
                            </thead>
                            <tbody id="wr-fms-tbody">
                                ${fmsGrid}
                            </tbody>
                            <tfoot>
                                <tr class="wr-fms-total-row">
                                    <td colspan="5" class="wr-fms-total__label">FMS 합계</td>
                                    <td class="wr-fms-total__val" id="wr-fms-total">0 / 21</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <!-- 인바디 데이터 -->
                <div class="wr-form-section">
                    <h4 class="wr-form-section__title">인바디 데이터</h4>
                    <p class="wr-form-section__desc">인바디 측정 결과를 입력합니다 (전체 미입력 허용)</p>
                    <div class="wr-inbody-grid">
                        ${inbodyFields}
                    </div>
                </div>

                <!-- 트레이너 코멘트 -->
                <div class="wr-form-section">
                    <h4 class="wr-form-section__title">트레이너 코멘트</h4>
                    <textarea
                        id="wr-comment"
                        class="wr-comment-input"
                        placeholder="운동 수행 관찰 사항, 개선 포인트, 다음 단계 목표 등을 자유롭게 입력하세요 (최대 2,000자)"
                        maxlength="2000"
                        rows="5"
                    ></textarea>
                    <div class="wr-comment-count">
                        <span id="wr-comment-len">0</span> / 2,000
                    </div>
                </div>

                <!-- 액션 버튼 -->
                <div class="wr-form-actions">
                    <button
                        type="button"
                        class="wr-btn wr-btn--primary wr-btn--save"
                        id="wr-save-btn"
                        onclick="hotelWorkoutReports._saveReport()"
                    >
                        💾 저장
                    </button>
                    <button
                        type="button"
                        class="wr-btn wr-btn--pdf wr-btn--pdf-gen"
                        id="wr-pdf-btn"
                        onclick="hotelWorkoutReports._generatePdf()"
                        disabled
                    >
                        📄 PDF 생성
                    </button>
                </div>
                <p class="wr-form-save-hint" id="wr-save-msg"></p>
            </form>`;

        // 코멘트 글자 수 카운터
        const commentEl = document.getElementById('wr-comment');
        const lenEl     = document.getElementById('wr-comment-len');
        if (commentEl && lenEl) {
            commentEl.addEventListener('input', () => {
                lenEl.textContent = commentEl.value.length;
            });
        }
    }

    /** FMS 라디오 선택 시 행 하이라이트 + 합계 업데이트 */
    function _onFmsChange(key, score, rowIdx) {
        const selectedEl = document.getElementById(`wr-fms-selected-${rowIdx}`);
        if (selectedEl) {
            selectedEl.textContent = `${score}점`;
            selectedEl.className   = `wr-fms-row__selected wr-fms-row__selected--${score}`;
        }

        // 행 전체 하이라이트
        const rowEl = document.getElementById(`wr-fms-row-${rowIdx}`);
        if (rowEl) {
            rowEl.className = `wr-fms-row wr-fms-row--selected`;
        }

        _updateFmsTotal();
    }

    function _updateFmsTotal() {
        let total = 0;
        let count = 0;
        FMS_MOVEMENTS.forEach(mv => {
            const checked = document.querySelector(`input[name="fms_${mv.key}"]:checked`);
            if (checked) {
                total += parseInt(checked.value, 10);
                count++;
            }
        });
        const totalEl = document.getElementById('wr-fms-total');
        if (totalEl) totalEl.textContent = `${total} / 21 (${count}/${FMS_MOVEMENTS.length}동작 입력)`;
    }

    /** 폼 데이터 수집 */
    function _collectFormData() {
        const phase = parseInt(document.getElementById('wr-phase').value, 10);

        // FMS
        const fmsScores = {};
        let hasFms = false;
        FMS_MOVEMENTS.forEach(mv => {
            const checked = document.querySelector(`input[name="fms_${mv.key}"]:checked`);
            if (checked) {
                fmsScores[mv.key] = parseInt(checked.value, 10);
                hasFms = true;
            }
        });

        // 인바디
        const inbodyData = {};
        let hasInbody = false;
        INBODY_FIELDS.forEach(f => {
            const el = document.getElementById(`wr-inbody-${f.key}`);
            if (el && el.value !== '') {
                const v = parseFloat(el.value);
                if (!isNaN(v)) {
                    inbodyData[f.key] = v;
                    hasInbody = true;
                }
            }
        });

        const comment = (document.getElementById('wr-comment') || {}).value || '';

        return {
            application_id:  _selectedMember.application_id,
            phase,
            fms_scores:      hasFms    ? fmsScores  : null,
            inbody_data:     hasInbody ? inbodyData : null,
            trainer_comment: comment.trim() || null,
        };
    }


    // ── 저장 ──────────────────────────────────────────────────────
    async function _saveReport() {
        const saveBtn = document.getElementById('wr-save-btn');
        const msgEl   = document.getElementById('wr-save-msg');

        const data = _collectFormData();

        // 클라이언트 측 phase 검증
        if (!Number.isInteger(data.phase) || data.phase < 1) {
            if (msgEl) { msgEl.textContent = '⚠️ 회차(Phase)는 1 이상의 정수여야 합니다'; msgEl.className = 'wr-form-save-hint wr-form-save-hint--err'; }
            return;
        }

        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }
        if (msgEl)   { msgEl.textContent = ''; msgEl.className = 'wr-form-save-hint'; }

        try {
            const res = await _api('POST', '', data);
            _savedReportId = res.id;

            if (msgEl) {
                msgEl.textContent = `✅ 저장 완료 (ID: ${_e(res.id.slice(0, 8))}...)`;
                msgEl.className   = 'wr-form-save-hint wr-form-save-hint--ok';
            }

            // PDF 버튼 활성화
            const pdfBtn = document.getElementById('wr-pdf-btn');
            if (pdfBtn) pdfBtn.disabled = false;

            // 리포트 목록 갱신
            await _loadReportList();

        } catch (e) {
            if (msgEl) {
                msgEl.textContent = `❌ 저장 실패: ${_e(e.message)}`;
                msgEl.className   = 'wr-form-save-hint wr-form-save-hint--err';
            }
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 저장'; }
        }
    }


    // ── PDF 생성 ──────────────────────────────────────────────────
    async function _generatePdf() {
        if (!_savedReportId) {
            alert('먼저 리포트를 저장하세요');
            return;
        }

        const pdfBtn = document.getElementById('wr-pdf-btn');
        const msgEl  = document.getElementById('wr-save-msg');

        if (pdfBtn) { pdfBtn.disabled = true; pdfBtn.textContent = 'PDF 생성 중...'; }

        try {
            const res = await _api('POST', `/${encodeURIComponent(_savedReportId)}/pdf-url`, {});

            if (msgEl) {
                msgEl.textContent = '📄 PDF URL 생성 완료';
                msgEl.className   = 'wr-form-save-hint wr-form-save-hint--ok';
            }

            // 새 탭에서 PDF 열기
            window.open(res.pdf_url, '_blank', 'noopener');

            // 리포트 목록 갱신 (PDF 배지 표시)
            await _loadReportList();

        } catch (e) {
            if (msgEl) {
                msgEl.textContent = `❌ PDF 생성 실패: ${_e(e.message)}`;
                msgEl.className   = 'wr-form-save-hint wr-form-save-hint--err';
            }
        } finally {
            if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.textContent = '📄 PDF 생성'; }
        }
    }


    // ── 진입점 ────────────────────────────────────────────────────
    /**
     * admin-app.js의 navigate('hotel-workout-reports') 호출 시 실행되는 render()
     * 상태 초기화 후 hotel 단지 선택 화면 표시
     */
    async function render() {
        _selectedComplex  = null;
        _selectedMember   = null;
        _reports          = [];
        _savedReportId    = null;
        _searchQuery      = '';
        _memberResults    = [];

        const root = document.getElementById('wr-root');
        if (!root) {
            console.warn('[hotelWorkoutReports] #wr-root 엘리먼트가 없습니다. admin/index.html에 추가하세요.');
            return;
        }

        root.innerHTML = _skeletonHtml();
        await _loadHotelComplexList();
    }


    // ── public API ────────────────────────────────────────────────
    return {
        render,

        // 단지 선택
        _loadHotelComplexList,
        _selectComplex,

        // 회원 검색
        _renderMemberSearch,
        _onSearchInput,
        _doSearch,
        _selectMember,

        // 리포트 목록
        _viewReport,

        // 폼
        _onFmsChange,
        _saveReport,
        _generatePdf,
    };

})();

/*
 * ── 운영자 연동 가이드 ─────────────────────────────────────────────
 *
 * 1. admin/index.html <head>에 CSS 추가:
 *    <link rel="stylesheet" href="css/hotel-workout-reports.css" />
 *
 * 2. admin/index.html <body>에 컨테이너 추가:
 *    <div id="wr-root"></div>
 *    (다른 페이지 컨테이너와 함께, 라우터가 show/hide 처리)
 *
 * 3. admin/index.html 사이드바에 메뉴 항목 추가:
 *    <li><a href="#" onclick="navigate('hotel-workout-reports')">🏋️ 운동 리포트</a></li>
 *
 * 4. admin/js/admin-app.js의 pageMap 객체에 항목 추가:
 *    'hotel-workout-reports': hotelWorkoutReports,
 *
 * 5. admin/js/admin-app.js의 스크립트 로드 목록에 이 파일 추가:
 *    <script src="js/pages/hotel-workout-reports.js"></script>
 *
 * ── Feature Flag ────────────────────────────────────────────────
 *
 * 서버: ENABLE_HOTEL_MEMBER_PAGE=true (.env 또는 Vercel 환경변수)
 * 클라이언트: 별도 Flag 없음 — API 403 응답 시 안내 화면 자동 전환
 */
