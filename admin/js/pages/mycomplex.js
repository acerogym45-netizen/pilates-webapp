/**
 * 내 단지 설정 페이지
 * - 일반 관리자: 본인 단지 정보 수정, QR, 비밀번호 변경
 * - 마스터 관리자: 추가 암호(master2026) 입력 후 전체 단지 추가/수정/삭제 관리
 */
const mycomplex = {
    masterVerified: false,   // 이 세션에서 마스터 추가 암호를 인증했는가
    _masterPw: '',           // 인증된 마스터 암호 (서버 요청 시 사용)

    async render() {
        if (Admin.role === 'master') {
            await mycomplex._renderMaster();
        } else {
            mycomplex._renderAdmin();
        }
    },

    /* ═══════════════════════════════════════════
     *  마스터: 추가 암호 확인 → 단지 목록 관리
     * ═══════════════════════════════════════════ */
    async _renderMaster() {
        if (!mycomplex.masterVerified) {
            mycomplex._renderMasterLock();
            return;
        }
        await mycomplex._renderComplexManager();
    },

    _renderMasterLock() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-city"></i> 단지 관리</h2>
            </div>
            <div class="settings-card" style="max-width:420px;margin:40px auto">
                <div class="settings-card-header">
                    <i class="fas fa-shield-alt"></i> 마스터 추가 인증 필요
                </div>
                <div class="settings-card-body">
                    <p style="font-size:.9rem;color:#666;margin-bottom:16px">
                        단지 관리 기능은 마스터 추가 암호를 입력해야 접근할 수 있습니다.
                    </p>
                    <div class="form-group">
                        <label>추가 암호 <span class="req">*</span></label>
                        <input type="password" id="masterExtraPw" placeholder="마스터 추가 암호 입력"
                               onkeydown="if(event.key==='Enter') mycomplex.verifyMasterExtra()"
                               autocomplete="off">
                    </div>
                    <button class="btn-primary" onclick="mycomplex.verifyMasterExtra()">
                        <i class="fas fa-unlock"></i> 인증
                    </button>
                    <div id="masterLockError" style="display:none;color:#e74c3c;font-size:.85rem;margin-top:8px"></div>
                </div>
            </div>`;
        setTimeout(() => document.getElementById('masterExtraPw')?.focus(), 100);
    },

    async verifyMasterExtra() {
        const pw  = document.getElementById('masterExtraPw')?.value?.trim();
        const err = document.getElementById('masterLockError');
        if (!pw) { err.textContent = '암호를 입력하세요'; err.style.display = 'block'; return; }

        try {
            // 서버의 MASTER_PASSWORD와 비교
            const res = await API.complexes.verifyPassword('', pw);
            if (res.role === 'master') {
                mycomplex.masterVerified = true;
                mycomplex._masterPw = pw;
                await mycomplex._renderComplexManager();
            } else {
                err.textContent = '암호가 올바르지 않습니다';
                err.style.display = 'block';
            }
        } catch(e) {
            err.textContent = '암호가 올바르지 않습니다';
            err.style.display = 'block';
            setTimeout(() => err.style.display = 'none', 3000);
        }
    },

    complexData: [],

    async _renderComplexManager() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-city"></i> 단지 관리</h2>
                <div style="display:flex;gap:8px">
                    <button class="btn-primary btn-sm" onclick="mycomplex.showAddForm()">
                        <i class="fas fa-plus"></i> 단지 추가
                    </button>
                    <button class="btn-secondary btn-sm" onclick="mycomplex.masterVerified=false; mycomplex.render()">
                        <i class="fas fa-lock"></i> 잠금
                    </button>
                </div>
            </div>
            <div id="complexManagerList" class="data-list">
                <div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div>
            </div>`;
        await mycomplex._loadComplexes();
    },

    async _loadComplexes() {
        try {
            const res = await API.complexes.list();
            mycomplex.complexData = res.data || [];
            mycomplex._renderComplexList();
        } catch(e) {
            document.getElementById('complexManagerList').innerHTML = `<p class="error-hint">${e.message}</p>`;
        }
    },

    _renderComplexList() {
        const c = document.getElementById('complexManagerList');
        if (!mycomplex.complexData.length) {
            c.innerHTML = '<p class="empty-hint">등록된 단지가 없습니다</p>';
            return;
        }
        c.innerHTML = mycomplex.complexData.map(cx => `
            <div class="list-item">
                <div class="item-status">
                    <span class="status-badge ${cx.is_active ? 'status-success' : 'status-muted'}">
                        ${cx.is_active ? '활성' : '비활성'}
                    </span>
                </div>
                <div class="item-main">
                    <strong>${escHtml(cx.name)}</strong>
                    <p>코드: <code>${escHtml(cx.code)}</code> | ${escHtml(cx.address || '-')}</p>
                    <small>
                        입주민 URL: <a href="/?complex=${cx.code}" target="_blank">/?complex=${cx.code}</a>
                    </small>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" title="QR 코드" onclick="mycomplex.showQR('${escHtml(cx.code)}','${escHtml(cx.name)}')">
                        <i class="fas fa-qrcode"></i>
                    </button>
                    <button class="btn-ghost dark btn-sm" title="수정" onclick="mycomplex.showEditForm('${cx.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-ghost dark btn-sm btn-danger-ghost" title="삭제" onclick="mycomplex.deleteComplex('${cx.id}','${escHtml(cx.name)}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`).join('');
    },

    showAddForm() {
        const body = `
            <div class="form-group">
                <label>단지명 <span class="req">*</span></label>
                <input type="text" id="cxName" placeholder="예: 청주SK뷰자이">
            </div>
            <div class="form-group">
                <label>단지 코드 <span class="req">*</span> <small style="color:#999">(영문+숫자+하이픈, URL용)</small></label>
                <input type="text" id="cxCode" placeholder="예: cheongju-sk">
            </div>
            <div class="form-group">
                <label>주소</label>
                <input type="text" id="cxAddr" placeholder="예: 충청북도 청주시 흥덕구">
            </div>
            <div class="form-group">
                <label>테마 색상</label>
                <div style="display:flex;align-items:center;gap:10px">
                    <input type="color" id="cxColor" value="#667eea" style="width:50px;height:36px;padding:2px">
                    <span style="font-size:.85rem;color:#666">헤더 및 버튼 색상에 적용됩니다</span>
                </div>
            </div>
            <div class="form-group">
                <label>관리자 비밀번호 <small style="color:#999">(기본: admin1234)</small></label>
                <input type="text" id="cxPw" value="admin1234">
            </div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="mycomplex.saveNewComplex()">
                <i class="fas fa-save"></i> 단지 추가
            </button>`;
        openGlobalModal('<i class="fas fa-plus"></i> 새 단지 추가', body, footer);
    },

    async saveNewComplex() {
        const name  = document.getElementById('cxName').value.trim();
        const code  = document.getElementById('cxCode').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const addr  = document.getElementById('cxAddr').value.trim();
        const color = document.getElementById('cxColor').value;
        const pw    = document.getElementById('cxPw').value.trim() || 'admin1234';

        if (!name) { showToast('단지명을 입력하세요', 'error'); return; }
        if (!code) { showToast('단지 코드를 입력하세요', 'error'); return; }

        try {
            await API.complexes.create({
                name, code, address: addr,
                primary_color: color,
                admin_password: pw,
                masterPassword: mycomplex._masterPw
            });
            closeGlobalModal();
            showToast(`✅ '${name}' 단지가 추가되었습니다`);
            await mycomplex._loadComplexes();
        } catch(e) {
            showToast('추가 실패: ' + e.message, 'error');
        }
    },

    showEditForm(id) {
        const cx = mycomplex.complexData.find(x => x.id === id);
        if (!cx) return;
        const body = `
            <div class="form-group">
                <label>단지 코드</label>
                <input type="text" value="${escHtml(cx.code)}" readonly style="background:#f5f5f5;color:#999">
                <small style="color:#999">코드는 변경할 수 없습니다</small>
            </div>
            <div class="form-group">
                <label>단지명 <span class="req">*</span></label>
                <input type="text" id="editCxName" value="${escHtml(cx.name)}">
            </div>
            <div class="form-group">
                <label>주소</label>
                <input type="text" id="editCxAddr" value="${escHtml(cx.address || '')}">
            </div>
            <div class="form-group">
                <label>테마 색상</label>
                <div style="display:flex;align-items:center;gap:10px">
                    <input type="color" id="editCxColor" value="${cx.primary_color || '#667eea'}" style="width:50px;height:36px;padding:2px">
                </div>
            </div>
            <div class="form-group">
                <label>관리자 비밀번호</label>
                <input type="text" id="editCxPw" value="${escHtml(cx.admin_password || '')}">
            </div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="editCxActive" ${cx.is_active ? 'checked' : ''}>
                    <span>활성화 (비활성 시 입주민 페이지 접근 제한)</span>
                </label>
            </div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="mycomplex.saveEditComplex('${id}')">
                <i class="fas fa-save"></i> 저장
            </button>`;
        openGlobalModal('<i class="fas fa-edit"></i> 단지 수정', body, footer);
    },

    async saveEditComplex(id) {
        const cx = mycomplex.complexData.find(x => x.id === id);
        if (!cx) return;
        const name  = document.getElementById('editCxName').value.trim();
        if (!name) { showToast('단지명을 입력하세요', 'error'); return; }

        try {
            await API.complexes.update(id, {
                name,
                address:       document.getElementById('editCxAddr').value.trim(),
                primary_color: document.getElementById('editCxColor').value,
                admin_password: document.getElementById('editCxPw').value.trim(),
                is_active:     document.getElementById('editCxActive').checked,
                masterPassword: mycomplex._masterPw
            });
            closeGlobalModal();
            showToast('✅ 단지 정보가 저장되었습니다');
            await mycomplex._loadComplexes();
        } catch(e) {
            showToast('저장 실패: ' + e.message, 'error');
        }
    },

    deleteComplex(id, name) {
        showConfirm('단지 삭제',
            `'${name}' 단지를 삭제하면 모든 관련 데이터(신청, 공지, 프로그램 등)가 삭제됩니다.\n정말 삭제하시겠습니까?`,
            async () => {
                try {
                    await API.complexes.delete(id, mycomplex._masterPw);
                    showToast('✅ 단지가 삭제되었습니다');
                    await mycomplex._loadComplexes();
                } catch(e) {
                    showToast('삭제 실패: ' + e.message, 'error');
                }
            }
        );
    },

    showQR(code, name) {
        const url   = `${window.location.origin}/?complex=${code}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
        const body  = `
            <div style="text-align:center">
                <img src="${qrUrl}" alt="QR Code" style="width:250px;height:250px;border:1px solid #eee;border-radius:8px">
                <p style="margin-top:12px;font-size:.9rem;color:#555;font-weight:600">${escHtml(name)}</p>
                <code style="font-size:.8rem;word-break:break-all;display:block;margin:8px 0;background:#f5f5f5;padding:6px;border-radius:4px">${url}</code>
                <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
                    <button onclick="navigator.clipboard.writeText('${url}').then(()=>showToast('URL 복사됨'))" class="btn-secondary btn-sm">
                        <i class="fas fa-copy"></i> URL 복사
                    </button>
                    <a href="${qrUrl}" download="qr-${code}.png"
                       class="btn-primary btn-sm" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none">
                        <i class="fas fa-download"></i> QR 다운로드
                    </a>
                    <button onclick="window.open('/?complex=${code}','_blank')" class="btn-secondary btn-sm">
                        <i class="fas fa-external-link-alt"></i> 페이지 열기
                    </button>
                </div>
            </div>`;
        openGlobalModal('<i class="fas fa-qrcode"></i> QR 코드', body);
    },

    /* ═══════════════════════════════════════════
     *  일반 관리자: 내 단지 정보 수정
     * ═══════════════════════════════════════════ */
    _renderAdmin() {
        const cx = Admin.complex;
        if (!cx || !cx.id) {
            document.getElementById('pageContent').innerHTML = `
                <div class="page-header">
                    <h2><i class="fas fa-cog"></i> 내 단지 설정</h2>
                </div>
                <div class="empty-hint">
                    <i class="fas fa-info-circle"></i>
                    단지 정보를 불러올 수 없습니다. 다시 로그인해주세요.
                </div>`;
            return;
        }

        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-cog"></i> 내 단지 설정</h2>
                <button class="btn-secondary btn-sm" onclick="mycomplex.showQR('${cx.code}','${escHtml(cx.name)}')">
                    <i class="fas fa-qrcode"></i> QR 코드
                </button>
            </div>

            <!-- 단지 기본 정보 카드 -->
            <div class="settings-card">
                <div class="settings-card-header">
                    <i class="fas fa-building"></i> 단지 기본 정보
                </div>
                <div class="settings-card-body">
                    <div class="info-row">
                        <label>단지 코드</label>
                        <span class="info-value"><code>${escHtml(cx.code)}</code>
                            <small style="color:#999;margin-left:8px">(변경 불가)</small>
                        </span>
                    </div>
                    <div class="info-row">
                        <label>단지명</label>
                        <span class="info-value">${escHtml(cx.name || '-')}</span>
                    </div>
                    <div class="info-row">
                        <label>주소</label>
                        <span class="info-value">${escHtml(cx.address || '-')}</span>
                    </div>
                    <div class="info-row">
                        <label>테마 색상</label>
                        <span class="info-value">
                            <span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${escHtml(cx.primary_color||'#667eea')};vertical-align:middle;margin-right:6px;border:1px solid #ddd"></span>
                            ${escHtml(cx.primary_color || '#667eea')}
                        </span>
                    </div>
                    <div class="info-row">
                        <label>입주민 QR URL</label>
                        <span class="info-value url-wrap">
                            <a href="/?complex=${cx.code}" target="_blank">
                                ${window.location.origin}/?complex=${cx.code}
                            </a>
                        </span>
                    </div>
                    <button class="btn-primary btn-sm" style="margin-top:12px" onclick="mycomplex._showAdminEditForm()">
                        <i class="fas fa-edit"></i> 단지 정보 수정
                    </button>
                </div>
            </div>

            <!-- 비밀번호 변경 카드 -->
            <div class="settings-card">
                <div class="settings-card-header">
                    <i class="fas fa-lock"></i> 관리자 비밀번호 변경
                </div>
                <div class="settings-card-body">
                    <div class="form-group">
                        <label>현재 비밀번호 <span class="req">*</span></label>
                        <input type="password" id="pwCurrent" placeholder="현재 관리자 비밀번호" autocomplete="off">
                    </div>
                    <div class="form-group">
                        <label>새 비밀번호 <span class="req">*</span></label>
                        <input type="password" id="pwNew" placeholder="새 비밀번호 (6자 이상)" autocomplete="new-password">
                    </div>
                    <div class="form-group">
                        <label>새 비밀번호 확인 <span class="req">*</span></label>
                        <input type="password" id="pwConfirm" placeholder="새 비밀번호 재입력" autocomplete="new-password">
                    </div>
                    <button class="btn-warning btn-sm" onclick="mycomplex._changeAdminPassword()">
                        <i class="fas fa-key"></i> 비밀번호 변경
                    </button>
                </div>
            </div>

            <!-- QR 코드 안내 카드 -->
            <div class="settings-card">
                <div class="settings-card-header">
                    <i class="fas fa-qrcode"></i> QR 코드 안내
                </div>
                <div class="settings-card-body" style="text-align:center">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(window.location.origin + '/?complex=' + cx.code)}"
                         alt="QR Code" style="width:180px;height:180px;border:1px solid #eee;border-radius:8px">
                    <p style="margin-top:12px;font-size:.85rem;color:#666">
                        이 QR코드를 스캔하면 입주민 신청 페이지로 이동합니다
                    </p>
                    <a href="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(window.location.origin + '/?complex=' + cx.code)}"
                       download="qr-${cx.code}.png" class="btn-secondary btn-sm"
                       style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;text-decoration:none">
                        <i class="fas fa-download"></i> QR 이미지 다운로드
                    </a>
                </div>
            </div>`;
    },

    _showAdminEditForm() {
        const cx = Admin.complex;
        const body = `
            <div class="form-group">
                <label>단지명 *</label>
                <input type="text" id="editCxName" value="${escHtml(cx.name || '')}">
            </div>
            <div class="form-group">
                <label>주소</label>
                <input type="text" id="editCxAddr" value="${escHtml(cx.address || '')}">
            </div>
            <div class="form-group">
                <label>테마 색상</label>
                <div style="display:flex;align-items:center;gap:10px">
                    <input type="color" id="editCxColor" value="${cx.primary_color || '#667eea'}" style="width:50px;height:36px;padding:2px">
                    <span style="font-size:.85rem;color:#666">헤더 및 버튼 색상에 적용됩니다</span>
                </div>
            </div>
            <div class="form-group">
                <label>현재 비밀번호 확인 *</label>
                <input type="password" id="editCxCurrentPw" placeholder="변경 사항 저장을 위해 현재 비밀번호 입력" autocomplete="off">
            </div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="mycomplex._saveAdminEdit()">
                <i class="fas fa-save"></i> 저장
            </button>`;
        openGlobalModal('<i class="fas fa-edit"></i> 단지 정보 수정', body, footer);
    },

    async _saveAdminEdit() {
        const name      = document.getElementById('editCxName').value.trim();
        const address   = document.getElementById('editCxAddr').value.trim();
        const color     = document.getElementById('editCxColor').value;
        const currentPw = document.getElementById('editCxCurrentPw').value;

        if (!name)      { showToast('단지명을 입력하세요', 'error'); return; }
        if (!currentPw) { showToast('현재 비밀번호를 입력하세요', 'error'); return; }

        try {
            const res = await API.complexes.selfUpdate(Admin.complex.id, {
                currentPassword: currentPw,
                name, address,
                primary_color: color
            });
            Admin.complex = res.data;
            sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));

            closeGlobalModal();
            showToast('단지 정보가 저장되었습니다');
            document.getElementById('sidebarComplexName').textContent = Admin.complex.name;
            mycomplex._renderAdmin();
        } catch(e) {
            showToast('저장 실패: ' + e.message, 'error');
        }
    },

    async _changeAdminPassword() {
        const current = document.getElementById('pwCurrent').value;
        const newPw   = document.getElementById('pwNew').value;
        const confirm = document.getElementById('pwConfirm').value;

        if (!current || !newPw || !confirm) { showToast('모든 항목을 입력하세요', 'error'); return; }
        if (newPw.length < 6) { showToast('새 비밀번호는 6자 이상이어야 합니다', 'error'); return; }
        if (newPw !== confirm) { showToast('새 비밀번호가 일치하지 않습니다', 'error'); return; }

        try {
            const res = await API.complexes.selfUpdate(Admin.complex.id, {
                currentPassword: current,
                new_password: newPw
            });
            Admin.complex = res.data;
            sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));

            document.getElementById('pwCurrent').value = '';
            document.getElementById('pwNew').value     = '';
            document.getElementById('pwConfirm').value = '';

            showToast('비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요');
        } catch(e) {
            showToast('변경 실패: ' + e.message, 'error');
        }
    }
};
