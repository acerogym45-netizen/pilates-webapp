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

// ── 로그인 ───────────────────────────────────────────────────────────────────
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
}

// ── 앱 시작 ──────────────────────────────────────────────────────────────────
function startAdminApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainLayout').style.display  = 'flex';

    document.getElementById('sidebarComplexName').textContent = Admin.complex?.name || Admin.complex?.code || '관리자';

    // 마스터 메뉴 표시
    if (Admin.role === 'master') {
        document.getElementById('masterMenu').style.display = 'flex';
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
    const pages = { dashboard, applications, cancellations, inquiries, notices, programs, instructors, curricula, complexes };
    if (pages[page]) {
        pages[page].render();
    }
    return false;
}

// ── 배지 로드 ─────────────────────────────────────────────────────────────────
async function loadBadges() {
    try {
        const res = await API.stats.dashboard({ complexId: Admin.complex?.id });
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
