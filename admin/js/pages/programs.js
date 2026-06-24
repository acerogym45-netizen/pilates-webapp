/** 프로그램 관리 */
const programs = {
    data: [],
    async render() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-dumbbell"></i> 프로그램 관리</h2>
                <button class="btn-primary btn-sm" onclick="programs.showForm()">
                    <i class="fas fa-plus"></i> 프로그램 추가
                </button>
            </div>

            <div id="programList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load() {
        try {
            const params = {};
            params.complexId = getEffectiveComplexId(); if (!params.complexId) delete params.complexId;
            const res = await API.programs.list(params);
            this.data = res.data || [];
            this.renderList();
        } catch(e) { document.getElementById('programList').innerHTML = `<p class="error-hint">${e.message}</p>`; }
    },
    renderList() {
        const c = document.getElementById('programList');
        if (!this.data.length) { c.innerHTML = '<p class="empty-hint">등록된 프로그램이 없습니다</p>'; return; }
        c.innerHTML = this.data.map(p => `
            <div class="list-item">
                <div class="item-status">
                    <span class="status-badge type-badge-${_resolveType(p)}">${typeLabel(_resolveType(p))}</span>
                    ${!p.is_active ? '<span class="status-badge status-muted" title="신규 접수 차단 중 · 해지 신청 및 기존 수강자 현황은 정상 표시">신규접수 차단</span>' : ''}
                </div>
                <div class="item-main">
                    <strong>${p.name}</strong>
                    <p>${p.days || '-'} | ₩${(p.price||0).toLocaleString()}/월 | 정원 ${p.capacity}명</p>
                    <small>${p.complex_code ? `[${p.complex_code}] ` : ''}시간대: ${Array.isArray(p.time_slots) && p.time_slots.length ? p.time_slots.join(', ') : '자유'}</small>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" onclick="programs.showCapacity('${p.id}')"><i class="fas fa-chart-bar"></i></button>
                    <button class="btn-ghost dark btn-sm" onclick="programs.showForm('${p.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-ghost dark btn-sm" onclick="programs.deleteItem('${p.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`).join('');
    },
    showForm(id) {
        const p = id ? this.data.find(x => x.id === id) : null;
        if (!id && !getEffectiveComplexId()) {
            // 마스터 관리자: 먼저 단지 선택
            pickComplexForCreate((complexId, complexName) => {
                programs._openProgramForm(null, complexId, complexName);
            });
            return;
        }
        programs._openProgramForm(p, getEffectiveComplexId());
    },
    _openProgramForm(p, complexId, complexName) {
        const slots    = p && Array.isArray(p.time_slots) ? p.time_slots : [];
        const titleStr = complexName ? `프로그램 추가 — ${complexName}` : (p ? '프로그램 수정' : '프로그램 추가');

        // ── 운영 요일 체크박스 ──────────────────────────────────────────
        const ALL_DAYS  = ['월','화','수','목','금','토','일'];
        const savedDays = (p?.days || '').split(/[,\s·&]+/).map(d => d.trim()).filter(d => ALL_DAYS.includes(d));
        const dayBoxes  = ALL_DAYS.map(d =>
            `<label class="day-cb-lbl">
                <input type="checkbox" name="pDayCheck" value="${d}" ${savedDays.includes(d)?'checked':''}>
                <span>${d}</span>
            </label>`
        ).join('');

        // ── 시간대 프리셋 (06:00~22:00, 30분 간격) ─────────────────────
        const PRESET_TIMES = [
            '06:00','06:30','07:00','07:30','08:00','08:30',
            '09:00','09:30','10:00','10:30','11:00','11:30',
            '12:00','12:30','13:00','13:30','14:00','14:30',
            '15:00','15:30','16:00','16:30','17:00','17:30',
            '18:00','18:30','19:00','19:30','20:00','20:30',
            '21:00','21:30','22:00'
        ];
        const timeBoxes = PRESET_TIMES.map(t =>
            `<label class="time-cb-lbl">
                <input type="checkbox" name="pTimeCheck" value="${t}" ${slots.includes(t)?'checked':''}>
                <span>${t}</span>
            </label>`
        ).join('');

        const resolvedType = _resolveType(p);
        const isPersonal = resolvedType === 'personal' || resolvedType === 'duet';
        const isMakeup   = resolvedType === 'makeup';
        const body = `
            ${complexName ? `<p style="font-size:.85rem;color:#888;margin-bottom:8px"><i class="fas fa-building"></i> ${escHtml(complexName)}</p>` : ''}
            <input type="hidden" id="programComplexId" value="${complexId || ''}">
            <div class="form-group"><label>프로그램명 *</label><input type="text" id="pName" value="${p ? escHtml(p.name) : ''}"></div>
            <div class="form-group">
                <label>유형 *</label>
                <select id="pType" onchange="programs._onTypeChange(this.value)">
                    <option value="group"    ${resolvedType==='group'   ?'selected':''}>그룹</option>
                    <option value="duet"     ${resolvedType==='duet'    ?'selected':''}>듀엣</option>
                    <option value="personal" ${resolvedType==='personal'?'selected':''}>개인</option>
                    <option value="makeup"   ${resolvedType==='makeup'  ?'selected':''}>보강</option>
                </select>
                ${isMakeup ? `<div style="margin-top:6px;padding:8px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:7px;font-size:.8rem;color:#92400e">
                    <i class="fas fa-info-circle" style="color:#f59e0b"></i>
                    <b>보강</b> 유형: 중복 수강 허용 · 자동 승인 · 접수 완료 문자 발송 (입금 안내 없음)
                </div>` : ''}
            </div>
            <div class="form-group">
                <label>운영 요일</label>
                <div class="day-cb-wrap">${dayBoxes}</div>
            </div>
            <div class="form-group" id="pSlotsGroup" style="${isPersonal ? 'display:none' : ''}">
                <label>시간대 <span style="font-size:.8rem;font-weight:normal;color:#888">(그룹수업 — 해당 시간 선택)</span></label>
                <div class="time-cb-wrap">${timeBoxes}</div>
                <div style="display:flex;gap:6px;margin-top:8px;align-items:center">
                    <input type="text" id="pSlotInput" placeholder="직접 입력 (예: 07:45)" style="flex:1;font-size:.85rem"
                        onkeydown="if(event.key==='Enter'){event.preventDefault();programs._addCustomSlot();}">
                    <button type="button" class="btn-secondary btn-sm" onclick="programs._addCustomSlot()">
                        <i class="fas fa-plus"></i> 직접 추가
                    </button>
                </div>
                <small style="color:#999;margin-top:4px;display:block">개인/듀엣은 비워두세요 (입주민 자유 입력)</small>
            </div>
            <div class="form-row">
                <div class="form-group"><label>월 수강료 (원)</label><input type="number" id="pPrice" value="${p?.price||0}"></div>
                <div class="form-group"><label>정원 (명)</label><input type="number" id="pCapacity" value="${p?.capacity||6}"></div>
            </div>
            <div class="form-group">
                <label>수강 기간 <small style="font-weight:normal;color:#888">(일수, 비우면 자동계산 미사용)</small></label>
                <div style="display:flex;align-items:center;gap:8px">
                    <input type="number" id="pDurationDays" value="${p?.duration_days||''}" min="1" max="365" placeholder="예: 28" style="width:100px">
                    <span style="font-size:.82rem;color:#888">일</span>
                    <span style="font-size:.78rem;color:#aaa;margin-left:4px">주1회×4주=28일 / 주2회×4주=28일 / 주2회×8주=56일 / 주2회×12주=84일</span>
                </div>
            </div>
            <div class="form-group"><label>설명</label><textarea id="pDesc" rows="3">${p ? escHtml(p.description||'') : ''}</textarea></div>
            <div class="form-group"><label>표시 순서</label><input type="number" id="pOrder" value="${p?.display_order||0}"></div>
            <!-- 헬스장 모드 전용: 예약금(보증금) 설정 -->
            <div style="background:linear-gradient(135deg,#fff7ed,#ffedd5);border:1.5px solid #fed7aa;border-radius:10px;padding:14px 16px;margin-top:4px">
                <div style="font-weight:700;font-size:.88rem;color:#c2410c;margin-bottom:10px">
                    <i class="fas fa-shield-alt"></i> 예약금(노쇼 방지 보증금) — 헬스장 모드 전용
                </div>
                <label class="checkbox-label" style="margin-bottom:8px">
                    <input type="checkbox" id="pDepositEnabled" ${p?.deposit_enabled ? 'checked' : ''}
                           onchange="programs._onDepositToggle(this.checked)">
                    <span style="font-weight:600;color:#c2410c">예약금 ON
                        <small style="color:#666;font-weight:normal;display:block;margin-top:1px">
                            체크 시: 신청 완료 화면에 예약금 납부 안내 표시
                        </small>
                    </span>
                </label>
                <div id="pDepositAmountWrap" style="${p?.deposit_enabled ? '' : 'display:none'};display:${p?.deposit_enabled ? 'flex' : 'none'};align-items:center;gap:8px;margin-top:6px">
                    <label style="font-size:.85rem;font-weight:600;color:#374151;white-space:nowrap">예약금 금액</label>
                    <input type="number" id="pDepositAmount" value="${p?.deposit_amount||0}" min="0" step="1000"
                           style="width:130px;padding:7px 10px;border:1.5px solid #fed7aa;border-radius:7px;font-size:.88rem">
                    <span style="font-size:.85rem;color:#888">원</span>
                </div>
            </div>
            ${isPersonal ? `
            <div class="form-group" id="pAlwaysOpenLessonWrap" style="padding:12px 14px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px">
                <label class="checkbox-label">
                    <input type="checkbox" id="pAlwaysOpenLesson" ${p?.always_open_lesson ? 'checked' : ''}>
                    <span style="font-weight:600;color:#2e7d32">상시 접수 ON
                        <small style="color:#555;font-weight:normal;display:block;margin-top:2px">
                            체크 시: 신청 기간과 무관하게 언제든 접수 가능 (대기 저장 → 강사 SMS 자동 발송)<br>
                            체크 해제 시: 일반 신청 기간 규칙 적용
                        </small>
                    </span>
                </label>
            </div>` : ''}
            ${p ? `
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="pActive" ${p.is_active?'checked':''}>
                    <span>활성화 <small style="color:#888;font-weight:normal">(비활성 시 신규 접수만 차단 · 기존 수강자 해지 신청 가능)</small></span>
                </label>
            </div>
            <div class="form-group" id="showOnInactiveGroup" style="${p.is_active ? 'display:none' : ''};margin-left:16px;padding:10px 14px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px">
                <label class="checkbox-label">
                    <input type="checkbox" id="pShowOnInactive" ${p.show_on_inactive !== false ? 'checked' : ''}>
                    <span style="font-size:.88rem">입주민 페이지에 표시
                        <small style="color:#888;font-weight:normal;display:block;margin-top:2px">
                            체크 시: 비활성이어도 신청폼에 프로그램이 보임 (신규접수 차단 안내 표시)<br>
                            체크 해제 시: 입주민 페이지에서 완전 숨김 (관리자 화면에는 항상 표시)
                        </small>
                    </span>
                </label>
            </div>` : ''}` ;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="programs.save('${p?.id||''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(titleStr, body, footer);

        // 기존 슬롯 중 프리셋에 없는 값은 직접추가 체크박스로 동적 생성
        slots.forEach(s => {
            if (!PRESET_TIMES.includes(s)) programs._addCustomSlotCheckbox(s, true);
        });

        // pActive 토글 시 showOnInactiveGroup 표시/숨김
        const pActiveEl = document.getElementById('pActive');
        const showGrp   = document.getElementById('showOnInactiveGroup');
        if (pActiveEl && showGrp) {
            pActiveEl.addEventListener('change', () => {
                showGrp.style.display = pActiveEl.checked ? 'none' : '';
            });
        }
    },

    /** 유형 변경 시 시간대 섹션 토글 */
    _onTypeChange(val) {
        const isPersonalType = val === 'personal' || val === 'duet';
        const isMakeupType   = val === 'makeup';

        // 보강 유형 안내 배지 동적 삽입/제거
        const typeSelect = document.getElementById('pType');
        let makeupNotice = document.getElementById('pMakeupNotice');
        if (isMakeupType && !makeupNotice) {
            makeupNotice = document.createElement('div');
            makeupNotice.id = 'pMakeupNotice';
            makeupNotice.style.cssText = 'margin-top:6px;padding:8px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:7px;font-size:.8rem;color:#92400e';
            makeupNotice.innerHTML = '<i class="fas fa-info-circle" style="color:#f59e0b"></i> <b>보강</b> 유형: 중복 수강 허용 · 자동 승인 · 접수 완료 문자 발송 (입금 안내 없음)';
            typeSelect?.closest('.form-group')?.appendChild(makeupNotice);
        } else if (!isMakeupType && makeupNotice) {
            makeupNotice.remove();
        }

        // 시간대 섹션 토글 (보강도 그룹처럼 시간대 선택 가능)
        const g = document.getElementById('pSlotsGroup');
        if (g) g.style.display = isPersonalType ? 'none' : '';

        // 상시 접수 체크박스: 개인/듀엣이면 표시, 그룹/보강이면 제거
        const alwaysOpenWrap = document.getElementById('pAlwaysOpenLessonWrap');
        if (isPersonalType && !alwaysOpenWrap) {
            // 체크박스 동적 삽입 (활성화 체크박스 바로 위)
            const activeGroup = document.getElementById('pActive')?.closest('.form-group');
            if (activeGroup) {
                const wrap = document.createElement('div');
                wrap.id = 'pAlwaysOpenLessonWrap';
                wrap.className = 'form-group';
                wrap.style.cssText = 'padding:12px 14px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px';
                wrap.innerHTML = `
                    <label class="checkbox-label">
                        <input type="checkbox" id="pAlwaysOpenLesson">
                        <span style="font-weight:600;color:#2e7d32">상시 접수 ON
                            <small style="color:#555;font-weight:normal;display:block;margin-top:2px">
                                체크 시: 신청 기간과 무관하게 언제든 접수 가능 (대기 저장 → 강사 SMS 자동 발송)<br>
                                체크 해제 시: 일반 신청 기간 규칙 적용
                            </small>
                        </span>
                    </label>`;
                activeGroup.before(wrap);
            }
        } else if (!isPersonalType && alwaysOpenWrap) {
            alwaysOpenWrap.remove();
        }
    },

    /** 직접 입력 시간대 → 동적 체크박스 추가 */
    _addCustomSlot() {
        const input = document.getElementById('pSlotInput');
        const val   = (input?.value || '').trim();
        if (!val) { input?.focus(); return; }
        // 이미 있는 값 체크
        const existing = Array.from(document.querySelectorAll('.time-cb-lbl input[name="pTimeCheck"]'))
            .map(el => el.value);
        if (existing.includes(val)) {
            // 이미 있으면 해당 체크박스만 체크
            const found = document.querySelector(`.time-cb-lbl input[value="${CSS.escape(val)}"]`);
            if (found) { found.checked = true; showToast(`${val} 선택됨`, 'success'); }
            input.value = ''; return;
        }
        programs._addCustomSlotCheckbox(val, true);
        input.value = '';
        input.focus();
    },

    /** 동적 시간대 체크박스 DOM 생성 */
    _addCustomSlotCheckbox(val, checked) {
        const wrap = document.querySelector('.time-cb-wrap');
        if (!wrap) return;
        const lbl = document.createElement('label');
        lbl.className = 'time-cb-lbl time-cb-custom';
        lbl.innerHTML = `<input type="checkbox" name="pTimeCheck" value="${escHtml(val)}" ${checked?'checked':''}><span>${escHtml(val)}</span>`;
        wrap.appendChild(lbl);
    },
    _onDepositToggle(checked) {
        const wrap = document.getElementById('pDepositAmountWrap');
        if (wrap) wrap.style.display = checked ? 'flex' : 'none';
    },
    async save(id) {
        const name = document.getElementById('pName').value.trim();
        if (!name) { showToast('프로그램명을 입력하세요', 'error'); return; }
        // 요일 체크박스 수집
        const days = Array.from(document.querySelectorAll('input[name="pDayCheck"]:checked'))
            .map(el => el.value).join(', ');
        // 시간대 체크박스 수집
        const time_slots = Array.from(document.querySelectorAll('input[name="pTimeCheck"]:checked'))
            .map(el => el.value).filter(Boolean);
        try {
            const durationDaysVal = document.getElementById('pDurationDays')?.value;
            const data = {
                name, type: document.getElementById('pType').value,
                days,
                time_slots, price: parseInt(document.getElementById('pPrice').value)||0,
                capacity: parseInt(document.getElementById('pCapacity').value)||6,
                description: document.getElementById('pDesc').value,
                display_order: parseInt(document.getElementById('pOrder').value)||0,
                duration_days: durationDaysVal ? parseInt(durationDaysVal) : null,
            };
            // always_open_lesson: 개인/듀엣 상시접수 (체크박스가 있을 때만 포함)
            const alwaysOpenEl = document.getElementById('pAlwaysOpenLesson');
            if (alwaysOpenEl) data.always_open_lesson = alwaysOpenEl.checked;

            // 예약금(보증금) 설정
            const depositEnabledEl = document.getElementById('pDepositEnabled');
            const depositAmountEl  = document.getElementById('pDepositAmount');
            if (depositEnabledEl) data.deposit_enabled = depositEnabledEl.checked;
            if (depositAmountEl)  data.deposit_amount  = parseInt(depositAmountEl.value) || 0;

            if (id) {
                const activeEl = document.getElementById('pActive');
                if (activeEl) data.is_active = activeEl.checked;
                const showOnInactiveEl = document.getElementById('pShowOnInactive');
                if (showOnInactiveEl) data.show_on_inactive = showOnInactiveEl.checked;
                await API.programs.update(id, data);
            } else {
                // 단지 ID: hidden input 우선, 없으면 Admin.complex.id
                const cxIdEl = document.getElementById('programComplexId');
                data.complex_id = (cxIdEl?.value) || getEffectiveComplexId();
                if (!data.complex_id) { showToast('단지를 선택하세요', 'error'); return; }
                await API.programs.create(data);
            }
            closeGlobalModal();
            showToast('저장되었습니다');
            await this.load();
        } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
    },
    async showCapacity(id) {
        try {
            const res = await API.programs.capacity(id);
            const p = this.data.find(x => x.id === id);
            const cap = res.data || [];
            const body = cap.length ? cap.map(s => `
                <div class="capacity-row">
                    <span>${s.slot}</span>
                    <div class="capacity-bar">
                        <div class="capacity-fill ${s.isFull ? 'full' : ''}" style="width:${Math.min(100,(s.approved/s.capacity)*100)}%"></div>
                    </div>
                    <span>${s.approved}/${s.capacity}</span>
                    ${s.waiting ? `<span class="text-warning">대기 ${s.waiting}</span>` : ''}
                </div>`).join('') : '<p class="empty-hint">시간대 없음</p>';
            openGlobalModal(`<i class="fas fa-chart-bar"></i> ${p?.name} 정원 현황`, body);
        } catch(e) { showToast('로드 실패', 'error'); }
    },
    deleteItem(id) {
        showConfirm('삭제 확인', '프로그램을 삭제하시겠습니까? (관련 신청 데이터는 유지됩니다)', async () => {
            try { await API.programs.delete(id); showToast('삭제되었습니다'); await this.load(); }
            catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    }
};

function typeLabel(t) {
    return { group:'그룹', duet:'듀엣', personal:'개인', makeup:'보강' }[t] || t;
}

/**
 * DB type 컬럼값이 'group'이어도 프로그램명으로 실제 유형을 추론
 * 예: "1:1 개인 레슨" → 'personal', "2:1 듀엣레슨" → 'duet'
 */
function _resolveType(p) {
    if (!p) return 'group';
    const t = (p.type || '').toLowerCase();
    if (t === 'personal' || t === 'duet' || t === 'makeup') return t;
    const n = (p.name || '').toLowerCase();
    if (/1:1|개인/.test(n)) return 'personal';
    if (/2:1|듀엣/.test(n)) return 'duet';
    if (/보강/.test(n)) return 'makeup';
    return t || 'group';
}
