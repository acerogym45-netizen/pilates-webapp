/**
 * Vercel Cron Job — 보강 프로그램 월별 인원 현황 초기화
 *
 * 스케줄: 매월 1일 KST 00:00 = UTC 전날 15:00
 *   → vercel.json: "schedule": "0 15 L * *"  (L = 말일 → 매월 1일 KST는 전달 말일 UTC 15:00)
 *   실제로는: "0 15 28-31 * *" 로 설정 후 dayKst === 1 && hourKst === 0 조건으로 필터링
 *
 * 동작:
 *   - type='makeup' 또는 이름에 '보강' 포함 프로그램의 display_approved_count → null
 *   - applications 이력은 그대로 보존 (신청 기록 삭제 없음)
 */
require('dotenv').config();

const { getSupabase } = require('../server/db-supabase');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const authHeader = req.headers['authorization'] || '';
    const cronSecret = process.env.CRON_SECRET || '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const nowUtc  = new Date();
        const nowKst  = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
        const dayKst  = nowKst.getUTCDate();
        const hourKst = nowKst.getUTCHours();

        // KST 매월 1일 00:00~06:00 사이에만 실행
        if (dayKst !== 1 || hourKst > 6) {
            return res.json({
                success: true,
                skipped: true,
                message: `보강 초기화 스킵 (KST ${dayKst}일 ${hourKst}시 — 1일 00:00~06:00에만 실행)`
            });
        }

        const sb = getSupabase();

        // 보강 프로그램 조회
        const { data: makeupProgs, error: mErr } = await sb
            .from('programs')
            .select('id, name, display_approved_count')
            .or('type.eq.makeup,name.ilike.%보강%');
        if (mErr) throw new Error(mErr.message);

        const targets = (makeupProgs || []).filter(p => p.display_approved_count !== null);

        if (!targets.length) {
            return res.json({ success: true, reset: 0, message: '초기화할 보강 프로그램 없음' });
        }

        const ids = targets.map(p => p.id);
        const { error: upErr } = await sb
            .from('programs')
            .update({ display_approved_count: null })
            .in('id', ids);
        if (upErr) throw new Error(upErr.message);

        const mo = nowKst.getUTCMonth() + 1;
        console.log(`[makeup-reset-cron] ${mo}월 보강 초기화 완료: ${ids.length}개 프로그램`);

        res.json({
            success: true,
            reset: ids.length,
            programs: targets.map(p => p.name),
            message: `${mo}월 보강 프로그램 인원 현황 초기화 완료 (신청 이력 보존)`
        });

    } catch (e) {
        console.error('[makeup-reset-cron] 오류:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
};
