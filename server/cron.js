/**
 * 대기 만료 처리 Cron Job
 *
 * 역할:
 *  - 매 10분마다 waiting_expires_at < NOW() 인 대기 건을 'waiting_expired'로 처리
 *  - 해당 자리에 다음 대기자가 있으면 자동으로 SMS 발송
 *
 * 사용:
 *  server/index.js 에서 require('./cron') 로 임포트
 *  (서버 시작 시 자동으로 Cron 루프 시작)
 */

const { processExpiredWaiting } = require('./utils/waiting');

const INTERVAL_MS = 10 * 60 * 1000; // 10분

let _cronRunning = false;

async function runCron() {
    if (_cronRunning) return; // 이전 실행이 아직 진행 중이면 스킵
    _cronRunning = true;
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
        _cronRunning = false;
    }
}

function startCron() {
    console.log(`[Cron] 대기 만료 처리 Cron 시작 (${INTERVAL_MS / 60000}분 간격)`);
    // 서버 시작 2분 후 첫 실행 (DB 연결 안정화 대기)
    setTimeout(() => {
        runCron();
        setInterval(runCron, INTERVAL_MS);
    }, 2 * 60 * 1000);
}

module.exports = { startCron, runCron };
