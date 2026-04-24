/**
 * 솔라피(Solapi) SMS 발송 유틸리티
 * - 문의 답변 등록 시 입주민에게 자동 SMS 발송
 * - 환경변수: SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER (발신번호)
 * - SMS_ENABLED=false 이면 발송하지 않음 (기본값: SMS 설정이 있으면 활성화)
 */

const { SolapiMessageService } = require('solapi');

/**
 * 솔라피 설정이 유효한지 확인
 */
function isSmsConfigured() {
    return !!(
        process.env.SOLAPI_API_KEY &&
        process.env.SOLAPI_API_SECRET &&
        process.env.SOLAPI_SENDER
    );
}

/**
 * SMS 발송 활성화 여부 확인
 * - SMS_ENABLED=false 이면 비활성화
 * - 설정 키가 있으면 기본 활성화
 */
function isSmsEnabled() {
    if (process.env.SMS_ENABLED === 'false') return false;
    return isSmsConfigured();
}

/**
 * 솔라피 서비스 인스턴스 생성 (lazy initialization)
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
    // 최소 10자리 (01012345678), 국제형식 포함
    if (digits.length < 10) return null;
    return digits;
}

/**
 * 문의 답변 SMS 발송
 * @param {Object} params
 * @param {string} params.phone - 수신 전화번호
 * @param {string} params.name - 수신자 이름
 * @param {string} params.title - 문의 제목
 * @param {string} params.answer - 등록된 답변 내용
 * @param {string} params.complexName - 아파트 단지명 (선택)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendInquiryAnswerSms({ phone, name, title, answer, complexName }) {
    if (!isSmsEnabled()) {
        console.log('[SMS] 비활성화 상태 - 발송 생략');
        return { success: false, skipped: true, reason: 'SMS 비활성화' };
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        console.warn('[SMS] 유효하지 않은 전화번호:', phone);
        return { success: false, error: '유효하지 않은 전화번호' };
    }

    const service = getSolapiService();
    if (!service) {
        return { success: false, error: '솔라피 서비스 초기화 실패' };
    }

    const sender = process.env.SOLAPI_SENDER;
    const complex = complexName ? `[${complexName}] ` : '';

    // 문자 내용
    const text = `${complex}${name}님의 문의에 답변이 등록되었습니다.\n\n문의 제목 : ${title}\n\n답변 내용은 입주민 페이지 > [내 문의조회]에서 확인하실 수 있습니다.`;

    try {
        console.log(`[SMS] 발송 시도: ${normalizedPhone} (${name})`);
        // solapi SDK v6: service.send(messageObject) - 메시지 객체를 직접 전달
        const result = await service.send({
            to: normalizedPhone,
            from: sender,
            text: text,
        });
        // v6 응답: { groupInfo: { count: {...} }, failedMessageList: [...], ... }
        const groupId = result?.groupInfo?.id || result?.groupId || 'sent';
        const failed = result?.failedMessageList?.length || 0;
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
        enabled: isSmsEnabled(),
        sender: process.env.SOLAPI_SENDER || null,
        // API Key는 앞 4자리만 노출
        apiKeyPreview: process.env.SOLAPI_API_KEY
            ? process.env.SOLAPI_API_KEY.substring(0, 4) + '****'
            : null,
    };
}

module.exports = {
    sendInquiryAnswerSms,
    isSmsEnabled,
    isSmsConfigured,
    getSmsStatus,
    normalizePhone,
};
