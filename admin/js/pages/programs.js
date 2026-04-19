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
                    <span class="status-badge type-badge-${p.type}">${typeLabel(p.type)}</span>
                    ${!p.is_active ? '<span class="status-badge status-muted">비활성</span>' : ''}
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

        // 운영 요일 체크박스
        const ALL_DAYS   = ['월','화','수','목','금','토','일'];
        const savedDays  = (p?.days || '').split(/[,\s·&]+/).map(d => d.trim()).filter(d => ALL_DAYS.includes(d));
        const dayBoxes   = ALL_DAYS.map(d =>
            `<label class="day-cb-lbl"><input type="checkbox" name="pDayCheck" value="${d}" ${savedDays.includes(d)?'checked':''}><span>${d}</span></label>`
        ).join('');

        const isPersonal = p?.type === 'personal' || p?.type === 'duet';
        const body = `
            ${complexName ? `<p style="font-size:.85rem;color:#888;margin-bottom:8px"><i class="fas fa-building"></i> ${escHtml(complexName)}</p>` : ''}
            <input type="hidden" id="programComplexId" value="${complexId || ''}">
            <div class="form-group"><label>프로그램명 *</label><input type="text" id="pName" value="${p ? escHtml(p.name) : ''}"></div>
            <div class="form-group">
                <label>유형 *</label>
                <select id="pType" onchange="programs._onTypeChange(this.value)">
                    <option value="group"    ${p?.type==='group'   ?'selected':''}>그룹</option>
                    <option value="duet"     ${p?.type==='duet'    ?'selected':''}>듀엣</option>
                    <option value="personal" ${p?.type==='personal'?'selected':''}>개인</option>
                </select>
            </div>
            <div class="form-group">
                <label>운영 요일</label>
                <div class="day-cb-wrap">${dayBoxes}</div>
            </div>
            <div class="form-group" id="pSlotsGroup" style="${isPersonal ? 'display:none' : ''}">
                <label>시간대 <span style="font-size:.8rem;font-weight:normal;color:#888">(그룹수업 — 추가 버튼으로 등록)</span></label>
                <div id="pSlotsContainer" style="min-height:32px;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:4px"></div>
                <div style="display:flex;gap:6px">
                    <input type="text" id="pSlotInput" placeholder="예: 오전 09:00" style="flex:1"
                        onkeydown="if(event.key==='Enter'){event.preventDefault();programs._addSlot();}">
                    <button type="button" class="btn-secondary btn-sm" onclick="programs._addSlot()">
                        <i class="fas fa-plus"></i> 추가
                    </button>
                </div>
                <small style="color:#999;margin-top:4px;display:block">개인/듀엣은 비워두세요 (입주민 자유 입력)</small>
            </div>
            <div class="form-row">
                <div class="form-group"><label>월 수강료 (원)</label><input type="number" id="pPrice" value="${p?.price||0}"></div>
                <div class="form-group"><label>정원 (명)</label><input type="number" id="pCapacity" value="${p?.capacity||6}"></div>
            </div>
            <div class="form-group"><label>설명</label><textarea id="pDesc" rows="3">${p ? escHtml(p.description||'') : ''}</textarea></div>
            <div class="form-group"><label>표시 순서</label><input type="number" id="pOrder" value="${p?.display_order||0}"></div>
            ${p ? `<div class="form-group"><label class="checkbox-label"><input type="checkbox" id="pActive" ${p.is_active?'checked':''}><span>활성화</span></label></div>` : ''}`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="programs.save('${p?.id||''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(titleStr, body, footer);
        // 모달 렌더 직후 기존 슬롯 태그 초기화
        slots.forEach(s => programs._addSlotTag(s));
    },

    /** 유형 변경 시 시간대 섹션 토글 */
    _onTypeChange(val) {
        const g = document.getElementById('pSlotsGroup');
        if (g) g.style.display = (val === 'personal' || val === 'duet') ? 'none' : '';
    },

    /** 슬롯 입력창 → 태그 추가 */
    _addSlot() {
        const input = document.getElementById('pSlotInput');
        const val   = (input?.value || '').trim();
        if (!val) { input?.focus(); return; }
        const existing = Array.from(document.querySelectorAll('#pSlotsContainer .slot-tag')).map(el => el.dataset.val);
        if (existing.includes(val)) { showToast('이미 추가된 시간대입니다', 'warning'); return; }
        programs._addSlotTag(val);
        input.value = '';
        input.focus();
    },

    /** 슬롯 태그 DOM 생성 */
    _addSlotTag(val) {
        const container = document.getElementById('pSlotsContainer');
        if (!container) return;
        const tag = document.createElement('span');
        tag.className   = 'slot-tag';
        tag.dataset.val = val;
        tag.innerHTML   = `${escHtml(val)}<button type="button" title="삭제" onclick="this.parentElement.remove()" style="background:none;border:none;color:#2980b9;cursor:pointer;padding:0 0 0 5px;font-size:1rem;line-height:1">×</button>`;
        container.appendChild(tag);
    },
    async save(id) {
        const name = document.getElementById('pName').value.trim();
        if (!name) { showToast('프로그램명을 입력하세요', 'error'); return; }
        // 요일 체크박스 수집
        const days = Array.from(document.querySelectorAll('input[name="pDayCheck"]:checked'))
            .map(el => el.value).join(', ');
        // 슬롯 태그 수집
        const time_slots = Array.from(document.querySelectorAll('#pSlotsContainer .slot-tag'))
            .map(el => el.dataset.val).filter(Boolean);
        try {
            const data = {
                name, type: document.getElementById('pType').value,
                days,
                time_slots, price: parseInt(document.getElementById('pPrice').value)||0,
                capacity: parseInt(document.getElementById('pCapacity').value)||6,
                description: document.getElementById('pDesc').value,
                display_order: parseInt(document.getElementById('pOrder').value)||0
            };
            if (id) {
                const activeEl = document.getElementById('pActive');
                if (activeEl) data.is_active = activeEl.checked;
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
    return { group:'그룹', duet:'듀엣', personal:'개인' }[t] || t;
}
