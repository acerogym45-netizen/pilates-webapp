/**
 * 관리자 앱 코어 - 라우팅 & 공통 기능
 * v4.0 - bdxi 스타일 로그인 (단지 드롭다운 + 마스터 분리)
 */
const Admin = {
    complex: null,
    role: null,       // 'admin' | 'master'
    currentPage: null,

    // URL에서 단지 코드 읽기
    getComplexCodeFromUrl() {
        return new URLSearchParams(window.location.search).get('complex') || '';
    }
};

// ── 초기화 ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const savedComplex = sessionStorage.getItem('adminComplex');
    const savedRole    = sessionStorage.getItem('adminRole');

    if (savedComplex && savedRole) {
        Admin.complex = JSON.parse(savedComplex);
        Admin.role    = savedRole;
        startAdminApp();
    } else {
        // 로그인 화면 초기화: 단지 목록 로드
        _loadComplexListForLogin();
        // URL 파라미터로 단지 코드 자동 선택
        const codeFromUrl = Admin.getComplexCodeFromUrl();
        if (codeFromUrl) {
            const codeInput = document.getElementById('loginComplexCode');
            if (codeInput) codeInput.value = codeFromUrl;
        }
    }
});

// ── 로그인 화면 단지 목록 로드 ───────────────────────────────────────────────
async function _loadComplexListForLogin() {
    const statusEl = document.getElementById('complexLoadStatus');
    const selectEl = document.getElementById('loginComplexSelect');
    const codeInput = document.getElementById('loginComplexCode');

    if (statusEl) statusEl.textContent = '단지 목록 로딩 중...';

    try {
        const res = await API.complexes.list();
        const list = (res.data || []).filter(cx => cx.is_active);

        if (!list.length) {
            // 등록된 단지 없음 → 코드 직접 입력 모드
            if (selectEl) selectEl.style.display = 'none';
            if (codeInput) codeInput.style.display = 'block';
            if (statusEl) statusEl.textContent = '단지 코드를 직접 입력하세요';
            return;
        }

        // 드롭다운 옵션 채우기
        if (selectEl) {
            selectEl.innerHTML = '<option value="">— 단지를 선택하세요 —</option>' +
                list.map(cx => `<option value="${cx.code}" data-id="${cx.id}">${escHtml(cx.name)}</option>`).join('');
        }

        // URL 파라미터로 단지 자동 선택
        const codeFromUrl = Admin.getComplexCodeFromUrl();
        if (codeFromUrl && selectEl) {
            selectEl.value = codeFromUrl;
        }

        if (statusEl) statusEl.textContent = '';
    } catch (e) {
        // API 실패 시 코드 직접 입력
        const selectWrap = document.getElementById('complexSelectWrap');
        if (selectWrap) selectWrap.style.display = 'none';
        if (codeInput) codeInput.style.display = 'block';
        if (statusEl) statusEl.textContent = '단지 목록 로드 실패. 코드를 직접 입력하세요.';
        statusEl.style.color = '#e74c3c';
    }
}

// ── 단지 선택 드롭다운 변경 ───────────────────────────────────────────────────
function onComplexSelectChange(value) {
    // 필요시 단지 선택에 따른 UI 변경 처리
}

// ── 로그인 폼 전환 ────────────────────────────────────────────────────────────
function showMasterLogin() {
    document.getElementById('cardAdmin').style.display  = 'none';
    document.getElementById('cardMaster').style.display = 'block';
    document.getElementById('loginHintBox').style.display = 'none';
    setTimeout(() => document.getElementById('masterPassword')?.focus(), 100);
}

function showAdminLogin() {
    document.getElementById('cardMaster').style.display = 'none';
    document.getElementById('cardAdmin').style.display  = 'block';
    document.getElementById('loginHintBox').style.display = 'block';
}

// ── 마스터 로그인 ─────────────────────────────────────────────────────────────
async function doMasterLogin() {
    const pw  = document.getElementById('masterPassword').value.trim();
    const err = document.getElementById('masterLoginError');
    err.style.display = 'none';

    if (!pw) { err.textContent = '마스터 비밀번호를 입력하세요'; err.style.display = 'block'; return; }

    const btn = document.querySelector('#cardMaster .btn-login-master-action');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 인증 중...'; }

    try {
        const res = await API.complexes.verifyPassword('', pw);
        Admin.complex = res.complex || { code: 'master', name: '마스터 관리자' };
        Admin.role    = 'master';
        sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));
        sessionStorage.setItem('adminRole',    'master');
        startAdminApp();
    } catch (e) {
        err.textContent = '마스터 비밀번호가 올바르지 않습니다';
        err.style.display = 'block';
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-crown"></i> 총괄 관리자 입장'; }
        setTimeout(() => err.style.display = 'none', 3000);
    }
}

// ── 일반 로그인 ───────────────────────────────────────────────────────────────
async function doLogin() {
    // 드롭다운 or 직접 입력에서 단지 코드 읽기
    const selectEl  = document.getElementById('loginComplexSelect');
    const codeInput = document.getElementById('loginComplexCode');
    let code = '';

    if (selectEl && selectEl.style.display !== 'none' && selectEl.value) {
        code = selectEl.value;
    } else if (codeInput && codeInput.style.display !== 'none') {
        code = codeInput.value.trim();
    } else if (selectEl) {
        code = selectEl.value.trim();
    }

    const pw  = document.getElementById('loginPassword').value.trim();
    const err = document.getElementById('loginError');
    err.style.display = 'none';

    if (!code) { err.textContent = '단지를 선택하거나 코드를 입력하세요'; err.style.display = 'block'; return; }
    if (!pw)   { err.textContent = '비밀번호를 입력하세요'; err.style.display = 'block'; return; }

    const btn = document.querySelector('#cardAdmin .btn-login-admin');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 인증 중...'; }

    try {
        const res = await API.complexes.verifyPassword(code, pw);
        Admin.complex = res.complex || { code };
        Admin.role    = res.role;
        sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));
        sessionStorage.setItem('adminRole',    Admin.role);
        startAdminApp();
    } catch (e) {
        err.textContent = '비밀번호가 올바르지 않습니다';
        err.style.display = 'block';
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> 입장하기'; }
        setTimeout(() => err.style.display = 'none', 3000);
    }
}

// ── 로그아웃 ──────────────────────────────────────────────────────────────────
function doLogout() {
    sessionStorage.removeItem('adminComplex');
    sessionStorage.removeItem('adminRole');
    Admin.complex = null; Admin.role = null; Admin.selectedComplexId = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainLayout').style.display = 'none';
    document.getElementById('loginPassword').value = '';
    const masterPw = document.getElementById('masterPassword');
    if (masterPw) masterPw.value = '';
    // 로그인 화면 초기 상태로
    showAdminLogin();
    _loadComplexListForLogin();
}

// ── 앱 시작 ──────────────────────────────────────────────────────────────────
function startAdminApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainLayout').style.display  = 'flex';

    const roleBadge = document.getElementById('sidebarRoleBadge');

    if (Admin.role === 'master') {
        document.getElementById('sidebarComplexName').textContent = '마스터 관리자';
        document.getElementById('sidebarComplexName').style.color = '#f39c12';
        if (roleBadge) {
            roleBadge.textContent = '👑 마스터';
            roleBadge.style.cssText = 'display:block;background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;border-radius:6px;padding:2px 8px;font-size:.72rem;font-weight:700;margin-top:2px';
        }
        // 마스터 메뉴 설정
        const myComplexMenu = document.getElementById('myComplexMenu');
        if (myComplexMenu) {
            myComplexMenu.setAttribute('data-page', 'complexes');
            myComplexMenu.setAttribute('onclick', "navigate('complexes')");
            myComplexMenu.innerHTML = `<i class="fas fa-city"></i> <span>단지 관리</span><span class="master-badge" style="font-size:.65rem;background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;border-radius:4px;padding:1px 5px;margin-left:4px">MASTER</span>`;
        }
        const masterMenu = document.getElementById('masterMenu');
        if (masterMenu) masterMenu.style.display = 'none';

        _initMasterComplexSwitcher();
    } else {
        document.getElementById('sidebarComplexName').textContent =
            Admin.complex?.name || Admin.complex?.code || '관리자';
        document.getElementById('sidebarComplexName').style.color = '';
        if (roleBadge) {
            roleBadge.textContent = '관리자';
            roleBadge.style.cssText = 'display:block';
        }
        const masterMenu = document.getElementById('masterMenu');
        if (masterMenu) masterMenu.style.display = 'none';
        const switcher = document.getElementById('masterComplexSwitcher');
        if (switcher) switcher.style.display = 'none';
    }

    navigate('dashboard');
    loadBadges();
}

// ── 마스터 단지 전환 셀렉터 ──────────────────────────────────────────────────
async function _initMasterComplexSwitcher() {
    const switcher = document.getElementById('masterComplexSwitcher');
    const select   = document.getElementById('masterComplexSelect');
    if (!switcher || !select) return;

    try {
        const res = await API.complexes.list();
        const list = res.data || [];
        if (!list.length) return;

        select.innerHTML = '<option value="">🏙 전체 단지 (통합 보기)</option>' +
            list.map(cx => `<option value="${cx.id}" data-code="${cx.code}" data-name="${escHtml(cx.name)}">
                ${cx.is_active ? '✅' : '⏸'} ${escHtml(cx.name)} (${escHtml(cx.code)})
            </option>`).join('');

        if (Admin.selectedComplexId) select.value = Admin.selectedComplexId;
        switcher.style.display = 'block';
        Admin._allComplexes = list;
    } catch(e) {
        console.warn('단지 목록 로드 실패:', e.message);
    }
}

function switchMasterComplex(complexId) {
    if (Admin.role !== 'master') return;
    if (!complexId) {
        Admin.selectedComplexId   = null;
        Admin.selectedComplexName = '전체 단지';
        Admin.selectedComplexCode = null;
        document.getElementById('sidebarComplexName').textContent = '마스터 관리자';
        document.getElementById('sidebarComplexName').style.color = '#f39c12';
    } else {
        const cx = (Admin._allComplexes || []).find(c => c.id === complexId);
        Admin.selectedComplexId   = complexId;
        Admin.selectedComplexName = cx?.name || '단지';
        Admin.selectedComplexCode = cx?.code || null;
        document.getElementById('sidebarComplexName').textContent = cx?.name || '단지';
        document.getElementById('sidebarComplexName').style.color = '#f39c12';
    }
    if (Admin.currentPage) navigate(Admin.currentPage);
    loadBadges();
}

function getMasterSelectedComplexId() {
    if (Admin.role !== 'master') return Admin.complex?.id || null;
    return Admin.selectedComplexId || null;
}
function getMasterSelectedComplexCode() {
    if (Admin.role !== 'master') return Admin.complex?.code || null;
    return Admin.selectedComplexCode || null;
}

// ── 페이지 라우팅 ─────────────────────────────────────────────────────────────
function navigate(page) {
    Admin.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
    const pages = { dashboard, applications, cancellations, inquiries, notices, programs, instructors, curricula, complexes, mycomplex };
    if (pages[page]) pages[page].render();
    return false;
}

// ── 배지 로드 ─────────────────────────────────────────────────────────────────
async function loadBadges() {
    try {
        const params = {};
        const effId = getMasterSelectedComplexId();
        if (effId) params.complexId = effId;
        const res = await API.stats.dashboard(params);
        const s = res.data;
        setBadge('navBadgeApp',     s.waiting);
        setBadge('navBadgeCancel',  s.pendingCancel);
        setBadge('navBadgeInquiry', s.unanswered);
    } catch (e) {}
}

function setBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) { el.textContent = count; el.style.display = 'inline-flex'; }
    else el.style.display = 'none';
}

// ── 범용 모달 ─────────────────────────────────────────────────────────────────
function openGlobalModal(title, bodyHtml, footerHtml = '') {
    document.getElementById('globalModalTitle').innerHTML = title;
    document.getElementById('globalModalBody').innerHTML  = bodyHtml;
    document.getElementById('globalModalFooter').innerHTML = footerHtml;
    document.getElementById('globalModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}
function closeGlobalModal() {
    document.getElementById('globalModal').style.display = 'none';
    document.body.style.overflow = '';
}

// ── 확인 모달 ─────────────────────────────────────────────────────────────────
function showConfirm(title, msg, onConfirm) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = msg;
    const btn = document.getElementById('confirmOkBtn');
    btn.onclick = () => { closeConfirmModal(); onConfirm(); };
    document.getElementById('confirmModal').style.display = 'flex';
}
function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const el = document.getElementById('adminToast');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3500);
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────
function formatDate(str) {
    if (!str) return '-';
    return str.slice(0, 16).replace('T', ' ');
}
function statusLabel(s) {
    const map = { approved:'승인', waiting:'대기', rejected:'거부', cancelled:'해지', expired:'만료', transferred:'양도', received:'양수', pending:'대기중' };
    return map[s] || s;
}
function statusClass(s) {
    const map = { approved:'success', waiting:'warning', rejected:'danger', cancelled:'muted', expired:'muted', transferred:'purple', received:'info', pending:'warning' };
    return map[s] || 'muted';
}
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}
function goToResidentPage() {
    const code = getEffectiveComplexCode() || Admin.complex?.code || '';
    window.open(`/?complex=${code}`, '_blank');
}
function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── 단지 ID 헬퍼 ─────────────────────────────────────────────────────────────
function getEffectiveComplexId() {
    if (Admin.role === 'master') return getMasterSelectedComplexId();
    return Admin.complex?.id || null;
}
function getEffectiveComplexCode() {
    if (Admin.role === 'master') return getMasterSelectedComplexCode();
    return Admin.complex?.code || null;
}

// ── 단지 선택 모달 (마스터 전용 컨텐츠 생성 시) ──────────────────────────────
let _pickComplexCallback = null;
function _onPickComplexConfirm() {
    const sel = document.getElementById('pickComplexSelect');
    if (!sel) return;
    const id   = sel.value;
    const name = sel.options[sel.selectedIndex]?.text || '';
    closeGlobalModal();
    if (_pickComplexCallback) { _pickComplexCallback(id, name); _pickComplexCallback = null; }
}
async function pickComplexForCreate(callback) {
    if (Admin.complex?.id) { callback(Admin.complex.id, Admin.complex.name); return; }
    try {
        const res = await API.complexes.list();
        const list = (res.data || []).filter(cx => cx.is_active);
        if (!list.length) { showToast('등록된 활성 단지가 없습니다', 'error'); return; }
        const opts = list.map(cx => `<option value="${cx.id}">${escHtml(cx.name)} (${escHtml(cx.code)})</option>`).join('');
        _pickComplexCallback = callback;
        const body = `
            <p style="font-size:.9rem;color:#666;margin-bottom:12px">
                <i class="fas fa-info-circle"></i>
                마스터 관리자로 로그인되어 있습니다. 항목을 추가할 단지를 선택하세요.
            </p>
            <div class="form-group">
                <label>단지 선택 <span class="req">*</span></label>
                <select id="pickComplexSelect" style="width:100%;padding:8px;border-radius:6px;border:1.5px solid #ddd">${opts}</select>
            </div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal(); _pickComplexCallback=null;">취소</button>
            <button class="btn-primary" onclick="_onPickComplexConfirm()">
                <i class="fas fa-check"></i> 선택
            </button>`;
        openGlobalModal('<i class="fas fa-building"></i> 단지 선택', body, footer);
    } catch(e) { showToast('단지 목록 로드 실패: ' + e.message, 'error'); }
}

// ── CSV 다운로드 ──────────────────────────────────────────────────────────────
function downloadCSV(filename, rows, headers) {
    const BOM = '\uFEFF';
    const csvRows = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(','))];
    const blob = new Blob([BOM + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}
