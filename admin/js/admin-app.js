/**
 * 관리자 앱 코어 - 라우팅 & 공통 기능
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
    // 세션에 로그인 정보가 있으면 자동 로그인
    const savedComplex = sessionStorage.getItem('adminComplex');
    const savedRole    = sessionStorage.getItem('adminRole');

    // URL에서 단지 코드 자동 입력
    const codeFromUrl = Admin.getComplexCodeFromUrl();
    if (codeFromUrl) document.getElementById('loginComplexCode').value = codeFromUrl;

    if (savedComplex && savedRole) {
        Admin.complex = JSON.parse(savedComplex);
        Admin.role    = savedRole;
        startAdminApp();
    }
});

// ── 마스터 로그인 토글 (하위 호환성 유지) ────────────────────────────────────────────────────────
function toggleMasterLogin() {
    // 로그인 UI가 재설계되어 항상 표시됨; 하위 호환성을 위해 유지
    document.getElementById('masterPassword')?.focus();
}

// ── 마스터 로그인 ─────────────────────────────────────────────────────────────
async function doMasterLogin() {
    const pw  = document.getElementById('masterPassword').value.trim();
    const err = document.getElementById('loginError');
    err.style.display = 'none';

    if (!pw) { err.textContent = '마스터 비밀번호를 입력하세요'; err.style.display = 'block'; return; }

    try {
        // 마스터 비밀번호로 검증 (단지코드 없이 master로 시도)
        const res = await API.complexes.verifyPassword('', pw);
        Admin.complex = res.complex || { code: 'master', name: '마스터 관리자' };
        Admin.role    = 'master';

        sessionStorage.setItem('adminComplex', JSON.stringify(Admin.complex));
        sessionStorage.setItem('adminRole',    'master');

        startAdminApp();
    } catch (e) {
        err.textContent = '마스터 비밀번호가 올바르지 않습니다';
        err.style.display = 'block';
        setTimeout(() => err.style.display = 'none', 3000);
    }
}

// ── 일반 로그인 ───────────────────────────────────────────────────────────────
async function doLogin() {
    const code = document.getElementById('loginComplexCode').value.trim();
    const pw   = document.getElementById('loginPassword').value.trim();
    const err  = document.getElementById('loginError');
    err.style.display = 'none';

    if (!code || !pw) { err.textContent = '단지 코드와 비밀번호를 입력하세요'; err.style.display = 'block'; return; }

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
        setTimeout(() => err.style.display = 'none', 3000);
    }
}

function doLogout() {
    sessionStorage.removeItem('adminComplex');
    sessionStorage.removeItem('adminRole');
    Admin.complex = null; Admin.role = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainLayout').style.display = 'none';
    document.getElementById('loginPassword').value = '';
    // 마스터 비밀번호 필드 초기화
    const masterPw = document.getElementById('masterPassword');
    if (masterPw) masterPw.value = '';
}

// ── 앱 시작 ──────────────────────────────────────────────────────────────────
function startAdminApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainLayout').style.display  = 'flex';

    // 사이드바 단지명 & 역할 배지
    if (Admin.role === 'master') {
        document.getElementById('sidebarComplexName').textContent = '마스터 관리자';
        document.getElementById('sidebarComplexName').style.color = '#f39c12';
    } else {
        document.getElementById('sidebarComplexName').textContent =
            Admin.complex?.name || Admin.complex?.code || '관리자';
        document.getElementById('sidebarComplexName').style.color = '';
    }

    const roleBadge = document.getElementById('sidebarRoleBadge');
    if (roleBadge) {
        if (Admin.role === 'master') {
            roleBadge.textContent = '👑 마스터';
            roleBadge.style.cssText = 'display:block;background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;border-radius:6px;padding:2px 8px;font-size:.72rem;font-weight:700;margin-top:2px';
        } else {
            roleBadge.textContent = '관리자';
            roleBadge.style.cssText = 'display:block';
        }
    }

    // 마스터 전용 메뉴 처리
    if (Admin.role === 'master') {
        // 마스터: 내 단지 설정 메뉴를 단지 관리 형태로 변경
        const myComplexMenu = document.getElementById('myComplexMenu');
        if (myComplexMenu) {
            myComplexMenu.style.display = 'flex';
            myComplexMenu.innerHTML = `<i class="fas fa-city"></i> <span>단지 관리</span><span class="master-badge" style="font-size:.65rem;background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;border-radius:4px;padding:1px 5px;margin-left:4px">MASTER</span>`;
        }
        // masterMenu (전체 단지 관리) 별도 표시도 유지
        const masterMenu = document.getElementById('masterMenu');
        if (masterMenu) masterMenu.style.display = 'none'; // myComplexMenu로 통합했으므로 숨김
    } else {
        // 일반 관리자: masterMenu 숨김
        const masterMenu = document.getElementById('masterMenu');
        if (masterMenu) masterMenu.style.display = 'none';
    }

    navigate('dashboard');
    loadBadges();
}

// ── 페이지 라우팅 ─────────────────────────────────────────────────────────────
function navigate(page) {
    Admin.currentPage = page;

    // 사이드바 활성화
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

    // 모바일 사이드바 닫기
    document.getElementById('sidebar').classList.remove('open');

    // 페이지 렌더링
    const pages = { dashboard, applications, cancellations, inquiries, notices, programs, instructors, curricula, complexes, mycomplex };
    if (pages[page]) {
        pages[page].render();
    }
    return false;
}

// ── 배지 로드 ─────────────────────────────────────────────────────────────────
async function loadBadges() {
    try {
        const params = {};
        if (Admin.complex?.id) params.complexId = Admin.complex.id;
        const res = await API.stats.dashboard(params);
        const s = res.data;

        setBadge('navBadgeApp',    s.waiting);
        setBadge('navBadgeCancel', s.pendingCancel);
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
    const code = Admin.complex?.code || '';
    window.open(`/?complex=${code}`, '_blank');
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── 단지 ID 헬퍼 (마스터 관리자의 경우 null 반환) ─────────────────────────────────
function getEffectiveComplexId() {
    return Admin.complex?.id || null;
}

// 단지 선택 콜백 저장소
let _pickComplexCallback = null;

function _onPickComplexConfirm() {
    const sel = document.getElementById('pickComplexSelect');
    if (!sel) return;
    const id   = sel.value;
    const name = sel.options[sel.selectedIndex]?.text || '';
    closeGlobalModal();
    if (_pickComplexCallback) {
        _pickComplexCallback(id, name);
        _pickComplexCallback = null;
    }
}

// 마스터 관리자가 공지/프로그램 생성 시 단지 선택 모달 (콜백 방식)
async function pickComplexForCreate(callback) {
    if (Admin.complex?.id) {
        // 일반 관리자: 바로 본인 단지 ID 사용
        callback(Admin.complex.id, Admin.complex.name);
        return;
    }
    // 마스터 관리자: 단지 목록 조회 후 선택
    try {
        const res = await API.complexes.list();
        const list = (res.data || []).filter(cx => cx.is_active);
        if (!list.length) { showToast('등록된 활성 단지가 없습니다', 'error'); return; }
        const opts = list.map(cx =>
            `<option value="${cx.id}">${escHtml(cx.name)} (${escHtml(cx.code)})</option>`
        ).join('');
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
    } catch(e) {
        showToast('단지 목록 로드 실패: ' + e.message, 'error');
    }
}

// ── CSV 다운로드 유틸 ──────────────────────────────────────────────────────────
function downloadCSV(filename, rows, headers) {
    const BOM = '\uFEFF';
    const csvRows = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(','))];
    const blob = new Blob([BOM + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}
