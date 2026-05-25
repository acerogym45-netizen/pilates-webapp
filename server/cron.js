/**
 * Cron Job 통합 모듈
 *
 * ① 대기 만료 처리 (기존)
 *    - 매 10분마다 waiting_expires_at < NOW() 인 대기 건을 'waiting_expired'로 처리
 *    - 해당 자리에 다음 대기자가 있으면 자동으로 SMS 발송
 *
 * ② 수강 연장 자동화 (Phase 4+5 신규)
 *    - Phase 4: 매일 오전 9시 (KST) 실행
 *              direct 단지 + expiry_date = 오늘+14일 + renewal_status IS NULL
 *              → UUID 토큰 생성 + renewal_status='pending' + SMS 발송
 *    - Phase 5: 매 1시간마다 실행
 *              renewal_deadline < NOW() + renewal_status='pending'
 *              → renewal_status='expired' + 만료 SMS 발송
 *
 * 사용:
 *  server/index.js 에서 require('./cron').startCron() 으로 임포트
 */

const { processExpiredWaiting } = require('./utils/waiting');
const { runRenewalCron }        = require('./utils/renewal-cron');

// ── 인터벌 상수 ───────────────────────────────────────────────────────────────
const WAITING_INTERVAL_MS  = 10 * 60 * 1000;       // 10분
const RENEWAL_INTERVAL_MS  =  1 * 60 * 60 * 1000;  // 1시간 (Phase 5 폴링)

// ── 실행 플래그 (중복 실행 방지) ──────────────────────────────────────────────
let _waitingCronRunning = false;
let _renewalCronRunning = false;

// ══════════════════════════════════════════════════════════════════════════════
// 대기 만료 처리 (기존)
// ══════════════════════════════════════════════════════════════════════════════
async function runWaitingCron() {
    if (_waitingCronRunning) return;
    _waitingCronRunning = true;
    try {
        const result = await processExpiredWaiting();
        if (result.processed > 0) {
            console.log(`[Cron] 대기 만료 처리: ${result.processed}건 처리, ${result.triggered}건 다음 순번 트리거`);
        }
        if (result.errors && result.errors.length > 0) {
            console.error('[Cron] 대기 만료 처리 오류:', result.errors);
        }
    } catch (e) {
        console.error('[Cron] 대기 만료 Cron 예외:', e.message);
    } finally {
        _waitingCronRunning = false;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 수강 연장 자동화 (Phase 4+5)
// ══════════════════════════════════════════════════════════════════════════════
async function runRenewal() {
    if (_renewalCronRunning) return;
    _renewalCronRunning = true;
    try {
        const result = await runRenewalCron();
        const n = result.notices;
        const e = result.expirations;
        if (n.sent > 0 || e.processed > 0) {
            console.log(`[Cron] 연장 자동화: TM발송=${n.sent} 만료처리=${e.processed}`);
        }
        if ((n.errors && n.errors.length > 0) || (e.errors && e.errors.length > 0)) {
            console.error('[Cron] 연장 자동화 오류:', [...(n.errors || []), ...(e.errors || [])]);
        }
    } catch (e) {
        console.error('[Cron] 연장 자동화 Cron 예외:', e.message);
    } finally {
        _renewalCronRunning = false;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// KST 기준 다음 오전 9시까지 남은 밀리초 계산
// ══════════════════════════════════════════════════════════════════════════════
function getMsUntilKst9am() {
    const now      = new Date();
    const kstNow   = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC → KST
    const kstHour  = kstNow.getUTCHours();
    const kstMin   = kstNow.getUTCMinutes();
    const kstSec   = kstNow.getUTCSeconds();

    // 오늘 KST 9:00:00 기준 남은 시간
    let hoursLeft = 9 - kstHour;
    let msLeft    = (hoursLeft * 60 * 60 - kstMin * 60 - kstSec) * 1000;

    // 이미 9시 지났으면 내일 9시
    if (msLeft <= 0) msLeft += 24 * 60 * 60 * 1000;

    return msLeft;
}

// ══════════════════════════════════════════════════════════════════════════════
// startCron — 서버 시작 시 1회 호출
// ══════════════════════════════════════════════════════════════════════════════
function startCron() {
    // ① 대기 만료: 서버 시작 2분 후 첫 실행, 이후 10분 간격
    console.log(`[Cron] 대기 만료 처리 Cron 등록 (${WAITING_INTERVAL_MS / 60000}분 간격)`);
    setTimeout(() => {
        runWaitingCron();
        setInterval(runWaitingCron, WAITING_INTERVAL_MS);
    }, 2 * 60 * 1000);

    // ② 연장 자동화 Phase 5 (1시간 간격 폴링 — deadline 초과 감지)
    console.log(`[Cron] 연장 만료 처리 Cron 등록 (${RENEWAL_INTERVAL_MS / 60 / 1000}분 간격)`);
    setTimeout(() => {
        runRenewal(); // 서버 재시작 후 즉시 1회 실행
        setInterval(runRenewal, RENEWAL_INTERVAL_MS);
    }, 3 * 60 * 1000); // 3분 후 첫 실행 (대기 cron과 시간차)

    // ③ 연장 자동화 Phase 4 (매일 KST 오전 9시 — D-14 TM 발송)
    const msUntil9am = getMsUntilKst9am();
    const hh = Math.floor(msUntil9am / 3600000);
    const mm = Math.floor((msUntil9am % 3600000) / 60000);
    console.log(`[Cron] 연장 TM 발송 Cron 등록 — 다음 실행 KST 09:00 (${hh}시간 ${mm}분 후)`);

    setTimeout(function scheduleDaily9am() {
        runRenewal(); // 오전 9시 정각에 전체 실행 (Phase 4 D-14 TM 포함)
        // 다음 날 오전 9시 예약 (정확한 24시간 후)
        setTimeout(scheduleDaily9am, 24 * 60 * 60 * 1000);
    }, msUntil9am);
}

// ── 레거시 호환 alias (기존 runCron export 유지) ──────────────────────────────
const runCron = runWaitingCron;

module.exports = { startCron, runCron, runWaitingCron, runRenewal };
