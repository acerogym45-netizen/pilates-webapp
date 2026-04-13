/** 단지 관리 (마스터 전용) */
const complexes = {
    data: [],
    async render() {
        if (Admin.role !== 'master') {
            document.getElementById('pageContent').innerHTML = `<div class="empty-hint"><i class="fas fa-lock"></i> 마스터 관리자 전용 메뉴입니다</div>`;
            return;
        }
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-city"></i> 단지 관리</h2>
                <button class="btn-primary btn-sm" onclick="complexes.showForm()">
                    <i class="fas fa-plus"></i> 단지 추가
                </button>
            </div>
            <div id="complexList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load() {
        try {
            const res = await API.complexes.list();
            this.data = res.data || [];
            this.renderList();
        } catch(e) { document.getElementById('complexList').innerHTML = `<p class="error-hint">${e.message}</p>`; }
    },
    renderList() {
        const c = document.getElementById('complexList');
        if (!this.data.length) { c.innerHTML = '<p class="empty-hint">등록된 단지가 없습니다</p>'; return; }
        c.innerHTML = this.data.map(cx => `
            <div class="list-item">
                <div class="item-status">
                    <span class="status-badge ${cx.is_active ? 'status-success' : 'status-muted'}">${cx.is_active ? '활성' : '비활성'}</span>
                </div>
                <div class="item-main">
                    <strong>${cx.name}</strong>
                    <p>코드: <code>${cx.code}</code> | ${cx.address || '-'}</p>
                    <small>QR URL: /?complex=${cx.code}</small>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" onclick="complexes.showQR('${cx.code}','${cx.name}')">
                        <i class="fas fa-qrcode"></i>
                    </button>
                    <button class="btn-ghost dark btn-sm" onclick="complexes.showForm('${cx.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-ghost dark btn-sm" onclick="complexes.deleteItem('${cx.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`).join('');
    },
    showForm(id) {
        const cx = id ? this.data.find(x => x.id === id) : null;
        const body = `
            <div class="form-group"><label>단지명 *</label><input type="text" id="cxName" value="${cx ? escHtml(cx.name) : ''}"></div>
            <div class="form-group"><label>단지 코드 * (영문+숫자, URL용)</label><input type="text" id="cxCode" value="${cx ? escHtml(cx.code) : ''}" placeholder="예: apt-demo" ${cx ? 'readonly' : ''}></div>
            <div class="form-group"><label>주소</label><input type="text" id="cxAddr" value="${cx ? escHtml(cx.address||'') : ''}"></div>
            <div class="form-group"><label>기본 색상</label><input type="color" id="cxColor" value="${cx?.primary_color || '#667eea'}"></div>
            <div class="form-group"><label>관리자 비밀번호</label><input type="text" id="cxPw" value="${cx ? escHtml(cx.admin_password||'') : 'admin1234'}" placeholder="기본: admin1234"></div>
            <div class="form-group"><label>마스터 비밀번호 확인 *</label><input type="password" id="cxMasterPw" placeholder="master 비밀번호 입력"></div>
            ${cx ? `<div class="form-group"><label class="checkbox-label"><input type="checkbox" id="cxActive" ${cx.is_active?'checked':''}><span>활성화</span></label></div>` : ''}`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="complexes.save('${id||''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(cx ? '단지 수정' : '단지 추가', body, footer);
    },
    async save(id) {
        const name = document.getElementById('cxName').value.trim();
        const code = document.getElementById('cxCode').value.trim();
        const masterPassword = document.getElementById('cxMasterPw').value;
        if (!name || !code) { showToast('단지명과 코드를 입력하세요', 'error'); return; }
        if (!masterPassword) { showToast('마스터 비밀번호를 입력하세요', 'error'); return; }
        try {
            const data = {
                name, code, masterPassword,
                address: document.getElementById('cxAddr').value,
                primary_color: document.getElementById('cxColor').value,
                admin_password: document.getElementById('cxPw').value,
            };
            if (id) {
                const activeEl = document.getElementById('cxActive');
                if (activeEl) data.is_active = activeEl.checked;
                await API.complexes.update(id, data);
            } else {
                await API.complexes.create(data);
            }
            closeGlobalModal();
            showToast('저장되었습니다');
            await this.load();
        } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
    },
    showQR(code, name) {
        const url = `${window.location.origin}/?complex=${code}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
        const body = `
            <div style="text-align:center">
                <img src="${qrUrl}" alt="QR Code" style="width:250px;height:250px">
                <p style="margin-top:12px;font-size:.9rem;color:#666">${name}</p>
                <code style="font-size:.8rem;word-break:break-all">${url}</code>
                <div style="margin-top:12px">
                    <a href="${qrUrl}" download="qr-${code}.png" class="btn-primary" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none">
                        <i class="fas fa-download"></i> QR 코드 다운로드
                    </a>
                </div>
            </div>`;
        openGlobalModal('<i class="fas fa-qrcode"></i> QR 코드', body);
    },
    deleteItem(id) {
        showConfirm('단지 삭제', '단지를 삭제하면 모든 관련 데이터가 삭제됩니다. 계속하시겠습니까?', async () => {
            const masterPassword = prompt('마스터 비밀번호를 입력하세요:');
            if (!masterPassword) return;
            try {
                await API.complexes.delete(id, masterPassword);
                showToast('삭제되었습니다');
                await this.load();
            } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    }
};
