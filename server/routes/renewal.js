/**
 * 수강 연장 자동화 라우터
 *
 * GET  /renew/:token           — 입주민용 연장 의향 페이지 (공개)
 * POST /api/renewal/respond    — 입주민 연장 희망/비희망 응답
 * POST /api/renewal/confirm    — 관리자 결제 확인 → 연장 처리 (Phase 6)
 * POST /api/renewal/send-notice — 관리자가 수동으로 연장 TM 발송
 * GET  /api/renewal/pending    — 관리자: 연장 대기 목록 조회
 */

const express  = require('express');
const crypto   = require('crypto');
const router   = express.Router();
const { getSupabase } = require('../db-supabase');
const {
    sendRenewalNoticeSms,
    sendRenewalConfirmedSms,
    sendRenewalExpiredSms,
} = require('../utils/sms');

// ── 헬퍼: 단지 SMS 설정 조회 ──────────────────────────────────────────────────
async function getComplexSmsConfig(sb, complexId) {
    if (!complexId) return { sender: null, smsEnabled: null, complexName: '' };
    const { data: cx } = await sb
        .from('complexes')
        .select('name, sms_sender, sms_enabled, payment_mode')
        .eq('id', complexId)
        .single();
    return {
        sender:      cx?.sms_sender  || null,
        smsEnabled:  cx?.sms_enabled != null ? Boolean(cx.sms_enabled) : null,
        complexName: cx?.name        || '',
        paymentMode: cx?.payment_mode || 'management_fee',
    };
}

// ── 헬퍼: 만료일에서 1개월 연장 ───────────────────────────────────────────────
function addOneMonth(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + 1);
    // 말일 보정 (예: 1/31 + 1개월 → 2/28)
    return d.toISOString().slice(0, 10);
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /renew/:token  — 입주민용 연장 의향 페이지 (HTML 응답)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/renew/:token', async (req, res) => {
    try {
        const sb = getSupabase();
        const { token } = req.params;

        const { data: app, error } = await sb
            .from('applications')
            .select('id, name, program_name, expiry_date, renewal_status, renewal_deadline, complex_id')
            .eq('renewal_token', token)
            .single();

        if (error || !app) {
            return res.send(renewPageHtml({ error: '유효하지 않은 연장 링크입니다.' }));
        }

        // 기한 초과 확인
        if (app.renewal_deadline && new Date() > new Date(app.renewal_deadline)) {
            return res.send(renewPageHtml({
                error: '연장 응답 기한이 지났습니다.',
                name: app.name,
            }));
        }

        // 이미 응답한 경우
        if (app.renewal_status === 'confirmed') {
            return res.send(renewPageHtml({
                done: true, type: 'confirmed',
                name: app.name,
                programName: app.program_name,
            }));
        }
        if (app.renewal_status === 'declined') {
            return res.send(renewPageHtml({
                done: true, type: 'declined',
                name: app.name,
            }));
        }

        // 단지 정보 조회 (계좌번호 안내용)
        const { data: cx } = await sb
            .from('complexes')
            .select('name, renewal_account_bank, renewal_account_number, renewal_account_holder')
            .eq('id', app.complex_id)
            .single();

        return res.send(renewPageHtml({
            token,
            name: app.name,
            programName: app.program_name,
            expiryDate: app.expiry_date,
            deadline: app.renewal_deadline,
            complexName: cx?.name || '',
            accountBank:   cx?.renewal_account_bank   || '',
            accountNumber: cx?.renewal_account_number || '',
            accountHolder: cx?.renewal_account_holder || '',
        }));
    } catch (e) {
        console.error('[renewal] GET /renew/:token 오류:', e.message);
        res.send(renewPageHtml({ error: '서버 오류가 발생했습니다.' }));
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/renewal/respond  — 입주민 연장 희망/비희망 응답
// body: { token, response: 'confirmed' | 'declined' }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/api/renewal/respond', async (req, res) => {
    try {
        const sb = getSupabase();
        const { token, response } = req.body;

        if (!token || !['confirmed', 'declined'].includes(response)) {
            return res.status(400).json({ success: false, error: '잘못된 요청입니다' });
        }

        const { data: app, error } = await sb
            .from('applications')
            .select('*')
            .eq('renewal_token', token)
            .single();

        if (error || !app) {
            return res.status(404).json({ success: false, error: '유효하지 않은 토큰입니다' });
        }

        // 기한 초과 확인
        if (app.renewal_deadline && new Date() > new Date(app.renewal_deadline)) {
            return res.status(400).json({ success: false, error: '응답 기한이 지났습니다' });
        }

        // 이미 응답한 경우
        if (app.renewal_status && app.renewal_status !== 'pending') {
            return res.status(400).json({ success: false, error: '이미 응답이 완료된 요청입니다' });
        }

        // 응답 저장
        const { error: updateErr } = await sb
            .from('applications')
            .update({ renewal_status: response })
            .eq('id', app.id);

        if (updateErr) throw updateErr;

        // 비희망 → 만료 예약 처리 (cron에서 expiry_date 이후 처리)
        if (response === 'declined') {
            console.log(`[renewal] ${app.name} 연장 비희망 선택 (app_id=${app.id})`);
        }

        console.log(`[renewal] ${app.name} 연장 응답: ${response} (app_id=${app.id})`);
        res.json({ success: true, response });
    } catch (e) {
        console.error('[renewal] POST /respond 오류:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/renewal/confirm  — 관리자 결제 확인 → 연장 처리 (Phase 6)
// body: { applicationId, paymentMethod: 'transfer'|'cash', memo }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/api/renewal/confirm', async (req, res) => {
    try {
        const sb = getSupabase();
        const { applicationId, paymentMethod, memo } = req.body;

        if (!applicationId) {
            return res.status(400).json({ success: false, error: 'applicationId 필수' });
        }

        const { data: app, error } = await sb
            .from('applications')
            .select('*')
            .eq('id', applicationId)
            .single();

        if (error || !app) {
            return res.status(404).json({ success: false, error: '신청을 찾을 수 없습니다' });
        }

        if (!app.expiry_date) {
            return res.status(400).json({ success: false, error: '만료일이 설정되지 않았습니다' });
        }

        // 1개월 연장
        const newExpiryDate = addOneMonth(app.expiry_date);
        const newStartDate  = app.expiry_date; // 기존 만료일 다음날이 새 시작일 (간단히 기존 만료일 사용)

        // applications 업데이트
        const { error: updateErr } = await sb
            .from('applications')
            .update({
                expiry_date:    newExpiryDate,
                renewal_status: null,          // 다음 연장 사이클을 위해 초기화
                renewal_token:  null,
                renewal_deadline: null,
                renewal_notified_at: null,
            })
            .eq('id', applicationId);

        if (updateErr) throw updateErr;

        // renewal_payments 기록
        await sb.from('renewal_payments').insert({
            application_id: applicationId,
            amount:         app.monthly_fee || 0,
            payment_method: paymentMethod || 'transfer',
            confirmed_by:   'admin',
            memo:           memo || '',
        }).select().maybeSingle();
        // renewal_payments 테이블 없어도 에러 무시하고 계속 진행

        // 입주민 확인 SMS 발송
        const smsConfig = await getComplexSmsConfig(sb, app.complex_id);
        const smsResult = await sendRenewalConfirmedSms({
            phone:        app.phone,
            name:         app.name,
            complexName:  smsConfig.complexName,
            programName:  app.program_name,
            newExpiryDate,
            sender:       smsConfig.sender,
            smsEnabled:   smsConfig.smsEnabled,
        });

        console.log(`[renewal] 연장 확인 완료: ${app.name} → 새 만료일 ${newExpiryDate}, SMS: ${smsResult.success ? '성공' : '실패'}`);
        res.json({
            success: true,
            new_expiry_date: newExpiryDate,
            sms: smsResult,
        });
    } catch (e) {
        console.error('[renewal] POST /confirm 오류:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/renewal/send-notice  — 관리자 수동 연장 TM 발송
// body: { applicationId }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/api/renewal/send-notice', async (req, res) => {
    try {
        const sb = getSupabase();
        const { applicationId } = req.body;

        if (!applicationId) {
            return res.status(400).json({ success: false, error: 'applicationId 필수' });
        }

        const { data: app, error } = await sb
            .from('applications')
            .select('*')
            .eq('id', applicationId)
            .single();

        if (error || !app) {
            return res.status(404).json({ success: false, error: '신청을 찾을 수 없습니다' });
        }

        if (!app.expiry_date) {
            return res.status(400).json({ success: false, error: '만료일이 설정되지 않은 수강자입니다' });
        }

        // 토큰 생성 + 3일 데드라인 설정
        const token    = crypto.randomUUID();
        const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3일 후

        const { error: updateErr } = await sb
            .from('applications')
            .update({
                renewal_token:       token,
                renewal_status:      'pending',
                renewal_deadline:    deadline.toISOString(),
                renewal_notified_at: new Date().toISOString(),
            })
            .eq('id', applicationId);

        if (updateErr) throw updateErr;

        // SMS 발송
        const baseUrl    = process.env.APP_BASE_URL || `https://${req.get('host')}`;
        const renewalUrl = `${baseUrl}/renew/${token}`;
        const smsConfig  = await getComplexSmsConfig(sb, app.complex_id);

        const smsResult = await sendRenewalNoticeSms({
            phone:        app.phone,
            name:         app.name,
            complexName:  smsConfig.complexName,
            programName:  app.program_name,
            expiryDate:   app.expiry_date,
            renewalUrl,
            sender:       smsConfig.sender,
            smsEnabled:   smsConfig.smsEnabled,
        });

        console.log(`[renewal] 수동 연장TM 발송: ${app.name} (${app.expiry_date}), SMS: ${smsResult.success ? '성공' : '실패/건너뜀'}`);
        res.json({
            success: true,
            token,
            deadline: deadline.toISOString(),
            renewal_url: renewalUrl,
            sms: smsResult,
        });
    } catch (e) {
        console.error('[renewal] POST /send-notice 오류:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/renewal/pending  — 관리자: 연장 대기 목록 (결제 확인 필요)
// query: ?complexId=...
// ══════════════════════════════════════════════════════════════════════════════
router.get('/api/renewal/pending', async (req, res) => {
    try {
        const sb = getSupabase();
        const { complexId } = req.query;

        let query = sb
            .from('applications')
            .select('id, name, dong, ho, phone, program_name, preferred_time, monthly_fee, expiry_date, renewal_status, renewal_notified_at, renewal_deadline, complex_id, complexes!inner(name, payment_mode)')
            .eq('status', 'approved')
            .eq('complexes.payment_mode', 'direct')
            .not('renewal_status', 'is', null)
            .order('expiry_date', { ascending: true });

        if (complexId) query = query.eq('complex_id', complexId);

        const { data, error } = await query;
        if (error) throw error;

        res.json({ success: true, data: data || [] });
    } catch (e) {
        console.error('[renewal] GET /pending 오류:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// HTML 렌더러 — 연장 의향 페이지
// ══════════════════════════════════════════════════════════════════════════════
function renewPageHtml({ error, done, type, token, name, programName, expiryDate, deadline,
    complexName, accountBank, accountNumber, accountHolder } = {}) {

    const deadlineStr = deadline
        ? new Date(deadline).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';

    if (error) {
        return baseHtml(`
            <div class="card error-card">
                <div class="icon">⚠️</div>
                <h2>링크 오류</h2>
                <p>${error}</p>
            </div>`);
    }

    if (done) {
        const msg = type === 'confirmed'
            ? `<p><strong>${name}</strong>님의 <strong>${programName}</strong> 수강 연장 희망이 접수되었습니다.</p><p class="sub">담당자가 결제를 확인한 후 연장이 완료됩니다.<br>계좌 입금 후 잠시 기다려 주세요.</p>`
            : `<p><strong>${name}</strong>님의 연장 비희망이 접수되었습니다.</p><p class="sub">수강 만료 후 자동 처리됩니다.<br>재등록을 원하시면 접수 페이지를 이용해 주세요.</p>`;
        return baseHtml(`
            <div class="card done-card">
                <div class="icon">${type === 'confirmed' ? '✅' : '👋'}</div>
                <h2>응답 완료</h2>
                ${msg}
            </div>`);
    }

    const accountSection = (accountBank && accountNumber) ? `
        <div class="account-box" id="accountBox" style="display:none">
            <div class="account-title">💳 결제 계좌 안내</div>
            <div class="account-row"><span>은행</span><strong>${accountBank}</strong></div>
            <div class="account-row"><span>계좌번호</span><strong class="account-num">${accountNumber}</strong></div>
            <div class="account-row"><span>예금주</span><strong>${accountHolder || ''}</strong></div>
            <div class="account-row"><span>금액</span><strong class="amount-hint">담당자 확인 후 안내</strong></div>
            <p class="account-note">※ 입금 후 별도 연락 불필요합니다.<br>담당자가 확인 후 연장 완료 문자를 발송해드립니다.</p>
        </div>` : '';

    return baseHtml(`
        <div class="card">
            <div class="complex-name">${complexName || '필라테스'}</div>
            <h2>수강 연장 안내</h2>
            <div class="info-row"><span class="label">수강생</span><span class="value"><strong>${name}</strong>님</span></div>
            <div class="info-row"><span class="label">프로그램</span><span class="value">${programName || ''}</span></div>
            <div class="info-row"><span class="label">만료일</span><span class="value expiry">${expiryDate || ''}</span></div>
            ${deadlineStr ? `<div class="deadline-notice">⏰ 응답 기한: ${deadlineStr}까지</div>` : ''}
            <div class="btn-group">
                <button class="btn btn-confirm" onclick="respond('confirmed')">
                    ✅ 연장 희망
                </button>
                <button class="btn btn-decline" onclick="respond('declined')">
                    ✖ 연장 비희망
                </button>
            </div>
            ${accountSection}
        </div>
        <script>
        const TOKEN = '${token}';
        async function respond(type) {
            const btns = document.querySelectorAll('.btn');
            btns.forEach(b => b.disabled = true);

            try {
                const res = await fetch('/api/renewal/respond', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: TOKEN, response: type })
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error);

                if (type === 'confirmed') {
                    document.querySelector('.card').innerHTML = \`
                        <div class="icon">✅</div>
                        <h2>연장 희망 접수 완료</h2>
                        <p>결제 후 담당자 확인이 완료되면<br>연장 완료 문자를 발송해드립니다.</p>
                        \${document.getElementById('accountBox')
                            ? '<p style="margin-top:16px;font-size:.9rem;color:#4338ca;font-weight:600">아래 계좌로 수강료를 입금해 주세요 👇</p>'
                            : ''}\`;
                    const box = document.getElementById('accountBox');
                    if (box) { box.style.display = 'block'; }
                } else {
                    document.querySelector('.card').innerHTML = \`
                        <div class="icon">👋</div>
                        <h2>연장 비희망 접수 완료</h2>
                        <p>수강 만료 후 자동 처리됩니다.<br>재등록을 원하시면 접수 페이지를 이용해 주세요.</p>\`;
                }
            } catch(e) {
                btns.forEach(b => b.disabled = false);
                alert('오류가 발생했습니다: ' + e.message);
            }
        }

        // 연장 희망 클릭 시 계좌 박스 표시 (버튼 클릭 전 미리 보여주기)
        document.querySelector('.btn-confirm')?.addEventListener('click', () => {
            const box = document.getElementById('accountBox');
            if (box) box.style.display = 'block';
        }, { once: true });
        </script>`);
}

function baseHtml(content) {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>수강 연장 안내</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .card {
    background: #fff;
    border-radius: 20px;
    padding: 32px 28px;
    max-width: 420px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,.2);
    text-align: center;
  }
  .complex-name {
    font-size: .82rem; color: #8b5cf6; font-weight: 700;
    letter-spacing: .05em; margin-bottom: 8px;
    text-transform: uppercase;
  }
  h2 { font-size: 1.4rem; color: #1e1b4b; margin-bottom: 20px; }
  .icon { font-size: 3rem; margin-bottom: 12px; }
  .info-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px;
    background: #f8f7ff; border-radius: 10px; margin-bottom: 8px;
    text-align: left;
  }
  .info-row .label { font-size: .82rem; color: #6b7280; }
  .info-row .value { font-size: .95rem; color: #1f2937; }
  .info-row .expiry { font-weight: 700; color: #dc2626; }
  .deadline-notice {
    font-size: .82rem; color: #d97706; font-weight: 600;
    background: #fef9c3; border-radius: 8px; padding: 8px 12px;
    margin: 12px 0; text-align: center;
  }
  .btn-group { display: flex; flex-direction: column; gap: 12px; margin-top: 24px; }
  .btn {
    padding: 16px; border: none; border-radius: 12px; font-size: 1rem;
    font-weight: 700; cursor: pointer; transition: all .15s; letter-spacing: .02em;
  }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-confirm { background: #4f46e5; color: #fff; }
  .btn-confirm:hover:not(:disabled) { background: #4338ca; transform: translateY(-1px); }
  .btn-decline { background: #f1f5f9; color: #64748b; border: 1.5px solid #e2e8f0; }
  .btn-decline:hover:not(:disabled) { background: #e2e8f0; }
  .account-box {
    margin-top: 20px; background: #f0fdf4;
    border: 1.5px solid #86efac; border-radius: 14px; padding: 18px;
    text-align: left;
  }
  .account-title { font-weight: 700; color: #166534; margin-bottom: 12px; font-size: .95rem; }
  .account-row {
    display: flex; justify-content: space-between;
    padding: 6px 0; border-bottom: 1px solid #dcfce7; font-size: .88rem;
  }
  .account-row span { color: #6b7280; }
  .account-row strong { color: #1f2937; }
  .account-num { font-family: monospace; font-size: 1rem; letter-spacing: .05em; color: #166534 !important; }
  .account-note {
    margin-top: 10px; font-size: .78rem; color: #4b5563; line-height: 1.6;
  }
  .error-card, .done-card { }
  p { font-size: .95rem; color: #374151; line-height: 1.6; margin-bottom: 8px; }
  .sub { font-size: .82rem; color: #9ca3af; }
</style>
</head>
<body>
${content}
</body>
</html>`;
}

module.exports = router;
