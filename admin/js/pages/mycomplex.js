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
        const isHotel   = cx.venue_type === 'hotel';
        const themeName = cx.theme_name || 'default';
        const body = `
            <!-- 🏨 페이지 디자인 설정 -->
            <div style="background:linear-gradient(135deg,#f0f4ff,#faf5ff);border:1.5px solid #c4b5fd;border-radius:12px;padding:16px 18px;margin-bottom:18px">
                <div style="font-weight:700;font-size:.95rem;color:#5b21b6;margin-bottom:14px">
                    <i class="fas fa-palette"></i> 페이지 디자인 설정
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#fff;border-radius:10px;border:1px solid #e9d5ff;margin-bottom:12px">
                    <div>
                        <div style="font-weight:600;font-size:.9rem;color:#1e1e2e">🏨 호텔 모드</div>
                        <div style="font-size:.78rem;color:#888;margin-top:2px">켜면 입주민 페이지가 호텔 전용 UI로 전환됩니다</div>
                    </div>
                    <label style="position:relative;display:inline-block;width:46px;height:26px;cursor:pointer;flex-shrink:0">
                        <input type="checkbox" id="editHotelMode" ${isHotel ? 'checked' : ''}
                               style="opacity:0;width:0;height:0"
                               onchange="mycomplex._onHotelModeChange(this.checked)">
                        <span id="hotelModeTrack" style="position:absolute;inset:0;background:${isHotel ? '#7c3aed' : '#ccc'};border-radius:26px;transition:.3s">
                            <span id="hotelModeThumb" style="position:absolute;top:3px;left:${isHotel ? '23px' : '3px'};width:20px;height:20px;background:#fff;border-radius:50%;transition:.3s;box-shadow:0 1px 3px rgba(0,0,0,.2)"></span>
                        </span>
                    </label>
                </div>
                <div class="form-group" style="margin-bottom:10px">
                    <label style="font-size:.85rem;font-weight:600;color:#374151;margin-bottom:6px;display:block">테마 선택</label>
                    <select id="editThemeName"
                            style="width:100%;padding:9px 12px;border:1.5px solid #c4b5fd;border-radius:8px;font-size:.88rem;background:#fff"
                            onchange="mycomplex._onThemeChange(this.value)">
                        <option value="default"  ${themeName==='default' ?'selected':''}>🏠 Default (기존 아파트 보라)</option>
                        <option value="hotel"    ${themeName==='hotel'   ?'selected':''}>🏨 Hotel (네이비+골드)</option>
                        <option value="modern"   ${themeName==='modern'  ?'selected':''}>🏙️ Modern (차콜+시안)</option>
                        <option value="nature"   ${themeName==='nature'  ?'selected':''}>🌿 Nature (딥그린+베이지)</option>
                        <option value="minimal"  ${themeName==='minimal' ?'selected':''}>⬜ Minimal (화이트+블랙)</option>
                        <option value="ocean"    ${themeName==='ocean'   ?'selected':''}>🌊 Ocean (딥블루+아쿠아)</option>
                        <option value="sunset"   ${themeName==='sunset'  ?'selected':''}>🌅 Sunset (브라운+오렌지)</option>
                        <option value="cherry"   ${themeName==='cherry'  ?'selected':''}>🌸 Cherry (로즈+크림)</option>
                        <option value="dark"     ${themeName==='dark'    ?'selected':''}>🌑 Dark (블랙+민트)</option>
                        <option value="royal"    ${themeName==='royal'   ?'selected':''}>👑 Royal (버건디+골드)</option>
                        <option value="zen"      ${themeName==='zen'     ?'selected':''}>🧘 Zen (오프화이트+인디고)</option>
                    </select>
                    <div id="themePreviewBar" style="margin-top:8px;height:8px;border-radius:4px;transition:background .3s;background:${mycomplex._themeColor(themeName)}"></div>
                </div>
            </div>
            <!-- 기본 정보 -->
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
        const name = document.getElementById('editCxName').value.trim();
        if (!name) { showToast('단지명을 입력하세요', 'error'); return; }

        const hotelMode = document.getElementById('editHotelMode')?.checked;
        const themeName = document.getElementById('editThemeName')?.value || 'default';
        const venueType = hotelMode ? 'hotel' : 'apartment';

        try {
            await API.complexes.update(id, {
                name,
                address:        document.getElementById('editCxAddr').value.trim(),
                primary_color:  document.getElementById('editCxColor').value,
                admin_password: document.getElementById('editCxPw').value.trim(),
                is_active:      document.getElementById('editCxActive').checked,
                theme_name:     themeName,
                venue_type:     venueType,
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
                        <label>페이지 모드</label>
                        <span class="info-value">
                            ${cx.venue_type === 'hotel'
                                ? '<span style="background:#7c3aed;color:#fff;padding:2px 10px;border-radius:12px;font-size:.8rem;font-weight:600">🏨 호텔 모드 ON</span>'
                                : '<span style="background:#e5e7eb;color:#555;padding:2px 10px;border-radius:12px;font-size:.8rem;font-weight:600">🏠 아파트 모드</span>'}
                            &nbsp;
                            <span style="background:#f3f4f6;color:#666;padding:2px 8px;border-radius:10px;font-size:.78rem">${escHtml(cx.theme_name || 'default')} 테마</span>
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

            <!-- 시간대 정원 공유 설정 카드 -->
            <div class="settings-card">
                <div class="settings-card-header">
                    <i class="fas fa-users"></i> 시간대 정원 공유 설정
                </div>
                <div class="settings-card-body">
                    <p style="font-size:.875rem;color:#666;margin-bottom:16px;line-height:1.6">
                        <i class="fas fa-info-circle" style="color:#3498db"></i>
                        <strong>켜기</strong>: 같은 시간대에 프로그램이 여러 개(8회권, 12회권 등)여도 <strong>자리를 공유</strong>합니다.<br>
                        예) 월수금 09:00 정원 6명 → 8회권·12회권·24회권 신청자 합산 6명이 차면 마감<br>
                        <strong>끄기</strong>: 프로그램별로 정원을 독립 관리합니다 (기존 방식).
                    </p>
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#f8f9fa;border-radius:10px;border:1px solid #e9ecef">
                        <div>
                            <div style="font-weight:600;font-size:.95rem;color:#2c3e50">
                                <i class="fas fa-share-alt" style="color:#8e44ad;margin-right:6px"></i>
                                시간대별 정원 통합 관리
                            </div>
                            <div style="font-size:.8rem;color:#888;margin-top:3px">
                                같은 시간대 프로모션(회권 종류)끼리 정원 공유
                            </div>
                        </div>
                        <label style="position:relative;display:inline-block;width:52px;height:28px;cursor:pointer;flex-shrink:0">
                            <input type="checkbox" id="shareCapacityToggle"
                                   ${cx.share_timeslot_capacity ? 'checked' : ''}
                                   style="opacity:0;width:0;height:0"
                                   onchange="mycomplex._saveShareCapacity(this.checked)">
                            <span style="position:absolute;inset:0;background:${cx.share_timeslot_capacity ? '#8e44ad' : '#ccc'};border-radius:28px;transition:.3s"
                                  id="shareCapacityTrack">
                                <span style="position:absolute;top:3px;left:${cx.share_timeslot_capacity ? '27px' : '3px'};width:22px;height:22px;background:#fff;border-radius:50%;transition:.3s;box-shadow:0 1px 3px rgba(0,0,0,.2)"
                                      id="shareCapacityThumb"></span>
                            </span>
                        </label>
                    </div>
                    <p id="shareCapacityHint" style="margin-top:10px;font-size:.8rem;color:${cx.share_timeslot_capacity ? '#8e44ad' : '#e74c3c'}">
                        ${cx.share_timeslot_capacity
                            ? '<i class="fas fa-check-circle"></i> 시간대 정원 공유 ON — 같은 시간대 프로모션이 자리를 함께 씁니다'
                            : '<i class="fas fa-times-circle"></i> 시간대 정원 공유 OFF — 프로그램별 독립 정원 (기존 방식)'}
                    </p>
                </div>
            </div>

            <!-- 해지 신청 탭 설정 카드 -->
            <div class="settings-card">
                <div class="settings-card-header">
                    <i class="fas fa-file-signature"></i> 해지 신청 기능 설정
                </div>
                <div class="settings-card-body">
                    <p style="font-size:.875rem;color:#666;margin-bottom:16px;line-height:1.6">
                        <i class="fas fa-info-circle" style="color:#3498db"></i>
                        입주민 페이지의 <strong>해지 신청</strong> 퀵액션 버튼 표시 여부를 설정합니다.<br>
                        끄면 버튼이 사라지고 해지 신청을 받지 않습니다.
                    </p>
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#f8f9fa;border-radius:10px;border:1px solid #e9ecef">
                        <div>
                            <div style="font-weight:600;font-size:.95rem;color:#2c3e50">
                                <i class="fas fa-file-signature" style="color:#e74c3c;margin-right:6px"></i>
                                해지 신청 버튼
                            </div>
                            <div style="font-size:.8rem;color:#888;margin-top:3px">
                                입주민 페이지 퀵액션에 해지 신청 버튼 표시
                            </div>
                        </div>
                        <label style="position:relative;display:inline-block;width:52px;height:28px;cursor:pointer;flex-shrink:0">
                            <input type="checkbox" id="showCancelTabToggle"
                                   ${cx.show_cancel_tab !== false ? 'checked' : ''}
                                   style="opacity:0;width:0;height:0"
                                   onchange="mycomplex._saveCancelTabSetting(this.checked)">
                            <span style="position:absolute;inset:0;background:${cx.show_cancel_tab !== false ? '#10b981' : '#ccc'};border-radius:28px;transition:.3s"
                                  id="showCancelTabTrack">
                                <span style="position:absolute;top:3px;left:${cx.show_cancel_tab !== false ? '27px' : '3px'};width:22px;height:22px;background:#fff;border-radius:50%;transition:.3s;box-shadow:0 1px 3px rgba(0,0,0,.2)"
                                      id="showCancelTabThumb"></span>
                            </span>
                        </label>
                    </div>
                    <p id="cancelTabSettingHint" style="margin-top:10px;font-size:.8rem;color:${cx.show_cancel_tab !== false ? '#10b981' : '#e74c3c'}">
                        ${cx.show_cancel_tab !== false
                            ? '<i class="fas fa-check-circle"></i> 해지 신청 버튼이 표시됩니다'
                            : '<i class="fas fa-eye-slash"></i> 해지 신청 버튼이 숨겨집니다'}
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
            </div>

            ${cx.venue_type === 'hotel' ? `
            <!-- ── 입주민 페이지 화면 미리보기 및 설정 (호텔 모드 전용) ── -->
            <div class="settings-card" id="pagePreviewCard"
                 style="border:2px solid rgba(200,168,100,.45);background:linear-gradient(135deg,#0d1b2e,#132336)">
                <div class="settings-card-header"
                     style="background:linear-gradient(90deg,#0d1b2e,#1a2e45);color:#C8A864;border-bottom:1px solid rgba(200,168,100,.3)">
                    <i class="fas fa-tv" style="margin-right:6px"></i>
                    입주민 페이지 화면 미리보기 및 설정
                    <span style="font-size:.75rem;font-weight:400;color:#8ba8c2;margin-left:8px">
                        클릭하여 텍스트/표시 여부 편집
                    </span>
                </div>
                <div class="settings-card-body" style="padding:16px;background:transparent">

                    <!-- 안내 -->
                    <p style="font-size:.82rem;color:#8ba8c2;margin-bottom:14px;line-height:1.6;padding:10px 12px;background:rgba(200,168,100,.07);border-radius:8px;border:1px solid rgba(200,168,100,.2)">
                        <i class="fas fa-info-circle" style="color:#C8A864;margin-right:4px"></i>
                        각 항목을 수정하면 입주민 페이지에 즉시 반영됩니다.
                        공란으로 두면 기본값이 표시됩니다.
                    </p>

                    <!-- 미리보기 패널 -->
                    <div id="hotelPagePreview" style="
                        background:#0d1b2e;border:1px solid rgba(200,168,100,.25);border-radius:14px;
                        padding:16px 14px;margin-bottom:18px;position:relative;overflow:hidden;
                        font-family:'Noto Sans KR',sans-serif;">

                        <!-- 헤더 슬로건 -->
                        <div style="text-align:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(200,168,100,.15)">
                            <div style="font-size:.55rem;letter-spacing:.22em;color:#C8A864;margin-bottom:4px">FITNESS CONCIERGE</div>
                            <div id="prevHeroTitle" style="font-size:1rem;font-weight:700;color:#f0eade;line-height:1.4">
                                ${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return s.hero_title||'아세로짐 대전 라마다호텔점에<br>어서 오세요.'; }catch(e){ return '아세로짐 대전 라마다호텔점에<br>어서 오세요.'; } })()}
                            </div>
                        </div>

                        <!-- PRIMARY CTA 미리보기 -->
                        <div style="background:rgba(200,168,100,.09);border:1px solid rgba(200,168,100,.3);border-left:3px solid #C8A864;border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
                            <div style="width:36px;height:36px;background:rgba(200,168,100,.18);border-radius:8px;border:1px solid rgba(200,168,100,.4);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">🏋</div>
                            <div style="flex:1;min-width:0">
                                <div style="font-size:.5rem;color:#C8A864;letter-spacing:.12em">WELLNESS CLASS</div>
                                <div id="prevLessonTitle" style="font-size:.85rem;font-weight:700;color:#e2c97e">헬스 클래스 신청</div>
                                <div id="prevLessonDesc" style="font-size:.62rem;color:#7a9ab8">
                                    ${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return s.lesson_desc||'그룹 트레이닝 · 근력 · 유산소'; }catch(e){ return '그룹 트레이닝 · 근력 · 유산소'; } })()}
                                </div>
                            </div>
                            <span style="color:#C8A864;font-size:1rem">›</span>
                        </div>

                        <!-- SECONDARY 2열 -->
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
                            <div style="background:rgba(26,58,90,.8);border:1px solid rgba(200,168,100,.2);border-radius:8px;padding:8px 10px;display:flex;align-items:center;gap:6px">
                                <div style="width:28px;height:28px;background:rgba(200,168,100,.15);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:.85rem;flex-shrink:0">🧑‍💼</div>
                                <div>
                                    <div style="font-size:.48rem;color:#7a9ab8;letter-spacing:.1em">PERSONAL</div>
                                    <div id="prevPtTitle" style="font-size:.75rem;font-weight:700;color:#f0eade">
                                        ${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return s.pt_title||'PT 예약'; }catch(e){ return 'PT 예약'; } })()}
                                    </div>
                                    <div id="prevPtDesc" style="font-size:.58rem;color:#7a9ab8">
                                        ${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return s.pt_desc||'1:1 퍼스널 트레이닝'; }catch(e){ return '1:1 퍼스널 트레이닝'; } })()}
                                    </div>
                                </div>
                            </div>
                            <div style="background:rgba(18,45,72,.8);border:1px solid rgba(200,168,100,.15);border-radius:8px;padding:8px 10px;display:flex;align-items:center;gap:6px">
                                <div style="width:28px;height:28px;background:rgba(200,168,100,.1);border-radius:6px;display:flex;align-items:center;justify-content:function:.85rem;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.85rem">📋</div>
                                <div>
                                    <div style="font-size:.48rem;color:#7a9ab8;letter-spacing:.1em">BOOKING</div>
                                    <div id="prevBookingTitle" style="font-size:.75rem;font-weight:700;color:#f0eade">예약 조회·변경</div>
                                    <div style="font-size:.58rem;color:#7a9ab8">내역 확인 · 취소 · 변경</div>
                                </div>
                            </div>
                        </div>

                        <!-- MORE SERVICES 레이블 -->
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                            <div style="flex:1;height:1px;background:rgba(200,168,100,.2)"></div>
                            <span style="font-size:.5rem;letter-spacing:.2em;color:#C8A864;opacity:.6">MORE SERVICES</span>
                            <div style="flex:1;height:1px;background:rgba(200,168,100,.2)"></div>
                        </div>

                        <!-- 서브 6버튼 그리드 미리보기 -->
                        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:8px">
                            ${mycomplex._renderSubPreviewGrid(cx.page_settings)}
                        </div>

                        <!-- 아웃라인 버튼 2종 -->
                        <div style="display:flex;flex-direction:column;gap:5px">
                            <div id="prevManage" style="border:1.5px solid rgba(200,168,100,.35);border-radius:8px;padding:8px;text-align:center;font-size:.72rem;color:#e2c97e">
                                📋 ${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return s.manage_label||'내 신청 내역 조회·변경'; }catch(e){ return '내 신청 내역 조회·변경'; } })()}
                            </div>
                            <div id="prevCancel" style="border:1.5px solid rgba(180,60,60,.35);border-radius:8px;padding:8px;text-align:center;font-size:.72rem;color:#d08888">
                                ❌ ${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return s.cancel_label||'이용 해지 신청'; }catch(e){ return '이용 해지 신청'; } })()}
                            </div>
                        </div>
                    </div>

                    <!-- 편집 폼 -->
                    <div style="border-top:1px solid rgba(200,168,100,.2);padding-top:16px">
                        <div style="font-size:.85rem;font-weight:700;color:#C8A864;margin-bottom:12px">
                            <i class="fas fa-edit"></i> 텍스트 편집
                        </div>

                        <!-- 헤더 타이틀 -->
                        <div class="form-group" style="margin-bottom:10px">
                            <label style="font-size:.8rem;color:#8ba8c2">환영 타이틀 (상단 h2)</label>
                            <input type="text" id="psHeroTitle" placeholder="아세로짐 대전 라마다호텔점에&#10;어서 오세요."
                                   value="${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return escHtml(s.hero_title||''); }catch(e){ return ''; } })()}"
                                   style="background:#0d1b2e;color:#f0eade;border:1px solid rgba(200,168,100,.3);border-radius:8px;padding:8px 10px;font-size:.85rem;width:100%"
                                   oninput="mycomplex._livePreview('heroTitle',this.value)">
                            <small style="color:#5a7a9a;font-size:.72rem">줄바꿈이 필요하면 직접 HTML br을 사용하거나, 자동 줄바꿈됩니다</small>
                        </div>

                        <!-- PRIMARY CTA 타이틀 구분선 -->
                        <div style="font-size:.8rem;font-weight:700;color:#C8A864;margin:4px 0 8px;padding-top:8px;border-top:1px solid rgba(200,168,100,.15)">
                            PRIMARY · SECONDARY CTA
                        </div>

                        <!-- 헬스 클래스 타이틀 -->
                        <div class="form-group" style="margin-bottom:10px">
                            <label style="font-size:.8rem;color:#8ba8c2">헬스 클래스 신청 타이틀</label>
                            <input type="text" id="psLessonTitle" placeholder="헬스 클래스 신청"
                                   value="${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return escHtml(s.lesson_title||''); }catch(e){ return ''; } })()}"
                                   style="background:#0d1b2e;color:#f0eade;border:1px solid rgba(200,168,100,.3);border-radius:8px;padding:8px 10px;font-size:.85rem;width:100%"
                                   oninput="mycomplex._livePreview('lessonTitle',this.value)">
                        </div>

                        <!-- 클래스 설명 -->
                        <div class="form-group" style="margin-bottom:10px">
                            <label style="font-size:.8rem;color:#8ba8c2">헬스 클래스 설명 (서브텍스트)</label>
                            <input type="text" id="psLessonDesc" placeholder="그룹 트레이닝 · 근력 · 유산소"
                                   value="${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return escHtml(s.lesson_desc||''); }catch(e){ return ''; } })()}"
                                   style="background:#0d1b2e;color:#f0eade;border:1px solid rgba(200,168,100,.3);border-radius:8px;padding:8px 10px;font-size:.85rem;width:100%"
                                   oninput="mycomplex._livePreview('lessonDesc',this.value)">
                        </div>

                        <!-- PT 설명 -->
                        <div class="form-group" style="margin-bottom:10px">
                            <label style="font-size:.8rem;color:#8ba8c2">PT 예약 타이틀</label>
                            <input type="text" id="psPtTitle" placeholder="PT 예약"
                                   value="${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return escHtml(s.pt_title||''); }catch(e){ return ''; } })()}"
                                   style="background:#0d1b2e;color:#f0eade;border:1px solid rgba(200,168,100,.3);border-radius:8px;padding:8px 10px;font-size:.85rem;width:100%"
                                   oninput="mycomplex._livePreview('ptTitle',this.value)">
                        </div>
                        <div class="form-group" style="margin-bottom:10px">
                            <label style="font-size:.8rem;color:#8ba8c2">PT 예약 설명</label>
                            <input type="text" id="psPtDesc" placeholder="1:1 퍼스널 트레이닝"
                                   value="${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return escHtml(s.pt_desc||''); }catch(e){ return ''; } })()}"
                                   style="background:#0d1b2e;color:#f0eade;border:1px solid rgba(200,168,100,.3);border-radius:8px;padding:8px 10px;font-size:.85rem;width:100%"
                                   oninput="mycomplex._livePreview('ptDesc',this.value)">
                        </div>

                        <!-- 예약 조회·변경 타이틀 -->
                        <div class="form-group" style="margin-bottom:10px">
                            <label style="font-size:.8rem;color:#8ba8c2">예약 조회·변경 타이틀</label>
                            <input type="text" id="psBookingTitle" placeholder="예약 조회·변경"
                                   value="${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return escHtml(s.booking_title||''); }catch(e){ return ''; } })()}"
                                   style="background:#0d1b2e;color:#f0eade;border:1px solid rgba(200,168,100,.3);border-radius:8px;padding:8px 10px;font-size:.85rem;width:100%"
                                   oninput="mycomplex._livePreview('bookingTitle',this.value)">
                        </div>

                        <!-- 아웃라인 버튼 레이블 구분선 -->
                        <div style="font-size:.8rem;font-weight:700;color:#C8A864;margin:4px 0 8px;padding-top:8px;border-top:1px solid rgba(200,168,100,.15)">
                            하단 버튼
                        </div>

                        <!-- 내 신청 내역 조회·변경 -->  
                        <div class="form-group" style="margin-bottom:10px">
                            <label style="font-size:.8rem;color:#8ba8c2">내 신청 내역 버튼 레이블</label>
                            <input type="text" id="psManageLabel" placeholder="내 신청 내역 조회·변경"
                                   value="${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return escHtml(s.manage_label||''); }catch(e){ return ''; } })()}"
                                   style="background:#0d1b2e;color:#f0eade;border:1px solid rgba(200,168,100,.3);border-radius:8px;padding:8px 10px;font-size:.85rem;width:100%"
                                   oninput="mycomplex._livePreview('manageLabel',this.value)">
                        </div>

                        <!-- 이용 해지 신청 -->
                        <div class="form-group" style="margin-bottom:10px">
                            <label style="font-size:.8rem;color:#8ba8c2">이용 해지 신청 버튼 레이블</label>
                            <input type="text" id="psCancelLabel" placeholder="이용 해지 신청"
                                   value="${(()=>{ try{ const s=JSON.parse(cx.page_settings||'{}'); return escHtml(s.cancel_label||''); }catch(e){ return ''; } })()}"
                                   style="background:#0d1b2e;color:#f0eade;border:1px solid rgba(200,168,100,.3);border-radius:8px;padding:8px 10px;font-size:.85rem;width:100%"
                                   oninput="mycomplex._livePreview('cancelLabel',this.value)">
                        </div>

                        <!-- 서브 버튼 레이블 + 표시 여부 구분선 -->
                        <!-- 서브 버튼 레이블 + 표시 여부 -->
                        <div style="font-size:.8rem;font-weight:700;color:#8ba8c2;margin-bottom:8px;margin-top:4px">서브 서비스 표시 / 레이블</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
                            ${mycomplex._renderSubEditGrid(cx.page_settings)}
                        </div>

                        <!-- 저장 버튼 -->
                        <div style="display:flex;gap:8px;align-items:center">
                            <button class="btn-primary btn-sm"
                                    style="background:linear-gradient(135deg,#b8902a,#C8A864);border:none;color:#0d1b2e;font-weight:700"
                                    onclick="mycomplex._savePageSettings('${cx.id}')">
                                <i class="fas fa-save"></i> 화면 설정 저장
                            </button>
                            <button class="btn-secondary btn-sm"
                                    onclick="window.open('/?complex=${cx.code}','_blank')">
                                <i class="fas fa-external-link-alt"></i> 실제 페이지 확인
                            </button>
                        </div>
                    </div>
                </div>
            </div>` : ''}`;

        // SMS 설정 상태 비동기 로드
        setTimeout(() => mycomplex._loadSmsStatus(), 100);
    },

    _showAdminEditForm() {
        const cx = Admin.complex;
        const isHotel   = cx.venue_type === 'hotel';
        const themeName = cx.theme_name || 'default';
        const body = `
            <!-- 🏨 페이지 디자인 설정 -->
            <div style="background:linear-gradient(135deg,#f0f4ff,#faf5ff);border:1.5px solid #c4b5fd;border-radius:12px;padding:16px 18px;margin-bottom:18px">
                <div style="font-weight:700;font-size:.95rem;color:#5b21b6;margin-bottom:14px">
                    <i class="fas fa-palette"></i> 페이지 디자인 설정
                </div>
                <!-- 호텔 모드 토글 -->
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#fff;border-radius:10px;border:1px solid #e9d5ff;margin-bottom:12px">
                    <div>
                        <div style="font-weight:600;font-size:.9rem;color:#1e1e2e">🏨 호텔 모드</div>
                        <div style="font-size:.78rem;color:#888;margin-top:2px">켜면 입주민 페이지가 호텔 전용 UI로 전환됩니다</div>
                    </div>
                    <label style="position:relative;display:inline-block;width:46px;height:26px;cursor:pointer;flex-shrink:0">
                        <input type="checkbox" id="editHotelMode" ${isHotel ? 'checked' : ''}
                               style="opacity:0;width:0;height:0"
                               onchange="mycomplex._onHotelModeChange(this.checked)">
                        <span id="hotelModeTrack" style="position:absolute;inset:0;background:${isHotel ? '#7c3aed' : '#ccc'};border-radius:26px;transition:.3s">
                            <span id="hotelModeThumb" style="position:absolute;top:3px;left:${isHotel ? '23px' : '3px'};width:20px;height:20px;background:#fff;border-radius:50%;transition:.3s;box-shadow:0 1px 3px rgba(0,0,0,.2)"></span>
                        </span>
                    </label>
                </div>
                <!-- 헬스장 모드 토글 -->
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#fff;border-radius:10px;border:1px solid #fed7aa;margin-bottom:12px">
                    <div>
                        <div style="font-weight:600;font-size:.9rem;color:#1e1e2e">🏋️ 헬스장 모드</div>
                        <div style="font-size:.78rem;color:#888;margin-top:2px">켜면 입주민 신청 폼에서 동/호수·시간표·내 신청 버튼이 숨겨집니다</div>
                    </div>
                    <label style="position:relative;display:inline-block;width:46px;height:26px;cursor:pointer;flex-shrink:0">
                        <input type="checkbox" id="editGymMode" ${cx.gym_mode ? 'checked' : ''}
                               style="opacity:0;width:0;height:0"
                               onchange="mycomplex._onGymModeChange(this.checked)">
                        <span id="editGymModeTrack" style="position:absolute;inset:0;background:${cx.gym_mode ? '#f97316' : '#ccc'};border-radius:26px;transition:.3s">
                            <span id="editGymModeThumb" style="position:absolute;top:3px;left:${cx.gym_mode ? '23px' : '3px'};width:20px;height:20px;background:#fff;border-radius:50%;transition:.3s;box-shadow:0 1px 3px rgba(0,0,0,.2)"></span>
                        </span>
                    </label>
                </div>
                <!-- 테마 선택 -->
                <div class="form-group" style="margin-bottom:10px">
                    <label style="font-size:.85rem;font-weight:600;color:#374151;margin-bottom:6px;display:block">테마 선택</label>
                    <select id="editThemeName"
                            style="width:100%;padding:9px 12px;border:1.5px solid #c4b5fd;border-radius:8px;font-size:.88rem;background:#fff"
                            onchange="mycomplex._onThemeChange(this.value)">
                        <option value="default"  ${themeName==='default' ?'selected':''}>🏠 Default (기존 아파트 보라)</option>
                        <option value="hotel"    ${themeName==='hotel'   ?'selected':''}>🏨 Hotel (네이비+골드)</option>
                        <option value="modern"   ${themeName==='modern'  ?'selected':''}>🏙️ Modern (차콜+시안)</option>
                        <option value="nature"   ${themeName==='nature'  ?'selected':''}>🌿 Nature (딥그린+베이지)</option>
                        <option value="minimal"  ${themeName==='minimal' ?'selected':''}>⬜ Minimal (화이트+블랙)</option>
                        <option value="ocean"    ${themeName==='ocean'   ?'selected':''}>🌊 Ocean (딥블루+아쿠아)</option>
                        <option value="sunset"   ${themeName==='sunset'  ?'selected':''}>🌅 Sunset (브라운+오렌지)</option>
                        <option value="cherry"   ${themeName==='cherry'  ?'selected':''}>🌸 Cherry (로즈+크림)</option>
                        <option value="dark"     ${themeName==='dark'    ?'selected':''}>🌑 Dark (블랙+민트)</option>
                        <option value="royal"    ${themeName==='royal'   ?'selected':''}>👑 Royal (버건디+골드)</option>
                        <option value="zen"      ${themeName==='zen'     ?'selected':''}>🧘 Zen (오프화이트+인디고)</option>
                    </select>
                    <div id="themePreviewBar" style="margin-top:8px;height:8px;border-radius:4px;transition:background .3s;background:${mycomplex._themeColor(themeName)}"></div>
                </div>
            </div>
            <!-- 기본 정보 -->
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

    /* 테마 색상 맵 */
    _THEME_COLORS: {
        default:'#667eea', hotel:'#C8A864', modern:'#00CEC9',
        nature:'#3A7D1E', minimal:'#111111', ocean:'#00B4D8',
        sunset:'#E8650A', cherry:'#D4457A', dark:'#0AFFD9',
        royal:'#BF9B30', zen:'#3D3580'
    },
    _themeColor(name) {
        return mycomplex._THEME_COLORS[name] || mycomplex._THEME_COLORS.default;
    },
    _onThemeChange(val) {
        const bar = document.getElementById('themePreviewBar');
        if (bar) bar.style.background = mycomplex._themeColor(val);
        /* 호텔 테마 선택 시 호텔 모드 자동 ON */
        if (val === 'hotel') {
            const chk = document.getElementById('editHotelMode');
            const trk = document.getElementById('hotelModeTrack');
            const thb = document.getElementById('hotelModeThumb');
            if (chk && !chk.checked) {
                chk.checked = true;
                if (trk) trk.style.background = '#7c3aed';
                if (thb) thb.style.left = '23px';
            }
        }
        /* 즉시 DB 저장 — theme_name + venue_type 연동 */
        if (!Admin.complex?.id) return;
        const hotelChk = document.getElementById('editHotelMode');
        const isHotel  = hotelChk ? hotelChk.checked : (val === 'hotel');
        API.complexes.patchFlags(Admin.complex.id, {
            theme_name: val,
            venue_type: isHotel ? 'hotel' : 'apartment'
        }).then(res => {
            Admin.complex = res.data;
            sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));
            showToast(`🎨 테마 "${val}" 저장되었습니다`);
        }).catch(err => {
            showToast('테마 저장 실패: ' + err.message, 'error');
        });
    },
    _onHotelModeChange(checked) {
        const trk = document.getElementById('hotelModeTrack');
        const thb = document.getElementById('hotelModeThumb');
        if (trk) trk.style.background = checked ? '#7c3aed' : '#ccc';
        if (thb) thb.style.left = checked ? '23px' : '3px';
        /* 호텔 모드 ON 시 테마를 hotel로 자동 세팅 */
        if (checked) {
            const sel = document.getElementById('editThemeName');
            if (sel && sel.value === 'default') {
                sel.value = 'hotel';
                mycomplex._onThemeChange('hotel');
            }
        }
        /* 즉시 DB 저장 — venue_type을 바로 반영 */
        if (!Admin.complex?.id) return;
        const newVenueType = checked ? 'hotel' : 'apartment';
        const newThemeName = checked
            ? (document.getElementById('editThemeName')?.value || 'hotel')
            : (document.getElementById('editThemeName')?.value || 'default');

        API.complexes.patchFlags(Admin.complex.id, {
            venue_type: newVenueType,
            theme_name: newThemeName
        }).then(res => {
            Admin.complex = res.data;
            sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));
            showToast(checked ? '🏨 호텔 모드 ON — 저장되었습니다' : '🏠 호텔 모드 OFF — 저장되었습니다');
        }).catch(err => {
            showToast('저장 실패: ' + err.message, 'error');
            /* 실패 시 토글 원복 */
            const chk = document.getElementById('editHotelMode');
            if (chk) chk.checked = !checked;
            if (trk) trk.style.background = !checked ? '#7c3aed' : '#ccc';
            if (thb) thb.style.left = !checked ? '23px' : '3px';
        });
    },

    _onGymModeChange(checked) {
        const trk = document.getElementById('editGymModeTrack');
        const thb = document.getElementById('editGymModeThumb');
        if (trk) trk.style.background = checked ? '#f97316' : '#ccc';
        if (thb) thb.style.left = checked ? '23px' : '3px';

        if (!Admin.complex?.id) return;
        API.complexes.patchFlags(Admin.complex.id, { gym_mode: checked })
        .then(res => {
            Admin.complex = res.data;
            sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));
            showToast(checked ? '🏋️ 헬스장 모드 ON — 저장되었습니다' : '🏋️ 헬스장 모드 OFF — 저장되었습니다');
        }).catch(err => {
            showToast('저장 실패: ' + err.message, 'error');
            /* 실패 시 토글 원복 */
            const chk = document.getElementById('editGymMode');
            if (chk) chk.checked = !checked;
            if (trk) trk.style.background = !checked ? '#f97316' : '#ccc';
            if (thb) thb.style.left = !checked ? '23px' : '3px';
        });
    },

    async _saveAdminEdit() {
        const name       = document.getElementById('editCxName').value.trim();
        const address    = document.getElementById('editCxAddr').value.trim();
        const color      = document.getElementById('editCxColor').value;
        const currentPw  = document.getElementById('editCxCurrentPw').value;
        const hotelMode  = document.getElementById('editHotelMode')?.checked;
        const themeName  = document.getElementById('editThemeName')?.value || 'default';
        const venueType  = hotelMode ? 'hotel' : 'apartment';

        if (!name)      { showToast('단지명을 입력하세요', 'error'); return; }
        if (!currentPw) { showToast('현재 비밀번호를 입력하세요', 'error'); return; }

        try {
            const res = await API.complexes.selfUpdate(Admin.complex.id, {
                currentPassword: currentPw,
                name, address,
                primary_color: color,
                theme_name: themeName,
                venue_type: venueType
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

    async _saveShareCapacity(checked) {
        const track = document.getElementById('shareCapacityTrack');
        const thumb = document.getElementById('shareCapacityThumb');
        const hint  = document.getElementById('shareCapacityHint');
        if (track) track.style.background = checked ? '#8e44ad' : '#ccc';
        if (thumb) thumb.style.left = checked ? '27px' : '3px';
        if (hint) {
            hint.style.color = checked ? '#8e44ad' : '#e74c3c';
            hint.innerHTML = checked
                ? '<i class="fas fa-check-circle"></i> 시간대 정원 공유 ON — 같은 시간대 프로모션이 자리를 함께 씁니다'
                : '<i class="fas fa-times-circle"></i> 시간대 정원 공유 OFF — 프로그램별 독립 정원 (기존 방식)';
        }
        try {
            const res = await API.complexes.patchFlags(Admin.complex.id, { share_timeslot_capacity: checked });
            Admin.complex = res.data;
            sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));
            showToast(checked ? '시간대 정원 공유가 켜졌습니다' : '시간대 정원 공유가 꺼졌습니다');
        } catch(e) {
            const toggle = document.getElementById('shareCapacityToggle');
            if (toggle) toggle.checked = !checked;
            if (track) track.style.background = !checked ? '#8e44ad' : '#ccc';
            if (thumb) thumb.style.left = !checked ? '27px' : '3px';
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
            // 비밀번호 불필요한 flags 전용 PATCH 엔드포인트 사용
            const res = await API.complexes.patchFlags(Admin.complex.id, { show_inquiry: checked });
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

    async _saveCancelTabSetting(checked) {
        // 토글 UI 즉시 반영
        const track = document.getElementById('showCancelTabTrack');
        const thumb = document.getElementById('showCancelTabThumb');
        const hint  = document.getElementById('cancelTabSettingHint');
        if (track) track.style.background = checked ? '#10b981' : '#ccc';
        if (thumb) thumb.style.left = checked ? '27px' : '3px';
        if (hint) {
            hint.style.color = checked ? '#10b981' : '#e74c3c';
            hint.innerHTML = checked
                ? '<i class="fas fa-check-circle"></i> 해지 신청 버튼이 표시됩니다'
                : '<i class="fas fa-eye-slash"></i> 해지 신청 버튼이 숨겨집니다';
        }

        try {
            // 비밀번호 불필요한 flags 전용 PATCH 엔드포인트 사용
            const res = await API.complexes.patchFlags(Admin.complex.id, { show_cancel_tab: checked });
            Admin.complex = res.data;
            sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));
            showToast(checked ? '해지 신청 버튼이 활성화되었습니다' : '해지 신청 버튼이 숨겨졌습니다');
        } catch(e) {
            // 실패 시 토글 되돌리기
            const toggle = document.getElementById('showCancelTabToggle');
            if (toggle) toggle.checked = !checked;
            if (track) track.style.background = !checked ? '#10b981' : '#ccc';
            if (thumb) thumb.style.left = !checked ? '27px' : '3px';
            showToast('저장 실패: ' + e.message, 'error');
        }
    },

    async _saveGymMode(checked) {
        // 토글 UI 즉시 반영
        const track = document.getElementById('gymModeTrack');
        const thumb = document.getElementById('gymModeThumb');
        const hint  = document.getElementById('gymModeHint');
        if (track) track.style.background = checked ? '#f97316' : '#ccc';
        if (thumb) thumb.style.left = checked ? '27px' : '3px';
        if (hint) {
            hint.style.color = checked ? '#f97316' : '#6b7280';
            hint.innerHTML = checked
                ? '<i class="fas fa-check-circle"></i> 헬스장 모드 ON — 동/호수 입력 칸이 숨겨집니다'
                : '<i class="fas fa-times-circle"></i> 헬스장 모드 OFF — 동/호수 입력 칸이 표시됩니다 (기본)';
        }

        try {
            const res = await API.complexes.patchFlags(Admin.complex.id, { gym_mode: checked });
            Admin.complex = res.data;
            sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));
            showToast(checked ? '헬스장 모드가 활성화되었습니다 (동/호수 숨김)' : '헬스장 모드가 비활성화되었습니다 (동/호수 표시)');
        } catch(e) {
            // 실패 시 토글 되돌리기
            const toggle = document.getElementById('gymModeToggle');
            if (toggle) toggle.checked = !checked;
            if (track) track.style.background = !checked ? '#f97316' : '#ccc';
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

    /* ─── 입주민 페이지 미리보기 실시간 업데이트 ──────────────── */

    /** 서브 버튼 미리보기 그리드 HTML 생성 */
    _renderSubPreviewGrid(pageSettingsRaw) {
        let ps = {};
        try { ps = JSON.parse(pageSettingsRaw || '{}'); } catch(e) {}
        const items = [
            ['prevInquiry',  'show_inquiry',  'inquiry_label',  '내 문의 조회', '🔍'],
            ['prevTimetable','show_timetable','timetable_label','시간표',       '🕐'],
            ['prevProgram',  'show_program',  'program_label',  '프로그램 안내','📚'],
            ['prevTrainer',  'show_trainer',  'trainer_label',  '트레이너 소개','👤'],
            ['prevNotice',   'show_notice',   'notice_label',   '공지사항',     '📢'],
            ['prevContact',  'show_contact',  'contact_label',  '문의하기',     '💬'],
        ];
        return items.map(([pid, showKey, labelKey, defLabel, icon]) => {
            const show  = ps[showKey] !== false;
            const label = escHtml(ps[labelKey] || defLabel);
            if (show) {
                return '<div id="' + pid + '" style="background:rgba(200,168,100,.07);border:1px solid rgba(200,168,100,.2);border-radius:8px;padding:8px 4px;text-align:center;font-size:.6rem;color:#8ba8c2">'
                     + icon + '<br>' + label + '</div>';
            } else {
                return '<div id="' + pid + '" style="background:rgba(0,0,0,.2);border:1px dashed rgba(255,255,255,.08);border-radius:8px;padding:8px 4px;text-align:center;font-size:.6rem;color:#3a4a5a;text-decoration:line-through">'
                     + icon + '<br>' + label + '</div>';
            }
        }).join('');
    },

    /** 서브 버튼 편집 그리드 HTML 생성 */
    _renderSubEditGrid(pageSettingsRaw) {
        let ps = {};
        try { ps = JSON.parse(pageSettingsRaw || '{}'); } catch(e) {}
        const items = [
            ['psInquiryLabel',  'inquiry_label',  'psShowInquiry',  'show_inquiry',  '내 문의 조회'],
            ['psTimetableLabel','timetable_label','psShowTimetable','show_timetable','시간표'],
            ['psProgramLabel',  'program_label',  'psShowProgram',  'show_program',  '프로그램 안내'],
            ['psTrainerLabel',  'trainer_label',  'psShowTrainer',  'show_trainer',  '트레이너 소개'],
            ['psNoticeLabel',   'notice_label',   'psShowNotice',   'show_notice',   '공지사항'],
            ['psContactLabel',  'contact_label',  'psShowContact',  'show_contact',  '문의하기'],
        ];
        return items.map(([labelId, labelKey, showId, showKey, defLabel]) => {
            const show = ps[showKey] !== false;
            const val  = escHtml(ps[labelKey] || '');
            const def  = escHtml(defLabel);
            return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(200,168,100,.15);border-radius:8px;padding:8px 10px">'
                 + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">'
                 +   '<label style="font-size:.72rem;color:#8ba8c2">' + def + '</label>'
                 +   '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:.68rem;color:#8ba8c2">'
                 +     '<input type="checkbox" id="' + showId + '" ' + (show ? 'checked' : '') + ' style="width:14px;height:14px"'
                 +     ' onchange="mycomplex._livePreview(\'' + showId + '\',this.checked)"> 표시'
                 +   '</label>'
                 + '</div>'
                 + '<input type="text" id="' + labelId + '" placeholder="' + def + '" value="' + val + '"'
                 + ' style="background:#0d1b2e;color:#f0eade;border:1px solid rgba(200,168,100,.2);border-radius:6px;padding:5px 8px;font-size:.78rem;width:100%"'
                 + ' oninput="mycomplex._livePreview(\'' + labelId + '\',this.value)">'
                 + '</div>';
        }).join('');
    },

    /**
     * 폼 인풋 변경 시 미리보기 패널 실시간 반영
     * @param {string} field - 필드 식별자
     * @param {*}      value - 새 값
     */
    _livePreview(field, value) {
        const map = {
            heroTitle:      'prevHeroTitle',
            lessonTitle:    'prevLessonTitle',
            lessonDesc:     'prevLessonDesc',
            ptTitle:        'prevPtTitle',
            ptDesc:         'prevPtDesc',
            bookingTitle:   'prevBookingTitle',
        };
        // 텍스트 필드 (단순 textContent)
        if (map[field]) {
            const el = document.getElementById(map[field]);
            if (el) el.textContent = value || '';
            return;
        }
        // 아웃라인 버튼 레이블 (이모지 앞부분 유지)
        if (field === 'manageLabel') {
            const el = document.getElementById('prevManage');
            if (el) el.innerHTML = '📋 ' + escHtml(value || '내 신청 내역 조회·변경');
            return;
        }
        if (field === 'cancelLabel') {
            const el = document.getElementById('prevCancel');
            if (el) el.innerHTML = '❌ ' + escHtml(value || '이용 해지 신청');
            return;
        }
        // 서브 버튼 레이블
        const labelMap = {
            psInquiryLabel:  'prevInquiry',
            psTimetableLabel:'prevTimetable',
            psProgramLabel:  'prevProgram',
            psTrainerLabel:  'prevTrainer',
            psNoticeLabel:   'prevNotice',
            psContactLabel:  'prevContact',
        };
        if (labelMap[field]) {
            const el = document.getElementById(labelMap[field]);
            if (el) {
                const cur = el.innerHTML;
                // 이모지 앞부분 유지, 레이블만 교체
                el.innerHTML = cur.replace(/(<br>|<BR>).*$/, '<br>' + escHtml(value));
            }
            return;
        }
        // 서브 버튼 표시 여부 토글
        const showMap = {
            psShowInquiry:  'prevInquiry',
            psShowTimetable:'prevTimetable',
            psShowProgram:  'prevProgram',
            psShowTrainer:  'prevTrainer',
            psShowNotice:   'prevNotice',
            psShowContact:  'prevContact',
        };
        if (showMap[field]) {
            const el = document.getElementById(showMap[field]);
            if (!el) return;
            if (value) {
                el.style.background = 'rgba(200,168,100,.07)';
                el.style.border     = '1px solid rgba(200,168,100,.2)';
                el.style.color      = '#8ba8c2';
                el.style.textDecoration = '';
            } else {
                el.style.background = 'rgba(0,0,0,.2)';
                el.style.border     = '1px dashed rgba(255,255,255,.08)';
                el.style.color      = '#3a4a5a';
                el.style.textDecoration = 'line-through';
            }
        }
    },

    /** 입주민 페이지 설정 저장 */
    async _savePageSettings(complexId) {
        const get = (id, fallback='') => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : fallback;
        };
        const chk = (id, fallback=true) => {
            const el = document.getElementById(id);
            return el ? el.checked : fallback;
        };

        const page_settings = {
            hero_title:       get('psHeroTitle'),
            lesson_title:     get('psLessonTitle'),
            lesson_desc:      get('psLessonDesc'),
            pt_title:         get('psPtTitle'),
            pt_desc:          get('psPtDesc'),
            booking_title:    get('psBookingTitle'),
            manage_label:     get('psManageLabel'),
            cancel_label:     get('psCancelLabel'),
            inquiry_label:    get('psInquiryLabel'),
            timetable_label:  get('psTimetableLabel'),
            program_label:    get('psProgramLabel'),
            trainer_label:    get('psTrainerLabel'),
            notice_label:     get('psNoticeLabel'),
            contact_label:    get('psContactLabel'),
            show_inquiry:     chk('psShowInquiry'),
            show_timetable:   chk('psShowTimetable'),
            show_program:     chk('psShowProgram'),
            show_trainer:     chk('psShowTrainer'),
            show_notice:      chk('psShowNotice'),
            show_contact:     chk('psShowContact'),
        };

        try {
            const auth = mycomplex._masterPw
                ? { masterPassword: mycomplex._masterPw }
                : { adminPassword: Admin.complex?.admin_password || '' };
            await API.complexes.savePageSettings(complexId, page_settings, auth);
            showToast('✅ 페이지 설정이 저장되었습니다');
            // 로컬 데이터 갱신
            const cx = mycomplex.complexData.find(x => x.id === complexId);
            if (cx) cx.page_settings = JSON.stringify(page_settings);
        } catch(e) {
            showToast('저장 실패: ' + e.message, 'error');
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
