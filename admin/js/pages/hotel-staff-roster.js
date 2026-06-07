/**
 * admin/js/pages/hotel-staff-roster.js
 * 라마다 임직원 명단 관리 admin 페이지
 *
 * 설계 원칙:
 *   - venue_type='hotel' 단지에서만 활성화
 *   - Feature Flag(ENABLE_HOTEL_MODE) OFF → API 실패 시 안내 화면
 *   - 기존 admin 라우팅·메뉴 구조 변경 금지 — 독립 객체(hotelStaffRoster)로 격리
 *   - 개인정보 최소 수집: 사번·이름·휴대폰 뒤 4자리·부서·VIP 여부만
 *   - ⚠️ 휴대폰 전체 번호 수집 금지 — phone_last4(4자리)만 저장
 *   - hotel_staff 테이블 (id, complex_id, staff_no, name, phone_last4,
 *                         department, is_vip, is_active, created_at)
 *   - 출입 로그 / 혼잡도 컬럼 추가 금지
 *   - VIP 등급 외 별도 등급 시스템 추가 금지
 *
 * API 엔드포인트 (GET/POST/PATCH/DELETE /api/hotel/staff/*):
 *   GET    /api/hotel/staff?complex_id=&search=&limit=&offset=
 *   POST   /api/hotel/staff                    ← 1건 등록
 *   PATCH  /api/hotel/staff/:id                ← is_active 토글 / 필드 수정
 *   DELETE /api/hotel/staff/:id                ← 1건 삭제
 *   POST   /api/hotel/staff/bulk               ← CSV 일괄 등록
 *
 * ⚠️  위 /api/hotel/staff 라우트가 아직 서버에 없는 경우:
 *     server/routes/hotel/staff-roster.js 신규 생성 + server/index.js 마운트 후 사용.
 *     운영자 연동 가이드는 이 파일 하단 주석 참고.
 *
 * 사용 방법 (admin/index.html):
 *   <link rel="stylesheet" href="css/hotel-staff-roster.css">
 *   <script src="js/pages/hotel-staff-roster.js"></script>
 *   navigate('hotel-staff-roster') → hotelStaffRoster.render()
 *
 * 단계: D-2 / 작성일: 2026-06-07
 */

'use strict';

/* ────────────────────────────────────────────────────────────────────
   hotelStaffRoster — 기존 페이지 객체(dashboard, instructors 등)와
   동일한 패턴으로 작성. 전역 네임스페이스에 등록.
   ──────────────────────────────────────────────────────────────────── */
const hotelStaffRoster = {

    // ── 상태 ─────────────────────────────────────────────────────
    /** @type {{ id: string, name: string, code: string }|null} */
    selectedComplex: null,

    /** @type {Array}  현재 로드된 명단 */
    _list: [],

    /** @type {string}  검색어 */
    _search: '',

    /** @type {string|null}  CSV 미리보기 중인 파싱 결과 */
    _csvPreview: null,

    // ── XSS 방어 ─────────────────────────────────────────────────
    _e(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    // ── 날짜 포맷 ────────────────────────────────────────────────
    _fmtDate(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleDateString('ko-KR', {
                year: 'numeric', month: '2-digit', day: '2-digit',
            });
        } catch { return iso; }
    },

    // ── 공통 API fetch ───────────────────────────────────────────
    /**
     * /api/hotel/staff/* 엔드포인트 래퍼
     * js/api.js 의 hotel 네임스페이스가 없으므로 직접 fetch 사용.
     * Content-Type: application/json
     */
    async _api(method, path, body) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const res  = await fetch('/api/hotel/staff' + path, opts);
        const data = await res.json();
        if (!res.ok || data.success === false) {
            throw new Error(data.error || `HTTP ${res.status}`);
        }
        return data;
    },

    // ── 진입점 ───────────────────────────────────────────────────
    async render() {
        const contentEl = document.getElementById('pageContent');
        if (!contentEl) return;

        contentEl.innerHTML = this._skeletonHtml();
        await this._loadHotelComplexList();
    },

    // ── 스켈레톤 ─────────────────────────────────────────────────
    _skeletonHtml() {
        return `
        <div class="page-header">
            <h2><i class="fas fa-id-badge"></i> 임직원 명단 관리</h2>
            <div class="header-actions">
                <button class="btn-secondary btn-sm" onclick="hotelStaffRoster.render()">
                    <i class="fas fa-sync"></i> 새로고침
                </button>
            </div>
        </div>
        <div id="srContent">
            <div class="sr-loading"><i class="fas fa-spinner fa-spin"></i> 호텔 단지 목록을 불러오는 중...</div>
        </div>`;
    },

    // ── Step 1: 호텔 단지 목록 조회 ──────────────────────────────
    async _loadHotelComplexList() {
        const wrap = document.getElementById('srContent');
        if (!wrap) return;

        try {
            const res    = await API.complexes.list();
            const hotels = (res.data || []).filter(cx => cx.venue_type === 'hotel');

            if (!hotels.length) {
                wrap.innerHTML = this._noHotelHtml();
                return;
            }

            // 단지 1개면 자동 선택, 이미 선택된 단지 유지
            if (!this.selectedComplex || !hotels.find(h => h.id === this.selectedComplex.id)) {
                this.selectedComplex = { id: hotels[0].id, name: hotels[0].name, code: hotels[0].code };
            }

            wrap.innerHTML = this._mainLayoutHtml(hotels);
            this._bindDragDrop();
            await this._loadRoster();

        } catch (e) {
            wrap.innerHTML = this._flagOffHtml(e.message);
        }
    },

    // ── 메인 레이아웃 HTML ────────────────────────────────────────
    _mainLayoutHtml(hotels) {
        const cx = this.selectedComplex;

        const selectorHtml = hotels.length > 1
            ? `<select class="sr-select" id="srComplexSelect"
                   onchange="hotelStaffRoster._onComplexChange(this.value)">
                   ${hotels.map(h =>
                       `<option value="${this._e(h.id)}"
                            data-name="${this._e(h.name)}"
                            data-code="${this._e(h.code)}"
                            ${h.id === cx.id ? 'selected' : ''}>
                           ${this._e(h.name)} (${this._e(h.code)})
                       </option>`
                   ).join('')}
               </select>`
            : `<span class="sr-complex-badge"><i class="fas fa-hotel"></i> ${this._e(cx.name)}</span>`;

        return `
        <!-- 단지 선택 바 -->
        <div class="sr-top-bar">
            <div class="sr-complex-row">
                <label class="sr-label"><i class="fas fa-hotel"></i> 호텔 단지</label>
                ${selectorHtml}
            </div>
            <!-- 액션 버튼 4개 -->
            <div class="sr-actions">
                <button class="sr-btn sr-btn-primary" onclick="hotelStaffRoster._openAddModal()">
                    <i class="fas fa-user-plus"></i> 수동 추가
                </button>
                <label class="sr-btn sr-btn-secondary sr-btn-upload" for="srCsvInput">
                    <i class="fas fa-file-csv"></i> CSV 업로드
                </label>
                <input type="file" id="srCsvInput" accept=".csv,text/csv"
                       onchange="hotelStaffRoster._onCsvFileSelected(this)"
                       style="display:none">
                <button class="sr-btn sr-btn-secondary" onclick="hotelStaffRoster._downloadCsv()">
                    <i class="fas fa-download"></i> CSV 다운로드
                </button>
            </div>
        </div>

        <!-- 개인정보 안내 배너 -->
        <div class="sr-privacy-notice">
            <i class="fas fa-shield-alt"></i>
            <span>개인정보 최소 수집 원칙 — <strong>휴대폰 번호 전체는 저장하지 않습니다.</strong>
            사번·이름·전화 뒤 4자리·부서·VIP 여부만 수집합니다.</span>
        </div>

        <!-- 검색 바 -->
        <div class="sr-search-bar">
            <i class="fas fa-search sr-search-icon"></i>
            <input type="text" class="sr-search-input" id="srSearchInput"
                   placeholder="사번 또는 이름으로 검색..."
                   value="${this._e(this._search)}"
                   oninput="hotelStaffRoster._onSearch(this.value)">
            ${this._search ? `<button class="sr-search-clear" onclick="hotelStaffRoster._clearSearch()">✕</button>` : ''}
        </div>

        <!-- 명단 테이블 -->
        <div class="sr-table-wrap" id="srTableWrap">
            <div class="sr-loading"><i class="fas fa-spinner fa-spin"></i> 명단 로딩 중...</div>
        </div>

        <!-- 페이지 하단 안내 -->
        <p class="sr-guide-note">
            <i class="fas fa-info-circle"></i>
            임직원 인증은 사번 + 전화 뒤 4자리 조합으로 이루어집니다.
            비활성 처리 시 즉시 로그인 불가 상태로 전환됩니다.
        </p>

        <!-- 수동 추가 모달 -->
        ${this._addModalHtml()}

        <!-- CSV 미리보기 모달 -->
        <div class="sr-overlay" id="srCsvOverlay" style="display:none">
            <div class="sr-modal sr-modal-wide">
                <div class="sr-modal-header">
                    <h3><i class="fas fa-table"></i> CSV 미리보기</h3>
                    <button class="sr-modal-close" onclick="hotelStaffRoster._closeCsvModal()">✕</button>
                </div>
                <div class="sr-modal-body" id="srCsvPreviewBody">
                    <!-- 미리보기 테이블이 여기에 삽입됨 -->
                </div>
                <div class="sr-modal-footer">
                    <span id="srCsvPreviewCount" class="sr-preview-count"></span>
                    <div class="sr-modal-btns">
                        <button class="sr-btn sr-btn-ghost" onclick="hotelStaffRoster._closeCsvModal()">취소</button>
                        <button class="sr-btn sr-btn-primary" id="srCsvConfirmBtn"
                                onclick="hotelStaffRoster._bulkInsert()">
                            <i class="fas fa-upload"></i> 일괄 등록
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 드래그앤드롭 오버레이 -->
        <div class="sr-drop-overlay" id="srDropOverlay">
            <div class="sr-drop-inner">
                <i class="fas fa-file-csv"></i>
                <p>CSV 파일을 여기에 놓으세요</p>
            </div>
        </div>`;
    },

    // ── 수동 추가 모달 HTML ───────────────────────────────────────
    _addModalHtml() {
        return `
        <div class="sr-overlay" id="srAddOverlay" style="display:none">
            <div class="sr-modal">
                <div class="sr-modal-header">
                    <h3><i class="fas fa-user-plus"></i> 임직원 수동 추가</h3>
                    <button class="sr-modal-close" onclick="hotelStaffRoster._closeAddModal()">✕</button>
                </div>
                <div class="sr-modal-body">
                    <form id="srAddForm" onsubmit="hotelStaffRoster._submitAdd(event)">
                        <div class="sr-field-grid">
                            <div class="sr-field">
                                <label class="sr-field-label">사번 <span class="sr-required">*</span></label>
                                <input type="text" id="addStaffNo" class="sr-input"
                                       placeholder="예: EMP001" maxlength="50" required>
                            </div>
                            <div class="sr-field">
                                <label class="sr-field-label">이름 <span class="sr-required">*</span></label>
                                <input type="text" id="addName" class="sr-input"
                                       placeholder="예: 홍길동" maxlength="50" required>
                            </div>
                            <div class="sr-field">
                                <label class="sr-field-label">
                                    휴대폰 뒤 4자리 <span class="sr-required">*</span>
                                    <span class="sr-field-hint">전체 번호 수집 금지</span>
                                </label>
                                <input type="text" id="addPhoneLast4" class="sr-input"
                                       placeholder="1234" pattern="[0-9]{4}" maxlength="4"
                                       inputmode="numeric" required>
                            </div>
                            <div class="sr-field">
                                <label class="sr-field-label">부서</label>
                                <input type="text" id="addDepartment" class="sr-input"
                                       placeholder="예: 프론트, 하우스키핑" maxlength="100">
                            </div>
                            <div class="sr-field sr-field-full">
                                <label class="sr-field-label">VIP 여부</label>
                                <label class="sr-toggle-wrap">
                                    <input type="checkbox" id="addIsVip" class="sr-toggle-input">
                                    <span class="sr-toggle-slider"></span>
                                    <span class="sr-toggle-label" id="addIsVipLabel">일반</span>
                                </label>
                                <p class="sr-field-desc">VIP 체크 시 30% 할인 + VIP 전용 혜택 적용</p>
                            </div>
                        </div>
                        <div class="sr-form-err" id="srAddErr" style="display:none"></div>
                    </form>
                </div>
                <div class="sr-modal-footer">
                    <div class="sr-modal-btns">
                        <button class="sr-btn sr-btn-ghost" onclick="hotelStaffRoster._closeAddModal()">취소</button>
                        <button class="sr-btn sr-btn-primary" id="srAddSubmitBtn"
                                onclick="hotelStaffRoster._submitAdd(event)">
                            <i class="fas fa-save"></i> 저장
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    },

    // ── Step 2: 명단 조회 ────────────────────────────────────────
    async _loadRoster() {
        const wrap = document.getElementById('srTableWrap');
        if (!wrap) return;

        const cx = this.selectedComplex;
        if (!cx) return;

        wrap.innerHTML = '<div class="sr-loading"><i class="fas fa-spinner fa-spin"></i> 명단 로딩 중...</div>';

        try {
            const qs = new URLSearchParams({
                complex_id: cx.id,
                ...(this._search ? { search: this._search } : {}),
                limit: 500,
            }).toString();

            const res   = await this._api('GET', `?${qs}`);
            this._list  = res.data || [];
            this._renderTable();
        } catch (e) {
            wrap.innerHTML = `<p class="sr-error"><i class="fas fa-exclamation-circle"></i> 명단 로드 실패: ${this._e(e.message)}</p>`;
        }
    },

    // ── 테이블 렌더링 ────────────────────────────────────────────
    _renderTable() {
        const wrap = document.getElementById('srTableWrap');
        if (!wrap) return;

        if (!this._list.length) {
            wrap.innerHTML = `
                <div class="sr-empty">
                    <i class="fas fa-users-slash"></i>
                    <p>${this._search ? '검색 결과가 없습니다.' : '등록된 임직원이 없습니다.'}</p>
                    <p class="sr-empty-sub">
                        CSV 업로드 또는 수동 추가로 명단을 등록하세요.
                    </p>
                </div>`;
            return;
        }

        const rows = this._list.map(s => `
            <tr class="${s.is_active ? '' : 'sr-row-inactive'}">
                <td class="sr-col-staffno">
                    <code class="sr-code">${this._e(s.staff_no)}</code>
                </td>
                <td class="sr-col-name">${this._e(s.name)}</td>
                <td class="sr-col-phone">
                    <span class="sr-phone-masked">
                        <i class="fas fa-phone-alt"></i> ···· ${this._e(s.phone_last4)}
                    </span>
                </td>
                <td class="sr-col-dept">${this._e(s.department || '—')}</td>
                <td class="sr-col-vip">
                    ${s.is_vip
                        ? '<span class="sr-badge sr-badge-vip"><i class="fas fa-crown"></i> VIP</span>'
                        : '<span class="sr-badge sr-badge-normal">일반</span>'}
                </td>
                <td class="sr-col-active">
                    <button class="sr-toggle-btn ${s.is_active ? 'active' : 'inactive'}"
                            onclick="hotelStaffRoster._toggleActive('${this._e(s.id)}', ${s.is_active})"
                            title="${s.is_active ? '비활성으로 전환' : '활성으로 전환'}">
                        ${s.is_active ? '활성' : '비활성'}
                    </button>
                </td>
                <td class="sr-col-date">${this._fmtDate(s.created_at)}</td>
                <td class="sr-col-action">
                    <button class="sr-del-btn"
                            onclick="hotelStaffRoster._deleteStaff('${this._e(s.id)}', '${this._e(s.name)}', '${this._e(s.staff_no)}')"
                            title="삭제">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>`).join('');

        wrap.innerHTML = `
            <table class="sr-table">
                <thead>
                    <tr>
                        <th class="sr-col-staffno">사번</th>
                        <th class="sr-col-name">이름</th>
                        <th class="sr-col-phone">휴대폰 뒤 4자리</th>
                        <th class="sr-col-dept">부서</th>
                        <th class="sr-col-vip">VIP</th>
                        <th class="sr-col-active">활성</th>
                        <th class="sr-col-date">등록일</th>
                        <th class="sr-col-action"></th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="sr-table-foot">총 ${this._list.length}명 등록</p>`;
    },

    // ── 단지 변경 ────────────────────────────────────────────────
    _onComplexChange(id) {
        const sel = document.getElementById('srComplexSelect');
        if (!sel) return;
        const opt = sel.options[sel.selectedIndex];
        this.selectedComplex = {
            id,
            name: opt.dataset.name || '',
            code: opt.dataset.code || '',
        };
        this._search = '';
        this._loadRoster();
    },

    // ── 검색 ─────────────────────────────────────────────────────
    _onSearch(val) {
        this._search = val.trim();
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this._loadRoster(), 350);
    },

    _clearSearch() {
        this._search = '';
        const inp = document.getElementById('srSearchInput');
        if (inp) inp.value = '';
        this._loadRoster();
    },

    // ── 활성/비활성 토글 ─────────────────────────────────────────
    async _toggleActive(id, currentActive) {
        const nextActive = !currentActive;
        const label      = nextActive ? '활성' : '비활성';
        if (!confirm(`이 임직원을 ${label} 상태로 전환하시겠습니까?`)) return;

        try {
            await this._api('PATCH', `/${id}`, { is_active: nextActive });
            await this._loadRoster();
        } catch (e) {
            alert(`상태 변경 실패: ${e.message}`);
        }
    },

    // ── 1건 삭제 ────────────────────────────────────────────────
    async _deleteStaff(id, name, staffNo) {
        if (!confirm(`[${staffNo}] ${name} 임직원을 삭제하시겠습니까?\n삭제 후 복구가 불가합니다.`)) return;

        try {
            await this._api('DELETE', `/${id}`);
            await this._loadRoster();
        } catch (e) {
            alert(`삭제 실패: ${e.message}`);
        }
    },

    // ── 수동 추가 모달 ───────────────────────────────────────────
    _openAddModal() {
        const overlay = document.getElementById('srAddOverlay');
        if (!overlay) return;

        // 폼 초기화
        const f = document.getElementById('srAddForm');
        if (f) f.reset();
        document.getElementById('srAddErr').style.display = 'none';
        this._setVipLabel(false);

        // VIP 토글 라벨 연동
        const vipChk = document.getElementById('addIsVip');
        if (vipChk) {
            vipChk.onchange = () => this._setVipLabel(vipChk.checked);
        }

        overlay.style.display = 'flex';
        document.getElementById('addStaffNo')?.focus();
    },

    _closeAddModal() {
        const overlay = document.getElementById('srAddOverlay');
        if (overlay) overlay.style.display = 'none';
    },

    _setVipLabel(isVip) {
        const lbl = document.getElementById('addIsVipLabel');
        if (lbl) lbl.textContent = isVip ? 'VIP' : '일반';
    },

    async _submitAdd(e) {
        if (e) e.preventDefault();

        const staffNo    = document.getElementById('addStaffNo')?.value.trim();
        const name       = document.getElementById('addName')?.value.trim();
        const phoneLast4 = document.getElementById('addPhoneLast4')?.value.trim();
        const department = document.getElementById('addDepartment')?.value.trim() || null;
        const isVip      = document.getElementById('addIsVip')?.checked || false;
        const errEl      = document.getElementById('srAddErr');

        // 유효성 검사
        if (!staffNo) return this._showFormErr(errEl, '사번을 입력하세요.');
        if (!name)    return this._showFormErr(errEl, '이름을 입력하세요.');
        if (!/^\d{4}$/.test(phoneLast4))
            return this._showFormErr(errEl, '휴대폰 뒤 4자리는 숫자 4자리여야 합니다.');

        const btn = document.getElementById('srAddSubmitBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }
        errEl.style.display = 'none';

        try {
            await this._api('POST', '', {
                complex_id:  this.selectedComplex.id,
                staff_no:    staffNo,
                name,
                phone_last4: phoneLast4,
                department,
                is_vip:      isVip,
            });
            this._closeAddModal();
            await this._loadRoster();
        } catch (err) {
            this._showFormErr(errEl, err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
        }
    },

    _showFormErr(el, msg) {
        if (!el) return;
        el.textContent    = msg;
        el.style.display  = 'block';
    },

    // ── CSV 업로드: 파일 선택 ────────────────────────────────────
    _onCsvFileSelected(input) {
        const file = input.files?.[0];
        if (!file) return;
        // input 초기화 (같은 파일 재선택 허용)
        input.value = '';
        this._parseCsvFile(file);
    },

    // ── CSV 파싱 ─────────────────────────────────────────────────
    /**
     * CSV 포맷: staff_no,name,phone_last4,department,is_vip
     * BOM 허용, 헤더 행 1줄, 이하 데이터 행
     */
    _parseCsvFile(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                let text = ev.target.result;
                // BOM 제거
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

                const lines = text.split(/\r?\n/).filter(l => l.trim());
                if (lines.length < 2) {
                    alert('CSV 파일에 데이터가 없습니다. 헤더 행을 제외하고 최소 1행이 필요합니다.');
                    return;
                }

                // 헤더 파싱 (소문자 + trim)
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
                const required = ['staff_no', 'name', 'phone_last4'];
                const missing  = required.filter(r => !headers.includes(r));
                if (missing.length) {
                    alert(`CSV 헤더 오류: ${missing.join(', ')} 컬럼이 없습니다.\n필수 헤더: staff_no, name, phone_last4`);
                    return;
                }

                const idxMap = {};
                headers.forEach((h, i) => { idxMap[h] = i; });

                // 데이터 파싱
                const rows = [];
                const errors = [];

                for (let i = 1; i < lines.length; i++) {
                    const cols = this._parseCsvLine(lines[i]);
                    const row  = {
                        staff_no:    (cols[idxMap['staff_no']]    || '').trim(),
                        name:        (cols[idxMap['name']]        || '').trim(),
                        phone_last4: (cols[idxMap['phone_last4']] || '').trim(),
                        department:  idxMap['department']  != null ? (cols[idxMap['department']]  || '').trim() || null : null,
                        is_vip:      idxMap['is_vip']      != null ? this._parseBool(cols[idxMap['is_vip']]) : false,
                        _rowNum:     i + 1,
                    };

                    // 행 유효성 검사
                    if (!row.staff_no)  { errors.push(`행 ${row._rowNum}: 사번 누락`); continue; }
                    if (!row.name)      { errors.push(`행 ${row._rowNum}: 이름 누락`); continue; }
                    if (!/^\d{4}$/.test(row.phone_last4)) {
                        errors.push(`행 ${row._rowNum}: phone_last4 형식 오류 (숫자 4자리 필요, 현재: "${row.phone_last4}")`);
                        continue;
                    }
                    rows.push(row);
                }

                if (!rows.length && errors.length) {
                    alert(`CSV 파싱 오류:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... 외 ${errors.length - 5}건` : ''}`);
                    return;
                }

                this._csvPreview = rows;
                this._showCsvPreview(rows, errors);

            } catch (err) {
                alert(`CSV 파싱 중 오류: ${err.message}`);
            }
        };
        reader.readAsText(file, 'UTF-8');
    },

    /** CSV 한 행을 컬럼 배열로 파싱 (인용부호 처리) */
    _parseCsvLine(line) {
        const cols = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                else inQ = !inQ;
            } else if (ch === ',' && !inQ) {
                cols.push(cur); cur = '';
            } else {
                cur += ch;
            }
        }
        cols.push(cur);
        return cols;
    },

    _parseBool(val) {
        if (!val) return false;
        const v = String(val).trim().toLowerCase();
        return v === 'true' || v === '1' || v === 'yes' || v === 'y' || v === '예';
    },

    // ── CSV 미리보기 표시 ─────────────────────────────────────────
    _showCsvPreview(rows, errors) {
        const overlay = document.getElementById('srCsvOverlay');
        const body    = document.getElementById('srCsvPreviewBody');
        const count   = document.getElementById('srCsvPreviewCount');
        if (!overlay || !body) return;

        const errHtml = errors.length
            ? `<div class="sr-csv-warn">
                   <i class="fas fa-exclamation-triangle"></i>
                   오류로 제외된 ${errors.length}행:
                   <ul>${errors.slice(0, 10).map(e => `<li>${this._e(e)}</li>`).join('')}
                   ${errors.length > 10 ? `<li>... 외 ${errors.length - 10}건</li>` : ''}</ul>
               </div>` : '';

        const tableRows = rows.map(r => `
            <tr>
                <td><code class="sr-code">${this._e(r.staff_no)}</code></td>
                <td>${this._e(r.name)}</td>
                <td>···· ${this._e(r.phone_last4)}</td>
                <td>${this._e(r.department || '—')}</td>
                <td>${r.is_vip ? '<span class="sr-badge sr-badge-vip">VIP</span>' : '<span class="sr-badge sr-badge-normal">일반</span>'}</td>
            </tr>`).join('');

        body.innerHTML = `
            ${errHtml}
            <table class="sr-table sr-table-preview">
                <thead>
                    <tr>
                        <th>사번</th><th>이름</th>
                        <th>휴대폰 뒤 4자리</th><th>부서</th><th>VIP</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>`;

        if (count) count.textContent = `${rows.length}명 등록 예정${errors.length ? ` / ${errors.length}행 제외` : ''}`;

        overlay.style.display = 'flex';
    },

    _closeCsvModal() {
        const overlay = document.getElementById('srCsvOverlay');
        if (overlay) overlay.style.display = 'none';
        this._csvPreview = null;
    },

    // ── CSV 일괄 INSERT ─────────────────────────────────────────
    async _bulkInsert() {
        if (!this._csvPreview?.length) return;

        const btn = document.getElementById('srCsvConfirmBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 등록 중...'; }

        const records = this._csvPreview.map(r => ({
            complex_id:  this.selectedComplex.id,
            staff_no:    r.staff_no,
            name:        r.name,
            phone_last4: r.phone_last4,
            department:  r.department || null,
            is_vip:      r.is_vip,
        }));

        try {
            const res = await this._api('POST', '/bulk', {
                complex_id: this.selectedComplex.id,
                records,
            });

            const inserted = res.inserted ?? records.length;
            const skipped  = res.skipped  ?? 0;
            const dupList  = res.duplicates || [];

            let msg = `✅ ${inserted}명 등록 완료.`;
            if (skipped > 0) {
                msg += `\n⚠️ ${skipped}명 중복 사번으로 건너뜀:`;
                dupList.slice(0, 5).forEach(d => { msg += `\n  · ${d.staff_no} (${d.name})`; });
                if (dupList.length > 5) msg += `\n  · 외 ${dupList.length - 5}건`;
            }
            alert(msg);
            this._closeCsvModal();
            await this._loadRoster();
        } catch (e) {
            alert(`일괄 등록 실패: ${e.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> 일괄 등록'; }
        }
    },

    // ── CSV 다운로드 ─────────────────────────────────────────────
    _downloadCsv() {
        if (!this._list.length) {
            alert('다운로드할 명단이 없습니다.');
            return;
        }

        const BOM  = '\uFEFF'; // Excel 한글 인코딩
        const head = 'staff_no,name,phone_last4,department,is_vip,is_active,created_at\n';
        const body = this._list.map(s => [
            this._csvEsc(s.staff_no),
            this._csvEsc(s.name),
            this._csvEsc(s.phone_last4),
            this._csvEsc(s.department || ''),
            s.is_vip    ? 'true' : 'false',
            s.is_active ? 'true' : 'false',
            s.created_at ? new Date(s.created_at).toISOString().slice(0, 10) : '',
        ].join(',')).join('\n');

        const blob = new Blob([BOM + head + body], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const cx   = this.selectedComplex;
        const date = new Date().toISOString().slice(0, 10);

        const a    = document.createElement('a');
        a.href     = url;
        a.download = `hotel_staff_${cx ? cx.code : 'export'}_${date}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /** CSV 셀 값 이스케이프 (쉼표·쌍따옴표 포함 시 인용) */
    _csvEsc(val) {
        const s = String(val ?? '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    },

    // ── 드래그앤드롭 CSV ─────────────────────────────────────────
    _bindDragDrop() {
        const wrap    = document.getElementById('srContent');
        const overlay = document.getElementById('srDropOverlay');
        if (!wrap || !overlay) return;

        let dragCounter = 0;

        wrap.addEventListener('dragenter', (e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            dragCounter++;
            overlay.classList.add('active');
        });

        wrap.addEventListener('dragleave', (e) => {
            dragCounter--;
            if (dragCounter <= 0) { dragCounter = 0; overlay.classList.remove('active'); }
        });

        wrap.addEventListener('dragover', (e) => { e.preventDefault(); });

        wrap.addEventListener('drop', (e) => {
            e.preventDefault();
            dragCounter = 0;
            overlay.classList.remove('active');
            const file = Array.from(e.dataTransfer.files).find(f =>
                f.type === 'text/csv' || f.name.endsWith('.csv')
            );
            if (!file) { alert('CSV 파일만 업로드 가능합니다.'); return; }
            this._parseCsvFile(file);
        });
    },

    // ── Feature Flag OFF / 호텔 단지 없음 안내 HTML ──────────────
    _flagOffHtml(errMsg) {
        return `
        <div class="sr-flag-off">
            <div class="sr-flag-off-icon"><i class="fas fa-toggle-off"></i></div>
            <h3>호텔 모드 비활성화 또는 접근 오류</h3>
            <p>
                ENABLE_HOTEL_MODE 환경변수가 <code>false</code>이거나<br>
                API 접근 중 오류가 발생했습니다.
            </p>
            ${errMsg ? `<p class="sr-error-detail">${this._e(errMsg)}</p>` : ''}
            <p>활성화 방법: <code>.env</code> 에서 <code>ENABLE_HOTEL_MODE=true</code> 설정 후 서버 재시작</p>
        </div>`;
    },

    _noHotelHtml() {
        return `
        <div class="sr-flag-off">
            <div class="sr-flag-off-icon"><i class="fas fa-hotel"></i></div>
            <h3>등록된 호텔 단지 없음</h3>
            <p>
                <code>venue_type = 'hotel'</code>인 단지가 없습니다.<br>
                단지 관리에서 신규 단지를 추가하고 venue_type을 <code>hotel</code>로 설정하세요.
            </p>
        </div>`;
    },
};

/* ── navigate() 연동 가이드 ────────────────────────────────────────
   기존 admin-app.js 의 navigate() switch 문에 아래 케이스 추가:

   case 'hotel-staff-roster':
       hotelStaffRoster.render();
       break;

   사이드바 항목 예시 (admin/index.html):
   <li data-page="hotel-staff-roster" onclick="navigate('hotel-staff-roster')">
       <i class="fas fa-id-badge"></i> <span>임직원 명단</span>
   </li>

   스크립트/CSS 로드 예시 (admin/index.html <head> / 스크립트 구역):
   <link rel="stylesheet" href="css/hotel-staff-roster.css">
   <script src="js/pages/hotel-staff-roster.js"></script>
   ────────────────────────────────────────────────────────────────── */

/* ── 서버 라우트 연동 가이드 ─────────────────────────────────────────
   hotel_staff CRUD용 /api/hotel/staff 라우트가 필요합니다.
   server/ 수정 권한이 있을 때 아래 절차로 추가하세요:

   1. server/routes/hotel/staff-roster.js 신규 생성
      - GET    / → complex_id + search 로 hotel_staff 조회
      - POST   / → 1건 INSERT (staff_no UNIQUE 위반 시 409)
      - PATCH  /:id → is_active / 필드 PATCH
      - DELETE /:id → 1건 DELETE
      - POST   /bulk → records 배열 일괄 INSERT
                       중복 staff_no 는 skip 후 { duplicates: [] } 반환

   2. server/index.js if(flags.hotelMode) 블록에 추가:
      const hotelStaffRosterRouter = require('./routes/hotel/staff-roster');
      app.use('/api/hotel/staff', hotelStaffRosterRouter);
   ────────────────────────────────────────────────────────────────── */
