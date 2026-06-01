/**
 * Vercel Cron Job — 수강 연장 자동화 (D-14 TM 발송 + 무응답 만료 처리)
 *
 * 스케줄: 매일 UTC 00:00 (= KST 09:00)
 *   → vercel.json: "schedule": "0 0 * * *"
 *
 * Phase 4 — D-14 TM 발송
 *   - payment_mode='direct' 단지 + status='approved'
 *   - expiry_date = 오늘+14일 + renewal_status IS NULL
 *   - → UUID 토큰 생성 → renewal_status='pending' → SMS 발송
 *
 * Phase 5 — 무응답 만료 처리 (매 실행마다 겸용)
 *   - renewal_deadline < NOW() + renewal_status='pending'
 *   - → renewal_status='expired' + 만료 알림 SMS
 */
require('dotenv').config();

const { runRenewalCron } = require('../server/utils/renewal-cron');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // ── 보안: Vercel Cron 호출 인증 ──────────────────────────────────
    const authHeader = req.headers['authorization'] || '';
    const cronSecret = process.env.CRON_SECRET || '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const kstStr = `${nowKst.getUTCFullYear()}-${String(nowKst.getUTCMonth()+1).padStart(2,'0')}-${String(nowKst.getUTCDate()).padStart(2,'0')} ${String(nowKst.getUTCHours()).padStart(2,'0')}:${String(nowKst.getUTCMinutes()).padStart(2,'0')} KST`;

    console.log(`[renewal-cron] 실행 시작 — ${kstStr}`);

    try {
        const result = await runRenewalCron();
        const { notices, expirations } = result;

        console.log(`[renewal-cron] 완료 — TM발송:${notices.sent} 스킵:${notices.skipped} 만료처리:${expirations.processed}`);

        return res.status(200).json({
            success:  true,
            kst:      kstStr,
            notices: {
                sent:    notices.sent,
                skipped: notices.skipped,
                errors:  notices.errors,
            },
            expirations: {
                processed: expirations.processed,
                errors:    expirations.errors,
            },
        });
    } catch (e) {
        console.error('[renewal-cron] 오류:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
