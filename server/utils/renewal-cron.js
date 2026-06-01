/**
 * 수강 연장 자동화 Cron 유틸리티
 *
 * Phase 4 — 만료 D-14 자동 TM 발송
 *   - 매일 실행
 *   - direct 단지 + status='approved' + expiry_date = 오늘+14일 + renewal_status IS NULL
 *   - 조건 충족 시 UUID 토큰 생성 → renewal_status='pending' → SMS 발송
 *
 * Phase 5 — 3일 무반응 자동 해지
 *   - 매일 실행
 *   - renewal_deadline < NOW() + renewal_status = 'pending'
 *   - → renewal_status='expired' + status='approved' 유지 (기록만)
 *   - → 선택적: 해지 SMS 발송
 */

const crypto = require('crypto');
const { getSupabase } = require('../db-supabase');
const {
    sendRenewalNoticeSms,
    sendRenewalExpiredSms,
} = require('./sms');
const { triggerWaitingQueue } = require('./waiting');

// ── 기본 도메인 ───────────────────────────────────────────────────────────────
function getBaseUrl() {
    if (process.env.BASE_URL) return process.env.BASE_URL;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return 'https://pilates-system.vercel.app';
}

// ── 날짜 문자열 계산 헬퍼 (KST 기준) ─────────────────────────────────────────
function getKstDateStr(offsetDays = 0) {
    // UTC+9 기준 오늘 날짜 (KST)
    const now = new Date();
    const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
    const kstDate = new Date(kstMs + offsetDays * 24 * 60 * 60 * 1000);
    return kstDate.toISOString().slice(0, 10);
}

// ══════════════════════════════════════════════════════════════════════════════
// Phase 4: 만료 D-14 자동 TM 발송
// ══════════════════════════════════════════════════════════════════════════════

/**
 * direct 단지 수강자 중 만료일이 오늘+14일인 신규 건에 연장 TM 발송
 * @returns {Promise<{sent: number, skipped: number, errors: Array}>}
 */
async function sendRenewalNotices() {
    const sb = getSupabase();
    const results = { sent: 0, skipped: 0, errors: [] };

    try {
        const targetDate = getKstDateStr(14); // 오늘 기준 14일 후
        console.log(`[Cron:RenewalNotice] 실행 — 대상 만료일: ${targetDate}`);

        // direct 단지 + 승인됨 + 만료일 D-14 + 아직 TM 미발송
        const { data: apps, error: fetchErr } = await sb
            .from('applications')
            .select(`
                id, name, phone, program_name, expiry_date, complex_id,
                complexes!inner(
                    id, name, payment_mode, sms_sender, sms_enabled,
                    renewal_account_bank, renewal_account_number, renewal_account_holder
                )
            `)
            .eq('status', 'approved')
            .eq('complexes.payment_mode', 'direct')
            .eq('expiry_date', targetDate)
            .is('renewal_status', null);

        if (fetchErr) {
            console.error('[Cron:RenewalNotice] 조회 실패:', fetchErr.message);
            results.errors.push(fetchErr.message);
            return results;
        }

        if (!apps || apps.length === 0) {
            console.log('[Cron:RenewalNotice] 대상 없음');
            return results;
        }

        console.log(`[Cron:RenewalNotice] 대상 ${apps.length}명 처리 시작`);

        for (const app of apps) {
            try {
                const cx = app.complexes;

                // 토큰 + 데드라인 생성
                const token    = crypto.randomUUID();
                const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

                // DB 업데이트 (선점 방식 — SMS 발송 전 상태 기록)
                const { error: updErr } = await sb
                    .from('applications')
                    .update({
                        renewal_token:       token,
                        renewal_status:      'pending',
                        renewal_deadline:    deadline.toISOString(),
                        renewal_notified_at: new Date().toISOString(),
                    })
                    .eq('id', app.id)
                    .is('renewal_status', null); // 동시 실행 방어: 이미 처리된 건 스킵

                if (updErr) {
                    console.error(`[Cron:RenewalNotice] ID:${app.id} DB 업데이트 실패:`, updErr.message);
                    results.errors.push(`${app.id}: ${updErr.message}`);
                    results.skipped++;
                    continue;
                }

                // SMS 발송
                const renewalUrl = `${getBaseUrl()}/renew/${token}`;
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

                if (smsResult.success) {
                    console.log(`[Cron:RenewalNotice] ✅ 발송 완료 — ${app.name} (${app.expiry_date})`);
                    results.sent++;
                } else if (smsResult.skipped) {
                    console.log(`[Cron:RenewalNotice] ⏭ SMS 비활성 — ${app.name}`);
                    results.sent++; // DB는 업데이트됨
                } else {
                    console.warn(`[Cron:RenewalNotice] ⚠ SMS 실패 — ${app.name}: ${smsResult.error}`);
                    results.errors.push(`SMS 실패(${app.name}): ${smsResult.error}`);
                    results.sent++; // DB는 업데이트됨 (토큰은 유효)
                }

            } catch (itemErr) {
                console.error(`[Cron:RenewalNotice] ID:${app.id} 예외:`, itemErr.message);
                results.errors.push(`${app.id}: ${itemErr.message}`);
                results.skipped++;
            }
        }

        console.log(`[Cron:RenewalNotice] 완료 — 발송:${results.sent} 스킵:${results.skipped} 오류:${results.errors.length}`);

    } catch (e) {
        console.error('[Cron:RenewalNotice] 예외:', e.message);
        results.errors.push(e.message);
    }

    return results;
}

// ══════════════════════════════════════════════════════════════════════════════
// Phase 5: 3일 무반응 자동 해지 처리
// ══════════════════════════════════════════════════════════════════════════════

/**
 * renewal_deadline 초과 + pending 상태인 건 → expired 처리
 * @returns {Promise<{processed: number, errors: Array}>}
 */
async function processExpiredRenewals() {
    const sb = getSupabase();
    const results = { processed: 0, errors: [] };

    try {
        const now = new Date().toISOString();
        console.log(`[Cron:RenewalExpiry] 실행 — 기준 시각: ${now}`);

        // renewal_deadline 초과 + pending 상태 조회
        const { data: expired, error: fetchErr } = await sb
            .from('applications')
            .select(`
                id, name, phone, program_name, program_id, preferred_time, expiry_date, complex_id,
                complexes!inner(name, sms_sender, sms_enabled)
            `)
            .eq('renewal_status', 'pending')
            .lt('renewal_deadline', now)
            .order('renewal_deadline', { ascending: true });

        if (fetchErr) {
            console.error('[Cron:RenewalExpiry] 조회 실패:', fetchErr.message);
            results.errors.push(fetchErr.message);
            return results;
        }

        if (!expired || expired.length === 0) {
            console.log('[Cron:RenewalExpiry] 만료 대상 없음');
            return results;
        }

        console.log(`[Cron:RenewalExpiry] 만료 대상 ${expired.length}건 처리 시작`);

        for (const app of expired) {
            try {
                const cx = app.complexes;

                // renewal_status → 'expired' (status='approved'는 유지 — 기록 보존)
                // 토큰/데드라인 초기화 (보안)
                const { error: updErr } = await sb
                    .from('applications')
                    .update({
                        renewal_status:   'expired',
                        renewal_token:    null,
                        renewal_deadline: null,
                    })
                    .eq('id', app.id)
                    .eq('renewal_status', 'pending'); // 동시 실행 방어

                if (updErr) {
                    console.error(`[Cron:RenewalExpiry] ID:${app.id} DB 업데이트 실패:`, updErr.message);
                    results.errors.push(`${app.id}: ${updErr.message}`);
                    continue;
                }

                results.processed++;

                // 만료 안내 SMS (현재 회원에게 미응답 처리 안내)
                const smsResult = await sendRenewalExpiredSms({
                    phone:       app.phone,
                    name:        app.name,
                    complexName: cx.name,
                    programName: app.program_name,
                    sender:      cx.sms_sender,
                    smsEnabled:  cx.sms_enabled != null ? Boolean(cx.sms_enabled) : null,
                });

                const smsLog = smsResult.success
                    ? '✅'
                    : smsResult.skipped ? '⏭(비활성)' : `⚠(${smsResult.error})`;
                console.log(`[Cron:RenewalExpiry] ${app.name} → expired 처리 완료, SMS: ${smsLog}`);

                // 대기자 공석 안내 TM — 해당 프로그램+시간대의 다음 대기자에게 발송
                if (app.complex_id && app.preferred_time) {
                    try {
                        const triggerResult = await triggerWaitingQueue({
                            complexId:     app.complex_id,
                            programId:     app.program_id || null,
                            programName:   app.program_name,
                            preferredTime: app.preferred_time,
                        });
                        if (triggerResult.triggered) {
                            console.log(`[Cron:RenewalExpiry] 대기자 공석 안내 TM 발송 완료 — ${triggerResult.waitingName} (${app.program_name} / ${app.preferred_time})`);
                        } else {
                            console.log(`[Cron:RenewalExpiry] 대기자 없음 또는 스킵 — ${app.program_name} / ${app.preferred_time}: ${triggerResult.reason || triggerResult.error || ''}`);
                        }
                    } catch (trigErr) {
                        console.error(`[Cron:RenewalExpiry] 대기자 트리거 실패 — ID:${app.id}:`, trigErr.message);
                    }
                }

            } catch (itemErr) {
                console.error(`[Cron:RenewalExpiry] ID:${app.id} 예외:`, itemErr.message);
                results.errors.push(`${app.id}: ${itemErr.message}`);
            }
        }

        console.log(`[Cron:RenewalExpiry] 완료 — 처리:${results.processed} 오류:${results.errors.length}`);

    } catch (e) {
        console.error('[Cron:RenewalExpiry] 예외:', e.message);
        results.errors.push(e.message);
    }

    return results;
}

// ══════════════════════════════════════════════════════════════════════════════
// 통합 실행 함수 (cron.js에서 호출)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Phase 4 + Phase 5 순차 실행
 * @returns {Promise<{notices: Object, expirations: Object}>}
 */
async function runRenewalCron() {
    console.log('[Cron:Renewal] === 연장 자동화 Cron 시작 ===');
    const notices     = await sendRenewalNotices();
    const expirations = await processExpiredRenewals();
    console.log('[Cron:Renewal] === 연장 자동화 Cron 완료 ===');
    return { notices, expirations };
}

module.exports = {
    sendRenewalNotices,
    processExpiredRenewals,
    runRenewalCron,
};
