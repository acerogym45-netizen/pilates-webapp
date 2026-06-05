/**
 * 시간대 정원 진단 엔드포인트 (읽기 전용)
 *
 * GET /api/debug-slots?appId=<application_id>&secret=<CRON_SECRET>
 *
 * 반환:
 *  - 해당 신청의 단지 share_timeslot_capacity 설정
 *  - 같은 days 프로그램 목록 (is_active 여부 포함)
 *  - 각 시간대별 실제 approved 카운트 (활성 프로그램만 / 전체 포함 비교)
 *  - available-slots API와 change-time API가 각각 어떤 수치를 쓰는지 시뮬레이션
 */

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

module.exports = async (req, res) => {
    // CRON_SECRET 인증
    const secret = req.query.secret || (req.headers.authorization || '').replace('Bearer ', '');
    if (!secret || secret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { appId } = req.query;
    if (!appId) return res.status(400).json({ error: 'appId 파라미터 필요' });

    const sb = getSupabase();

    try {
        // 1. 해당 신청 조회
        const { data: app, error: appErr } = await sb
            .from('applications')
            .select('id, name, dong, ho, phone, status, program_id, program_name, preferred_time, complex_id')
            .eq('id', appId)
            .single();
        if (appErr || !app) return res.status(404).json({ error: '신청 없음', detail: appErr });

        // 2. 단지 설정
        const { data: cx } = await sb
            .from('complexes')
            .select('id, name, code, share_timeslot_capacity')
            .eq('id', app.complex_id)
            .single();

        // 3. 같은 days 프로그램 전체 조회 (활성+비활성 모두)
        // 먼저 현재 신청의 프로그램 days 확인
        const { data: myProg } = await sb
            .from('programs')
            .select('id, name, days, capacity, is_active')
            .eq('id', app.program_id)
            .single();

        let allDayProgs = [];
        let activeDayProgs = [];
        if (myProg?.days) {
            const { data: all } = await sb
                .from('programs')
                .select('id, name, days, capacity, is_active')
                .eq('complex_id', app.complex_id)
                .eq('days', myProg.days);
            allDayProgs = all || [];
            activeDayProgs = allDayProgs.filter(p => p.is_active);
        }

        const allDayIds    = allDayProgs.map(p => p.id);
        const activeDayIds = activeDayProgs.map(p => p.id);

        // 4. 해당 단지의 모든 approved 신청 조회 (시간대별 집계용)
        const { data: allApproved } = await sb
            .from('applications')
            .select('id, program_id, program_name, preferred_time, status')
            .eq('complex_id', app.complex_id)
            .eq('status', 'approved');

        // 5. 시간대 목록 수집
        const timeSlots = [...new Set((allApproved || []).map(a => a.preferred_time).filter(Boolean))].sort();

        // 6. 각 시간대별 카운트 비교
        const slotAnalysis = timeSlots.map(slot => {
            // [A] 활성 프로그램만 합산 (change-time 수정 후 / available-slots 기준)
            const cntActiveOnly = (allApproved || []).filter(a =>
                a.preferred_time === slot &&
                a.program_id && activeDayIds.includes(a.program_id)
            ).length;

            // [B] 전체 프로그램 합산 (수정 전 change-time — 비활성 포함)
            const cntAllProgs = (allApproved || []).filter(a =>
                a.preferred_time === slot &&
                a.program_id && allDayIds.includes(a.program_id)
            ).length;

            // [C] program_id=null 레코드 중 활성 프로그램명 일치
            const activeNames = new Set(activeDayProgs.map(p => p.name));
            const cntNullId = (allApproved || []).filter(a =>
                a.preferred_time === slot &&
                !a.program_id && activeNames.has(a.program_name)
            ).length;

            // [D] program_id=null 전체 (단지+시간대)
            const cntNullIdAll = (allApproved || []).filter(a =>
                a.preferred_time === slot && !a.program_id
            ).length;

            // capacity: myProg.capacity
            const capacity = myProg?.capacity || 6;
            return {
                slot,
                // 수정 후 change-time이 쓰는 값 (활성 프로그램 .in() — null 제외)
                change_time_cnt: cntActiveOnly,
                // available-slots가 쓰는 값 (활성 프로그램 sameDayIds 합산 — null→nameToId 포함)
                available_slots_cnt: cntActiveOnly + cntNullId,
                // 수정 전 change-time이 쓰던 값 (비활성 포함)
                old_change_time_cnt: cntAllProgs,
                // program_id=null 레코드 수
                null_program_id_cnt: cntNullIdAll,
                capacity,
                // 현재 수정 후 상태에서 마감 여부
                is_full_change_time: cntActiveOnly >= capacity,
                is_full_available_slots: (cntActiveOnly + cntNullId) >= capacity,
                // 불일치 여부
                mismatch: cntActiveOnly !== (cntActiveOnly + cntNullId),
            };
        });

        // 7. 비활성 프로그램별 approved 레코드 상세
        const inactiveProgs = allDayProgs.filter(p => !p.is_active);
        const inactiveDetail = [];
        for (const prog of inactiveProgs) {
            const recs = (allApproved || []).filter(a => a.program_id === prog.id);
            if (recs.length > 0) {
                inactiveDetail.push({
                    program_id: prog.id,
                    program_name: prog.name,
                    is_active: false,
                    approved_count: recs.length,
                    by_slot: recs.reduce((acc, a) => {
                        acc[a.preferred_time] = (acc[a.preferred_time] || 0) + 1;
                        return acc;
                    }, {}),
                });
            }
        }

        res.json({
            success: true,
            app: { id: app.id, name: app.name, dong: app.dong, ho: app.ho, program_name: app.program_name, preferred_time: app.preferred_time },
            complex: { name: cx?.name, code: cx?.code, share_timeslot_capacity: cx?.share_timeslot_capacity },
            my_program: myProg ? { id: myProg.id, name: myProg.name, days: myProg.days, capacity: myProg.capacity, is_active: myProg.is_active } : null,
            same_days_programs: {
                all_count: allDayProgs.length,
                active_count: activeDayProgs.length,
                inactive_count: inactiveProgs.length,
                all: allDayProgs.map(p => ({ id: p.id, name: p.name, is_active: p.is_active, capacity: p.capacity })),
            },
            slot_analysis: slotAnalysis,
            inactive_programs_with_approved: inactiveDetail,
            summary: {
                share_timeslot_capacity: cx?.share_timeslot_capacity,
                inactive_progs_causing_overcount: inactiveDetail.length > 0,
                null_program_id_records_total: (allApproved || []).filter(a => !a.program_id).length,
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
};
