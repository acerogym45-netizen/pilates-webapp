/**
 * Vercel Cron Job — 프로그램 자동 활성화/비활성화
 *
 * 스케줄: 매일 UTC 00:00 (= KST 09:00)
 *
 * schedule_mode 별 동작:
 *   auto        — 기존 22~26일 자동 Cron 적용
 *   always_on   — Cron 무시, 항상 is_active = true 유지
 *   always_off  — Cron 무시, 항상 is_active = false 유지
 */
require('dotenv').config();

const { getSupabase } = require('../server/db-supabase');

module.exports = async function handler(req, res) {
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

        // 22일 09:00 ~ 26일 09:00 → 자동 모드 활성화 기간
        const isInPeriod =
            (dayKst === 22 && hourKst >= 9) ||
            (dayKst > 22 && dayKst < 26)   ||
            (dayKst === 26 && hourKst < 9);

        const autoTarget = isInPeriod; // auto 모드 단지에 적용할 값

        const sb = getSupabase();

        // ── 단지 목록 + schedule_mode 조회 ───────────────────────────
        const { data: complexes, error: cxErr } = await sb
            .from('complexes')
            .select('id, name, schedule_mode');
        if (cxErr) throw cxErr;

        const results = [];

        for (const cx of complexes || []) {
            const mode = cx.schedule_mode || 'auto';

            // always_on / always_off 는 Cron 무시
            if (mode === 'always_on' || mode === 'always_off') {
                results.push({ complex: cx.name, mode, skipped: true });
                continue;
            }

            // auto 모드: 22~26일 스케줄에 따라 업데이트
            const { data, error } = await sb
                .from('programs')
                .update({ is_active: autoTarget })
                .eq('complex_id', cx.id)
                .not('id', 'is', null)
                .select('id');

            if (error) {
                results.push({ complex: cx.name, mode, error: error.message });
            } else {
                results.push({ complex: cx.name, mode, count: (data || []).length, is_active: autoTarget });
            }
        }

        const action = autoTarget ? '활성화' : '비활성화';
        const autoCount = results.filter(r => !r.skipped && !r.error).reduce((s, r) => s + (r.count || 0), 0);
        const skipCount = results.filter(r => r.skipped).length;

        console.log(`[cron] ${monKst}월 ${dayKst}일 ${String(hourKst).padStart(2,'0')}:00 KST → auto ${action} ${autoCount}개 / always 스킵 ${skipCount}개`);

        return res.status(200).json({
            success: true,
            action,
            is_active: autoTarget,
            kst: `${monKst}월 ${dayKst}일 ${String(hourKst).padStart(2,'0')}:00 KST`,
            isInPeriod,
            autoCount,
            skipCount,
            results,
        });
    } catch (e) {
        console.error('[cron] 오류:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
