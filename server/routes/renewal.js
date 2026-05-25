/**
 * 수강 연장 자동화 라우터
 *
 * GET  /renew/:token           — 입주민용 연장 의향 페이지 (공개)
 * POST /api/renewal/respond    — 입주민 연장 희망/비희망 응답
 * POST /api/renewal/confirm    — 관리자 결제 확인 → 연장 처리
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

        if (app.renewal_deadline && new Date() > new Date(app.renewal_deadline)) {
            return res.status(400).json({ success: false, error: '응답 기한이 지났습니다' });
        }

        if (app.renewal_status && app.renewal_status !== 'pending') {
            return res.status(400).json({ success: false, error: '이미 응답이 완료된 요청입니다' });
        }

        const { error: updateErr } = await sb
            .from('applications')
            .update({ renewal_status: response })
            .eq('id', app.id);

        if (updateErr) throw updateErr;

        console.log(`[renewal] ${app.name} 연장 응답: ${response} (app_id=${app.id})`);
        res.json({ success: true, response });
    } catch (e) {
        console.error('[renewal] POST /respond 오류:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/renewal/confirm  — 관리자 결제 확인 → 연장 처리
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

        const newExpiryDate = addOneMonth(app.expiry_date);

        const { error: updateErr } = await sb
            .from('applications')
            .update({
                expiry_date:         newExpiryDate,
                renewal_status:      null,
                renewal_token:       null,
                renewal_deadline:    null,
                renewal_notified_at: null,
            })
            .eq('id', applicationId);

        if (updateErr) throw updateErr;

        await sb.from('renewal_payments').insert({
            application_id: applicationId,
            amount:         app.monthly_fee || 0,
            payment_method: paymentMethod || 'transfer',
            confirmed_by:   'admin',
            memo:           memo || '',
        }).select().maybeSingle();

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

        console.log(`[renewal] 연장 확인 완료: ${app.name} → 새 만료일 ${newExpiryDate}`);
        res.json({ success: true, new_expiry_date: newExpiryDate, sms: smsResult });
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

        const token    = crypto.randomUUID();
        const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

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
        res.json({ success: true, token, deadline: deadline.toISOString(), renewal_url: renewalUrl, sms: smsResult });
    } catch (e) {
        console.error('[renewal] POST /send-notice 오류:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/renewal/pending  — 관리자: 연장 대기 목록
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
        ? new Date(deadline).toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul',
            month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : '';

    // ── 오류 페이지 ──────────────────────────────────────────────────────────
    if (error) {
        return baseHtml(`
            <div class="card">
                <div class="status-icon error-icon">⚠</div>
                <h2 class="card-title">링크 오류</h2>
                <p class="card-desc">${error}</p>
            </div>`);
    }

    // ── 이미 응답 완료 페이지 ────────────────────────────────────────────────
    if (done) {
        if (type === 'confirmed') {
            return baseHtml(`
                <div class="card">
                    <div class="status-icon confirmed-icon">✓</div>
                    <h2 class="card-title">연장 희망 접수 완료</h2>
                    <p class="card-desc">결제 후 담당자 확인이 완료되면<br>연장 완료 문자를 발송해드립니다.</p>
                </div>`);
        } else {
            return baseHtml(`
                <div class="card">
                    <div class="status-icon declined-icon">✕</div>
                    <h2 class="card-title">연장 비희망 접수 완료</h2>
                    <p class="card-desc">수강 만료 후 자동 처리됩니다.<br>재등록을 원하시면 접수 페이지를 이용해 주세요.</p>
                </div>`);
        }
    }

    // ── 계좌 안내 섹션 (연장 희망 클릭 후 항상 노출) ────────────────────────
    const hasAccount = accountBank && accountNumber;
    const accountHtml = hasAccount ? `
        <div class="account-box" id="accountBox">
            <div class="account-header">
                <span class="account-icon">🏦</span>
                <span class="account-title">수강료 입금 안내</span>
            </div>
            <div class="account-row">
                <span class="account-label">은행</span>
                <span class="account-value">${accountBank}</span>
            </div>
            <div class="account-row">
                <span class="account-label">계좌번호</span>
                <span class="account-value account-num">${accountNumber}</span>
            </div>
            ${accountHolder ? `
            <div class="account-row">
                <span class="account-label">예금주</span>
                <span class="account-value">${accountHolder}</span>
            </div>` : ''}
            <p class="account-note">입금 후 별도 연락 불필요합니다.<br>담당자 확인 후 연장 완료 문자를 발송해드립니다.</p>
        </div>` : '';

    // ── 연장 의향 선택 메인 페이지 ──────────────────────────────────────────
    return baseHtml(`
        <div class="card" id="mainCard">
            <div class="complex-badge">${complexName || '수강 연장 안내'}</div>
            <h1 class="page-title">수강 연장 안내</h1>

            <div class="info-table">
                <div class="info-row">
                    <span class="info-label">수강생</span>
                    <span class="info-value"><strong>${name}</strong>님</span>
                </div>
                <div class="info-row">
                    <span class="info-label">프로그램</span>
                    <span class="info-value">${programName || ''}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">만료일</span>
                    <span class="info-value expiry-date">${expiryDate || ''}</span>
                </div>
            </div>

            ${deadlineStr ? `
            <div class="deadline-badge">
                <span class="deadline-clock">⏱</span>
                응답 기한: ${deadlineStr}까지
            </div>` : ''}

            <div class="btn-group" id="btnGroup">
                <button class="btn btn-confirm" id="btnConfirm" onclick="respond('confirmed')">
                    ✓&ensp;연장 희망
                </button>
                <button class="btn btn-decline" id="btnDecline" onclick="respond('declined')">
                    ✕&ensp;연장 비희망
                </button>
            </div>
        </div>

        <!-- 계좌 안내 카드 — 연장 희망 클릭 후 노출 -->
        ${hasAccount ? `<div class="account-card hidden" id="accountCard">${accountHtml}</div>` : ''}

        <!-- 완료 카드 — API 성공 후 mainCard 교체 -->
        <div class="card hidden" id="doneCard"></div>

        <script>
        const TOKEN = '${token}';
        const HAS_ACCOUNT = ${hasAccount ? 'true' : 'false'};

        async function respond(type) {
            const btnConfirm = document.getElementById('btnConfirm');
            const btnDecline = document.getElementById('btnDecline');
            btnConfirm.disabled = true;
            btnDecline.disabled = true;

            // 연장 희망: 계좌 카드 먼저 펼쳐두기 (API 응답 전에 표시)
            if (type === 'confirmed' && HAS_ACCOUNT) {
                const ac = document.getElementById('accountCard');
                if (ac) ac.classList.remove('hidden');
            }

            try {
                const res = await fetch('/api/renewal/respond', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: TOKEN, response: type })
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error);

                // 메인 카드를 완료 메시지로 교체
                const mainCard  = document.getElementById('mainCard');
                const doneCard  = document.getElementById('doneCard');

                if (type === 'confirmed') {
                    doneCard.innerHTML = \`
                        <div class="status-icon confirmed-icon">✓</div>
                        <h2 class="card-title">연장 희망 접수 완료</h2>
                        <p class="card-desc">결제 후 담당자 확인이 완료되면<br>연장 완료 문자를 발송해드립니다.\${HAS_ACCOUNT ? '<br><span class="account-hint">아래 계좌로 수강료를 입금해 주세요.</span>' : ''}</p>
                    \`;
                } else {
                    doneCard.innerHTML = \`
                        <div class="status-icon declined-icon">✕</div>
                        <h2 class="card-title">연장 비희망 접수 완료</h2>
                        <p class="card-desc">수강 만료 후 자동 처리됩니다.<br>재등록을 원하시면 접수 페이지를 이용해 주세요.</p>
                    \`;
                }

                mainCard.classList.add('hidden');
                doneCard.classList.remove('hidden');

            } catch(e) {
                btnConfirm.disabled = false;
                btnDecline.disabled = false;
                if (type === 'confirmed' && HAS_ACCOUNT) {
                    const ac = document.getElementById('accountCard');
                    if (ac) ac.classList.add('hidden');
                }
                alert('오류가 발생했습니다: ' + e.message);
            }
        }
        </script>`);
}

// ══════════════════════════════════════════════════════════════════════════════
// 공통 HTML 레이아웃 — 베이지/브라운/골드 프리미엄 디자인
// ══════════════════════════════════════════════════════════════════════════════
function baseHtml(content) {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>수강 연장 안내</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
    background: #1a1208;
    background-image:
      radial-gradient(ellipse at 20% 20%, rgba(180,140,80,0.18) 0%, transparent 55%),
      radial-gradient(ellipse at 80% 80%, rgba(120,80,40,0.22) 0%, transparent 55%);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px 40px;
    gap: 14px;
  }

  /* ── 메인 카드 ───────────────────────────────────────────── */
  .card {
    background: linear-gradient(160deg, #fdf8f0 0%, #f5ead8 100%);
    border-radius: 22px;
    padding: 32px 26px 28px;
    max-width: 400px;
    width: 100%;
    box-shadow:
      0 2px 0 rgba(200,160,80,0.35),
      0 12px 48px rgba(30,15,0,0.45),
      inset 0 1px 0 rgba(255,255,255,0.8);
    border: 1px solid rgba(200,160,80,0.3);
    position: relative;
    overflow: hidden;
  }
  .card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, #c8a050, #e8c870, #c8a050);
    border-radius: 22px 22px 0 0;
  }

  /* ── 단지명 배지 ─────────────────────────────────────────── */
  .complex-badge {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #9a7230;
    background: rgba(200,160,80,0.12);
    border: 1px solid rgba(200,160,80,0.3);
    border-radius: 20px;
    padding: 4px 12px;
    margin-bottom: 14px;
    text-transform: uppercase;
  }

  /* ── 페이지 타이틀 ───────────────────────────────────────── */
  .page-title {
    font-size: 1.45rem;
    font-weight: 800;
    color: #2c1a08;
    letter-spacing: -0.02em;
    margin-bottom: 22px;
    line-height: 1.3;
  }

  /* ── 정보 테이블 ─────────────────────────────────────────── */
  .info-table {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255,255,255,0.55);
    border: 1px solid rgba(200,160,80,0.18);
    border-radius: 10px;
    padding: 10px 14px;
  }
  .info-label {
    font-size: 0.8rem;
    color: #8b6a3a;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .info-value {
    font-size: 0.92rem;
    color: #2c1a08;
    font-weight: 500;
  }
  .info-value strong { font-weight: 700; }
  .expiry-date {
    font-weight: 800;
    color: #b84040;
    font-size: 1rem;
    letter-spacing: 0.02em;
  }

  /* ── 응답 기한 배지 ──────────────────────────────────────── */
  .deadline-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #8b5e20;
    background: rgba(200,160,80,0.12);
    border: 1px solid rgba(200,160,80,0.25);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 22px;
  }
  .deadline-clock { font-size: 1rem; }

  /* ── 버튼 그룹 ───────────────────────────────────────────── */
  .btn-group {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .btn {
    width: 100%;
    padding: 16px 20px;
    border: none;
    border-radius: 13px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.03em;
    transition: transform 0.12s, box-shadow 0.12s, opacity 0.12s;
    position: relative;
    overflow: hidden;
  }
  .btn:active:not(:disabled) { transform: scale(0.97); }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }

  .btn-confirm {
    background: linear-gradient(135deg, #3d2a0e 0%, #5c3f18 100%);
    color: #f0d88a;
    box-shadow: 0 4px 18px rgba(60,35,10,0.4), inset 0 1px 0 rgba(255,220,120,0.2);
    border: 1px solid rgba(200,160,80,0.4);
  }
  .btn-confirm::after {
    content: '';
    position: absolute;
    top: 0; left: -100%; width: 60%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,220,100,0.08), transparent);
    transition: left 0.4s;
  }
  .btn-confirm:hover:not(:disabled)::after { left: 150%; }
  .btn-confirm:hover:not(:disabled) {
    box-shadow: 0 6px 24px rgba(60,35,10,0.5), inset 0 1px 0 rgba(255,220,120,0.25);
  }

  .btn-decline {
    background: rgba(255,255,255,0.45);
    color: #6b5030;
    border: 1.5px solid rgba(160,120,60,0.25);
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }
  .btn-decline:hover:not(:disabled) {
    background: rgba(255,255,255,0.65);
  }

  /* ── 계좌 카드 ───────────────────────────────────────────── */
  .account-card {
    background: linear-gradient(160deg, #fdf8f0 0%, #f5ead8 100%);
    border-radius: 18px;
    max-width: 400px;
    width: 100%;
    box-shadow:
      0 2px 0 rgba(200,160,80,0.3),
      0 8px 32px rgba(30,15,0,0.35),
      inset 0 1px 0 rgba(255,255,255,0.7);
    border: 1px solid rgba(200,160,80,0.28);
    overflow: hidden;
    animation: slideDown 0.3s ease;
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .account-box { padding: 22px 22px 18px; }
  .account-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(200,160,80,0.2);
  }
  .account-icon { font-size: 1.1rem; }
  .account-title {
    font-size: 0.88rem;
    font-weight: 700;
    color: #7a5520;
    letter-spacing: 0.03em;
  }
  .account-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid rgba(200,160,80,0.1);
  }
  .account-row:last-of-type { border-bottom: none; }
  .account-label {
    font-size: 0.78rem;
    color: #9a7240;
    font-weight: 600;
  }
  .account-value {
    font-size: 0.9rem;
    color: #2c1a08;
    font-weight: 600;
  }
  .account-num {
    font-family: 'SF Mono', 'Menlo', monospace;
    font-size: 1rem;
    letter-spacing: 0.06em;
    color: #7a4a10;
  }
  .account-note {
    margin-top: 14px;
    font-size: 0.76rem;
    color: #8b6a3a;
    line-height: 1.65;
    padding: 10px 12px;
    background: rgba(200,160,80,0.08);
    border-radius: 8px;
  }
  .account-hint {
    display: block;
    margin-top: 6px;
    font-size: 0.82rem;
    color: #7a5520;
    font-weight: 600;
  }

  /* ── 상태 아이콘 (완료/오류 페이지) ─────────────────────── */
  .status-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.8rem;
    font-weight: 900;
    margin: 0 auto 18px;
  }
  .confirmed-icon {
    background: linear-gradient(135deg, #3d2a0e, #6a4020);
    color: #f0d88a;
    box-shadow: 0 4px 16px rgba(60,35,10,0.35);
  }
  .declined-icon {
    background: rgba(200,160,80,0.12);
    color: #7a5030;
    border: 2px solid rgba(200,160,80,0.25);
  }
  .error-icon {
    background: rgba(180,60,40,0.1);
    color: #b84040;
    border: 2px solid rgba(180,60,40,0.2);
  }

  /* ── 카드 타이틀 / 설명 (완료 페이지) ───────────────────── */
  .card-title {
    font-size: 1.25rem;
    font-weight: 800;
    color: #2c1a08;
    letter-spacing: -0.02em;
    margin-bottom: 10px;
    text-align: center;
  }
  .card-desc {
    font-size: 0.88rem;
    color: #6b5030;
    line-height: 1.7;
    text-align: center;
  }

  /* ── 유틸 ────────────────────────────────────────────────── */
  .hidden { display: none !important; }
</style>
</head>
<body>
${content}
</body>
</html>`;
}

module.exports = router;
