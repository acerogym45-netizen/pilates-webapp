/**
 * Vercel Cron Job — 프로그램 자동 활성화/비활성화 + DB 자동 백업
 *
 * 스케줄: 매일 UTC 21:00 (= KST 06:00)
 *   → vercel.json: "schedule": "0 21 * * *"
 *
 * schedule_mode 별 동작:
 *   auto        — 기존 22~26일 자동 Cron 적용
 *   always_on   — Cron 무시, 항상 is_active = true 유지
 *   always_off  — Cron 무시, 항상 is_active = false 유지
 *
 * 백업:
 *   매일 KST 06:00 자동 실행, 30일 보관 (auto 라벨만 자동 삭제)
 */
require('dotenv').config();

const { getSupabase }    = require('../server/db-supabase');
const { runBackup }      = require('../server/routes/backup');

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

        // ── [1] 프로그램 자동 활성화/비활성화 ─────────────────────────
        // 22일 09:00 KST ~ 26일 09:00 KST → 자동 모드 활성화 기간
        const isInPeriod =
            (dayKst === 22 && hourKst >= 9) ||
            (dayKst > 22 && dayKst < 26)   ||
            (dayKst === 26 && hourKst < 9);

        const autoTarget = isInPeriod;

        const sb = getSupabase();

        const { data: complexes, error: cxErr } = await sb
            .from('complexes')
            .select('id, name, schedule_mode');
        if (cxErr) throw cxErr;

        const scheduleResults = [];

        for (const cx of complexes || []) {
            const mode = cx.schedule_mode || 'auto';

            if (mode === 'always_on' || mode === 'always_off') {
                scheduleResults.push({ complex: cx.name, mode, skipped: true });
                continue;
            }

            const { data, error } = await sb
                .from('programs')
                .update({ is_active: autoTarget })
                .eq('complex_id', cx.id)
                .not('id', 'is', null)
                .select('id');

            if (error) {
                scheduleResults.push({ complex: cx.name, mode, error: error.message });
            } else {
                scheduleResults.push({ complex: cx.name, mode, count: (data || []).length, is_active: autoTarget });
            }
        }

        const action    = autoTarget ? '활성화' : '비활성화';
        const autoCount = scheduleResults.filter(r => !r.skipped && !r.error).reduce((s, r) => s + (r.count || 0), 0);
        const skipCount = scheduleResults.filter(r => r.skipped).length;
        console.log(`[cron/schedule] ${monKst}월 ${dayKst}일 ${String(hourKst).padStart(2,'0')}:00 KST → auto ${action} ${autoCount}개 / always 스킵 ${skipCount}개`);

        // ── [2] DB 자동 백업 ───────────────────────────────────────────
        let backupResult = null;
        try {
            backupResult = await runBackup('auto', 'cron');
            const totalRows = Object.values(backupResult.rowCounts).reduce((s, n) => s + n, 0);
            const sizeMb    = ((backupResult.sizeBytes || 0) / 1024 / 1024).toFixed(2);
            console.log(`[cron/backup] 완료 — ${totalRows}행 / ${sizeMb}MB / ${backupResult.snapshotDate}`);
        } catch (backupErr) {
            // 백업 실패해도 크론 전체를 실패 처리하지 않음
            console.error('[cron/backup] 오류:', backupErr.message);
            backupResult = { success: false, error: backupErr.message };
        }

        return res.status(200).json({
            success: true,
            kst: `${monKst}월 ${dayKst}일 ${String(hourKst).padStart(2,'0')}:00 KST`,
            schedule: {
                action,
                is_active: autoTarget,
                isInPeriod,
                autoCount,
                skipCount,
                results: scheduleResults,
            },
            backup: backupResult,
        });
    } catch (e) {
        console.error('[cron] 오류:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
