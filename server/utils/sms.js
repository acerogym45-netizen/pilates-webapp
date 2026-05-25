/**
 * 솔라피(Solapi) SMS 발송 유틸리티
 * - 문의 답변 등록 시 입주민에게 자동 SMS 발송
 * - API Key/Secret: Vercel 환경변수 SOLAPI_API_KEY, SOLAPI_API_SECRET (공통)
 * - 발신번호: 단지별 DB(complexes.sms_sender) 우선, 없으면 SOLAPI_SENDER 환경변수 폴백
 * - SMS_ENABLED=false 이면 전역 비활성화
 */

const { SolapiMessageService } = require('solapi');

/**
 * 솔라피 API Key/Secret 설정이 유효한지 확인 (공통)
 */
function isSmsConfigured() {
    return !!(
        process.env.SOLAPI_API_KEY &&
        process.env.SOLAPI_API_SECRET
    );
}

/**
 * SMS 발송 활성화 여부 확인 (전역)
 * - SMS_ENABLED=false 이면 비활성화
 * - API Key/Secret이 있으면 기본 활성화
 */
function isSmsEnabled() {
    if (process.env.SMS_ENABLED === 'false') return false;
    return isSmsConfigured();
}

/**
 * 솔라피 서비스 인스턴스 (lazy initialization)
 */
let _solapiService = null;
function getSolapiService() {
    if (!isSmsConfigured()) return null;
    if (!_solapiService) {
        _solapiService = new SolapiMessageService(
            process.env.SOLAPI_API_KEY,
            process.env.SOLAPI_API_SECRET
        );
    }
    return _solapiService;
}

/**
 * 전화번호 정규화 (한국 형식)
 * 010-1234-5678 → 01012345678
 */
function normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return null;
    return digits;
}

/**
 * 문의 답변 SMS 발송
 * @param {Object} params
 * @param {string} params.phone       - 수신 전화번호
 * @param {string} params.name        - 수신자 이름
 * @param {string} params.title       - 문의 제목
 * @param {string} params.answer      - 등록된 답변 내용
 * @param {string} params.complexName - 아파트 단지명 (선택)
 * @param {string} params.sender      - 발신번호 (단지별 DB값, 없으면 환경변수 폴백)
 * @param {boolean} params.smsEnabled - 단지별 SMS 활성화 여부 (false면 단지 단위 비활성)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendInquiryAnswerSms({ phone, name, title, answer, complexName, sender, smsEnabled }) {
    // 전역 비활성화 확인
    if (!isSmsEnabled()) {
        console.log('[SMS] 전역 비활성화 상태 - 발송 생략');
        return { success: false, skipped: true, reason: 'SMS 전역 비활성화' };
    }

    // 단지별 비활성화 확인 (smsEnabled가 명시적으로 false인 경우)
    if (smsEnabled === false) {
        console.log('[SMS] 단지별 비활성화 상태 - 발송 생략');
        return { success: false, skipped: true, reason: '해당 단지 SMS 비활성화' };
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        console.warn('[SMS] 유효하지 않은 전화번호:', phone);
        return { success: false, error: '유효하지 않은 전화번호' };
    }

    const service = getSolapiService();
    if (!service) {
        return { success: false, error: '솔라피 서비스 초기화 실패 (API Key 확인)' };
    }

    // 발신번호: 파라미터(단지 DB) 우선 → 환경변수 폴백
    const fromNumber = (sender && sender.trim()) || process.env.SOLAPI_SENDER;
    if (!fromNumber) {
        console.error('[SMS] 발신번호 없음 - 단지 설정 또는 SOLAPI_SENDER 환경변수 확인');
        return { success: false, error: '발신번호가 설정되지 않았습니다' };
    }

    const complex = complexName ? `[${complexName}] ` : '';
    const text = `${complex}${name}님의 문의에 답변이 등록되었습니다.\n\n문의 제목 : ${title}\n\n답변 내용은 입주민 페이지 > [내 문의조회]에서 확인하실 수 있습니다.`;

    try {
        console.log(`[SMS] 발송 시도: ${normalizedPhone} (${name}) / 발신: ${fromNumber}`);
        const result = await service.send({
            to:   normalizedPhone,
            from: fromNumber,
            text: text,
        });
        const groupId = result?.groupInfo?.id || result?.groupId || 'sent';
        const failed  = result?.failedMessageList?.length || 0;
        if (failed > 0) {
            const reason = result.failedMessageList[0]?.reason || '알 수 없는 오류';
            console.error(`[SMS] 발송 실패 (서버 응답): ${reason}`);
            return { success: false, error: reason };
        }
        console.log(`[SMS] 발송 성공: groupId=${groupId}`);
        return { success: true, messageId: groupId };
    } catch (err) {
        console.error('[SMS] 발송 실패:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * SMS 설정 상태 조회 (민감정보 제외)
 */
function getSmsStatus() {
    return {
        configured: isSmsConfigured(),
        enabled:    isSmsEnabled(),
        sender:     process.env.SOLAPI_SENDER || null,
        apiKeyPreview: process.env.SOLAPI_API_KEY
            ? process.env.SOLAPI_API_KEY.substring(0, 4) + '****'
            : null,
    };
}

/**
 * 연장 TM SMS 발송 (만료 2주 전 — 입주민에게 연장 의향 링크 포함)
 * @param {Object} p
 * @param {string} p.phone        - 수신 전화번호
 * @param {string} p.name         - 수강생 이름
 * @param {string} p.complexName  - 단지명
 * @param {string} p.programName  - 프로그램명
 * @param {string} p.expiryDate   - 만료일 (YYYY-MM-DD)
 * @param {string} p.renewalUrl   - 연장 의향 링크 URL
 * @param {string} p.sender       - 발신번호 (단지 DB)
 * @param {boolean} p.smsEnabled  - 단지 SMS 활성 여부
 */
async function sendRenewalNoticeSms({ phone, name, complexName, programName, expiryDate, renewalUrl, sender, smsEnabled }) {
    if (!isSmsEnabled()) return { success: false, skipped: true, reason: 'SMS 전역 비활성화' };
    if (smsEnabled === false) return { success: false, skipped: true, reason: '해당 단지 SMS 비활성화' };

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return { success: false, error: '유효하지 않은 전화번호' };

    const service = getSolapiService();
    if (!service) return { success: false, error: '솔라피 서비스 초기화 실패' };

    const fromNumber = (sender && sender.trim()) || process.env.SOLAPI_SENDER;
    if (!fromNumber) return { success: false, error: '발신번호가 설정되지 않았습니다' };

    const complex = complexName ? `[${complexName}] ` : '';
    const text = `${complex}${name}님 안녕하세요.\n\n${programName} 수강 만료일이 ${expiryDate}입니다.\n\n연장을 원하시면 아래 링크를 눌러주세요 (3일 이내 응답):\n${renewalUrl}\n\n※ 미응답 시 자동 해지 처리됩니다.`;

    try {
        console.log(`[SMS][연장TM] 발송 시도: ${normalizedPhone} (${name})`);
        const result = await service.send({ to: normalizedPhone, from: fromNumber, text });
        const failed = result?.failedMessageList?.length || 0;
        if (failed > 0) {
            const reason = result.failedMessageList[0]?.reason || '알 수 없는 오류';
            return { success: false, error: reason };
        }
        return { success: true, messageId: result?.groupInfo?.id || 'sent' };
    } catch (err) {
        console.error('[SMS][연장TM] 발송 실패:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * 연장 확인 SMS 발송 (관리자 결제 확인 후 입주민에게)
 */
async function sendRenewalConfirmedSms({ phone, name, complexName, programName, newExpiryDate, sender, smsEnabled }) {
    if (!isSmsEnabled()) return { success: false, skipped: true, reason: 'SMS 전역 비활성화' };
    if (smsEnabled === false) return { success: false, skipped: true, reason: '해당 단지 SMS 비활성화' };

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return { success: false, error: '유효하지 않은 전화번호' };

    const service = getSolapiService();
    if (!service) return { success: false, error: '솔라피 서비스 초기화 실패' };

    const fromNumber = (sender && sender.trim()) || process.env.SOLAPI_SENDER;
    if (!fromNumber) return { success: false, error: '발신번호가 설정되지 않았습니다' };

    const complex = complexName ? `[${complexName}] ` : '';
    const text = `${complex}${name}님,\n\n${programName} 수강 연장이 완료되었습니다. ✅\n\n새 만료일: ${newExpiryDate}\n\n앞으로도 즐거운 수업 되세요!`;

    try {
        console.log(`[SMS][연장확인] 발송 시도: ${normalizedPhone} (${name})`);
        const result = await service.send({ to: normalizedPhone, from: fromNumber, text });
        const failed = result?.failedMessageList?.length || 0;
        if (failed > 0) return { success: false, error: result.failedMessageList[0]?.reason };
        return { success: true, messageId: result?.groupInfo?.id || 'sent' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * 연장 비희망/만료 해지 알림 SMS (입주민에게)
 */
async function sendRenewalExpiredSms({ phone, name, complexName, programName, sender, smsEnabled }) {
    if (!isSmsEnabled()) return { success: false, skipped: true, reason: 'SMS 전역 비활성화' };
    if (smsEnabled === false) return { success: false, skipped: true, reason: '해당 단지 SMS 비활성화' };

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return { success: false, error: '유효하지 않은 전화번호' };

    const service = getSolapiService();
    if (!service) return { success: false, error: '솔라피 서비스 초기화 실패' };

    const fromNumber = (sender && sender.trim()) || process.env.SOLAPI_SENDER;
    if (!fromNumber) return { success: false, error: '발신번호가 설정되지 않았습니다' };

    const complex = complexName ? `[${complexName}] ` : '';
    const text = `${complex}${name}님,\n\n${programName} 수강이 만료 처리되었습니다.\n\n재등록을 원하시면 접수 페이지에서 신청해 주세요.`;

    try {
        const result = await service.send({ to: normalizedPhone, from: fromNumber, text });
        const failed = result?.failedMessageList?.length || 0;
        if (failed > 0) return { success: false, error: result.failedMessageList[0]?.reason };
        return { success: true, messageId: result?.groupInfo?.id || 'sent' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = {
    sendInquiryAnswerSms,
    sendRenewalNoticeSms,
    sendRenewalConfirmedSms,
    sendRenewalExpiredSms,
    isSmsEnabled,
    isSmsConfigured,
    getSmsStatus,
    normalizePhone,
};
