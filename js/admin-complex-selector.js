/**
 * admin-complex-selector.js
 * 모든 관리자 페이지에서 공통으로 사용하는 단지 선택 헤더 컴포넌트
 *
 * 기능:
 *  - URL ?complex=CODE 파라미터로 단지 식별
 *  - 인증(마스터/단지 비밀번호) 후 sessionStorage에 보관
 *  - 헤더에 단지 셀렉터 드롭다운 삽입 (마스터 로그인 시 전체 단지 전환 가능)
 *  - complexSelector.getComplexCode() / .getComplexId() 로 현재 단지 접근
 */

const complexSelector = (() => {
    const SESSION_KEY  = 'admin_auth';       // { role, complexCode, complexId, complexName }
    const MASTER_KEY   = 'master_auth_ok';   // 마스터 별도 플래그

    let _state = null;       // 현재 인증 상태
    let _allComplexes = [];  // 전체 단지 목록 (마스터 전용)

    /* ─────────────────────────────────────────────
       공개 API
    ───────────────────────────────────────────── */
    function getComplexCode() { return _state?.complexCode || null; }
    function getComplexId()   { return _state?.complexId   || null; }
    function getComplexName() { return _state?.complexName || '단지'; }
    function getRole()        { return _state?.role        || null; }
    function isMaster()       { return _state?.role === 'master'; }

    /* URL에서 complex 파라미터 읽기 */
    function getCodeFromURL() {
        return new URLSearchParams(window.location.search).get('complex') || null;
    }

    /* ─────────────────────────────────────────────
       초기화 – 페이지 로드 시 호출
       1) sessionStorage에 저장된 인증 확인
       2) 없으면 로그인 화면 표시
    ───────────────────────────────────────────── */
    async function init() {
        const saved = _loadSession();
        const urlCode = getCodeFromURL();

        if (saved) {
            // URL에 다른 단지 코드가 있으면 교체 (마스터만 가능)
            if (urlCode && urlCode !== saved.complexCode && saved.role === 'master') {
                await _switchComplex(urlCode);
            } else {
                _state = saved;
            }
            await _renderHeader();
            return true;
        }

        // 미인증 → 로그인 화면 표시
        _showLoginScreen(urlCode);
        return false;
    }

    /* ─────────────────────────────────────────────
       로그인 화면 주입
    ───────────────────────────────────────────── */
    function _showLoginScreen(prefillCode) {
        document.body.innerHTML = `
        <style>
            .cs-login-bg {
                min-height: 100vh;
                background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%);
                display: flex; align-items: center; justify-content: center; padding: 20px;
            }
            .cs-login-card {
                background: #fff; border-radius: 18px;
                max-width: 400px; width: 100%; padding: 48px 40px;
                text-align: center;
                box-shadow: 0 24px 80px rgba(0,0,0,.3);
            }
            .cs-lock { width: 72px; height: 72px; background: #eef2ff; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                margin: 0 auto 24px; font-size: 1.8rem; color: #4338ca; }
            .cs-login-card h2 { font-size: 1.35rem; color: #1e1b4b; margin-bottom: 6px; }
            .cs-login-card p  { color: #6b7280; font-size: .88rem; margin-bottom: 28px; }
            .cs-input {
                width: 100%; padding: 12px 14px; border: 2px solid #e5e7eb;
                border-radius: 10px; font-size: .95rem; margin-bottom: 10px;
                transition: border-color .2s;
            }
            .cs-input:focus { outline: none; border-color: #4338ca;
                box-shadow: 0 0 0 3px rgba(67,56,202,.1); }
            .cs-btn {
                width: 100%; padding: 13px; background: #4338ca;
                color: #fff; border: none; border-radius: 10px;
                font-size: .95rem; font-weight: 700; cursor: pointer; margin-top: 4px;
            }
            .cs-btn:hover { background: #3730a3; }
            .cs-err { color: #dc2626; font-size: .85rem; margin-top: 10px; display: none; }
            .cs-sep { text-align: center; color: #9ca3af; font-size: .78rem; margin: 12px 0; }
            .cs-master-link {
                display: block; margin-top: 20px; padding-top: 20px;
                border-top: 1px solid #f3f4f6; color: #9ca3af; font-size: .8rem;
                text-decoration: none;
            }
            .cs-master-link:hover { color: #4338ca; }
        </style>
        <div class="cs-login-bg">
            <div class="cs-login-card">
                <div class="cs-lock"><i class="fas fa-shield-alt"></i></div>
                <h2>관리자 로그인</h2>
                <p>단지 관리자 또는 마스터 비밀번호를 입력하세요</p>
                <input class="cs-input" type="text" id="csCodeInput"
                       placeholder="단지 코드 (예: cheongju-sk)"
                       value="${prefillCode || ''}" autocomplete="off">
                <input class="cs-input" type="password" id="csPwInput"
                       placeholder="비밀번호"
                       onkeydown="if(event.key==='Enter') window._csDoLogin()">
                <button class="cs-btn" onclick="window._csDoLogin()">
                    <i class="fas fa-sign-in-alt"></i> 접속
                </button>
                <p class="cs-err" id="csErr">
                    <i class="fas fa-exclamation-circle"></i> 단지 코드 또는 비밀번호가 올바르지 않습니다
                </p>
                <a href="master-admin.html" class="cs-master-link">
                    <i class="fas fa-crown"></i> 마스터 관리자 페이지로 이동
                </a>
            </div>
        </div>`;

        window._csDoLogin = async () => {
            const code = document.getElementById('csCodeInput').value.trim();
            const pw   = document.getElementById('csPwInput').value.trim();
            const err  = document.getElementById('csErr');
            err.style.display = 'none';
            if (!pw) return;

            try {
                const res = await fetch('/api/complexes/verify-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ complexCode: code || undefined, password: pw })
                });
                const data = await res.json();
                if (data.success) {
                    const s = {
                        role: data.role,
                        complexCode: data.complex?.code  || code,
                        complexId:   data.complex?.id    || null,
                        complexName: data.complex?.name  || '단지',
                    };
                    _saveSession(s);
                    if (data.role === 'master') sessionStorage.setItem(MASTER_KEY, '1');
                    location.reload();
                } else {
                    err.style.display = 'block';
                }
            } catch (e) {
                err.style.display = 'block';
            }
        };
    }

    /* ─────────────────────────────────────────────
       헤더 렌더링
    ───────────────────────────────────────────── */
    async function _renderHeader() {
        const header = document.querySelector('.admin-header');
        if (!header) return;

        // 마스터이면 전체 단지 목록 로드
        if (isMaster()) {
            try {
                const res = await fetch('/api/complexes');
                const data = await res.json();
                _allComplexes = data.data || [];
            } catch (_) {}
        }

        // 단지 선택기 / 배지 HTML 생성
        const complexBarHTML = _buildComplexBar();

        // 기존 헤더 h1 아래에 단지바 삽입
        let bar = header.querySelector('.cs-complex-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'cs-complex-bar';
            header.appendChild(bar);
        }
        bar.innerHTML = complexBarHTML;

        // 마스터 배지 스타일 주입
        _injectStyles();
    }

    function _buildComplexBar() {
        const role = getRole();
        const name = getComplexName();
        const code = getComplexCode();

        let html = `<div class="cs-bar">`;

        if (isMaster() && _allComplexes.length > 0) {
            // 드롭다운 셀렉터
            const options = _allComplexes
                .filter(c => c.is_active !== false)
                .map(c => `<option value="${c.code}" ${c.code === code ? 'selected' : ''}>${c.name}</option>`)
                .join('');
            html += `
                <span class="cs-master-badge"><i class="fas fa-crown"></i> MASTER</span>
                <div class="cs-selector-wrap">
                    <i class="fas fa-building" style="color:#6b7280; font-size:.9rem;"></i>
                    <select class="cs-select" onchange="window._csSwitchComplex(this.value)">
                        ${options}
                    </select>
                </div>`;
        } else {
            html += `
                <span class="cs-complex-name">
                    <i class="fas fa-building"></i> ${_esc(name)}
                </span>`;
        }

        html += `
            <div style="display:flex; gap:8px; align-items:center;">
                <a href="master-admin.html" class="cs-btn-small" title="마스터 대시보드">
                    <i class="fas fa-layer-group"></i>
                </a>
                <button class="cs-btn-small cs-logout" onclick="window._csLogout()">
                    <i class="fas fa-sign-out-alt"></i> 로그아웃
                </button>
            </div>
        </div>`;

        return html;
    }

    function _injectStyles() {
        if (document.getElementById('cs-styles')) return;
        const style = document.createElement('style');
        style.id = 'cs-styles';
        style.textContent = `
            .cs-complex-bar { margin-top: 16px; padding-top: 16px; border-top: 1px solid #f0f0f0; }
            .cs-bar {
                display: flex; align-items: center; gap: 12px;
                flex-wrap: wrap; justify-content: space-between;
            }
            .cs-master-badge {
                background: #4338ca; color: #fff;
                padding: 4px 12px; border-radius: 20px;
                font-size: .75rem; font-weight: 700;
            }
            .cs-selector-wrap {
                display: flex; align-items: center; gap: 8px;
                background: #f9fafb; border: 1px solid #e5e7eb;
                border-radius: 8px; padding: 6px 12px;
            }
            .cs-select {
                border: none; background: transparent;
                font-size: .9rem; font-weight: 600;
                color: #1f2937; cursor: pointer;
                padding-right: 8px;
            }
            .cs-select:focus { outline: none; }
            .cs-complex-name {
                display: flex; align-items: center; gap: 8px;
                font-size: .9rem; font-weight: 600; color: #374151;
                background: #f9fafb; border: 1px solid #e5e7eb;
                border-radius: 8px; padding: 6px 14px;
            }
            .cs-complex-name i { color: #4338ca; }
            .cs-btn-small {
                display: inline-flex; align-items: center; gap: 6px;
                padding: 7px 14px; border-radius: 7px; font-size: .82rem;
                font-weight: 600; cursor: pointer; text-decoration: none;
                border: 1px solid #e5e7eb; background: #f9fafb; color: #374151;
                transition: all .15s;
            }
            .cs-btn-small:hover { background: #f3f4f6; border-color: #d1d5db; }
            .cs-logout { color: #dc2626; border-color: #fecaca; background: #fff5f5; }
            .cs-logout:hover { background: #fee2e2; }
        `;
        document.head.appendChild(style);
    }

    /* ─────────────────────────────────────────────
       단지 전환 (마스터 전용)
    ───────────────────────────────────────────── */
    async function _switchComplex(code) {
        const c = _allComplexes.find(x => x.code === code);
        if (!c) return;
        const s = {
            role: 'master',
            complexCode: c.code,
            complexId:   c.id,
            complexName: c.name,
        };
        _saveSession(s);
        _state = s;
    }

    /* ─────────────────────────────────────────────
       sessionStorage 헬퍼
    ───────────────────────────────────────────── */
    function _saveSession(s) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
        _state = s;
    }

    function _loadSession() {
        try {
            const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
            if (s && s.role) { _state = s; return s; }
        } catch (_) {}
        return null;
    }

    function _esc(str) {
        return String(str || '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* 전역 콜백 (HTML onclick에서 호출) */
    window._csSwitchComplex = async (code) => {
        const c = _allComplexes.find(x => x.code === code);
        if (!c) return;
        await _switchComplex(code);
        // 같은 페이지를 새 단지 코드로 reload
        const url = new URL(location.href);
        url.searchParams.set('complex', code);
        location.href = url.toString();
    };

    window._csLogout = () => {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(MASTER_KEY);
        location.reload();
    };

    return { init, getComplexCode, getComplexId, getComplexName, getRole, isMaster };
})();
