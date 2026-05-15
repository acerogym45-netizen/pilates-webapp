/**
 * Vercel Cron Job — 프로그램 자동 활성화/비활성화
 *
 * 스케줄: 매일 UTC 00:00 (= KST 09:00)
 *   - KST 22일 09:00 → 전 단지 프로그램 활성화
 *   - KST 26일 09:00 → 전 단지 프로그램 비활성화
 *   - 그 외 날짜: 현재 기간 상태에 맞게 동기화 (멱등성 보장)
 */
require('dotenv').config();

const { getSupabase } = require('../server/db-supabase');

module.exports = async function handler(req, res) {
    // Vercel Cron은 GET 메서드로 호출
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // ── 보안: Vercel이 자동으로 CRON_SECRET 헤더를 삽입 ──────────────
    const authHeader = req.headers['authorization'] || '';
    const cronSecret = process.env.CRON_SECRET || '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // ── KST 현재 시각 계산 ────────────────────────────────────────
        const nowUtc  = new Date();
        const nowKst  = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
        const dayKst  = nowKst.getUTCDate();
        const hourKst = nowKst.getUTCHours();
        const monKst  = nowKst.getUTCMonth() + 1;

        // 22일 09:00 ~ 26일 09:00 → 활성화 기간
        const isInPeriod =
            (dayKst === 22 && hourKst >= 9) ||
            (dayKst > 22 && dayKst < 26)   ||
            (dayKst === 26 && hourKst < 9);

        const activateTarget = isInPeriod;
        const action = activateTarget ? '활성화' : '비활성화';

        const sb = getSupabase();

        // ── 전 단지 프로그램 일괄 업데이트 ──────────────────────────
        const { data, error } = await sb
            .from('programs')
            .update({ is_active: activateTarget })
            .neq('id', '')          // 전체 행 대상
            .select('id, name, complex_id, is_active');

        if (error) throw error;

        const count = (data || []).length;
        console.log(`[cron] ${monKst}월 ${dayKst}일 ${String(hourKst).padStart(2,'0')}:00 KST → 프로그램 ${action} (${count}개)`);

        return res.status(200).json({
            success: true,
            action,
            is_active: activateTarget,
            kst: `${monKst}월 ${dayKst}일 ${String(hourKst).padStart(2,'0')}:00 KST`,
            isInPeriod,
            count,
        });
    } catch (e) {
        console.error('[cron] 오류:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
