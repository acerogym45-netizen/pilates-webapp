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
            </div>

            <!-- 문의하기 기능 설정 카드 -->
            <div class="settings-card">
                <div class="settings-card-header">
                    <i class="fas fa-comment-dots"></i> 문의하기 기능 설정
                </div>
                <div class="settings-card-body">
                    <p style="font-size:.875rem;color:#666;margin-bottom:16px;line-height:1.6">
                        <i class="fas fa-info-circle" style="color:#3498db"></i>
                        입주민 페이지의 <strong>문의하기</strong> 퀵액션 버튼 표시 여부를 설정합니다.<br>
                        끄면 버튼이 사라지고 전화 문의만 가능해집니다.
                    </p>
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#f8f9fa;border-radius:10px;border:1px solid #e9ecef">
                        <div>
                            <div style="font-weight:600;font-size:.95rem;color:#2c3e50">
                                <i class="fas fa-comment-dots" style="color:#3498db;margin-right:6px"></i>
                                문의하기 버튼
                            </div>
                            <div style="font-size:.8rem;color:#888;margin-top:3px">
                                입주민 페이지 퀵액션에 문의하기 버튼 표시
                            </div>
                        </div>
                        <label style="position:relative;display:inline-block;width:52px;height:28px;cursor:pointer;flex-shrink:0">
                            <input type="checkbox" id="showInquiryToggle"
                                   ${cx.show_inquiry !== false ? 'checked' : ''}
                                   style="opacity:0;width:0;height:0"
                                   onchange="mycomplex._saveInquirySetting(this.checked)">
                            <span style="position:absolute;inset:0;background:${cx.show_inquiry !== false ? '#10b981' : '#ccc'};border-radius:28px;transition:.3s"
                                  id="showInquiryTrack">
                                <span style="position:absolute;top:3px;left:${cx.show_inquiry !== false ? '27px' : '3px'};width:22px;height:22px;background:#fff;border-radius:50%;transition:.3s;box-shadow:0 1px 3px rgba(0,0,0,.2)"
                                      id="showInquiryThumb"></span>
                            </span>
                        </label>
                    </div>
                    <p id="inquirySettingHint" style="margin-top:10px;font-size:.8rem;color:${cx.show_inquiry !== false ? '#10b981' : '#e74c3c'}">
                        ${cx.show_inquiry !== false
                            ? '<i class="fas fa-check-circle"></i> 문의하기 버튼이 표시됩니다'
                            : '<i class="fas fa-eye-slash"></i> 문의하기 버튼이 숨겨집니다 (전화응대 전용)'}
                    </p>
                </div>
            </div>

            <!-- SMS 알림 설정 카드 -->
            <div class="settings-card" id="smsSettingsCard">
                <div class="settings-card-header">
                    <i class="fas fa-sms"></i> SMS 자동 알림 설정
                    <span id="smsBadge" style="margin-left:8px;font-size:.75rem;padding:2px 8px;border-radius:10px;background:#e8f5e9;color:#27ae60;display:none">
                        <i class="fas fa-check-circle"></i> 활성화
                    </span>
                </div>
                <div class="settings-card-body">
                    <p style="font-size:.875rem;color:#666;margin-bottom:16px;line-height:1.6">
                        <i class="fas fa-info-circle" style="color:#3498db"></i>
                        문의 답변이 등록되면 입주민 전화번호로 <strong>자동 SMS</strong>를 발송합니다.<br>
                        발신번호는 <strong>이 단지 전용</strong>으로 설정됩니다.
                        솔라피 API Key/Secret은 Vercel 환경변수에서 공통 관리됩니다.
                    </p>

                    <!-- 현재 설정 상태 -->
                    <div id="smsStatusArea" style="margin-bottom:16px;padding:10px 14px;background:#f8f9fa;border-radius:8px;font-size:.85rem">
                        <i class="fas fa-spinner fa-spin"></i> 설정 상태 로딩 중...
                    </div>

                    <!-- 단지별 발신번호 설정 -->
                    <div class="form-group">
                        <label>발신 전화번호 <span class="req">*</span>
                            <span style="font-size:.75rem;font-weight:400;color:#3498db;margin-left:6px">이 단지 전용</span>
                        </label>
                        <input type="text" id="smsSender" placeholder="예: 01012345678 또는 0212345678">
                        <small style="color:#999">솔라피에 등록된 발신번호 (하이픈 제외). 미입력 시 공통 발신번호 사용</small>
                    </div>
                    <div class="form-group" style="display:flex;align-items:center;gap:10px">
                        <label style="margin:0;display:flex;align-items:center;gap:8px;cursor:pointer">
                            <input type="checkbox" id="smsEnabled" style="width:18px;height:18px;cursor:pointer">
                            이 단지 SMS 발송 활성화
                        </label>
                    </div>

                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
                        <button class="btn-primary btn-sm" onclick="mycomplex._saveSmsSettings()">
                            <i class="fas fa-save"></i> 설정 저장
                        </button>
                        <button class="btn-secondary btn-sm" onclick="mycomplex._showSmsTestModal()">
                            <i class="fas fa-paper-plane"></i> 테스트 발송
                        </button>
                    </div>

                    <div style="margin-top:14px;padding:10px 14px;background:#e8f4fd;border-radius:8px;font-size:.8rem;color:#1a5276;line-height:1.6">
                        <i class="fas fa-info-circle"></i>
                        <strong>솔라피 API Key/Secret</strong>은 Vercel 환경변수(<code>SOLAPI_API_KEY</code>, <code>SOLAPI_API_SECRET</code>)에서 총괄관리자가 공통 설정합니다.<br>
                        각 단지는 <strong>발신번호만</strong> 별도로 설정하면 됩니다.
                    </div>
                </div>
            </div>`;

        // SMS 설정 상태 비동기 로드
        setTimeout(() => mycomplex._loadSmsStatus(), 100);
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

    async _saveInquirySetting(checked) {
        // 토글 UI 즉시 반영
        const track = document.getElementById('showInquiryTrack');
        const thumb = document.getElementById('showInquiryThumb');
        const hint  = document.getElementById('inquirySettingHint');
        if (track) track.style.background = checked ? '#10b981' : '#ccc';
        if (thumb) thumb.style.left = checked ? '27px' : '3px';
        if (hint) {
            hint.style.color = checked ? '#10b981' : '#e74c3c';
            hint.innerHTML = checked
                ? '<i class="fas fa-check-circle"></i> 문의하기 버튼이 표시됩니다'
                : '<i class="fas fa-eye-slash"></i> 문의하기 버튼이 숨겨집니다 (전화응대 전용)';
        }

        try {
            const res = await API.complexes.selfUpdate(Admin.complex.id, {
                currentPassword: Admin.complex.admin_password,
                show_inquiry: checked
            });
            Admin.complex = res.data;
            sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));
            showToast(checked ? '문의하기 버튼이 활성화되었습니다' : '문의하기 버튼이 숨겨졌습니다');
        } catch(e) {
            // 실패 시 토글 되돌리기
            const toggle = document.getElementById('showInquiryToggle');
            if (toggle) toggle.checked = !checked;
            if (track) track.style.background = !checked ? '#10b981' : '#ccc';
            if (thumb) thumb.style.left = !checked ? '27px' : '3px';
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
    },

    /* ─── SMS 설정 ─────────────────────────────────────────── */

    /** SMS 설정 상태 로드 후 폼에 반영 (단지별) */
    async _loadSmsStatus() {
        const area  = document.getElementById('smsStatusArea');
        const badge = document.getElementById('smsBadge');
        if (!area) return;
        try {
            const complexId = Admin.complex?.id || '';
            const res = await fetch(`/api/sms/status${complexId ? '?complexId=' + complexId : ''}`);
            const d = await res.json();

            const apiOk          = d.configured; // 공통 API Key/Secret 설정 여부
            const complexSender  = d.complexSender  || null;
            const complexEnabled = d.complexEnabled != null ? d.complexEnabled : true;
            const effectiveSender = complexSender || d.sender || null;

            if (apiOk) {
                area.innerHTML = `
                    <span style="color:#27ae60"><i class="fas fa-check-circle"></i> 솔라피 API Key 설정됨</span>
                    &nbsp;·&nbsp; 발신번호: <strong>${effectiveSender || '⚠️ 미설정'}</strong>
                    ${!complexSender && d.sender ? '<span style="color:#999;font-size:.8rem">(공통 폴백)</span>' : ''}
                    &nbsp;·&nbsp; 상태: <strong>${complexEnabled && d.enabled ? '✅ 발송 활성화' : '⛔ 발송 비활성화'}</strong>`;
            } else {
                area.innerHTML = `<span style="color:#e67e22"><i class="fas fa-exclamation-circle"></i> 솔라피 API Key 미설정 — 총괄관리자에게 문의하세요</span>`;
            }

            // 폼 값 반영
            const senderEl  = document.getElementById('smsSender');
            const enabledEl = document.getElementById('smsEnabled');
            if (senderEl  && complexSender)  senderEl.value   = complexSender;
            if (enabledEl) enabledEl.checked = complexEnabled;
            if (badge) badge.style.display = (apiOk && complexEnabled && d.enabled) ? 'inline' : 'none';
        } catch(e) {
            area.innerHTML = `<span style="color:#e74c3c"><i class="fas fa-times-circle"></i> 상태 조회 실패: ${e.message}</span>`;
        }
    },

    /** SMS 설정 저장 (단지별 발신번호 + 활성화 여부만 DB에 저장) */
    async _saveSmsSettings() {
        const sender  = document.getElementById('smsSender').value.trim().replace(/\D/g, '');
        const enabled = document.getElementById('smsEnabled').checked;
        const complexId = Admin.complex?.id || '';

        if (sender && !/^0\d{9,10}$/.test(sender)) {
            showToast('발신번호 형식이 올바르지 않습니다 (숫자만, 예: 01012345678)', 'error');
            return;
        }
        if (!complexId) {
            showToast('단지 정보를 불러올 수 없습니다', 'error');
            return;
        }

        try {
            const res = await fetch('/api/sms/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sender, enabled, complexId }),
            });
            const d = await res.json();
            if (d.success) {
                showToast('SMS 설정이 저장되었습니다');
                await mycomplex._loadSmsStatus();
            } else {
                showToast('저장 실패: ' + d.error, 'error');
            }
        } catch(e) {
            showToast('저장 실패: ' + e.message, 'error');
        }
    },

    /** 테스트 SMS 발송 모달 */
    _showSmsTestModal() {
        const body = `
            <p style="font-size:.875rem;color:#666;margin-bottom:16px">
                입력한 번호로 테스트 SMS를 발송합니다. 실제 문자 비용이 발생합니다.
            </p>
            <div class="form-group">
                <label>수신 전화번호 <span class="req">*</span></label>
                <input type="text" id="testSmsPhone" placeholder="01012345678" maxlength="11">
            </div>
            <div class="form-group">
                <label>수신자 이름</label>
                <input type="text" id="testSmsName" placeholder="홍길동" value="테스트">
            </div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="mycomplex._sendTestSms()">
                <i class="fas fa-paper-plane"></i> 발송
            </button>`;
        openGlobalModal('<i class="fas fa-sms"></i> SMS 테스트 발송', body, footer);
    },

    /** 테스트 SMS 실제 발송 (단지별 발신번호 사용) */
    async _sendTestSms() {
        const phone     = document.getElementById('testSmsPhone').value.trim().replace(/\D/g, '');
        const name      = document.getElementById('testSmsName').value.trim() || '테스트';
        const complexId = Admin.complex?.id || '';
        if (!phone || !/^01\d{8,9}$/.test(phone)) {
            showToast('올바른 휴대폰 번호를 입력하세요 (예: 01012345678)', 'error');
            return;
        }
        const btn = document.querySelector('#globalModal .btn-primary');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 발송 중...'; }
        try {
            const res = await fetch('/api/sms/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, name, complexId }),
            });
            const d = await res.json();
            closeGlobalModal();
            if (d.success) {
                showToast(`✅ ${d.message}`, 'success');
            } else {
                showToast('❌ ' + (d.error || d.message), 'error');
            }
        } catch(e) {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> 발송'; }
            showToast('발송 실패: ' + e.message, 'error');
        }
    }
};
