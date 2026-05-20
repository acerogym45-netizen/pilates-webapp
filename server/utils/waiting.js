/**
 * 대기 자동 SMS 시스템 유틸리티
 *
 * 플로우:
 *  자리 발생 → triggerWaitingQueue() 호출
 *    → 해당 프로그램+시간대의 대기자 최소 순번 1명 조회
 *    → SMS 발송 (링크 포함)
 *    → waiting_sms_sent_at, waiting_expires_at 업데이트
 *
 * 만료 처리 (Cron이 주기적으로 호출):
 *  processExpiredWaiting()
 *    → waiting_expires_at < NOW() 인 대기자 탐색
 *    → status = 'waiting_expired'
 *    → 다음 순번에게 SMS 발송
 */

const { getSupabase } = require('../db-supabase');
const { normalizePhone } = require('./sms');
const { SolapiMessageService } = require('solapi');

// ─── Solapi 인스턴스 (lazy) ───────────────────────────────────
let _solapiService = null;
function getSolapiService() {
    if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) return null;
    if (!_solapiService) {
        _solapiService = new SolapiMessageService(
            process.env.SOLAPI_API_KEY,
            process.env.SOLAPI_API_SECRET
        );
    }
    return _solapiService;
}

function isSmsEnabled() {
    if (process.env.SMS_ENABLED === 'false') return false;
    return !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET);
}

// ─── 기본 도메인 (입주민 링크용) ─────────────────────────────
function getBaseUrl() {
    return process.env.BASE_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'https://pilates-system.vercel.app'; // 폴백
}

/**
 * 대기 알림 SMS 발송
 * @param {Object} params
 * @param {string} params.phone          - 수신 전화번호
 * @param {string} params.name           - 수신자 이름
 * @param {string} params.complexName    - 단지명
 * @param {string} params.complexCode    - 단지 코드 (입주민 페이지 링크용)
 * @param {string} params.programName    - 프로그램명
 * @param {string} params.preferredTime  - 희망 시간대
 * @param {number} params.waitingOrder   - 대기 순번
 * @param {number} params.timeoutHours   - 응답 제한 시간
 * @param {string} params.applicationId  - 신청 ID (수락 링크용)
 * @param {string} params.sender         - 발신번호
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendWaitingAvailableSms({
    phone, name, complexName, complexCode,
    programName, preferredTime, waitingOrder,
    timeoutHours = 3, applicationId, sender
}) {
    if (!isSmsEnabled()) {
        console.log('[Waiting SMS] SMS 비활성화 상태 - 발송 생략');
        return { success: false, skipped: true, reason: 'SMS 비활성화' };
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return { success: false, error: '유효하지 않은 전화번호' };

    const service = getSolapiService();
    if (!service) return { success: false, error: 'Solapi 서비스 초기화 실패' };

    const fromNumber = (sender && sender.trim()) || process.env.SOLAPI_SENDER;
    if (!fromNumber) return { success: false, error: '발신번호 미설정' };

    // 입주민 페이지 링크 (대기 수락 화면으로 이동)
    const baseUrl   = getBaseUrl();
    const acceptUrl = `${baseUrl}/?complex=${complexCode}&action=accept-waiting&id=${applicationId}`;

    const complex = complexName ? `[${complexName}] ` : '';
    const text = `${complex}${name}님, 안녕하세요!\n\n` +
        `대기 중이시던 프로그램에 자리가 났습니다.\n\n` +
        `📋 프로그램: ${programName}\n` +
        `🕐 시간대: ${preferredTime}\n` +
        `🔢 대기 순번: ${waitingOrder}번\n\n` +
        `⏰ ${timeoutHours}시간 이내에 아래 링크에서 수락해 주세요.\n` +
        `시간 내 미응답 시 다음 순번으로 넘어갑니다.\n\n` +
        `▶ 수락하기: ${acceptUrl}`;

    try {
        console.log(`[Waiting SMS] 발송 시도: ${normalizedPhone} (${name}) 대기${waitingOrder}번`);
        const result = await service.send({ to: normalizedPhone, from: fromNumber, text });
        const failed = result?.failedMessageList?.length || 0;
        if (failed > 0) {
            const reason = result.failedMessageList[0]?.reason || '알 수 없는 오류';
            console.error(`[Waiting SMS] 발송 실패: ${reason}`);
            return { success: false, error: reason };
        }
        const groupId = result?.groupInfo?.id || result?.groupId || 'sent';
        console.log(`[Waiting SMS] 발송 성공: groupId=${groupId}`);
        return { success: true, messageId: groupId };
    } catch (err) {
        console.error('[Waiting SMS] 발송 실패:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * 대기 만료 알림 SMS (다음 순번에게 발송 전 이전 대기자에게 만료 안내, 선택사항)
 */
async function sendWaitingExpiredSms({ phone, name, complexName, programName, preferredTime, sender }) {
    if (!isSmsEnabled()) return { success: false, skipped: true };
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return { success: false, error: '유효하지 않은 전화번호' };
    const service = getSolapiService();
    if (!service) return { success: false, error: 'Solapi 서비스 초기화 실패' };
    const fromNumber = (sender && sender.trim()) || process.env.SOLAPI_SENDER;
    if (!fromNumber) return { success: false, error: '발신번호 미설정' };

    const complex = complexName ? `[${complexName}] ` : '';
    const text = `${complex}${name}님,\n\n` +
        `[${programName} / ${preferredTime}] 대기 응답 시간이 초과되어 ` +
        `다음 대기자에게 순번이 이전되었습니다.\n\n` +
        `다음 기회에 다시 신청해 주세요.`;

    try {
        const result = await service.send({ to: normalizedPhone, from: fromNumber, text });
        const failed = result?.failedMessageList?.length || 0;
        if (failed > 0) return { success: false, error: result.failedMessageList[0]?.reason };
        return { success: true };
    } catch (err) {
        console.error('[Waiting Expired SMS] 발송 실패:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * 자리 발생 시 대기 큐 트리거
 * - 특정 프로그램 + 시간대의 다음 대기자에게 SMS 발송
 *
 * @param {Object} params
 * @param {string} params.complexId     - 단지 ID
 * @param {string} params.programId     - 프로그램 ID (null 가능)
 * @param {string} params.programName   - 프로그램명
 * @param {string} params.preferredTime - 시간대
 * @returns {Promise<{triggered: boolean, waitingId?: string, error?: string}>}
 */
async function triggerWaitingQueue({ complexId, programId, programName, preferredTime }) {
    try {
        const sb = getSupabase();

        // 1. 단지 대기 시스템 활성 여부 + 설정 조회
        const { data: cx, error: cxErr } = await sb
            .from('complexes')
            .select('id, name, code, waiting_enabled, waiting_timeout_hours, sms_sender, sms_enabled')
            .eq('id', complexId)
            .single();

        if (cxErr || !cx) {
            console.warn('[WaitingQueue] 단지 조회 실패:', cxErr?.message);
            return { triggered: false, error: '단지 조회 실패' };
        }

        if (!cx.waiting_enabled) {
            console.log(`[WaitingQueue] 단지(${cx.name}) 대기 시스템 비활성 - 스킵`);
            return { triggered: false, reason: '대기 시스템 비활성' };
        }

        // 2. 단지별 신청 종류 설정에서 'waiting' 활성 여부 확인
        const { data: waitingSetting } = await sb
            .from('complex_apply_settings')
            .select('is_enabled')
            .eq('complex_id', complexId)
            .eq('apply_type_key', 'waiting')
            .single();

        if (waitingSetting && waitingSetting.is_enabled === false) {
            console.log(`[WaitingQueue] 단지(${cx.name}) 대기 신청 타입 비활성 - 스킵`);
            return { triggered: false, reason: '대기 신청 타입 비활성' };
        }

        // 3. 해당 프로그램+시간대 대기자 중 waiting_sms_sent_at IS NULL & 최소 순번 조회
        let waitingQuery = sb
            .from('applications')
            .select('*')
            .eq('complex_id', complexId)
            .eq('status', 'waiting')
            .eq('apply_type', 'waiting')
            .is('waiting_sms_sent_at', null)   // 아직 SMS 미발송
            .eq('preferred_time', preferredTime)
            .order('waiting_order', { ascending: true })
            .limit(1);

        if (programId) {
            waitingQuery = waitingQuery.eq('program_id', programId);
        } else {
            waitingQuery = waitingQuery.ilike('program_name', programName);
        }

        const { data: nextWaiting, error: wErr } = await waitingQuery;
        if (wErr) {
            console.error('[WaitingQueue] 대기자 조회 실패:', wErr.message);
            return { triggered: false, error: wErr.message };
        }

        if (!nextWaiting || nextWaiting.length === 0) {
            console.log(`[WaitingQueue] 대기자 없음 - 프로그램:${programName} 시간:${preferredTime}`);
            return { triggered: false, reason: '대기자 없음' };
        }

        const waiter = nextWaiting[0];
        const timeoutHours = cx.waiting_timeout_hours || 3;
        const expiresAt    = new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString();

        // 4. waiting_sms_sent_at + waiting_expires_at 업데이트 (발송 전 선점)
        const { error: updErr } = await sb
            .from('applications')
            .update({
                waiting_sms_sent_at: new Date().toISOString(),
                waiting_expires_at:  expiresAt,
            })
            .eq('id', waiter.id);

        if (updErr) {
            console.error('[WaitingQueue] 대기자 업데이트 실패:', updErr.message);
            return { triggered: false, error: updErr.message };
        }

        // 5. SMS 발송
        const smsResult = await sendWaitingAvailableSms({
            phone:         waiter.phone,
            name:          waiter.name,
            complexName:   cx.name,
            complexCode:   cx.code,
            programName:   waiter.program_name,
            preferredTime: waiter.preferred_time,
            waitingOrder:  waiter.waiting_order,
            timeoutHours,
            applicationId: waiter.id,
            sender:        cx.sms_sender,
        });

        console.log(`[WaitingQueue] 트리거 완료 - 대기자:${waiter.name}(${waiter.waiting_order}번) SMS:${smsResult.success ? '성공' : '실패'}`);
        return {
            triggered:   true,
            waitingId:   waiter.id,
            waitingName: waiter.name,
            smsResult,
        };

    } catch (e) {
        console.error('[WaitingQueue] 예외:', e.message);
        return { triggered: false, error: e.message };
    }
}

/**
 * 만료된 대기 처리 (Cron에서 주기적으로 호출)
 * - waiting_expires_at < NOW() 인 대기자를 'waiting_expired' 처리
 * - 해당 프로그램+시간대의 다음 순번에게 SMS 발송
 *
 * @returns {Promise<{processed: number, triggered: number, errors: Array}>}
 */
async function processExpiredWaiting() {
    const sb = getSupabase();
    const results = { processed: 0, triggered: 0, errors: [] };

    try {
        // 만료된 대기 건 조회
        const { data: expired, error: expErr } = await sb
            .from('applications')
            .select('*, complexes(name, code, sms_sender, waiting_timeout_hours, waiting_enabled)')
            .eq('status', 'waiting')
            .eq('apply_type', 'waiting')
            .not('waiting_sms_sent_at', 'is', null)   // SMS 발송됨
            .not('waiting_expires_at', 'is', null)
            .lt('waiting_expires_at', new Date().toISOString())  // 만료됨
            .order('waiting_expires_at', { ascending: true });

        if (expErr) {
            console.error('[Cron:WaitingExpiry] 조회 실패:', expErr.message);
            results.errors.push(expErr.message);
            return results;
        }

        if (!expired || expired.length === 0) return results;

        console.log(`[Cron:WaitingExpiry] 만료 대기자 ${expired.length}명 처리 시작`);

        for (const waiter of expired) {
            try {
                const cx = waiter.complexes || {};

                // status → 'waiting_expired' 처리
                await sb
                    .from('applications')
                    .update({ status: 'waiting_expired' })
                    .eq('id', waiter.id);
                results.processed++;

                // 만료 SMS (이전 대기자에게 알림)
                if (cx.sms_sender || process.env.SOLAPI_SENDER) {
                    await sendWaitingExpiredSms({
                        phone:         waiter.phone,
                        name:          waiter.name,
                        complexName:   cx.name,
                        programName:   waiter.program_name,
                        preferredTime: waiter.preferred_time,
                        sender:        cx.sms_sender,
                    });
                }

                // 다음 순번 트리거 — 자리는 여전히 비어있으므로
                const triggerResult = await triggerWaitingQueue({
                    complexId:     waiter.complex_id,
                    programId:     waiter.program_id,
                    programName:   waiter.program_name,
                    preferredTime: waiter.preferred_time,
                });
                if (triggerResult.triggered) results.triggered++;

            } catch (itemErr) {
                console.error(`[Cron:WaitingExpiry] ID:${waiter.id} 처리 실패:`, itemErr.message);
                results.errors.push(`${waiter.id}: ${itemErr.message}`);
            }
        }

        console.log(`[Cron:WaitingExpiry] 완료 - 처리:${results.processed} 트리거:${results.triggered}`);
    } catch (e) {
        console.error('[Cron:WaitingExpiry] 예외:', e.message);
        results.errors.push(e.message);
    }

    return results;
}

/**
 * 신청 종류(apply_type_key) 활성 여부 조회 (미들웨어/라우터에서 사용)
 * @param {string} complexId
 * @param {string} applyTypeKey  - 'new' | 'waiting' | 'cancel' | 'mid_cancel' | 'refund'
 * @returns {Promise<{isEnabled: boolean, isOpen: boolean, message?: string}>}
 */
async function checkApplyTypeSetting(complexId, applyTypeKey) {
    try {
        const sb = getSupabase();

        // 단지 기본 기간 조회
        const { data: cx } = await sb
            .from('complexes')
            .select('apply_period_enabled, apply_start, apply_end, waiting_enabled')
            .eq('id', complexId)
            .single();

        // 신청 종류별 설정 조회
        const { data: setting } = await sb
            .from('complex_apply_settings')
            .select('*')
            .eq('complex_id', complexId)
            .eq('apply_type_key', applyTypeKey)
            .single();

        // 설정 없으면 기본값 적용
        const isEnabled  = setting ? setting.is_enabled  : (applyTypeKey !== 'waiting');
        const periodMode = setting?.period_mode || 'auto';

        if (!isEnabled) {
            const LABELS = {
                new:        '신규 수강 신청',
                waiting:    '대기 신청',
                cancel:     '해지 신청',
                mid_cancel: '중도 해지',
                refund:     '환불 신청',
            };
            return { isEnabled: false, isOpen: false, message: `현재 ${LABELS[applyTypeKey] || applyTypeKey}을(를) 받지 않습니다.` };
        }

        const now = new Date();
        let isOpen = false;

        if (periodMode === 'always') {
            isOpen = true;
        } else if (periodMode === 'closed') {
            isOpen = false;
        } else if (periodMode === 'custom' && setting?.period_start && setting?.period_end) {
            isOpen = now >= new Date(setting.period_start) && now <= new Date(setting.period_end);
        } else {
            // auto: 단지 커스텀 기간 우선, 없으면 22~26일 자동
            if (cx?.apply_period_enabled) {
                if (cx.apply_start && cx.apply_end) {
                    isOpen = now >= new Date(cx.apply_start) && now <= new Date(cx.apply_end);
                } else {
                    isOpen = true; // 상시 개방
                }
            } else {
                const nowKst  = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                const dayKst  = nowKst.getUTCDate();
                const hourKst = nowKst.getUTCHours();
                isOpen = (dayKst === 22 && hourKst >= 9) ||
                         (dayKst > 22 && dayKst < 26)   ||
                         (dayKst === 26 && hourKst < 9);
            }
        }

        return { isEnabled: true, isOpen };
    } catch (e) {
        console.error('[checkApplyTypeSetting] 오류:', e.message);
        return { isEnabled: true, isOpen: true }; // 오류 시 허용 폴백
    }
}

module.exports = {
    triggerWaitingQueue,
    processExpiredWaiting,
    sendWaitingAvailableSms,
    sendWaitingExpiredSms,
    checkApplyTypeSetting,
};
