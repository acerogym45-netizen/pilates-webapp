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

        if (app.renewal_deadline && new Date() > new Date(app.renewal_deadline)) {
            return res.send(renewPageHtml({ error: '연장 응답 기한이 지났습니다.', name: app.name }));
        }

        if (app.renewal_status === 'confirmed') {
            return res.send(renewPageHtml({ done: true, type: 'confirmed', name: app.name, programName: app.program_name }));
        }
        if (app.renewal_status === 'declined') {
            return res.send(renewPageHtml({ done: true, type: 'declined', name: app.name }));
        }

        const { data: cx } = await sb
            .from('complexes')
            .select('name, renewal_account_bank, renewal_account_number, renewal_account_holder')
            .eq('id', app.complex_id)
            .single();

        return res.send(renewPageHtml({
            token,
            name:          app.name,
            programName:   app.program_name,
            expiryDate:    app.expiry_date,
            deadline:      app.renewal_deadline,
            complexName:   cx?.name || '',
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
// POST /api/renewal/respond
// ══════════════════════════════════════════════════════════════════════════════
router.post('/api/renewal/respond', async (req, res) => {
    try {
        const sb = getSupabase();
        const { token, response } = req.body;

        if (!token || !['confirmed', 'declined'].includes(response)) {
            return res.status(400).json({ success: false, error: '잘못된 요청입니다' });
        }

        const { data: app, error } = await sb
            .from('applications').select('*').eq('renewal_token', token).single();

        if (error || !app) return res.status(404).json({ success: false, error: '유효하지 않은 토큰입니다' });
        if (app.renewal_deadline && new Date() > new Date(app.renewal_deadline))
            return res.status(400).json({ success: false, error: '응답 기한이 지났습니다' });
        if (app.renewal_status && app.renewal_status !== 'pending')
            return res.status(400).json({ success: false, error: '이미 응답이 완료된 요청입니다' });

        const { error: updateErr } = await sb
            .from('applications').update({ renewal_status: response }).eq('id', app.id);
        if (updateErr) throw updateErr;

        console.log(`[renewal] ${app.name} 연장 응답: ${response}`);
        res.json({ success: true, response });
    } catch (e) {
        console.error('[renewal] POST /respond 오류:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/renewal/confirm
// ══════════════════════════════════════════════════════════════════════════════
router.post('/api/renewal/confirm', async (req, res) => {
    try {
        const sb = getSupabase();
        const { applicationId, paymentMethod, memo } = req.body;

        if (!applicationId) return res.status(400).json({ success: false, error: 'applicationId 필수' });

        const { data: app, error } = await sb
            .from('applications').select('*').eq('id', applicationId).single();
        if (error || !app) return res.status(404).json({ success: false, error: '신청을 찾을 수 없습니다' });
        if (!app.expiry_date) return res.status(400).json({ success: false, error: '만료일이 설정되지 않았습니다' });

        const newExpiryDate = addOneMonth(app.expiry_date);

        const { error: updateErr } = await sb.from('applications').update({
            expiry_date: newExpiryDate,
            renewal_status: null, renewal_token: null,
            renewal_deadline: null, renewal_notified_at: null,
        }).eq('id', applicationId);
        if (updateErr) throw updateErr;

        await sb.from('renewal_payments').insert({
            application_id: applicationId,
            amount: app.monthly_fee || 0,
            payment_method: paymentMethod || 'transfer',
            confirmed_by: 'admin',
            memo: memo || '',
        }).select().maybeSingle();

        const smsConfig = await getComplexSmsConfig(sb, app.complex_id);
        const smsResult = await sendRenewalConfirmedSms({
            phone: app.phone, name: app.name,
            complexName: smsConfig.complexName, programName: app.program_name,
            newExpiryDate, sender: smsConfig.sender, smsEnabled: smsConfig.smsEnabled,
        });

        res.json({ success: true, new_expiry_date: newExpiryDate, sms: smsResult });
    } catch (e) {
        console.error('[renewal] POST /confirm 오류:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/renewal/send-notice
// ══════════════════════════════════════════════════════════════════════════════
router.post('/api/renewal/send-notice', async (req, res) => {
    try {
        const sb = getSupabase();
        const { applicationId } = req.body;

        if (!applicationId) return res.status(400).json({ success: false, error: 'applicationId 필수' });

        const { data: app, error } = await sb
            .from('applications').select('*').eq('id', applicationId).single();
        if (error || !app) return res.status(404).json({ success: false, error: '신청을 찾을 수 없습니다' });
        if (!app.expiry_date) return res.status(400).json({ success: false, error: '만료일이 설정되지 않은 수강자입니다' });

        const token    = crypto.randomUUID();
        const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

        const { error: updateErr } = await sb.from('applications').update({
            renewal_token: token, renewal_status: 'pending',
            renewal_deadline: deadline.toISOString(),
            renewal_notified_at: new Date().toISOString(),
        }).eq('id', applicationId);
        if (updateErr) throw updateErr;

        const baseUrl    = process.env.APP_BASE_URL || `https://${req.get('host')}`;
        const renewalUrl = `${baseUrl}/renew/${token}`;
        const smsConfig  = await getComplexSmsConfig(sb, app.complex_id);

        const smsResult = await sendRenewalNoticeSms({
            phone: app.phone, name: app.name,
            complexName: smsConfig.complexName, programName: app.program_name,
            expiryDate: app.expiry_date, renewalUrl,
            sender: smsConfig.sender, smsEnabled: smsConfig.smsEnabled,
        });

        res.json({ success: true, token, deadline: deadline.toISOString(), renewal_url: renewalUrl, sms: smsResult });
    } catch (e) {
        console.error('[renewal] POST /send-notice 오류:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/renewal/pending
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
// HTML 렌더러
// ══════════════════════════════════════════════════════════════════════════════
function renewPageHtml({ error, done, type, token, name, programName, expiryDate, deadline,
    complexName, accountBank, accountNumber, accountHolder } = {}) {

    const deadlineStr = deadline
        ? new Date(deadline).toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : '';

    // ── 오류 상태 ──────────────────────────────────────────────────────────────
    if (error) {
        return baseHtml(`
            <div class="scene">
                <div class="wordmark">${complexName ? escXml(complexName) : 'PILATES'}</div>
                <div class="card">
                    <div class="status-wrap">
                        <div class="status-ring ring-warn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 9v4m0 4h.01"/>
                                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                            </svg>
                        </div>
                        <p class="status-label">안내</p>
                        <p class="status-sub">${escXml(error)}</p>
                    </div>
                </div>
            </div>`);
    }

    // ── 완료 상태 ──────────────────────────────────────────────────────────────
    if (done) {
        if (type === 'confirmed') {
            return baseHtml(`
                <div class="scene">
                    <div class="wordmark">${complexName ? escXml(complexName) : 'PILATES'}</div>
                    <div class="card">
                        <div class="status-wrap">
                            <div class="status-ring ring-confirm">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                            <p class="status-label">연장 희망 접수 완료</p>
                            <p class="status-sub">결제 후 담당자 확인이 완료되면<br>연장 완료 문자를 발송해드립니다.</p>
                        </div>
                    </div>
                </div>`);
        } else {
            return baseHtml(`
                <div class="scene">
                    <div class="wordmark">${complexName ? escXml(complexName) : 'PILATES'}</div>
                    <div class="card">
                        <div class="status-wrap">
                            <div class="status-ring ring-decline">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </div>
                            <p class="status-label">비희망 접수 완료</p>
                            <p class="status-sub">수강 만료 후 자동 처리됩니다.<br>재등록을 원하시면 접수 페이지를 이용해 주세요.</p>
                        </div>
                    </div>
                </div>`);
        }
    }

    // ── 메인 응답 페이지 ────────────────────────────────────────────────────────
    const hasAccount = !!(accountBank && accountNumber);

    // 날짜 포맷: "2025. 06. 30" → "6월 30일"
    function fmtDate(str) {
        if (!str) return '—';
        const d = new Date(str + 'T00:00:00');
        return `${d.getMonth() + 1}월 ${d.getDate()}일`;
    }

    return baseHtml(`
        <div class="scene" id="scene">

            <!-- 워드마크 -->
            <div class="wordmark">${escXml(complexName) || 'PILATES'}</div>

            <!-- ─── 메인 카드 ─────────────────────────────── -->
            <div class="card" id="mainCard">

                <!-- 헤더 -->
                <div class="card-header">
                    <span class="eyebrow">수강 연장 안내</span>
                    <h1 class="member-name">${escXml(name)}<span class="nim">님</span></h1>
                </div>

                <!-- 프로그램 필 -->
                <div class="prog-pill">
                    <span class="prog-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                            <rect x="3" y="4" width="18" height="18" rx="3"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8"  y1="2" x2="8"  y2="6"/>
                            <line x1="3"  y1="10" x2="21" y2="10"/>
                        </svg>
                    </span>
                    <span class="prog-name">${escXml(programName) || '—'}</span>
                </div>

                <!-- 만료일 블록 -->
                <div class="expiry-block">
                    <span class="expiry-caption">수강 만료일</span>
                    <span class="expiry-date">${fmtDate(expiryDate)}</span>
                </div>

                <!-- 응답 기한 -->
                ${deadlineStr ? `
                <div class="deadline-chip">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chip-icon">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span>${escXml(deadlineStr)}까지 응답</span>
                </div>` : ''}

                <!-- 구분선 -->
                <div class="rule"></div>

                <!-- 버튼 그룹 -->
                <div class="btn-col" id="btnGroup">
                    <button class="btn-yes" id="btnConfirm" onclick="respond('confirmed')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="btn-svg">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        연장 희망
                    </button>
                    <button class="btn-no" id="btnDecline" onclick="respond('declined')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="btn-svg">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        연장 비희망
                    </button>
                </div>
            </div><!-- /mainCard -->

            <!-- ─── 완료 카드 (숨김 → JS로 교체) ──────────── -->
            <div class="card hidden" id="doneCard"></div>

            <!-- ─── 계좌 카드 ─────────────────────────────── -->
            ${hasAccount ? `
            <div class="card account-card hidden" id="accountCard">
                <div class="ac-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="ac-icon">
                        <rect x="2" y="5" width="20" height="14" rx="3"/>
                        <line x1="2" y1="10" x2="22" y2="10"/>
                        <line x1="6" y1="15" x2="10" y2="15"/>
                    </svg>
                    <span>수강료 입금 안내</span>
                </div>
                <dl class="ac-list">
                    <div class="ac-row">
                        <dt>은행</dt>
                        <dd>${escXml(accountBank)}</dd>
                    </div>
                    <div class="ac-row">
                        <dt>계좌번호</dt>
                        <dd class="ac-num">${escXml(accountNumber)}</dd>
                    </div>
                    ${accountHolder ? `<div class="ac-row"><dt>예금주</dt><dd>${escXml(accountHolder)}</dd></div>` : ''}
                </dl>
                <p class="ac-note">
                    입금 후 별도 연락 불필요합니다.<br>
                    담당자 확인 후 연장 완료 문자를 발송해드립니다.
                </p>
            </div>` : ''}

        </div><!-- /scene -->

        <script>
        const TOKEN = '${token}';
        const HAS_ACCOUNT = ${hasAccount};

        async function respond(type) {
            const btnY = document.getElementById('btnConfirm');
            const btnN = document.getElementById('btnDecline');
            btnY.disabled = true;
            btnN.disabled = true;

            // 연장 희망 → 계좌 카드 즉시 노출 (API 대기 전)
            if (type === 'confirmed' && HAS_ACCOUNT) {
                const ac = document.getElementById('accountCard');
                if (ac) { ac.classList.remove('hidden'); ac.classList.add('slide-up'); }
            }

            try {
                const res = await fetch('/api/renewal/respond', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: TOKEN, response: type })
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error);

                const mainCard = document.getElementById('mainCard');
                const doneCard = document.getElementById('doneCard');

                if (type === 'confirmed') {
                    doneCard.innerHTML = \`
                        <div class="status-wrap">
                            <div class="status-ring ring-confirm">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                            <p class="status-label">연장 희망 접수 완료</p>
                            <p class="status-sub">결제 후 담당자 확인이 완료되면<br>연장 완료 문자를 발송해드립니다.\${HAS_ACCOUNT ? '<br><span class="pay-hint">아래 계좌로 수강료를 입금해 주세요.</span>' : ''}</p>
                        </div>\`;
                } else {
                    doneCard.innerHTML = \`
                        <div class="status-wrap">
                            <div class="status-ring ring-decline">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </div>
                            <p class="status-label">비희망 접수 완료</p>
                            <p class="status-sub">수강 만료 후 자동 처리됩니다.<br>재등록을 원하시면 접수 페이지를 이용해 주세요.</p>
                        </div>\`;
                }

                mainCard.classList.add('hidden');
                doneCard.classList.remove('hidden');
                doneCard.classList.add('fade-in');

            } catch(e) {
                btnY.disabled = false;
                btnN.disabled = false;
                // 오류 시 계좌 카드도 다시 숨김
                if (type === 'confirmed' && HAS_ACCOUNT) {
                    const ac = document.getElementById('accountCard');
                    if (ac) { ac.classList.add('hidden'); ac.classList.remove('slide-up'); }
                }
                alert('오류가 발생했습니다: ' + e.message);
            }
        }
        </script>`);
}

// ── XML 특수문자 이스케이프 (HTML 주입 방지) ─────────────────────────────────
function escXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ══════════════════════════════════════════════════════════════════════════════
// 공통 HTML 레이아웃 — 프리미엄 필라테스 디자인 v3
// ══════════════════════════════════════════════════════════════════════════════
function baseHtml(content) {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>수강 연장 안내</title>
<style>
/* ── 리셋 & 변수 ──────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* 팔레트 */
  --bg:         #18130e;          /* 최심부 다크 에스프레소 */
  --surface:    #f9f6f1;          /* 카드 배경 — 따뜻한 화이트 */
  --surface-2:  #f1ece3;          /* 서브 배경 */
  --border:     #e5dfd5;          /* 일반 선 */

  /* 골드 */
  --gold-hi:    #d4a84b;          /* 밝은 골드 (하이라이트) */
  --gold:       #b8933a;          /* 기본 골드 */
  --gold-dim:   rgba(184,147,58,.18);

  /* 텍스트 */
  --ink-h:      #1a1410;          /* 헤딩 */
  --ink:        #3d3028;          /* 본문 */
  --ink-sub:    #8a7a6a;          /* 서브텍스트 */
  --ink-ghost:  #b5a898;          /* 비활성 */

  /* 컬러 포인트 */
  --accent:     #2d2d2d;          /* 주 버튼 배경 */
  --accent-txt: #e8d49a;          /* 주 버튼 텍스트 */
  --red:        #9e4a3a;          /* 만료일 강조 */
}

/* ── 배경 · 레이아웃 ──────────────────────────────────────────── */
html { height: 100%; }
body {
  min-height: 100%;
  font-family: -apple-system, BlinkMacSystemFont,
               'Apple SD Gothic Neo', 'Noto Sans KR', 'Segoe UI', sans-serif;
  background: var(--bg);
  /* 서브틀 노이즈 텍스처 */
  background-image:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(184,147,58,.12) 0%, transparent 70%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='.03'/%3E%3C/svg%3E");
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 20px 64px;
  gap: 0;
}

/* ── Scene 컨테이너 ──────────────────────────────────────────── */
.scene {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
  max-width: 380px;
}

/* ── 워드마크 ─────────────────────────────────────────────────── */
.wordmark {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: var(--gold-hi);
  opacity: .75;
  margin-bottom: 6px;
  /* 양옆 라인 */
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  justify-content: center;
}
.wordmark::before,
.wordmark::after {
  content: '';
  flex: 1;
  max-width: 56px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
  opacity: .55;
}

/* ── 카드 베이스 ─────────────────────────────────────────────── */
.card {
  width: 100%;
  background: var(--surface);
  border-radius: 22px;
  /* 좌우·하단은 매우 얇은 선, 상단은 골드 라인 */
  border: 1px solid var(--border);
  border-top: 2px solid var(--gold);
  box-shadow:
    0 2px 0 rgba(184,147,58,.2),
    0 20px 60px rgba(0,0,0,.55),
    0 4px 12px rgba(0,0,0,.3),
    inset 0 1px 0 rgba(255,255,255,.9);
  overflow: hidden;
}

/* ── 카드 헤더 ───────────────────────────────────────────────── */
.card-header {
  padding: 26px 26px 0;
}
.eyebrow {
  display: block;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 8px;
}
.member-name {
  font-size: 1.85rem;
  font-weight: 800;
  color: var(--ink-h);
  letter-spacing: -0.04em;
  line-height: 1;
}
.nim {
  font-size: 1.05rem;
  font-weight: 400;
  color: var(--ink-sub);
  margin-left: 2px;
  letter-spacing: 0;
}

/* ── 프로그램 필 ─────────────────────────────────────────────── */
.prog-pill {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 18px 26px 0;
  padding: 10px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 50px;
  width: calc(100% - 52px);
}
.prog-icon {
  display: flex;
  align-items: center;
  color: var(--gold);
  flex-shrink: 0;
}
.prog-icon svg { width: 15px; height: 15px; }
.prog-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 만료일 블록 ─────────────────────────────────────────────── */
.expiry-block {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 16px 26px 0;
  padding: 14px 18px;
  background: var(--surface-2);
  border-radius: 14px;
  border: 1px solid var(--border);
}
.expiry-caption {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--ink-sub);
  letter-spacing: 0.06em;
}
.expiry-date {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--red);
  letter-spacing: -0.02em;
}

/* ── 기한 칩 ─────────────────────────────────────────────────── */
.deadline-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 12px 26px 0;
  padding: 9px 13px;
  background: var(--gold-dim);
  border: 1px solid rgba(184,147,58,.25);
  border-radius: 50px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--gold);
  width: calc(100% - 52px);
}
.chip-icon { width: 13px; height: 13px; flex-shrink: 0; }

/* ── 구분선 ─────────────────────────────────────────────────── */
.rule {
  height: 1px;
  background: var(--border);
  margin: 22px 26px 0;
}

/* ── 버튼 열 ─────────────────────────────────────────────────── */
.btn-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 26px 24px;
}
.btn-svg { width: 16px; height: 16px; flex-shrink: 0; }

.btn-yes, .btn-no {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  width: 100%;
  border: none;
  border-radius: 14px;
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  padding: 16px;
  transition: transform .12s, box-shadow .12s, opacity .12s;
  -webkit-tap-highlight-color: transparent;
}
.btn-yes:active:not(:disabled),
.btn-no:active:not(:disabled)  { transform: scale(0.97); }
.btn-yes:disabled,
.btn-no:disabled               { opacity: .45; cursor: not-allowed; }

.btn-yes {
  background: var(--accent);
  color: var(--accent-txt);
  box-shadow: 0 6px 22px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08);
}
.btn-yes:hover:not(:disabled) {
  box-shadow: 0 8px 28px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.1);
}

.btn-no {
  background: transparent;
  color: var(--ink-sub);
  border: 1.5px solid var(--border);
}
.btn-no:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--ink);
}

/* ── 상태 카드 (완료·오류) ───────────────────────────────────── */
.status-wrap {
  padding: 36px 28px 32px;
  text-align: center;
}
.status-ring {
  width: 64px; height: 64px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 20px;
}
.status-ring svg { width: 26px; height: 26px; }

.ring-confirm {
  background: var(--accent);
  color: var(--accent-txt);
  box-shadow: 0 4px 18px rgba(0,0,0,.4);
}
.ring-decline {
  background: var(--surface-2);
  color: var(--ink-ghost);
  border: 2px solid var(--border);
}
.ring-warn {
  background: rgba(158,74,58,.1);
  color: var(--red);
  border: 2px solid rgba(158,74,58,.2);
}

.status-label {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--ink-h);
  letter-spacing: -0.025em;
  margin-bottom: 10px;
}
.status-sub {
  font-size: 0.83rem;
  color: var(--ink-sub);
  line-height: 1.75;
}
.pay-hint {
  display: inline-block;
  margin-top: 8px;
  font-weight: 700;
  color: var(--gold);
  font-size: 0.82rem;
}

/* ── 계좌 카드 ───────────────────────────────────────────────── */
.account-card {
  overflow: visible;
}
.ac-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border);
}
.ac-icon { width: 17px; height: 17px; color: var(--gold); flex-shrink: 0; }
.ac-head span {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-sub);
}

.ac-list {
  list-style: none;
  padding: 6px 22px 0;
}
.ac-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.ac-row:last-child { border-bottom: none; }
.ac-row dt {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--ink-ghost);
  letter-spacing: 0.05em;
}
.ac-row dd {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--ink);
}
.ac-num {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 0.98rem !important;
  letter-spacing: 0.06em;
  color: var(--ink-h) !important;
}

.ac-note {
  margin: 14px 22px 20px;
  padding: 11px 14px;
  background: var(--surface-2);
  border-radius: 10px;
  font-size: 0.73rem;
  color: var(--ink-sub);
  line-height: 1.7;
  border: 1px solid var(--border);
}

/* ── 유틸 ───────────────────────────────────────────────────── */
.hidden { display: none !important; }

.slide-up {
  animation: slideUp .35s cubic-bezier(.16,1,.3,1) both;
}
.fade-in {
  animation: fadeIn .25s ease both;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
</style>
</head>
<body>
${content}
</body>
</html>`;
}

module.exports = router;
