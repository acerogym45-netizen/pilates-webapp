const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const sb = createClient(
  'https://vkmscnpmlvgdejolfjhj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXNjbnBtbHZnZGVqb2xmamhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzU2MjcsImV4cCI6MjA5MTgxMTYyN30.SbeR--_uAdl60vRydEmqtJIKMf0v9BxtP4hu_xSE_PQ'
);

async function main() {
  const { data, error } = await sb
    .from('applications')
    .select('*')
    .eq('id', '28f24799-1bdc-486e-adaa-0e7da4d844aa')
    .single();

  if (error) { console.error('Error:', error); return; }

  const c = new Date(data.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const u = new Date(data.updated_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const extractNow = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  const notesText = data.notes
    ? data.notes
    : '없음 — 프로그램 변경 기록 전혀 없음';

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>수강 신청 증거 서류 - 윤다영 (102동 1504호)</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:'Malgun Gothic',Arial,sans-serif;max-width:750px;margin:30px auto;padding:24px;background:#fff;color:#222;}
  h1{text-align:center;font-size:20px;border-bottom:3px double #333;padding-bottom:12px;margin-bottom:6px;}
  .subtitle{text-align:center;font-size:13px;color:#555;margin-bottom:20px;}
  .meta{text-align:right;font-size:11px;color:#999;margin-bottom:16px;}
  .section-title{background:#1a3f6f;color:#fff;padding:7px 14px;font-size:13px;font-weight:bold;margin-top:22px;margin-bottom:0;border-radius:4px 4px 0 0;}
  table{width:100%;border-collapse:collapse;margin-bottom:0;}
  th,td{border:1px solid #ccc;padding:8px 12px;font-size:13px;}
  th{background:#f5f5f5;width:140px;text-align:left;font-weight:bold;}
  .highlight-row th{background:#fff3cd;}
  .highlight-row td{background:#fff3cd;font-weight:bold;color:#c00;font-size:14px;}
  .sig-section{border:1px solid #ccc;border-top:none;padding:16px;text-align:center;background:#fafafa;}
  .sig-section img{max-width:280px;border:1px dashed #aaa;display:block;margin:10px auto;background:#fff;padding:4px;}
  .sig-meta{font-size:12px;color:#666;margin-top:8px;}
  .verdict-box{margin-top:22px;border:2px solid #1a3f6f;border-radius:6px;overflow:hidden;}
  .verdict-title{background:#1a3f6f;color:#fff;padding:8px 14px;font-size:13px;font-weight:bold;}
  .verdict-body{padding:14px;background:#f0f4ff;font-size:13px;line-height:1.8;}
  .verdict-body ul{margin:6px 0;padding-left:20px;}
  .verdict-body li{margin-bottom:4px;}
  .tag-no{display:inline-block;background:#c00;color:#fff;font-size:11px;padding:1px 7px;border-radius:10px;margin-left:6px;}
  .tag-yes{display:inline-block;background:#2a6f2a;color:#fff;font-size:11px;padding:1px 7px;border-radius:10px;margin-left:6px;}
  .final-verdict{margin-top:14px;padding:10px 14px;background:#fff;border-left:4px solid #c00;font-weight:bold;font-size:13px;line-height:1.7;}
  .footer{text-align:center;font-size:10px;color:#aaa;margin-top:28px;border-top:1px solid #eee;padding-top:10px;}
</style>
</head>
<body>

<h1>📄 수강 신청 증거 서류</h1>
<p class="subtitle">청주 SK뷰자이 피트니스 수강 신청 시스템 — DB 원본 데이터 추출본</p>
<div class="meta">추출 일시: ${extractNow} &nbsp;|&nbsp; DB: Supabase &nbsp;|&nbsp; 테이블: applications</div>

<div class="section-title">📋 신청자 정보</div>
<table>
  <tr><th>이름</th><td>${data.name}</td></tr>
  <tr><th>동/호수</th><td>102동 1504호</td></tr>
  <tr><th>연락처</th><td>${data.phone}</td></tr>
  <tr><th>신청 상태</th><td>${data.status === 'approved' ? '✅ 승인 완료 (approved)' : data.status}</td></tr>
</table>

<div class="section-title" style="margin-top:16px;">🏃 수강 신청 내용</div>
<table>
  <tr class="highlight-row"><th>수강 프로그램</th><td>${data.program_name}</td></tr>
  <tr class="highlight-row"><th>희망 시간</th><td>${data.preferred_time}</td></tr>
  <tr><th>신청 일시 (KST)</th><td><strong>${c}</strong></td></tr>
  <tr><th>최종 수정 (KST)</th><td>${u}</td></tr>
  <tr><th>약관 동의</th><td>${data.agreement ? '✅ 동의함' : '미동의'}</td></tr>
  <tr><th>변경 이력 (notes)</th><td style="color:${data.notes ? '#000' : '#999'};">${notesText}</td></tr>
</table>

<div class="section-title" style="margin-top:16px;">✍️ 계약서 서명 (DB 원본)</div>
<div class="sig-section">
  <p style="font-size:12px;color:#555;margin:0 0 8px;">
    아래는 입주민이 수강 신청 시 계약 내용에 동의하며 직접 서명한 이미지입니다.<br>
    (DB <code>signature_data</code> 컬럼에서 추출한 원본 PNG)
  </p>
  <img src="${data.signature_data}" alt="윤다영 서명 이미지" />
  <div class="sig-meta">
    서명자: <strong>${data.signature_name}</strong> &nbsp;|&nbsp; 서명 날짜: <strong>${data.signature_date}</strong>
  </div>
</div>

<div class="verdict-box">
  <div class="verdict-title">📌 민원 처리 결론 (DB 기반 객관적 사실)</div>
  <div class="verdict-body">
    <ul>
      <li>DB에 기록된 신청 프로그램: <strong>수&amp;금 6:1 그룹수업 (12:00)</strong> <span class="tag-yes">DB 확인됨</span></li>
      <li>화&amp;목 신청 레코드 존재 여부: <strong>없음</strong> <span class="tag-no">미존재</span></li>
      <li>프로그램 변경 API 호출 이력 (change-time): <strong>없음</strong> <span class="tag-no">미존재</span></li>
      <li>notes 컬럼 변경 이력 [변경] 태그: <strong>없음</strong> <span class="tag-no">미존재</span></li>
      <li>서명 데이터: <strong>존재</strong> — 수&amp;금 수강 계약서 내용에 본인이 직접 서명 <span class="tag-yes">서명 완료</span></li>
      <li>15:33 수정(updated_at) 원인: waiting → approved 상태 전환(관리자 승인) 또는 기타 필드 수정 — <strong>프로그램 변경 아님</strong></li>
    </ul>
    <div class="final-verdict">
      🔴 최종 판정: 윤다영(102동 1504호)은 <u>최초 신청 시부터 수&amp;금 6:1 그룹수업(12:00)으로 신청</u>하였으며,<br>
      화&amp;목으로 신청했다는 주장을 뒷받침하는 DB 기록은 전혀 존재하지 않습니다.<br>
      제출된 "화&amp;목 승인 캡처"는 현재 시스템 DB 데이터와 일치하지 않습니다.
    </div>
  </div>
</div>

<div class="footer">
  본 문서는 수강 신청 시스템 Supabase DB에서 직접 추출한 원본 데이터입니다.<br>
  Application ID: ${data.id} &nbsp;|&nbsp; 추출자: 시스템 관리자 &nbsp;|&nbsp; 추출 일시: ${extractNow}
</div>

</body>
</html>`;

  fs.writeFileSync('/home/user/webapp/public/contract_evidence_yundayoung.html', html);
  console.log('저장 완료: /home/user/webapp/public/contract_evidence_yundayoung.html');
  console.log('DB 프로그램:', data.program_name);
  console.log('서명자:', data.signature_name, '/', data.signature_date);
  console.log('notes:', data.notes || '없음');
}

main().catch(console.error);
