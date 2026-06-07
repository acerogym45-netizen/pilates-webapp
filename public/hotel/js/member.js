/**
 * public/hotel/js/member.js
 * 회원 마이페이지 스크립트
 *
 * 흐름:
 *   1. 페이지 로드 → localStorage 토큰 확인
 *      없음 → 안내 화면 (#noTokenScreen) 표시 후 종료
 *   2. 토큰 있음 → GET /api/hotel/members/me → 5개 카드 초기 렌더링
 *   3. 병렬: GET /workout-reports, GET /next-reservations
 *   4. 만료 7일 이내 → 토큰 갱신 배너 표시 + POST /refresh-token 처리
 *   5. 할인 코드 발급 버튼 → POST /issue-room-discount
 *
 * 설계 원칙:
 *   - 토큰 1개로 모든 접근 (추가 인증 강제 없음)
 *   - 다른 회원 정보 절대 표시 않음
 *   - 혼잡도/실시간 인원 표시 없음
 *   - 자동 리다이렉트 없음 (토큰 없어도 강제 이동 안 함)
 *   - 토큰 만료 7일 이내 자동 갱신 배너 표시
 *
 * 단계: C-3 / 작성일: 2026-06-07
 *
 * 주의: 이 파일은 api-client.js 이후에 로드됩니다.
 */

'use strict';

(function () {

    // ── 상수 ────────────────────────────────────────────────────
    const STORAGE_KEY      = 'hotel_member_token';
    const REFRESH_DAYS     = 7;           // 이 일수 이하면 갱신 배너 표시
    const REFRESH_MS       = REFRESH_DAYS * 24 * 60 * 60 * 1000;

    /** KST 요일 이름 */
    const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

    // ── DOM ─────────────────────────────────────────────────────
    const noTokenScreen    = document.getElementById('noTokenScreen');
    const memberContent    = document.getElementById('memberContent');
    const memberNameBadge  = document.getElementById('memberNameBadge');
    const statusBox        = document.getElementById('statusBox');

    // 카드 본문 영역
    const nextPtBody       = document.getElementById('nextPtBody');
    const ptGaugeBody      = document.getElementById('ptGaugeBody');
    const reportBody       = document.getElementById('reportBody');
    const reservationBody  = document.getElementById('reservationBody');

    // 할인 코드
    const discountCodeBox     = document.getElementById('discountCodeBox');
    const discountCodeValue   = document.getElementById('discountCodeValue');
    const discountCodeExpires = document.getElementById('discountCodeExpires');
    const issueBtn            = document.getElementById('issueBtn');

    // 토큰 갱신 배너
    const refreshBanner     = document.getElementById('refreshBanner');
    const refreshBannerText = document.getElementById('refreshBannerText');
    const refreshTokenBtn   = document.getElementById('refreshTokenBtn');

    // 로그아웃 버튼
    const logoutBtn = document.getElementById('logoutBtn');

    // ── 상태 ─────────────────────────────────────────────────────
    let currentToken = null;
    let isIssuing    = false;
    let isRefreshing = false;

    // ── 토큰 유틸 ───────────────────────────────────────────────
    function loadToken() {
        try { return localStorage.getItem(STORAGE_KEY) || null; }
        catch (e) { return null; }
    }
    function saveToken(token) {
        try { localStorage.setItem(STORAGE_KEY, token); } catch (e) { /* silent */ }
    }
    function removeToken() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* silent */ }
    }

    // ── 날짜 포맷 유틸 ──────────────────────────────────────────
    /**
     * ISO8601 문자열 → 한국어 날짜+시각 표시
     * 예) '2026-06-09T10:00:00+09:00' → '6/9(월) 10:00'
     */
    function formatKoDateTime(isoStr) {
        if (!isoStr) return null;
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return null;
        // KST 계산 (+9h)
        const kst = new Date(d.getTime() + (d.getTimezoneOffset() + 540) * 60000);
        const mon = kst.getMonth() + 1;
        const day = kst.getDate();
        const dow = DAY_NAMES[kst.getDay()];
        const hh  = String(kst.getHours()).padStart(2, '0');
        const mm  = String(kst.getMinutes()).padStart(2, '0');
        return `${mon}/${day}(${dow}) ${hh}:${mm}`;
    }

    /**
     * ISO8601 날짜 문자열 → 'YYYY.MM.DD' 포맷
     */
    function formatDateShort(isoStr) {
        if (!isoStr) return null;
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}.${m}.${day}`;
    }

    /**
     * D-day 라벨 문자열
     * 양수 → 'D-N', 0 → 'D-Day', 음수 → '만료됨'
     */
    function ddayLabel(dDay) {
        if (dDay == null) return null;
        if (dDay > 0)  return `D-${dDay}`;
        if (dDay === 0) return 'D-Day';
        return '만료됨';
    }

    /**
     * D-day에 따른 배지 클래스
     */
    function ddayClass(dDay) {
        if (dDay == null) return '';
        if (dDay < 0)    return 'urgent';
        if (dDay === 0)  return 'today';
        if (dDay <= 7)   return 'warn';
        return 'ok';
    }

    // ── XSS 방어 ─────────────────────────────────────────────────
    function esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── 상태 박스 ─────────────────────────────────────────────────
    function showStatus(msg, type) {
        statusBox.textContent = msg;
        statusBox.className   = `status-box ${type} show`;
    }
    function hideStatus() {
        statusBox.className   = 'status-box';
        statusBox.textContent = '';
    }

    // ── 카드 1: 다음 PT 예약 렌더링 ─────────────────────────────
    function renderNextPt(ptStatus) {
        const ns = ptStatus?.next_session;
        if (ns?.scheduled_at) {
            const dtStr = formatKoDateTime(ns.scheduled_at);
            nextPtBody.innerHTML =
                `<p class="next-pt-main">${esc(dtStr || ns.scheduled_at)}</p>` +
                `<p class="next-pt-sub">리프레시 PT · 45분</p>` +
                `<div class="pt-btn-row">` +
                  `<button type="button" class="pt-action-btn pt-action-btn--change" id="ptChangeBtn">일정 변경</button>` +
                  `<button type="button" class="pt-action-btn pt-action-btn--cancel" id="ptCancelBtn">예약 취소</button>` +
                `</div>`;

            // 변경 버튼 → refresh-pt.html 이동 (자동 리다이렉트 아닌 사용자 탭)
            document.getElementById('ptChangeBtn').addEventListener('click', () => {
                window.location.href = './refresh-pt.html';
            });
            // 취소 버튼 → 현재 단계에서는 안내 메시지 (추후 cancel API 연동)
            document.getElementById('ptCancelBtn').addEventListener('click', () => {
                showStatus('예약 취소는 피트니스 센터 프런트에 직접 문의해 주세요.', 'info');
            });
        } else {
            nextPtBody.innerHTML =
                `<p class="next-pt-empty">예정된 PT 예약이 없습니다.</p>` +
                `<div class="pt-btn-row">` +
                  `<button type="button" class="pt-action-btn pt-action-btn--change"` +
                  ` onclick="location.href='./refresh-pt.html'" style="flex:none;padding:0 20px;">` +
                    `PT 예약하기 →` +
                  `</button>` +
                `</div>`;
        }
    }

    // ── 카드 2: PT 잔여 게이지 렌더링 ───────────────────────────
    function renderPtGauge(member) {
        const ms  = member.membership;
        const pts = member.pt_status;

        const remaining = pts?.remaining;
        const total     = pts?.total;
        const expiresAt = ms?.expires_at;
        const dDay      = ms?.d_day;

        // 게이지 비율 계산
        let ratio = 0;
        if (total != null && total > 0 && remaining != null) {
            ratio = Math.max(0, Math.min(1, remaining / total));
        }

        // 게이지 색상: 20% 이하 → low, 50% 이하 → medium, 이상 → 기본(gold)
        const barClass = ratio <= 0.2 ? 'low' : ratio <= 0.5 ? 'medium' : '';

        // 잔여 횟수 표시 (null 허용)
        const remainStr = remaining != null ? remaining : '—';
        const totalStr  = total     != null ? `/ ${total}회` : '';

        // D-day 배지
        const ddLabel = ddayLabel(dDay);
        const ddCls   = ddayClass(dDay);
        const ddBadgeHtml = ddLabel
            ? `<span class="pt-dday-badge ${ddCls}">${esc(ddLabel)}</span>`
            : '';

        // 만료일
        const expiresStr = formatDateShort(expiresAt) || '—';

        ptGaugeBody.innerHTML =
            `<div class="pt-count-row">` +
              `<span class="pt-remaining-num">${esc(String(remainStr))}</span>` +
              `<span class="pt-total-text">${esc(totalStr)} 남음</span>` +
            `</div>` +
            `<div class="pt-gauge-wrap">` +
              `<div class="pt-gauge-bar ${barClass}" style="width:${Math.round(ratio * 100)}%"></div>` +
            `</div>` +
            `<div class="pt-dday-row">` +
              `<span class="pt-expires-label">멤버십 만료일</span>` +
              `<span class="pt-expires-val">` +
                `${esc(expiresStr)} ${ddBadgeHtml}` +
              `</span>` +
            `</div>`;
    }

    // ── 카드 3: 할인 코드 (me API 결과로 버튼 상태 결정) ────────
    function initDiscountCard(member) {
        const available = member.benefits?.ramada_room_code_available;

        if (!available) {
            // 이미 유효한 코드 있음 → me 결과에서 코드가 없을 때는
            // issue-room-discount 호출로 기존 코드를 가져옴
            issueBtn.textContent = '발급된 코드 확인';
            issueBtn.disabled    = false;
        } else {
            issueBtn.textContent = '할인 코드 발급받기';
            issueBtn.disabled    = false;
        }
    }

    // ── 카드 4: 운동 리포트 렌더링 ──────────────────────────────
    function renderReports(reports) {
        if (!reports || reports.length === 0) {
            reportBody.innerHTML = '<p class="report-empty">아직 운동 리포트가 없습니다.</p>';
            return;
        }
        const items = reports.map(r => {
            const dateStr = formatDateShort(r.created_at) || '';
            const phaseStr = r.phase ? `${r.phase}단계 리포트` : '운동 리포트';
            const dlHtml = r.pdf_url
                ? `<a href="${esc(r.pdf_url)}" target="_blank" rel="noopener" class="report-dl-btn">PDF ↓</a>`
                : '<span style="font-size:.75rem;color:var(--color-text-muted)">준비 중</span>';
            return `<li class="report-item">
                      <div>
                        <p class="report-phase">${esc(phaseStr)}</p>
                        <p class="report-date">${esc(dateStr)}</p>
                      </div>
                      ${dlHtml}
                    </li>`;
        }).join('');
        reportBody.innerHTML = `<ul class="report-list">${items}</ul>`;
    }

    // ── 카드 5: 다가오는 예약 목록 렌더링 ───────────────────────
    function renderReservations(reservations) {
        if (!reservations || reservations.length === 0) {
            reservationBody.innerHTML = '<p class="reservation-empty">예정된 예약이 없습니다.</p>';
            return;
        }
        const items = reservations.map(r => {
            const schedStr     = formatKoDateTime(r.scheduled_at) || '—';
            const programStr   = r.program_name || '예약';
            const instructorHtml = r.instructor_name
                ? `<p class="res-instructor">트레이너: ${esc(r.instructor_name)}</p>`
                : '';
            return `<li class="reservation-item">
                      <span class="res-dot"></span>
                      <div class="res-info">
                        <p class="res-program">${esc(programStr)}</p>
                        <p class="res-schedule">${esc(schedStr)}</p>
                        ${instructorHtml}
                      </div>
                    </li>`;
        }).join('');
        reservationBody.innerHTML = `<ul class="reservation-list">${items}</ul>`;
    }

    // ── 토큰 갱신 배너 초기화 ────────────────────────────────────
    /**
     * 서버에서 expires_at을 직접 받아올 방법이 없으므로
     * /me 응답의 d_day를 활용하거나 localStorage에 저장된 만료 정보를 사용한다.
     * 여기서는 membership.d_day가 ≤ REFRESH_DAYS 이면 배너를 표시한다.
     * (membership 만료일과 토큰 만료일은 다를 수 있으나 UX 기준으로 동일하게 사용)
     */
    function checkAndShowRefreshBanner(member) {
        const dDay = member?.membership?.d_day;
        // d_day가 0 이상 7 이하인 경우 갱신 배너
        if (dDay == null || dDay < 0 || dDay > REFRESH_DAYS) return;

        const label = dDay === 0
            ? '오늘 멤버십 링크가 만료됩니다.'
            : `멤버십 링크가 ${dDay}일 후 만료됩니다.`;
        refreshBannerText.textContent = label;
        refreshBanner.classList.add('show');
    }

    // ── 핸들러: 할인 코드 발급 ──────────────────────────────────
    async function handleIssueDiscount() {
        if (isIssuing || !currentToken) return;
        isIssuing = true;
        issueBtn.disabled = true;
        issueBtn.innerHTML = '<span class="spinner"></span>처리 중…';
        hideStatus();

        const { ok, data, errorMsg } = await hotelApi.post(
            '/members/issue-room-discount',
            { token: currentToken }
        );

        isIssuing = false;
        issueBtn.innerHTML = '발급 완료';

        if (!ok) {
            showStatus(errorMsg || '할인 코드 발급 중 오류가 발생했습니다.', 'error');
            issueBtn.disabled = false;
            issueBtn.innerHTML = '다시 시도';
            return;
        }

        // 코드 표시
        discountCodeValue.textContent   = data.code || '—';
        const expStr = data.expires_at
            ? `${formatDateShort(data.expires_at)} 까지 유효`
            : '';
        discountCodeExpires.textContent = expStr;
        discountCodeBox.classList.add('show');
        issueBtn.style.display = 'none';
    }

    // ── 핸들러: 토큰 갱신 ────────────────────────────────────────
    async function handleRefreshToken() {
        if (isRefreshing || !currentToken) return;
        isRefreshing = true;
        refreshTokenBtn.disabled = true;
        refreshTokenBtn.textContent = '갱신 중…';

        const { ok, data, errorMsg } = await hotelApi.post(
            '/members/refresh-token',
            { token: currentToken }
        );

        isRefreshing = false;

        if (!ok) {
            showStatus(errorMsg || '토큰 갱신에 실패했습니다.', 'error');
            refreshTokenBtn.disabled = false;
            refreshTokenBtn.textContent = '갱신';
            return;
        }

        // 새 토큰 저장 후 배너 숨김
        const newToken = data.new_token;
        if (newToken) {
            saveToken(newToken);
            currentToken = newToken;
        }
        refreshBanner.classList.remove('show');
        showStatus('멤버십 링크가 30일 연장되었습니다.', 'info');
        setTimeout(hideStatus, 4000);
    }

    // ── 핸들러: 로그아웃 ─────────────────────────────────────────
    function handleLogout() {
        if (!confirm('이 기기에서 로그아웃 하시겠습니까?\n(재접속 시 카카오톡 링크가 필요합니다)')) return;
        removeToken();
        memberContent.classList.remove('show');
        noTokenScreen.classList.add('show');
        memberNameBadge.textContent = '';
    }

    // ── 메인 초기화 ──────────────────────────────────────────────
    async function init() {
        // 1. 토큰 확인
        currentToken = loadToken();

        if (!currentToken) {
            // 토큰 없음 → 안내 화면 표시 (자동 리다이렉트 없음)
            noTokenScreen.classList.add('show');
            return;
        }

        // 2. 콘텐츠 영역 표시 (스켈레톤 상태)
        memberContent.classList.add('show');
        memberNameBadge.textContent = '로딩 중…';

        // 3. GET /me → 이름 + 카드 1·2·3 초기화
        const { ok: meOk, data: meData, errorMsg: meErr } = await hotelApi.get(
            '/members/me',
            { token: currentToken }
        );

        if (!meOk) {
            // 인증 실패 → 토큰 무효 안내 (강제 리다이렉트 없음)
            memberContent.classList.remove('show');
            noTokenScreen.classList.add('show');
            return;
        }

        const member = meData.member;

        // 이름 배지
        memberNameBadge.textContent = member.name ? `${member.name}님` : '회원';

        // 카드 1: 다음 PT
        renderNextPt(member.pt_status);

        // 카드 2: PT 게이지
        renderPtGauge(member);

        // 카드 3: 할인 코드 버튼 상태 초기화
        initDiscountCard(member);

        // 토큰 갱신 배너
        checkAndShowRefreshBanner(member);

        // 4. 카드 4·5 병렬 로드
        const [reportsResult, reservationsResult] = await Promise.allSettled([
            hotelApi.get('/members/workout-reports', { token: currentToken }),
            hotelApi.get('/members/next-reservations', { token: currentToken }),
        ]);

        // 카드 4: 운동 리포트
        if (reportsResult.status === 'fulfilled' && reportsResult.value.ok) {
            renderReports(reportsResult.value.data?.reports);
        } else {
            reportBody.innerHTML = '<p class="report-empty">리포트를 불러올 수 없습니다.</p>';
        }

        // 카드 5: 다가오는 예약
        if (reservationsResult.status === 'fulfilled' && reservationsResult.value.ok) {
            renderReservations(reservationsResult.value.data?.reservations);
        } else {
            reservationBody.innerHTML = '<p class="reservation-empty">예약 정보를 불러올 수 없습니다.</p>';
        }
    }

    // ── 이벤트 바인딩 ─────────────────────────────────────────────
    issueBtn.addEventListener('click', handleIssueDiscount);
    refreshTokenBtn.addEventListener('click', handleRefreshToken);
    logoutBtn.addEventListener('click', handleLogout);

    // ── 실행 ─────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}());
