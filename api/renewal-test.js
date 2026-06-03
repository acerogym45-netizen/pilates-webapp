/**
 * 연장 자동화 테스트 핸들러 (개발/운영 검증용)
 *
 * ⚠️  이 엔드포인트는 CRON_SECRET 인증 필수 — 외부 노출 차단
 *
 * ── 사용 방법 ──────────────────────────────────────────────────────────────
 *
 * [1] 현재 DB 상태 조회 (읽기 전용, 안전)
 *   GET /api/renewal-test?mode=status
 *   → applications 테이블의 renewal_status 분포 + 대기자 수 조회
 *
 * [2] 드라이런 — 오늘 실행 시 어떤 건이 처리될지 미리보기 (DB 변경 없음)
 *   GET /api/renewal-test?mode=dry_run
 *   → Phase4 대상(D-14 해당 건) + Phase5 대상(deadline 초과 pending 건) 목록만 반환
 *
 * [3] Phase 4 시뮬레이션 — 특정 신청 ID에 강제로 D-14 TM 발송
 *   GET /api/renewal-test?mode=phase4&id=<application_id>
 *   → 날짜 조건 무시, 해당 ID에 토큰 생성 + SMS 발송 (실제 DB 변경)
 *
 * [4] Phase 5 시뮬레이션 — 특정 신청 ID에 강제로 무응답 만료 처리
 *   GET /api/renewal-test?mode=phase5&id=<application_id>
 *   → renewal_status='expired' 처리 + 현재회원 만료SMS + 대기자 공석안내TM
 *
 * [5] 전체 플로우 시뮬레이션 (Phase4 → 즉시 Phase5) — 하나의 ID로 전체 워크플로우 테스트
 *   GET /api/renewal-test?mode=full_flow&id=<application_id>
 *   → Phase4 실행 후 deadline을 과거로 조작 → Phase5 즉시 실행
 *
 * ── 인증 ──────────────────────────────────────────────────────────────────
 *   헤더: Authorization: Bearer <CRON_SECRET>
 *   또는 쿼리: ?secret=<CRON_SECRET>
 */

require('dotenv').config();

const crypto      = require('crypto');
const { getSupabase }         = require('../server/db-supabase');
const { sendRenewalNoticeSms, sendRenewalExpiredSms } = require('../server/utils/sms');
const { triggerWaitingQueue } = require('../server/utils/waiting');

function getBaseUrl() {
    if (process.env.BASE_URL) return process.env.BASE_URL;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return 'https://pilates-system.vercel.app';
}

// ── 인증 체크 ───────────────────────────────────────────────────────────────
function checkAuth(req) {
    const cronSecret = process.env.CRON_SECRET || '';
    if (!cronSecret) return true; // 미설정 시 개발환경으로 간주 허용
    const authHeader = req.headers['authorization'] || '';
    const querySecret = req.query.secret || '';
    return authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret;
}

// ── 단일 신청 조회 (테스트 대상) ────────────────────────────────────────────
async function fetchApp(sb, id) {
    const { data, error } = await sb
        .from('applications')
        .select(`
            id, name, phone, program_name, program_id, preferred_time,
            expiry_date, complex_id, status, renewal_status,
            renewal_deadline, renewal_token, renewal_notified_at,
            complexes!inner(
                id, name, code, payment_mode, sms_sender, sms_enabled,
                waiting_enabled, waiting_timeout_hours,
                renewal_account_bank, renewal_account_number, renewal_account_holder
            )
        `)
        .eq('id', id)
        .single();
    if (error) throw new Error(`신청 조회 실패: ${error.message}`);
    return data;
}

// ══════════════════════════════════════════════════════════════════════════════
// mode=status — DB 현황 조회 (읽기 전용)
// ══════════════════════════════════════════════════════════════════════════════
async function modeStatus(sb) {
    // renewal_status 분포
    const { data: dist } = await sb
        .from('applications')
        .select('renewal_status, status')
        .not('renewal_status', 'is', null);

    const counts = { pending: 0, confirmed: 0, expired: 0, declined: 0, other: 0 };
    (dist || []).forEach(r => {
        if (counts[r.renewal_status] !== undefined) counts[r.renewal_status]++;
        else counts.other++;
    });

    // pending 중 deadline 초과 (Phase5 즉시 처리 대상)
    const now = new Date().toISOString();
    const { data: overdue } = await sb
        .from('applications')
        .select('id, name, program_name, preferred_time, renewal_deadline, complex_id')
        .eq('renewal_status', 'pending')
        .lt('renewal_deadline', now);

    // 오늘+14일 D-14 대상 (Phase4 오늘 대상)
    const kstMs = Date.now() + 9 * 60 * 60 * 1000;
    const target14 = new Date(kstMs + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: d14 } = await sb
        .from('applications')
        .select('id, name, program_name, expiry_date, complex_id, complexes!inner(payment_mode)')
        .eq('status', 'approved')
        .eq('complexes.payment_mode', 'direct')
        .eq('expiry_date', target14)
        .is('renewal_status', null);

    // 전체 대기자 수
    const { count: waitingCount } = await sb
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting');

    return {
        renewal_status_counts: counts,
        phase4_today_targets:  (d14 || []).map(a => ({ id: a.id, name: a.name, program: a.program_name, expiry: a.expiry_date })),
        phase5_overdue:        (overdue || []).map(a => ({ id: a.id, name: a.name, program: a.program_name, time: a.preferred_time, deadline: a.renewal_deadline })),
        total_waiting_applicants: waitingCount || 0,
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// mode=dry_run — 오늘 cron 실행 시 처리될 건 미리보기 (DB 변경 없음)
// ══════════════════════════════════════════════════════════════════════════════
async function modeDryRun(sb) {
    const kstMs = Date.now() + 9 * 60 * 60 * 1000;
    const target14 = new Date(kstMs + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const now = new Date().toISOString();

    // Phase4 대상
    const { data: phase4Apps } = await sb
        .from('applications')
        .select(`
            id, name, phone, program_name, expiry_date, complex_id,
            complexes!inner(name, payment_mode, sms_sender, sms_enabled)
        `)
        .eq('status', 'approved')
        .eq('complexes.payment_mode', 'direct')
        .eq('expiry_date', target14)
        .is('renewal_status', null);

    // Phase5 대상
    const { data: phase5Apps } = await sb
        .from('applications')
        .select(`
            id, name, phone, program_name, preferred_time, expiry_date, complex_id,
            renewal_deadline,
            complexes!inner(name, sms_sender, sms_enabled)
        `)
        .eq('renewal_status', 'pending')
        .lt('renewal_deadline', now);

    // Phase5 대상 각각의 대기자 존재 여부 미리보기
    const phase5WithWaiting = await Promise.all((phase5Apps || []).map(async app => {
        const { count } = await sb
            .from('applications')
            .select('*', { count: 'exact', head: true })
            .eq('complex_id', app.complex_id)
            .eq('status', 'waiting')
            .eq('preferred_time', app.preferred_time)
            .is('waiting_sms_sent_at', null);
        return {
            id: app.id, name: app.name,
            program: app.program_name, time: app.preferred_time,
            deadline: app.renewal_deadline,
            waiting_applicants_available: count || 0,
        };
    }));

    return {
        dry_run: true,
        target_date_for_phase4: target14,
        phase4_would_send_tm: (phase4Apps || []).map(a => ({
            id: a.id, name: a.name,
            program: a.program_name, expiry: a.expiry_date,
            complex: a.complexes?.name,
        })),
        phase5_would_expire: phase5WithWaiting,
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// mode=phase4 — 특정 ID에 강제 D-14 TM 발송 (날짜 무시)
// ══════════════════════════════════════════════════════════════════════════════
async function modePhase4(sb, id) {
    const app = await fetchApp(sb, id);
    const cx  = app.complexes;
    const log = [];

    log.push(`대상: ${app.name} (${app.program_name}, 만료: ${app.expiry_date})`);
    log.push(`현재 renewal_status: ${app.renewal_status ?? 'null'}`);

    // 이미 pending이면 토큰 재사용 (idempotent)
    if (app.renewal_status && app.renewal_status !== 'expired') {
        log.push(`⚠ 이미 renewal_status='${app.renewal_status}' — 토큰 강제 재발행`);
    }

    const token    = crypto.randomUUID();
    const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const { error: updErr } = await sb
        .from('applications')
        .update({
            renewal_token:       token,
            renewal_status:      'pending',
            renewal_deadline:    deadline.toISOString(),
            renewal_notified_at: new Date().toISOString(),
        })
        .eq('id', app.id);

    if (updErr) throw new Error(`DB 업데이트 실패: ${updErr.message}`);
    log.push(`✅ DB 업데이트 완료 — renewal_status=pending, deadline=${deadline.toISOString()}`);

    const renewalUrl = `${getBaseUrl()}/renew/${token}`;
    log.push(`연장 링크: ${renewalUrl}`);

    const smsResult = await sendRenewalNoticeSms({
        phone:       app.phone,
        name:        app.name,
        complexName: cx.name,
        programName: app.program_name,
        expiryDate:  app.expiry_date,
        renewalUrl,
        sender:      cx.sms_sender,
        smsEnabled:  cx.sms_enabled != null ? Boolean(cx.sms_enabled) : null,
    });

    if (smsResult.success)       log.push(`✅ D-14 TM SMS 발송 성공`);
    else if (smsResult.skipped)  log.push(`⏭ SMS 비활성 (DB는 업데이트됨)`);
    else                         log.push(`⚠ SMS 발송 실패: ${smsResult.error}`);

    return { phase: 4, app_id: id, token, renewal_url: renewalUrl, deadline: deadline.toISOString(), sms: smsResult, log };
}

// ══════════════════════════════════════════════════════════════════════════════
// mode=phase5 — 특정 ID에 강제 무응답 만료 처리 + 대기자 공석 안내 TM
// ══════════════════════════════════════════════════════════════════════════════
async function modePhase5(sb, id) {
    const app = await fetchApp(sb, id);
    const cx  = app.complexes;
    const log = [];

    log.push(`대상: ${app.name} (${app.program_name} / ${app.preferred_time ?? '시간 없음'})`);
    log.push(`현재 renewal_status: ${app.renewal_status ?? 'null'}`);

    if (!app.renewal_status || app.renewal_status === 'confirmed') {
        log.push(`⚠ renewal_status가 pending이 아님 — 강제로 expired 처리 진행`);
    }

    // expired 처리
    const { error: updErr } = await sb
        .from('applications')
        .update({
            renewal_status:   'expired',
            renewal_token:    null,
            renewal_deadline: null,
        })
        .eq('id', app.id);

    if (updErr) throw new Error(`DB 업데이트 실패: ${updErr.message}`);
    log.push(`✅ DB 업데이트 완료 — renewal_status=expired`);

    // 현재 회원 만료 안내 SMS
    const expiredSms = await sendRenewalExpiredSms({
        phone:       app.phone,
        name:        app.name,
        complexName: cx.name,
        programName: app.program_name,
        sender:      cx.sms_sender,
        smsEnabled:  cx.sms_enabled != null ? Boolean(cx.sms_enabled) : null,
    });

    if (expiredSms.success)       log.push(`✅ 현재 회원 만료 SMS 발송 성공`);
    else if (expiredSms.skipped)  log.push(`⏭ 현재 회원 만료 SMS 비활성 스킵`);
    else                          log.push(`⚠ 현재 회원 만료 SMS 실패: ${expiredSms.error}`);

    // 대기자 공석 안내 TM
    let waitingResult = null;
    if (app.complex_id && app.preferred_time) {
        log.push(`대기자 공석 안내 TM 시도 — 프로그램:${app.program_name} / 시간:${app.preferred_time}`);
        try {
            waitingResult = await triggerWaitingQueue({
                complexId:     app.complex_id,
                programId:     app.program_id || null,
                programName:   app.program_name,
                preferredTime: app.preferred_time,
            });
            if (waitingResult.triggered) {
                log.push(`✅ 대기자 공석 안내 TM 발송 완료 — 대상: ${waitingResult.waitingName} (SMS: ${waitingResult.smsResult?.success ? '성공' : waitingResult.smsResult?.skipped ? '비활성' : '실패'})`);
            } else {
                log.push(`ℹ 대기자 없음 또는 스킵: ${waitingResult.reason || waitingResult.error || '사유 없음'}`);
            }
        } catch (e) {
            log.push(`⚠ 대기자 트리거 예외: ${e.message}`);
        }
    } else {
        log.push(`⏭ preferred_time 없음 — 대기자 TM 스킵`);
    }

    return { phase: 5, app_id: id, expired_sms: expiredSms, waiting_trigger: waitingResult, log };
}

// ══════════════════════════════════════════════════════════════════════════════
// mode=full_flow — Phase4 → deadline 즉시 만료 → Phase5 전체 워크플로우 테스트
// ══════════════════════════════════════════════════════════════════════════════
async function modeFullFlow(sb, id) {
    const log = [];

    // 테스트 재실행 대비: 대기자 waiting_sms_sent_at 초기화 (중복 발송 방지)
    const app0 = await fetchApp(sb, id);
    if (app0.preferred_time) {
        await sb
            .from('applications')
            .update({ waiting_sms_sent_at: null, waiting_expires_at: null })
            .eq('complex_id', app0.complex_id)
            .eq('status', 'waiting')
            .eq('preferred_time', app0.preferred_time);
        log.push(`🔄 대기자 SMS 발송 기록 초기화 완료 (재테스트용)`);
    }

    log.push('=== Phase 4 시작 (D-14 TM 발송) ===');
    const p4 = await modePhase4(sb, id);
    log.push(...p4.log);

    // deadline을 1초 전으로 조작 → Phase5 즉시 실행 가능하게
    log.push('');
    log.push('=== deadline 즉시 만료 처리 (1초 전으로 조작) ===');
    const pastDeadline = new Date(Date.now() - 1000).toISOString();
    await sb
        .from('applications')
        .update({ renewal_deadline: pastDeadline })
        .eq('id', id);
    log.push(`✅ renewal_deadline → ${pastDeadline} (과거로 설정)`);

    // 잠깐 대기 (DB 반영)
    await new Promise(r => setTimeout(r, 500));

    log.push('');
    log.push('=== Phase 5 시작 (무응답 만료 + 대기자 TM) ===');
    const p5 = await modePhase5(sb, id);
    log.push(...p5.log);

    return {
        mode: 'full_flow',
        app_id: id,
        phase4: { token: p4.token, renewal_url: p4.renewal_url, sms: p4.sms },
        phase5: { expired_sms: p5.expired_sms, waiting_trigger: p5.waiting_trigger },
        log,
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!checkAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized — Authorization: Bearer <CRON_SECRET> 필요' });
    }

    const { mode = 'status', id } = req.query;
    const sb = getSupabase();

    const validModes = ['status', 'dry_run', 'phase4', 'phase5', 'full_flow'];
    if (!validModes.includes(mode)) {
        return res.status(400).json({
            error: `알 수 없는 mode: ${mode}`,
            valid_modes: validModes,
            usage: {
                status:    'GET /api/renewal-test?mode=status',
                dry_run:   'GET /api/renewal-test?mode=dry_run',
                phase4:    'GET /api/renewal-test?mode=phase4&id=<application_id>',
                phase5:    'GET /api/renewal-test?mode=phase5&id=<application_id>',
                full_flow: 'GET /api/renewal-test?mode=full_flow&id=<application_id>',
            },
        });
    }

    if (['phase4', 'phase5', 'full_flow'].includes(mode) && !id) {
        return res.status(400).json({ error: `mode=${mode} 는 &id=<application_id> 필수` });
    }

    try {
        let result;
        if      (mode === 'status')    result = await modeStatus(sb);
        else if (mode === 'dry_run')   result = await modeDryRun(sb);
        else if (mode === 'phase4')    result = await modePhase4(sb, id);
        else if (mode === 'phase5')    result = await modePhase5(sb, id);
        else if (mode === 'full_flow') result = await modeFullFlow(sb, id);

        const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const kstStr = `${nowKst.getUTCFullYear()}-${String(nowKst.getUTCMonth()+1).padStart(2,'0')}-${String(nowKst.getUTCDate()).padStart(2,'0')} ${String(nowKst.getUTCHours()).padStart(2,'0')}:${String(nowKst.getUTCMinutes()).padStart(2,'0')} KST`;

        return res.status(200).json({ success: true, kst: kstStr, mode, ...result });

    } catch (e) {
        console.error(`[renewal-test] mode=${mode} 오류:`, e.message);
        return res.status(500).json({ success: false, mode, error: e.message });
    }
};
