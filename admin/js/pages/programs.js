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
            const res = await API.programs.list({ complexId: Admin.complex?.id });
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
                    <small>시간대: ${Array.isArray(p.time_slots) && p.time_slots.length ? p.time_slots.join(', ') : '자유'}</small>
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
        const slots = p && Array.isArray(p.time_slots) ? p.time_slots : [];
        const body = `
            <div class="form-group"><label>프로그램명 *</label><input type="text" id="pName" value="${p ? escHtml(p.name) : ''}"></div>
            <div class="form-group">
                <label>유형 *</label>
                <select id="pType">
                    <option value="group" ${p?.type==='group'?'selected':''}>그룹</option>
                    <option value="duet" ${p?.type==='duet'?'selected':''}>듀엣</option>
                    <option value="personal" ${p?.type==='personal'?'selected':''}>개인</option>
                </select>
            </div>
            <div class="form-group"><label>운영 요일</label><input type="text" id="pDays" value="${p ? escHtml(p.days||'') : ''}" placeholder="예: 화, 목"></div>
            <div class="form-group">
                <label>시간대 (쉼표로 구분, 그룹수업만)</label>
                <input type="text" id="pSlots" value="${escHtml(slots.join(', '))}" placeholder="예: 오전 09시, 오전 10시, 저녁 19시">
                <small style="color:#999">개인/듀엣은 비워두세요 (입주민이 자유 입력)</small>
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
            <button class="btn-primary" onclick="programs.save('${id||''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(p ? '프로그램 수정' : '프로그램 추가', body, footer);
    },
    async save(id) {
        const name = document.getElementById('pName').value.trim();
        if (!name) { showToast('프로그램명을 입력하세요', 'error'); return; }
        const slotsRaw = document.getElementById('pSlots').value;
        const time_slots = slotsRaw ? slotsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
        try {
            const data = {
                name, type: document.getElementById('pType').value,
                days: document.getElementById('pDays').value,
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
                data.complex_id = Admin.complex?.id;
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
