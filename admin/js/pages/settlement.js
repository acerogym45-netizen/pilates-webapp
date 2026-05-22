/** 월별 정산 리포트 - v6.0
 *  엑셀 5시트 출력 (당월/차월 분리):
 *  ── 당월 ──────────────────────────────────────────────
 *    시트1) 📋 정산 내역      (자동연장·중도합류·차월해지·중도해지 / 차월신규 제거)
 *    시트2) 🏠 동호수계        (세대별 월수강료 합산 + 전체합계행 추가)
 *    시트3) ✂️ 중도해지 청구   (billing_amount·위약금·수강료 포함 / 신규)
 *  ── 차월 ──────────────────────────────────────────────
 *    시트4) 📑 수강신청 내역   (차월 수강 예정자 전체 + 프로그램별 소계)
 *    시트5) 🆕 신규접수자      (이번달 승인 = 차월부터 수강 / 신규)
 *
 *  단가: 15,000원/회 (SESSION_FEE — 강사인건비·중도해지 공통)
 */
const settlement = {
    _data:        null,
    _midEdits:    {},   // { cancellation_id: { attended, billing } }
    // 타임별 구조: { program_name: { time_slot: count } }
    _sessionEdits:{},     // 당월 타임별 수업횟수
    _nextSessionEdits:{}, // 차월 타임별 수업횟수
    _bulkItems:   [],
    SESSION_FEE:  15000,
    PENALTY_RATE: 0.10,

    // ══════════════════════════════════════════════════════
    // render
    // ══════════════════════════════════════════════════════
    async render() {
        const now = new Date();
        const yr  = now.getFullYear();
        const mo  = now.getMonth() + 1;
        const defMonth = `${yr}-${String(mo).padStart(2,'0')}`;

        const html = `
        <div style="max-width:1100px;margin:0 auto;padding:0 4px">

          <!-- 헤더 -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px">
            <div>
              <h2 style="margin:0;font-size:1.3rem;font-weight:800;color:#1a252f">
                <i class="fas fa-file-invoice-dollar" style="color:#e67e22;margin-right:6px"></i>월별 정산 리포트
              </h2>
              <div style="font-size:.8rem;color:#888;margin-top:2px">[당월] 정산 내역 · 동호수계 · 중도해지 청구 &nbsp;/&nbsp; [차월] 수강신청 내역 · 신규접수자 → 엑셀 5시트 다운로드</div>
            </div>
          </div>

          <!-- 월 선택 + 조회 -->
          <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:16px 18px;margin-bottom:18px;
                      display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <label style="font-size:.88rem;font-weight:700;color:#444">
              <i class="fas fa-calendar-alt" style="color:#e67e22;margin-right:4px"></i>조회 월
            </label>
            <input type="month" id="settlementMonth" value="${defMonth}"
              style="padding:7px 12px;border:1.5px solid #ddd;border-radius:7px;font-size:.92rem;color:#333;font-weight:600">
            <button onclick="settlement.load()"
              style="padding:8px 22px;background:#e67e22;color:#fff;border:none;border-radius:7px;font-size:.9rem;font-weight:700;cursor:pointer">
              <i class="fas fa-search"></i> 조회
            </button>
            <button id="settlementExcelBtn" onclick="settlement.downloadExcel()" style="display:none;
              padding:8px 22px;background:#27ae60;color:#fff;border:none;border-radius:7px;font-size:.9rem;font-weight:700;cursor:pointer">
              <i class="fas fa-file-excel"></i> 엑셀 다운로드 (5시트)
            </button>
            <button onclick="settlement.toggleSessionPanel()"
              style="padding:8px 18px;background:#f39c12;color:#fff;border:none;border-radius:7px;font-size:.9rem;font-weight:700;cursor:pointer">
              <i class="fas fa-calendar-check"></i> 수업횟수 설정
            </button>
            <button onclick="settlement.openBulkModal()"
              style="padding:8px 18px;background:#8e44ad;color:#fff;border:none;border-radius:7px;font-size:.9rem;font-weight:700;cursor:pointer">
              <i class="fas fa-upload"></i> 해지자 일괄등록
            </button>
          </div>

          <!-- 추가 엑셀 버튼 3개 -->
          <div id="settlementExtraButtons" style="display:none;background:#fff;border:1px solid #e0e0e0;border-radius:10px;
               padding:14px 18px;margin-bottom:18px;display:none;flex-wrap:wrap;gap:10px;align-items:center">
            <span style="font-size:.82rem;font-weight:700;color:#555;margin-right:4px">
              <i class="fas fa-file-download" style="color:#e67e22"></i> 추가 엑셀 출력:
            </span>
            <button onclick="settlement.downloadMgmtOfficeExcel()"
              style="padding:8px 18px;background:#1a5276;color:#fff;border:none;border-radius:7px;
                     font-size:.88rem;font-weight:700;cursor:pointer">
              <i class="fas fa-building"></i> 관리사무실 제출용
            </button>
            <button onclick="settlement.generateOperationBillPdf()"
              style="padding:8px 18px;background:#117a65;color:#fff;border:none;border-radius:7px;
                     font-size:.88rem;font-weight:700;cursor:pointer">
              <i class="fas fa-file-pdf"></i> 운영비 청구서 (PDF)
            </button>
            <button onclick="settlement.downloadInstructorPayrollExcel()"
              style="padding:8px 18px;background:#6e2f8a;color:#fff;border:none;border-radius:7px;
                     font-size:.88rem;font-weight:700;cursor:pointer">
              <i class="fas fa-user-tie"></i> 강사 인건비
            </button>
          </div>

          <!-- 일괄등록 모달 -->
          <div id="bulkCancelModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);
               z-index:9999;overflow-y:auto;padding:20px">
            <div style="max-width:860px;margin:0 auto;background:#fff;border-radius:14px;
                        box-shadow:0 8px 40px rgba(0,0,0,.25);overflow:hidden">
              <div style="background:#8e44ad;color:#fff;padding:16px 22px;
                          display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:1.05rem;font-weight:800">
                  <i class="fas fa-upload" style="margin-right:8px"></i>해지자 일괄등록
                </span>
                <button onclick="settlement.closeBulkModal()"
                  style="background:none;border:none;color:#fff;font-size:1.3rem;cursor:pointer;line-height:1">✕</button>
              </div>
              <div style="padding:20px 22px;border-bottom:1px solid #eee">
                <div style="font-weight:700;font-size:.9rem;color:#555;margin-bottom:12px">
                  <span style="background:#8e44ad;color:#fff;border-radius:50%;width:20px;height:20px;
                    display:inline-flex;align-items:center;justify-content:center;font-size:.75rem;margin-right:6px">1</span>
                  등록 월 선택 &amp; 엑셀 파일 업로드
                </div>
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                  <div>
                    <label style="font-size:.82rem;color:#666;font-weight:600">해지 처리 월</label><br>
                    <input type="month" id="bulkTermMonth"
                      style="margin-top:4px;padding:7px 10px;border:1.5px solid #ddd;border-radius:7px;
                             font-size:.9rem;font-weight:700;color:#333">
                  </div>
                  <div>
                    <label style="font-size:.82rem;color:#666;font-weight:600">
                      엑셀 파일 <span style="font-size:.72rem;font-weight:400;color:#999">(xlsx / cell)</span>
                    </label><br>
                    <input type="file" id="bulkFileInput" accept=".xlsx,.xls,.cell"
                      onchange="settlement.onBulkFileChange(event)"
                      style="margin-top:4px;font-size:.85rem">
                  </div>
                </div>
                <div style="margin-top:10px;padding:10px 14px;background:#f9f0ff;border:1px solid #d8b4fe;
                            border-radius:8px;font-size:.78rem;color:#6b21a8;line-height:1.7">
                  <b>📌 파일 형식 안내</b><br>
                  • 필수 컬럼: <b>동 / 호수 / 이름 / 전화번호 / 프로그램종류</b><br>
                  • 선택 컬럼: <b>구분</b> (중도해지 / 차월해지 등), <b>해지일</b> (YYYY-MM-DD)
                </div>
              </div>
              <div id="bulkPreviewArea" style="padding:20px 22px;border-bottom:1px solid #eee;display:none">
                <div style="font-weight:700;font-size:.9rem;color:#555;margin-bottom:12px">
                  <span style="background:#8e44ad;color:#fff;border-radius:50%;width:20px;height:20px;
                    display:inline-flex;align-items:center;justify-content:center;font-size:.75rem;margin-right:6px">2</span>
                  파싱 결과 미리보기
                </div>
                <div id="bulkPreviewTable"></div>
              </div>
              <div style="padding:16px 22px;display:flex;justify-content:flex-end;gap:10px">
                <button onclick="settlement.closeBulkModal()"
                  style="padding:9px 22px;background:#f0f0f0;border:none;border-radius:7px;
                         font-size:.9rem;font-weight:600;cursor:pointer;color:#555">취소</button>
                <button id="bulkSubmitBtn" onclick="settlement.submitBulk()" style="display:none;
                  padding:9px 22px;background:#8e44ad;color:#fff;border:none;border-radius:7px;
                  font-size:.9rem;font-weight:700;cursor:pointer">
                  <i class="fas fa-check"></i> 확인 등록
                </button>
              </div>
            </div>
          </div>

          <!-- 월별 수업횟수 설정 패널 -->
          <div id="sessionSettingPanel" style="display:none;background:#fff;border:1.5px solid #f39c12;
               border-radius:10px;padding:0;margin-bottom:18px;overflow:hidden">
            <div style="background:#fef9e7;border-bottom:2px solid #f39c12;padding:12px 18px;
                        display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <span style="font-size:.95rem;font-weight:700;color:#7d6608">
                <i class="fas fa-calendar-check" style="color:#f39c12;margin-right:6px"></i>
                월별 수업횟수 설정
                <span style="font-size:.75rem;font-weight:400;color:#aaa;margin-left:8px" id="sessionMonthLabel"></span>
              </span>
              <span style="font-size:.78rem;color:#999">수업횟수 입력 → 저장 시 요금 자동 반영 (회당 15,000원) · 엑셀 시트3 중도해지 청구에도 반영</span>
            </div>
            <div id="sessionSettingBody" style="padding:16px 18px"></div>
          </div>

          <!-- 요약 뱃지 -->
          <div id="settlementSummary" style="display:none;background:#fff;border:1px solid #e0e0e0;
               border-radius:10px;padding:14px 18px;margin-bottom:18px"></div>

          <!-- 결과 영역 -->
          <div id="settlementResult"></div>
        </div>`;

        document.getElementById('pageContent').innerHTML = html;
        await this.load();
    },

    // ══════════════════════════════════════════════════════
    // load
    // ══════════════════════════════════════════════════════
    async load() {
        const monthVal = document.getElementById('settlementMonth')?.value;
        if (!monthVal) return;
        const [yr, mo] = monthVal.split('-').map(Number);

        const resEl    = document.getElementById('settlementResult');
        const sumEl    = document.getElementById('settlementSummary');
        const excelBtn = document.getElementById('settlementExcelBtn');
        if (excelBtn) excelBtn.style.display = 'none';
        if (sumEl)    sumEl.style.display     = 'none';
        const extraBtnsEl = document.getElementById('settlementExtraButtons');
        if (extraBtnsEl) extraBtnsEl.style.display = 'none';
        this._midEdits = {};
        resEl.innerHTML = `<div style="text-align:center;padding:40px;color:#aaa">
          <i class="fas fa-spinner fa-spin fa-2x"></i><br><br>데이터 조회 중...</div>`;

        try {
            const cid = getEffectiveComplexId();
            if (!cid) throw new Error('단지를 선택해주세요');

            const resp = await fetch(`/api/settlement-report?complexId=${cid}&year=${yr}&month=${mo}`);
            const json = await resp.json();
            if (!json.success) throw new Error(json.error);

            this._data = json;

            // 프로그램별 time_slots 보강 (settlement-report에 없으므로 programs API에서 조회)
            try {
                const progRes  = await fetch(`/api/programs?complexId=${cid}`);
                const progJson = await progRes.json();
                const slotsMap = {};
                (progJson.data || []).forEach(p => {
                    if (p.name && !slotsMap[p.name]) {
                        slotsMap[p.name] = Array.isArray(p.time_slots) ? p.time_slots : [];
                    }
                });
                this._data.prog_slots_map = slotsMap;
            } catch(e) {
                this._data.prog_slots_map = {};
            }

            // 중도해지 로컬 상태 초기화
            (json.mid_cancel || []).forEach(r => {
                if (r.id) {
                    this._midEdits[r.id] = {
                        attended: r.attended_sessions ?? '',
                        billing:  r.billing_amount    ?? null,
                    };
                }
            });
            // 월별 수업횟수 로컬 상태 초기화 (당월 + 차월) — 타임별 { prog_name: { time_slot: count } }
            this._sessionEdits     = JSON.parse(JSON.stringify(json.prog_session_map      || {}));
            this._nextSessionEdits = JSON.parse(JSON.stringify(json.next_prog_session_map || {}));

            this._render(json);
            this._renderSessionPanel(json);
            if (excelBtn) excelBtn.style.display = '';
            const extraBtns = document.getElementById('settlementExtraButtons');
            if (extraBtns) extraBtns.style.display = 'flex';

            // 요약 뱃지 (합계액 강조 강화)
            if (sumEl) {
                const s   = json.summary;
                const yr2 = json.year, mo2 = json.month;
                const feeSum = s.settlement_fee_sum ?? s.total_charge ?? 0;
                sumEl.style.display = 'block';
                sumEl.innerHTML =
                    `<span style="font-size:.82rem;color:#555;display:flex;gap:14px;flex-wrap:wrap;align-items:center">
                      <span><i class="fas fa-users" style="color:#2980b9;margin-right:3px"></i>
                        ${yr2}년 ${mo2}월 수강자 <strong style="color:#2980b9">${s.settlement_total_rows ?? s.approved_count}</strong>명</span>
                      <span style="color:#ddd">|</span>
                      <span>해지 <strong style="color:#e74c3c">${s.settlement_cancel_rows ?? (s.mid_cancel_count + s.end_cancel_count)}</strong>명</span>
                      <span style="color:#ddd">|</span>
                      <span>신규 <strong style="color:#27ae60">${s.next_new_count}</strong>명</span>
                      <span style="color:#ddd">|</span>
                      <span style="background:#6f42c1;color:#fff;padding:2px 12px;border-radius:20px;font-weight:800;font-size:.85rem">
                        💰 ${this._fmtFee(feeSum)}</span>
                    </span>`;
            }

            // 조회 완료 후 결과 영역으로 자동 스크롤
            setTimeout(() => {
                const resultEl = document.getElementById('settlementResult');
                if (resultEl) {
                    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 150);
        } catch(e) {
            resEl.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c">
              <i class="fas fa-exclamation-triangle fa-2x"></i><br><br>${e.message}</div>`;
        }
    },

    // ══════════════════════════════════════════════════════
    // _render
    // ══════════════════════════════════════════════════════
    _render(d) {
        const resEl = document.getElementById('settlementResult');
        const yr = d.year, mo = d.month;

        let html = '';

        // ── 1. 정산 내역 (당월 수강생)
        html += this._settlementCard(d);

        // ── 2. 중도해지 특수 카드 (기존 기능 유지)
        html += this._midCancelCard(d.mid_cancel || [], d.summary.mid_cancel_count);

        // ── 3. 차월해지자
        const endCancelInfo = `
          <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
            <div style="font-size:.76rem;color:#7d4f00;line-height:1.8">
              <b>📋 포함 대상</b><br>
              · cancellations 테이블 status = approved + termination_month = <b>이번 달</b><br>
              · termination_date가 <b>이번 달 말일(${d.monthKey ? d.monthKey.replace('-','년 ')+'월 말' : '말일'})</b> 이거나 날짜 미상인 경우
            </div>
            <div style="font-size:.76rem;color:#7d4f00;line-height:1.8;border-left:2px solid #f0a500;padding-left:14px">
              <b>💡 처리 방식</b><br>
              · 이번 달 수강료는 <b>정상 부과</b> (정산 내역 상단에 함께 포함)<br>
              · <b>${d.nextKey ? d.nextKey.replace('-','년 ')+'월' : '다음 달'}</b>부터 수강료 미부과 (관리비 청구 제외 대상)<br>
              · 별도 후처리 불필요 — 다음 달 정산 시 자동으로 제외됨
            </div>
          </div>`;
        // 차월해지자 rows에 "이번달 마지막" 배지 추가
        const endCancelRows = (d.end_cancel || []).map(r => ({
            ...r,
            _last_badge: `<span style="background:#e67e22;color:#fff;font-size:.65rem;
                padding:1px 6px;border-radius:8px;margin-left:4px;white-space:nowrap">
                이번달 마지막</span>`,
        }));
        html += this._sectionCard(
            `<i class="fas fa-calendar-times" style="color:#e67e22"></i> 차월해지자
             <small style="font-weight:400;color:#888;font-size:.8rem">(${d.nextKey} 미부과 대상)</small>`,
            '#e67e22', '#fffaf5',
            endCancelRows, d.summary.end_cancel_count,
            ['dong','ho','name','phone','program_name','termination_date','_last_badge'],
            ['동','호수','이름','연락처','프로그램','해지일',''],
            { _last_badge: v => v || '' },
            endCancelInfo
        );

        // ── 4. 차월신규접수
        const nextNewInfo = `
          <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
            <div style="font-size:.76rem;color:#1a5c35;line-height:1.8">
              <b>📋 포함 대상</b><br>
              · applications 테이블 status = approved<br>
              · approved_at(또는 created_at)이 <b>이번 달(${d.monthKey ? d.monthKey.replace('-','년 ')+'월' : '이번 달'}) 1일 ~ 말일</b> 사이
            </div>
            <div style="font-size:.76rem;color:#1a5c35;line-height:1.8;border-left:2px solid #52be80;padding-left:14px">
              <b>💡 처리 방식</b><br>
              · <b>${d.nextKey ? d.nextKey.replace('-','년 ')+'월' : '다음 달'}부터</b> 수강료 부과 시작<br>
              · 이번 달 수강료 <b>미청구</b> — 위 정산 내역에서 완전 제외됨<br>
              · 위 정산 내역 카드 하단 <b>▼ 신규 수강 예정자</b> 섹션과 동일한 인원
            </div>
          </div>`;
        html += this._sectionCard(
            `<i class="fas fa-user-plus" style="color:#27ae60"></i> 차월신규접수
             <small style="font-weight:400;color:#888;font-size:.8rem">(${d.nextKey}부터 수강 예정)</small>`,
            '#27ae60', '#f0fff4',
            d.next_new || [], d.summary.next_new_count,
            ['dong','ho','name','phone','program_name','preferred_time','monthly_fee'],
            ['동','호수','이름','연락처','프로그램','시간','월수강료'],
            { monthly_fee: v => this._fmtFee(v) },
            nextNewInfo
        );

        resEl.innerHTML = html;
    },

    // ══════════════════════════════════════════════════════
    // 정산 내역 카드
    // ══════════════════════════════════════════════════════
    _settlementCard(d) {
        const rows = d.settlement_rows || [];
        const newRows = d.new_section_rows || [];
        const yr = d.year, mo = d.month;
        const totalRows = rows.length;
        const cancelRows = rows.filter(r => r.is_end_cancel || r.is_mid_cancel).length;

        const badge = `<span style="background:#2980b9;color:#fff;font-size:.72rem;font-weight:700;
          padding:2px 9px;border-radius:20px;margin-left:8px;vertical-align:middle">${totalRows}명</span>`;

        const thStyle = `padding:7px 8px;border:1px solid #ddd;font-size:.78rem;font-weight:700;
          background:#f0f7ff;white-space:nowrap;text-align:center`;

        const thead = `<tr>
          <th style="${thStyle}">동</th>
          <th style="${thStyle}">호수</th>
          <th style="${thStyle}">이름</th>
          <th style="${thStyle}">연락처</th>
          <th style="${thStyle}">프로그램</th>
          <th style="${thStyle}">희망시간</th>
          <th style="${thStyle}">요금</th>
          <th style="${thStyle}">구분</th>
        </tr>`;

        // 프로그램별 그룹핑 (소계용)
        const progOrder = [];
        const progMap = {};
        rows.forEach(r => {
            const p = r.program_name || '미분류';
            if (!progMap[p]) { progMap[p] = []; progOrder.push(p); }
            progMap[p].push(r);
        });

        let tbodyRows = '';
        progOrder.forEach(prog => {
            const items = progMap[prog];
            items.forEach((r, i) => {
                const id = r.id;
                const bgRow = r.is_mid_cancel ? 'background:#fff5f5'
                            : r.is_end_cancel  ? 'background:#fffaf0'
                            : i % 2 ? 'background:#fafafa' : '';
                const tdS = `padding:6px 8px;border:1px solid #eee;font-size:.82rem;text-align:center;${bgRow}`;

                // 구분 배지 (중도합류 분류 제거됨 — 이번달 승인자는 settlement_rows에 미포함)
                let catBadge = '';
                if (r.category === '중도해지') {
                    catBadge = `<span style="background:#e74c3c;color:#fff;font-size:.68rem;padding:2px 7px;border-radius:10px">중도해지</span>`;
                } else if (r.category && r.category.includes('해지')) {
                    catBadge = `<span style="background:#e67e22;color:#fff;font-size:.68rem;padding:2px 7px;border-radius:10px">${r.category}</span>`;
                }

                tbodyRows += `<tr id="app-row-${id}">
                  <td style="${tdS}">${r.dong||''}</td>
                  <td style="${tdS}">${r.ho||''}</td>
                  <td style="${tdS};font-weight:600">${r.name||''}</td>
                  <td style="${tdS}">${r.phone||''}</td>
                  <td style="${tdS};font-size:.78rem">${r.program_name||''}</td>
                  <td style="${tdS}">${r.preferred_time||''}</td>
                  <td style="${tdS}">${r.monthly_fee ? Number(r.monthly_fee).toLocaleString('ko-KR') + '원' : '-'}</td>
                  <td style="${tdS}">${catBadge}</td>
                </tr>`;
            });

            // 소계 행
            const subFeeSum = items.reduce((s, r) => s + (Number(r.monthly_fee) || 0), 0);
            tbodyRows += `<tr style="background:#e8f4fd">
              <td colspan="6" style="padding:5px 8px;border:1px solid #ddd;font-size:.8rem;font-weight:700;color:#1a5276;text-align:right">
                ${prog} 소계</td>
              <td style="padding:5px 8px;border:1px solid #ddd;font-size:.8rem;font-weight:700;color:#1a5276;text-align:center">
                ${subFeeSum.toLocaleString('ko-KR')}원</td>
              <td style="border:1px solid #ddd"></td>
            </tr>`;
        });

        // 합계 행 (강조 강화)
        const totalFeeSum = rows.reduce((s, r) => s + (Number(r.monthly_fee) || 0), 0);
        tbodyRows += `<tr style="background:#1a5276">
          <td colspan="6" style="padding:9px 10px;border:1px solid #0d3349;font-size:.87rem;font-weight:700;color:#aed6f1;text-align:right">
            등록세대 <strong style="color:#fff">${totalRows}</strong>명 &nbsp;/&nbsp; 해지 <strong style="color:#f1948a">${cancelRows}</strong>명</td>
          <td style="padding:9px 10px;border:1px solid #0d3349;font-size:1rem;font-weight:900;color:#fff;text-align:center;
              background:linear-gradient(135deg,#1a5276,#2471a3);letter-spacing:0.5px">
            💰 ${totalFeeSum.toLocaleString('ko-KR')}원</td>
          <td style="border:1px solid #0d3349;background:#1a5276"></td>
        </tr>`;

        // 신규 섹션 (하단)
        let newSectionHtml = '';
        if (newRows.length) {
            const nextLbl = d.nextKey ? d.nextKey.replace('-', '년 ') + '월' : '차월';
            const newThStyle = `padding:7px 8px;border:1px solid #ddd;font-size:.78rem;font-weight:700;
              background:#f0fff4;white-space:nowrap;text-align:center`;
            const newThead = `<tr>
              <th style="${newThStyle}" colspan="8"
                style="background:#27ae60;color:#fff;padding:8px;font-size:.9rem;font-weight:700">
                ▼ ${nextLbl} 신규 수강 예정자 (${newRows.length}명)
              </th>
            </tr>
            <tr>
              <th style="${newThStyle}">동</th>
              <th style="${newThStyle}">호수</th>
              <th style="${newThStyle}">이름</th>
              <th style="${newThStyle}">연락처</th>
              <th style="${newThStyle}">프로그램</th>
              <th style="${newThStyle}">희망시간</th>
              <th style="${newThStyle}">요금</th>
              <th style="${newThStyle}">구분</th>
            </tr>`;

            const newTbody = newRows.map((r, i) => {
                const isDup = r.is_duplicate;
                const bg = isDup ? 'background:#d5f5d0' : (i % 2 ? 'background:#f9fffe' : '');
                const tdS = `padding:6px 8px;border:1px solid #eee;font-size:.82rem;text-align:center;${bg}`;
                const catBadge = isDup
                    ? `<span style="background:#27ae60;color:#fff;font-size:.68rem;padding:2px 7px;border-radius:10px">신규/중복수강</span>`
                    : `<span style="background:#aaa;color:#fff;font-size:.68rem;padding:2px 7px;border-radius:10px">신규</span>`;
                return `<tr>
                  <td style="${tdS}">${r.dong||''}</td>
                  <td style="${tdS}">${r.ho||''}</td>
                  <td style="${tdS};font-weight:600">${r.name||''}</td>
                  <td style="${tdS}">${r.phone||''}</td>
                  <td style="${tdS};font-size:.78rem">${r.program_name||''}</td>
                  <td style="${tdS}">${r.preferred_time||''}</td>
                  <td style="${tdS}">${r.monthly_fee ? Number(r.monthly_fee).toLocaleString('ko-KR') + '원' : '-'}</td>
                  <td style="${tdS}">${catBadge}</td>
                </tr>`;
            }).join('');

            newSectionHtml = `<div style="margin-top:4px;border-top:3px solid #27ae60">
              <table style="width:100%;border-collapse:collapse;min-width:900px">
                <thead>${newThead}</thead>
                <tbody>${newTbody}</tbody>
              </table>
            </div>`;
        }

        const body = rows.length
            ? `<div style="overflow-x:auto">
                 <table style="width:100%;border-collapse:collapse;min-width:900px">
                   <thead>${thead}</thead>
                   <tbody>${tbodyRows}</tbody>
                 </table>
                 ${newSectionHtml}
               </div>`
            : `<div style="text-align:center;padding:32px 22px;color:#bbb;font-size:.9rem">
                 <i class="fas fa-inbox" style="font-size:2rem;margin-bottom:10px;display:block;color:#e0e0e0"></i>
                 이번 달 정산 내역이 없습니다<br>
                 <span style="font-size:.78rem;color:#ccc">조회 월 또는 단지를 확인해주세요</span>
               </div>`;

        return `
        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:18px;overflow:hidden">
          <div style="background:#f0f7ff;border-bottom:2px solid #2980b9;padding:12px 18px;
                      display:flex;align-items:center;flex-wrap:wrap;gap:6px">
            <span style="font-size:.95rem;font-weight:700;color:#222">
              <i class="fas fa-list-alt" style="color:#2980b9"></i> ${yr}년 ${mo}월 정산 내역${badge}
            </span>
            <span style="font-size:.75rem;color:#888;margin-left:8px">월수강료 기준 정산</span>
          </div>
          <div style="background:#eaf4ff;border-bottom:1px solid #c8e0f7;padding:9px 18px;
                      display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
            <div style="font-size:.76rem;color:#1a5276;line-height:1.8">
              <b>📋 포함 대상</b><br>
              · <b>자동연장</b>: 이전 달부터 수강 중 (approved_at &lt; 이번달 1일)<br>
              · <b>차월해지</b>: 이번 달 말일 해지 예정자 (요금은 이번 달까지 부과)<br>
              · <b>중도해지</b>: 이번 달 중간 해지자 (요금은 아래 중도해지 섹션에서 별도 계산)
            </div>
            <div style="font-size:.76rem;color:#1a5276;line-height:1.8;border-left:2px solid #aad4f5;padding-left:14px">
              <b>⚠️ 제외 대상</b><br>
              · status = cancelled (접수기간 중 신청 취소자)<br>
              · <b>이번 달 신규 승인자</b> → 아래 <b>▼ 신규 수강 예정자</b> 섹션에만 표시<br>
              · 하단 신규 섹션은 <b>다음 달부터</b> 수강료 부과 대상 (이번 달 미청구)
            </div>
          </div>
          ${body}
        </div>`;
    },

    // ══════════════════════════════════════════════════════
    // 월별 수업횟수 설정 패널 (방안 B)
    // ══════════════════════════════════════════════════════

    toggleSessionPanel() {
        const panel = document.getElementById('sessionSettingPanel');
        if (!panel) return;
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        if (isHidden && this._data) {
            this._renderSessionPanel(this._data);
        }
    },

    _renderSessionPanel(d) {
        const body  = document.getElementById('sessionSettingBody');
        const label = document.getElementById('sessionMonthLabel');
        if (!body) return;

        const monthVal = document.getElementById('settlementMonth')?.value || '';
        if (label) label.textContent = monthVal ? `(${monthVal})` : '';

        let nextMonthVal = '';
        if (monthVal) {
            const [y, m] = monthVal.split('-').map(Number);
            const nm = m === 12 ? 1 : m + 1;
            const ny = m === 12 ? y + 1 : y;
            nextMonthVal = `${ny}-${String(nm).padStart(2,'0')}`;
        }

        // 프로그램 목록: prog_id_map 기반, time_slots는 API로 별도 로드
        const progIdMap   = d.prog_id_map || {};
        const progNames   = Object.keys(progIdMap);
        if (!progNames.length) {
            body.innerHTML = `<div style="color:#aaa;font-size:.9rem;padding:10px 0">등록된 프로그램이 없습니다.</div>`;
            return;
        }

        // 프로그램별 time_slots 정보 (settlement-report API에서 받아온 raw_progs 활용)
        // 없으면 빈 배열 → 슬롯 없는 경우(_total 방식)로 처리
        const progSlotsMap = d.prog_slots_map || {};  // { program_name: ["09:00","10:00",...] }

        const rows = progNames.map(name => {
            const progId   = progIdMap[name];
            const slots    = progSlotsMap[name] || [];
            const curMap   = this._sessionEdits[name]     || {};
            const nextMap  = this._nextSessionEdits[name] || {};

            // 타임별 입력 행 생성
            const makeSlotInputs = (which, map) => {
                const color   = which === 'cur' ? '#e67e22' : '#27ae60';
                const border  = which === 'cur' ? '#f39c12' : '#27ae60';
                const bg      = which === 'cur' ? '#fff8ed' : '#f0f9f4';
                const txtColor= which === 'cur' ? '#7d5a00' : '#1a5c35';

                if (!slots.length) {
                    // 타임 없는 프로그램 → _total 단일 입력
                    const val = map['_total'] ?? '';
                    return `<div style="display:flex;align-items:center;gap:6px;background:${bg};
                                border:1px solid ${border};border-radius:7px;padding:5px 10px;flex-wrap:wrap">
                      <span style="font-size:.72rem;font-weight:600;color:${color};min-width:40px">전체</span>
                      <input type="number" min="0" max="99" value="${val}"
                        id="sess-${which}-${progId}-_total"
                        oninput="settlement._onSlotChange('${progId}','${name}','_total','${which}')"
                        style="width:55px;padding:3px 6px;border:1.5px solid ${border};border-radius:5px;
                               font-size:.9rem;text-align:center;font-weight:700;color:${txtColor}">
                      <span style="font-size:.72rem;color:#aaa">회</span>
                    </div>`;
                }

                return `<div style="display:flex;flex-wrap:wrap;gap:4px;background:${bg};
                            border:1px solid ${border};border-radius:7px;padding:6px 10px">
                    ${slots.map(slot => {
                        const safeId = slot.replace(':','');
                        const val = map[slot] ?? '';
                        return `<div style="display:flex;align-items:center;gap:3px">
                          <span style="font-size:.72rem;font-weight:700;color:${color};min-width:36px">${slot}</span>
                          <input type="number" min="0" max="99" value="${val}"
                            id="sess-${which}-${progId}-${safeId}"
                            oninput="settlement._onSlotChange('${progId}','${name}','${slot}','${which}')"
                            style="width:48px;padding:3px 5px;border:1.5px solid ${border};border-radius:5px;
                                   font-size:.88rem;text-align:center;font-weight:700;color:${txtColor}">
                          <span style="font-size:.68rem;color:#bbb;margin-right:6px">회</span>
                        </div>`;
                    }).join('')}
                </div>`;
            };

            // 당월·차월 합계 표시용 함수
            const sumMap = (map) => Object.values(map).reduce((a,b) => a + (Number(b)||0), 0);
            const curTotal  = sumMap(curMap);
            const nextTotal = sumMap(nextMap);

            return `
            <div style="padding:10px 0;border-bottom:1px solid #f3e8cc">
              <div style="font-size:.88rem;font-weight:700;color:#1a252f;margin-bottom:8px">
                ${name}
                <span id="sess-cur-total-${progId}" style="font-size:.75rem;font-weight:400;color:#e67e22;margin-left:8px">
                  당월 합계: ${curTotal}회 (${(curTotal*15000).toLocaleString('ko-KR')}원)
                </span>
                <span id="sess-next-total-${progId}" style="font-size:.75rem;font-weight:400;color:#27ae60;margin-left:8px">
                  차월 합계: ${nextTotal}회 (${(nextTotal*15000).toLocaleString('ko-KR')}원)
                </span>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <div style="display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap">
                  <span style="font-size:.72rem;font-weight:700;color:#e67e22;padding-top:8px;min-width:32px">당월</span>
                  ${makeSlotInputs('cur', curMap)}
                </div>
                <div style="display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap">
                  <span style="font-size:.72rem;font-weight:700;color:#27ae60;padding-top:8px;min-width:32px">차월</span>
                  ${makeSlotInputs('next', nextMap)}
                </div>
              </div>
            </div>`;
        }).join('');

        body.innerHTML = `
          <div style="font-size:.82rem;color:#888;margin-bottom:14px;line-height:1.6">
            <i class="fas fa-info-circle" style="color:#f39c12;margin-right:4px"></i>
            타임별로 수업횟수를 입력하세요. <b>당월</b> 합계 → 정산 요금 반영 / <b>차월</b> 합계 → 수강신청 내역 요금 반영
          </div>
          ${rows}
          <div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">
            <button onclick="settlement.saveSessionCounts()"
              style="padding:8px 24px;background:#f39c12;color:#fff;border:none;border-radius:7px;
                     font-size:.9rem;font-weight:700;cursor:pointer">
              <i class="fas fa-save"></i> 저장
            </button>
            <button onclick="settlement.toggleSessionPanel()"
              style="padding:8px 18px;background:#f0f0f0;border:none;border-radius:7px;
                     font-size:.88rem;font-weight:600;cursor:pointer;color:#555">
              닫기
            </button>
          </div>`;
    },

    // 타임별 입력 변경 핸들러
    _onSlotChange(progId, progName, slot, which) {
        const safeId  = slot.replace(':','');
        const inputId = `sess-${which}-${progId}-${safeId}`;
        const input   = document.getElementById(inputId);
        if (!input) return;
        const cnt = Number(input.value) || 0;

        // 로컬 상태 업데이트 { program_name: { time_slot: count } }
        const map = which === 'cur' ? this._sessionEdits : this._nextSessionEdits;
        if (!map[progName]) map[progName] = {};
        map[progName][slot] = cnt;

        // 합계 표시 업데이트
        const totalId = `sess-${which}-total-${progId}`;
        const totalEl = document.getElementById(totalId);
        if (totalEl) {
            const total = Object.values(map[progName]).reduce((a,b) => a + (Number(b)||0), 0);
            const label = which === 'cur' ? '당월' : '차월';
            const color = which === 'cur' ? '#e67e22' : '#27ae60';
            totalEl.innerHTML = `<span style="color:${color}">${label} 합계: ${total}회 (${(total*15000).toLocaleString('ko-KR')}원)</span>`;
        }
    },

    async saveSessionCounts() {
        const cid = getEffectiveComplexId();
        if (!cid) { showToast('단지를 선택해주세요', 'error'); return; }
        const monthVal = document.getElementById('settlementMonth')?.value;
        if (!monthVal) { showToast('조회 월을 선택해주세요', 'error'); return; }

        const [y, m] = monthVal.split('-').map(Number);
        const nm = m === 12 ? 1 : m + 1;
        const ny = m === 12 ? y + 1 : y;
        const nextMonthVal = `${ny}-${String(nm).padStart(2,'0')}`;

        const progIdMap = this._data?.prog_id_map || {};

        // 타임별 slot_counts 방식으로 세션 배열 생성
        const buildSessions = (editMap) => {
            const sessions = [];
            Object.entries(progIdMap).forEach(([name, pid]) => {
                const slotMap = editMap[name];
                if (!slotMap || typeof slotMap !== 'object') return;
                // 값이 있는 슬롯만
                const slot_counts = {};
                Object.entries(slotMap).forEach(([slot, cnt]) => {
                    if (cnt !== '' && cnt !== undefined && Number(cnt) >= 0) {
                        slot_counts[slot] = Number(cnt);
                    }
                });
                if (Object.keys(slot_counts).length > 0) {
                    sessions.push({ program_id: pid, slot_counts });
                }
            });
            return sessions;
        };

        const curSessions  = buildSessions(this._sessionEdits);
        const nextSessions = buildSessions(this._nextSessionEdits);

        if (!curSessions.length && !nextSessions.length) {
            showToast('저장할 수업횟수가 없습니다', 'error'); return;
        }

        try {
            if (curSessions.length) {
                const res  = await fetch('/api/program-monthly-sessions', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ complex_id: cid, yearMonth: monthVal, sessions: curSessions }),
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error || '당월 저장 실패');
            }
            if (nextSessions.length) {
                const res2  = await fetch('/api/program-monthly-sessions', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ complex_id: cid, yearMonth: nextMonthVal, sessions: nextSessions }),
                });
                const json2 = await res2.json();
                if (!json2.success) throw new Error(json2.error || '차월 저장 실패');
            }

            showToast(`✅ 저장 완료 (당월 ${curSessions.length}개 / 차월 ${nextSessions.length}개 프로그램)`, 'success');
            const panel = document.getElementById('sessionSettingPanel');
            if (panel) panel.style.display = 'none';
            await this.load();
        } catch(e) {
            showToast('저장 오류: ' + e.message, 'error');
            console.error(e);
        }
    },

    // DB 마이그레이션 SQL 안내 모달
    _showMigrationModal(sql, message) {
        // 기존 모달 제거
        const old = document.getElementById('migrationModal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'migrationModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
        modal.innerHTML = `
          <div style="background:#fff;border-radius:14px;max-width:680px;width:100%;
                      box-shadow:0 8px 40px rgba(0,0,0,.3);overflow:hidden">
            <div style="background:#e67e22;color:#fff;padding:16px 22px;
                        display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:1rem;font-weight:800">
                <i class="fas fa-database" style="margin-right:8px"></i>DB 테이블 초기 설정 필요
              </span>
              <button onclick="document.getElementById('migrationModal').remove()"
                style="background:none;border:none;color:#fff;font-size:1.3rem;cursor:pointer">✕</button>
            </div>
            <div style="padding:20px 22px">
              <div style="background:#fff9e6;border:1px solid #f39c12;border-radius:8px;
                          padding:12px 14px;font-size:.85rem;color:#7d5a00;margin-bottom:16px">
                <b>📌 안내:</b> <code>program_monthly_sessions</code> 테이블이 아직 생성되지 않았습니다.<br>
                아래 SQL을 <b>Supabase Dashboard → SQL Editor</b>에서 한 번만 실행하면 됩니다.
              </div>
              <div style="position:relative">
                <pre id="migrationSql" style="background:#1e1e2e;color:#cdd6f4;padding:14px 16px;
                     border-radius:8px;font-size:.78rem;overflow-x:auto;line-height:1.6;
                     max-height:240px;overflow-y:auto;white-space:pre-wrap">${sql.trim()}</pre>
                <button onclick="settlement._copySql()"
                  style="position:absolute;top:8px;right:8px;padding:4px 12px;background:#f39c12;
                         color:#fff;border:none;border-radius:5px;font-size:.75rem;font-weight:700;
                         cursor:pointer" id="copySqlBtn">
                  <i class="fas fa-copy"></i> 복사
                </button>
              </div>
            </div>
            <div style="padding:12px 22px;border-top:1px solid #eee;display:flex;
                        justify-content:flex-end;gap:10px">
              <a href="https://supabase.com/dashboard/project/vkmscnpmlvgdejolfjhj/sql/new"
                 target="_blank"
                 style="padding:8px 18px;background:#3ecf8e;color:#fff;text-decoration:none;
                        border-radius:7px;font-size:.88rem;font-weight:700">
                <i class="fas fa-external-link-alt"></i> Supabase SQL Editor 열기
              </a>
              <button onclick="document.getElementById('migrationModal').remove()"
                style="padding:8px 18px;background:#f0f0f0;border:none;border-radius:7px;
                       font-size:.88rem;font-weight:600;cursor:pointer;color:#555">닫기</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
    },

    _copySql() {
        const el = document.getElementById('migrationSql');
        if (!el) return;
        navigator.clipboard.writeText(el.textContent).then(() => {
            const btn = document.getElementById('copySqlBtn');
            if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> 복사됨'; btn.style.background = '#27ae60'; }
            setTimeout(() => {
                if (btn) { btn.innerHTML = '<i class="fas fa-copy"></i> 복사'; btn.style.background = '#f39c12'; }
            }, 2000);
        }).catch(() => showToast('클립보드 복사 실패. 직접 선택해서 복사하세요.', 'error'));
    },

    // ══════════════════════════════════════════════════════
    // 중도해지 특수 카드 (기존 기능 유지)
    // ══════════════════════════════════════════════════════
    _midCancelCard(rows, count) {
        const badge = `<span style="background:#e74c3c;color:#fff;font-size:.72rem;font-weight:700;
          padding:2px 9px;border-radius:20px;margin-left:8px;vertical-align:middle">${count}건</span>`;
        const formula = `<span style="font-size:.75rem;color:#c0392b;margin-left:12px;font-weight:400">
          청구 = <b>위약금</b>(월수강료×10%) + <b>수강료</b>(횟수×15,000원)
        </span>`;

        let body = '';
        if (!rows.length) {
            body = `<div style="text-align:center;padding:24px 22px;color:#bbb;font-size:.88rem">
              <i class="fas fa-check-circle" style="font-size:1.3rem;margin-bottom:8px;display:block;color:#d5d5d5"></i>
              이번 달 중도해지자 없음</div>`;
        } else {
            const thStyle = `padding:7px 8px;border:1px solid #ddd;font-size:.78rem;font-weight:700;
              background:#f7f7f7;white-space:nowrap;text-align:center`;
            const thead = `<tr>
              <th style="${thStyle}">동</th><th style="${thStyle}">호수</th>
              <th style="${thStyle}">이름</th><th style="${thStyle}">연락처</th>
              <th style="${thStyle}">프로그램</th><th style="${thStyle}">해지일</th>
              <th style="${thStyle}">월수강료</th>
              <th style="${thStyle}">수강횟수<br><span style="font-weight:400;font-size:.7rem;color:#e74c3c">직접 입력</span></th>
              <th style="${thStyle}">위약금<br><span style="font-weight:400;font-size:.7rem">×10%</span></th>
              <th style="${thStyle}">수강료<br><span style="font-weight:400;font-size:.7rem">×15,000</span></th>
              <th style="${thStyle}">총청구금액</th>
              <th style="${thStyle}">저장</th>
            </tr>`;

            const tbodyRows = rows.map((r, i) => {
                const id      = r.id || `idx_${i}`;
                const hasFee  = r.monthly_fee !== null && r.monthly_fee !== undefined && Number(r.monthly_fee) > 0;
                const initFee = hasFee ? Number(r.monthly_fee) : (this._midEdits[id]?.fee || '');
                const savedAtt = this._midEdits[id]?.attended ?? (r.attended_sessions !== null ? r.attended_sessions : '');
                const savedFee = this._midEdits[id]?.fee ?? initFee;
                if (!this._midEdits[id]) this._midEdits[id] = { attended: savedAtt, fee: initFee };
                else {
                    if (this._midEdits[id].fee === undefined) this._midEdits[id].fee = initFee;
                    if (this._midEdits[id].attended === undefined) this._midEdits[id].attended = savedAtt;
                }
                const calc = (savedAtt !== '' && savedFee !== '') ? this._calcBilling(savedFee, savedAtt) : null;
                const bgRow = i % 2 ? 'background:#fafafa' : '';
                const tdS = `padding:6px 8px;border:1px solid #eee;font-size:.82rem;text-align:center;${bgRow}`;
                const feeCell = hasFee
                    ? `<span style="color:#2980b9;font-weight:700">${Number(r.monthly_fee).toLocaleString('ko-KR')}원</span>`
                    : `<input type="number" min="0" step="1000" id="fee-${id}" value="${savedFee}"
                         oninput="settlement._onFeeChange('${id}')" placeholder="직접 입력"
                         style="width:80px;padding:4px 6px;border:1.5px solid #2980b9;border-radius:5px;
                                font-size:.82rem;text-align:right;color:#2980b9;font-weight:700">
                       <span style="font-size:.7rem;color:#999">원</span>`;

                return `<tr id="mid-row-${id}">
                  <td style="${tdS}">${r.dong||''}</td><td style="${tdS}">${r.ho||''}</td>
                  <td style="${tdS};font-weight:600">${r.name||''}</td>
                  <td style="${tdS}">${r.phone||''}</td>
                  <td style="${tdS}">${r.program_name||''}</td>
                  <td style="${tdS}">${r.termination_date||''}</td>
                  <td style="${tdS}" id="fee-cell-${id}">${feeCell}</td>
                  <td style="${tdS}">
                    <input type="number" min="0" max="99" id="att-${id}" value="${savedAtt}"
                      oninput="settlement._onAttendChange('${id}')"
                      style="width:60px;padding:4px 6px;border:1.5px solid #e74c3c;border-radius:5px;
                             font-size:.88rem;text-align:center;font-weight:700;color:#c0392b">
                    <span style="font-size:.72rem;color:#999">회</span>
                  </td>
                  <td style="${tdS}" id="penalty-${id}">
                    ${calc ? `<span style="color:#e67e22;font-weight:600">${calc.penalty.toLocaleString('ko-KR')}원</span>` : '<span style="color:#ccc">-</span>'}
                  </td>
                  <td style="${tdS}" id="course-${id}">
                    ${calc ? `<span style="color:#2980b9;font-weight:600">${calc.courseFee.toLocaleString('ko-KR')}원</span>` : '<span style="color:#ccc">-</span>'}
                  </td>
                  <td style="${tdS}" id="total-${id}">
                    ${calc ? `<span style="color:#e74c3c;font-weight:700;font-size:.9rem">${calc.total.toLocaleString('ko-KR')}원</span>` : '<span style="color:#ccc">-</span>'}
                  </td>
                  <td style="${tdS}">
                    <button onclick="settlement._saveMidBilling('${id}')" id="save-btn-${id}"
                      style="padding:4px 12px;background:#e74c3c;color:#fff;border:none;
                             border-radius:5px;font-size:.78rem;font-weight:700;cursor:pointer;white-space:nowrap">
                      <i class="fas fa-save"></i> 저장
                    </button>
                  </td>
                </tr>`;
            }).join('');

            body = `<div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;min-width:820px">
                <thead>${thead}</thead><tbody>${tbodyRows}</tbody>
              </table></div>`;
        }
        return `
        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:18px;overflow:hidden">
          <div style="background:#fff5f5;border-bottom:2px solid #e74c3c;padding:12px 18px;
                      display:flex;align-items:center;flex-wrap:wrap;gap:6px">
            <span style="font-size:.95rem;font-weight:700;color:#222">
              <i class="fas fa-cut" style="color:#e74c3c"></i> 중도해지자${badge}
              <small style="font-weight:400;color:#888;font-size:.8rem;margin-left:6px">(관리비 후청구)</small>
            </span>${formula}
          </div>
          <div style="background:#fff0f0;border-bottom:1px solid #f5c6c6;padding:9px 18px;
                      display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
            <div style="font-size:.76rem;color:#7b241c;line-height:1.8">
              <b>📋 포함 대상</b><br>
              · cancellations 테이블 status = approved + termination_month = <b>이번 달</b><br>
              · termination_date가 <b>이번 달 말일 미만</b>인 경우 (월 중간 해지)
            </div>
            <div style="font-size:.76rem;color:#7b241c;line-height:1.8;border-left:2px solid #f5b7b1;padding-left:14px">
              <b>💡 처리 방식</b><br>
              · 정산 내역 상단에도 <b>중도해지</b> 구분으로 함께 표시됨<br>
              · 요금은 정액 부과 없이 <b>관리비 후청구</b> (수강횟수 직접 입력 후 저장)<br>
              · 청구액 = 위약금(월수강료 × 10%) + 수강료(출석횟수 × 15,000원)
            </div>
          </div>${body}
        </div>`;
    },

    _calcBilling(monthlyFee, attended) {
        const fee     = Number(monthlyFee) || 0;
        const cnt     = Number(attended)   || 0;
        const penalty = Math.round(fee * this.PENALTY_RATE);
        const courseFee = cnt * this.SESSION_FEE;
        return { penalty, courseFee, total: penalty + courseFee };
    },

    _onFeeChange(id) {
        const feeInput = document.getElementById(`fee-${id}`);
        if (!feeInput) return;
        if (!this._midEdits[id]) this._midEdits[id] = {};
        this._midEdits[id].fee = Number(feeInput.value) || 0;
        this._updateCalcCells(id);
    },

    _onAttendChange(id) {
        const input = document.getElementById(`att-${id}`);
        if (!input) return;
        if (!this._midEdits[id]) this._midEdits[id] = {};
        this._midEdits[id].attended = input.value;
        this._updateCalcCells(id);
    },

    _updateCalcCells(id) {
        const edit     = this._midEdits[id] || {};
        const fee      = Number(edit.fee) || 0;
        const attended = edit.attended;
        const calc     = (attended !== '' && attended !== undefined && fee > 0)
            ? this._calcBilling(fee, attended) : null;
        const penEl    = document.getElementById(`penalty-${id}`);
        const courseEl = document.getElementById(`course-${id}`);
        const totalEl  = document.getElementById(`total-${id}`);
        if (penEl)    penEl.innerHTML    = calc ? `<span style="color:#e67e22;font-weight:600">${calc.penalty.toLocaleString('ko-KR')}원</span>` : '<span style="color:#ccc">-</span>';
        if (courseEl) courseEl.innerHTML = calc ? `<span style="color:#2980b9;font-weight:600">${calc.courseFee.toLocaleString('ko-KR')}원</span>` : '<span style="color:#ccc">-</span>';
        if (totalEl)  totalEl.innerHTML  = calc ? `<span style="color:#e74c3c;font-weight:700;font-size:.9rem">${calc.total.toLocaleString('ko-KR')}원</span>` : '<span style="color:#ccc">-</span>';
    },

    async _saveMidBilling(id) {
        const edit = this._midEdits[id] || {};
        const attInput = document.getElementById(`att-${id}`);
        const attended = parseInt(attInput?.value ?? edit.attended);
        if (isNaN(attended) || attended < 0) { showToast('수강횟수를 올바르게 입력해주세요', 'error'); return; }
        const feeInput   = document.getElementById(`fee-${id}`);
        const monthlyFee = feeInput ? parseInt(feeInput.value) : (Number(edit.fee) || 0);
        if (!monthlyFee || monthlyFee <= 0) { showToast('월수강료를 입력해주세요', 'error'); return; }
        const btn = document.getElementById(`save-btn-${id}`);
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
        try {
            const calc = this._calcBilling(monthlyFee, attended);
            if (id.startsWith('idx_')) throw new Error('저장할 수 없는 레코드입니다 (id 없음)');
            const res = await fetch(`/api/cancellations/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attended_sessions: attended, session_fee: this.SESSION_FEE, billing_amount: calc.total }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || '저장 실패');
            this._midEdits[id] = { attended, fee: monthlyFee, billing: calc.total };
            if (this._data?.mid_cancel) {
                const row = this._data.mid_cancel.find(r => r.id === id);
                if (row) { row.attended_sessions = attended; row.monthly_fee = monthlyFee; row.billing_amount = calc.total; }
            }
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> 저장됨'; btn.style.background = '#27ae60';
                setTimeout(() => { if (btn) { btn.innerHTML = '<i class="fas fa-save"></i> 저장'; btn.style.background = '#e74c3c'; } }, 2000); }
            const name = this._data?.mid_cancel?.find(r => r.id === id)?.name || '';
            showToast(`${name} 저장 완료 (총청구 ${calc.total.toLocaleString('ko-KR')}원)`, 'success');
        } catch(e) {
            showToast('저장 오류: ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
        }
    },

    // ══════════════════════════════════════════════════════
    // 공통 섹션 카드
    // infoHtml: 선택적 설명 박스 HTML (null이면 미표시)
    // ══════════════════════════════════════════════════════
    _sectionCard(title, color, bg, rows, count, cols, labels, fmtMap, infoHtml = null) {
        const badge = `<span style="background:${color};color:#fff;font-size:.72rem;font-weight:700;
          padding:2px 9px;border-radius:20px;margin-left:8px;vertical-align:middle">${count}건</span>`;
        let tableHtml = '';
        if (!rows || !rows.length) {
            tableHtml = `<div style="text-align:center;padding:24px 22px;color:#bbb;font-size:.88rem">
              <i class="fas fa-check-circle" style="font-size:1.3rem;margin-bottom:8px;display:block;color:#d5d5d5"></i>
              해당 없음</div>`;
        } else {
            const thead = labels.map(l =>
                `<th style="padding:7px 8px;border:1px solid #ddd;font-size:.78rem;font-weight:700;
                  background:#f7f7f7;white-space:nowrap;text-align:center">${l}</th>`).join('');
            const tbody = rows.map((r, i) => {
                const tds = cols.map(c => {
                    let v = r[c] ?? '';
                    if (fmtMap[c]) v = fmtMap[c](v);
                    return `<td style="padding:6px 8px;border:1px solid #eee;font-size:.82rem;
                      text-align:center;${i%2?'background:#fafafa':''}">${v}</td>`;
                }).join('');
                return `<tr>${tds}</tr>`;
            }).join('');
            tableHtml = `<div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;min-width:580px">
                <thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody>
              </table></div>`;
        }
        const infoBand = infoHtml
            ? `<div style="border-bottom:1px solid ${color}33;padding:9px 18px;
                           background:${bg};opacity:.95">${infoHtml}</div>`
            : '';
        return `
        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:18px;overflow:hidden">
          <div style="background:${bg};border-bottom:2px solid ${color};padding:12px 18px">
            <span style="font-size:.95rem;font-weight:700;color:#222">${title}${badge}</span>
          </div>${infoBand}${tableHtml}
        </div>`;
    },

    // ══════════════════════════════════════════════════════
    // 엑셀 5시트 다운로드
    //  [당월] 시트1: 정산 내역   시트2: 동호수계   시트3: 중도해지 청구
    //  [차월] 시트4: 수강신청 내역   시트5: 신규접수자
    // ══════════════════════════════════════════════════════
    async downloadExcel() {
        if (!this._data) { showToast('먼저 조회해주세요', 'error'); return; }
        const btn = document.getElementById('settlementExcelBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 생성 중...'; }

        try {
            await this._loadSheetJS();
            const XLSX = window.XLSX;
            const d    = this._data;
            const yr   = d.year;
            const mo   = String(d.month).padStart(2,'0');
            const monthLabel = `${yr}년 ${mo}월`;
            const nextLabel  = d.nextKey ? d.nextKey.replace('-', '년 ') + '월' : '차월';
            const wb   = XLSX.utils.book_new();

            // ── 공통 색상 팔레트 ─────────────────────────────
            const LIGHT_GREEN  = { fgColor: { rgb: 'D5F5D0' } };
            // 당월 계열 (파란색)
            const BLUE_HDR     = { fgColor: { rgb: 'D6EAF8' } };
            const BLUE_SUB     = { fgColor: { rgb: 'E8F4FD' } };
            const BLUE_TOTAL   = { fgColor: { rgb: 'AED6F1' } };
            const RED_HDR      = { fgColor: { rgb: 'FADBD8' } };
            const RED_ROW      = { fgColor: { rgb: 'FFF0F0' } };
            const RED_TOTAL    = { fgColor: { rgb: 'F1948A' } };
            // 차월 계열 (초록색)
            const GREEN_HDR    = { fgColor: { rgb: 'D5F5E3' } };
            const GREEN_SUB    = { fgColor: { rgb: 'E9F7EF' } };
            const GREEN_TOTAL  = { fgColor: { rgb: 'A9DFBF' } };
            const LIME_HDR     = { fgColor: { rgb: 'EAFAF1' } };

            // ── 공통 스타일 헬퍼 ─────────────────────────────
            const applyHdr = (ws, row, cols, fill) => {
                for (let c = 0; c < cols; c++) {
                    const ref = XLSX.utils.encode_cell({ r: row, c });
                    if (!ws[ref]) ws[ref] = { v: '', t: 's' };
                    ws[ref].s = { fill, font: { bold: true }, alignment: { horizontal: 'center' } };
                }
            };
            const applyRow = (ws, row, cols, fill, bold = false) => {
                for (let c = 0; c < cols; c++) {
                    const ref = XLSX.utils.encode_cell({ r: row, c });
                    if (!ws[ref]) ws[ref] = { v: '', t: 's' };
                    if (!ws[ref].s) ws[ref].s = {};
                    ws[ref].s.fill = fill;
                    if (bold) ws[ref].s.font = { bold: true };
                }
            };

            // ═════════════════════════════════════════════
            // 【당월】시트1: 정산 내역
            //  - 자동연장 / 중도합류 / 차월해지 / 중도해지 포함
            //  - 차월 신규 섹션 제거 (→ 시트5로 분리)
            //  - 프로그램별 소계 + 전체 합계
            // ═════════════════════════════════════════════
            const settlementRows = d.settlement_rows || [];
            {
                const s1 = [];
                s1.push([`${monthLabel} 정산 내역`]);
                s1.push([`※ 포함: 자동연장 · 중도합류 · 차월해지(이번달까지 부과) · 중도해지 | 제외: 접수취소(cancelled) · 차월신규(→ 시트5 참조)`]);
                s1.push([]);
                s1.push(['동','호수','이름','전화번호','프로그램','희망시간','월수강료','구분']);

                const progOrder = [], progMap = {};
                settlementRows.forEach(r => {
                    const p = r.program_name || '미분류';
                    if (!progMap[p]) { progMap[p] = []; progOrder.push(p); }
                    progMap[p].push(r);
                });

                let r1 = 4; // 0-based, 데이터 시작 행
                progOrder.forEach(prog => {
                    const items = progMap[prog];
                    items.forEach(r => {
                        s1.push([r.dong, r.ho, r.name, r.phone||'',
                            r.program_name||'', r.preferred_time||'',
                            r.monthly_fee||'', r.category||'']);
                        r1++;
                    });
                    const subFee = items.reduce((s,r) => s+(Number(r.monthly_fee)||0), 0);
                    s1.push(['','','','', prog,'소계', subFee,'']);
                    r1++;
                });

                const totalFee    = settlementRows.reduce((s,r) => s+(Number(r.monthly_fee)||0), 0);
                const cancelCount = settlementRows.filter(r => r.is_end_cancel||r.is_mid_cancel).length;
                s1.push([]);
                s1.push([`등록 ${settlementRows.length}명`,'','',`해지 ${cancelCount}명`,'','', totalFee,'합계']);

                const ws1 = XLSX.utils.aoa_to_sheet(s1);
                ws1['!cols'] = [{wch:6},{wch:7},{wch:10},{wch:14},{wch:22},{wch:10},{wch:12},{wch:18}];
                ws1['!merges'] = [
                    { s:{r:0,c:0}, e:{r:0,c:7} },
                    { s:{r:1,c:0}, e:{r:1,c:7} },
                ];
                // 제목 행
                const titleRef = XLSX.utils.encode_cell({ r:0, c:0 });
                ws1[titleRef].s = { fill: BLUE_HDR, font:{ bold:true, sz:12 }, alignment:{ horizontal:'center' } };
                // 설명 행
                const descRef = XLSX.utils.encode_cell({ r:1, c:0 });
                if (!ws1[descRef]) ws1[descRef] = { v:'', t:'s' };
                ws1[descRef].s = { fill:{ fgColor:{ rgb:'EBF5FB' } }, font:{ italic:true, color:{ rgb:'1A5276' }, sz:8 }, alignment:{ wrapText:true } };
                // 헤더 행
                applyHdr(ws1, 3, 8, BLUE_HDR);
                // 소계·합계 행
                let ri = 4;
                progOrder.forEach(prog => {
                    ri += progMap[prog].length;
                    applyRow(ws1, ri, 8, BLUE_SUB, true);
                    ri++;
                });
                // 합계 행 (빈행 + 합계)
                const totalRowIdx = s1.length - 1;
                applyRow(ws1, totalRowIdx, 8, BLUE_TOTAL, true);

                XLSX.utils.book_append_sheet(wb, ws1, `📋 ${mo}월 정산 내역`);
            }

            // ═════════════════════════════════════════════
            // 【당월】시트2: 동호수계
            //  - 세대별 월수강료 합산 (중도해지자 제외)
            //  - 다인세대: 연두색 + 합계행
            // ═════════════════════════════════════════════
            {
                const s2 = [];
                s2.push([`${monthLabel} 동호수계`]);
                s2.push([`※ 세대별 수강료 합산 | 중도해지자는 관리비 후청구 방식이므로 제외`]);
                s2.push([]);
                s2.push(['동','호수','이름','전화번호','프로그램','희망시간','개별요금','세대합계']);

                const dhRows = d.dongho_settlement_rows || [];
                const s2Info = [];
                let r2 = 4;

                dhRows.forEach(dh => {
                    const items = dh.items;
                    const isMulti = items.length > 1;
                    if (isMulti) {
                        items.forEach(it => {
                            s2.push([dh.dong, dh.ho, it.name, it.phone||'',
                                it.program_name||'', it.preferred_time||'', it.final_charge||'', '']);
                            s2Info.push({ r: r2, isMulti:true, isSum:false });
                            r2++;
                        });
                        const total = items.reduce((s,it) => s+(Number(it.final_charge)||0), 0);
                        s2.push(['','','','','','','', total]);
                        s2Info.push({ r: r2, isMulti:true, isSum:true });
                        r2++;
                    } else {
                        const it = items[0];
                        const fc = Number(it.final_charge)||'';
                        s2.push([dh.dong, dh.ho, it.name, it.phone||'',
                            it.program_name||'', it.preferred_time||'', fc, fc]);
                        s2Info.push({ r: r2, isMulti:false, isSum:false });
                        r2++;
                    }
                });

                // 세대 합계 총액 행
                const grandDh = dhRows.reduce((sum, dh) => {
                    return sum + dh.items.reduce((s,it) => s+(Number(it.final_charge)||0), 0);
                }, 0);
                s2.push([]);
                s2.push(['','','','','','','전체합계', grandDh]);

                const ws2 = XLSX.utils.aoa_to_sheet(s2);
                ws2['!cols'] = [{wch:6},{wch:7},{wch:10},{wch:14},{wch:22},{wch:10},{wch:12},{wch:12}];
                ws2['!merges'] = [
                    { s:{r:0,c:0}, e:{r:0,c:7} },
                    { s:{r:1,c:0}, e:{r:1,c:7} },
                ];
                const t2Ref = XLSX.utils.encode_cell({ r:0, c:0 });
                ws2[t2Ref].s = { fill: BLUE_HDR, font:{ bold:true, sz:12 }, alignment:{ horizontal:'center' } };
                const d2Ref = XLSX.utils.encode_cell({ r:1, c:0 });
                if (!ws2[d2Ref]) ws2[d2Ref] = { v:'', t:'s' };
                ws2[d2Ref].s = { fill:{ fgColor:{ rgb:'EBF5FB' } }, font:{ italic:true, color:{ rgb:'1A5276' }, sz:8 }, alignment:{ wrapText:true } };
                applyHdr(ws2, 3, 8, BLUE_HDR);
                s2Info.forEach(info => {
                    if (!info.isMulti) return;
                    applyRow(ws2, info.r, 8, LIGHT_GREEN, info.isSum);
                });
                // 총합계 행
                applyRow(ws2, s2.length-1, 8, BLUE_TOTAL, true);

                XLSX.utils.book_append_sheet(wb, ws2, `🏠 ${mo}월 동호수계`);
            }

            // ═════════════════════════════════════════════
            // 【당월】시트3: 중도해지 청구 내역  ← 신규
            //  - 월 중간 해지자 (termination_date < 말일)
            //  - 청구액 = 위약금(월수강료×10%) + 수강료(출석횟수×15,000)
            //  - billing_amount 저장된 값 그대로 출력
            // ═════════════════════════════════════════════
            {
                const midRows = d.mid_cancel || [];
                const s3 = [];
                s3.push([`${monthLabel} 중도해지 청구 내역`]);
                s3.push([`※ 관리비 후청구 대상 | 청구액 = 위약금(월수강료×10%) + 수강료(출석횟수×15,000원)`]);
                s3.push([]);
                s3.push(['동','호수','이름','전화번호','프로그램','해지일',
                    '월수강료','수강횟수','위약금(×10%)','수강료(×15,000)','총청구금액','처리상태']);

                let midTotal = 0;
                midRows.forEach(r => {
                    const fee      = Number(r.monthly_fee) || 0;
                    const att      = Number(r.attended_sessions) ?? '';
                    const billing  = Number(r.billing_amount) || null;
                    const penalty  = billing !== null && fee > 0 ? Math.round(fee * 0.1) : '';
                    const courseFee= billing !== null && att !== '' ? att * 15000 : '';
                    const status   = billing !== null ? '저장완료' : '미입력';
                    if (billing) midTotal += billing;
                    s3.push([
                        r.dong, r.ho, r.name, r.phone||'',
                        r.program_name||'', r.termination_date||'',
                        fee||'', att, penalty, courseFee, billing||'', status
                    ]);
                });

                s3.push([]);
                s3.push(['','','','','','','','','','','합계', midTotal||'']);

                const ws3 = XLSX.utils.aoa_to_sheet(s3);
                ws3['!cols'] = [{wch:6},{wch:7},{wch:10},{wch:14},{wch:22},{wch:12},
                    {wch:12},{wch:10},{wch:13},{wch:15},{wch:13},{wch:10}];
                ws3['!merges'] = [
                    { s:{r:0,c:0}, e:{r:0,c:11} },
                    { s:{r:1,c:0}, e:{r:1,c:11} },
                ];
                const t3Ref = XLSX.utils.encode_cell({ r:0, c:0 });
                ws3[t3Ref].s = { fill: RED_HDR, font:{ bold:true, sz:12 }, alignment:{ horizontal:'center' } };
                const d3Ref = XLSX.utils.encode_cell({ r:1, c:0 });
                if (!ws3[d3Ref]) ws3[d3Ref] = { v:'', t:'s' };
                ws3[d3Ref].s = { fill:{ fgColor:{ rgb:'FDF2F0' } }, font:{ italic:true, color:{ rgb:'7B241C' }, sz:8 }, alignment:{ wrapText:true } };
                applyHdr(ws3, 3, 12, RED_HDR);
                // 데이터 행 - 미입력 행 연한 빨강
                midRows.forEach((r, i) => {
                    if (!r.billing_amount) {
                        applyRow(ws3, 4 + i, 12, RED_ROW);
                    }
                });
                // 합계 행
                applyRow(ws3, s3.length-1, 12, RED_TOTAL, true);

                XLSX.utils.book_append_sheet(wb, ws3, `✂️ ${mo}월 중도해지 청구`);
            }

            // ═════════════════════════════════════════════
            // 【차월】시트4: 수강신청 내역
            //  - 차월 수강 예정자 전체 (해지자 제외)
            //  - 프로그램별 소계 + 전체 합계
            // ═════════════════════════════════════════════
            {
                const enrollRows = d.enrollment_rows || [];
                const s4 = [];
                s4.push([`${nextLabel} 수강신청 내역`]);
                s4.push([`※ 차월(${nextLabel}) 수강료 부과 대상 전체 | 차월해지자 · 접수취소자 제외`]);
                s4.push([]);
                s4.push(['동','호수','이름','전화번호','프로그램','희망시간','월수강료']);

                const ep = [], em = {};
                enrollRows.forEach(r => {
                    const p = r.program_name||'미분류';
                    if (!em[p]) { em[p]=[]; ep.push(p); }
                    em[p].push(r);
                });

                let r4 = 4;
                ep.forEach(prog => {
                    const items = em[prog];
                    items.forEach(r => {
                        s4.push([r.dong, r.ho, r.name, r.phone||'',
                            r.program_name||'', r.preferred_time||'', r.monthly_fee||'']);
                        r4++;
                    });
                    const subFee = items.reduce((s,r) => s+(Number(r.monthly_fee)||0), 0);
                    s4.push(['','','','', prog,'소계', subFee]);
                    r4++;
                });

                const totalNext = enrollRows.reduce((s,r) => s+(Number(r.monthly_fee)||0), 0);
                s4.push([]);
                s4.push([`총 ${enrollRows.length}명`,'','','','','', totalNext]);

                const ws4 = XLSX.utils.aoa_to_sheet(s4);
                ws4['!cols'] = [{wch:6},{wch:7},{wch:10},{wch:14},{wch:22},{wch:10},{wch:12}];
                ws4['!merges'] = [
                    { s:{r:0,c:0}, e:{r:0,c:6} },
                    { s:{r:1,c:0}, e:{r:1,c:6} },
                ];
                const t4Ref = XLSX.utils.encode_cell({ r:0, c:0 });
                ws4[t4Ref].s = { fill: GREEN_HDR, font:{ bold:true, sz:12 }, alignment:{ horizontal:'center' } };
                const d4Ref = XLSX.utils.encode_cell({ r:1, c:0 });
                if (!ws4[d4Ref]) ws4[d4Ref] = { v:'', t:'s' };
                ws4[d4Ref].s = { fill:{ fgColor:{ rgb:'EAFAF1' } }, font:{ italic:true, color:{ rgb:'1A5C35' }, sz:8 }, alignment:{ wrapText:true } };
                applyHdr(ws4, 3, 7, GREEN_HDR);
                let ri4 = 4;
                ep.forEach(prog => {
                    ri4 += em[prog].length;
                    applyRow(ws4, ri4, 7, GREEN_SUB, true);
                    ri4++;
                });
                applyRow(ws4, s4.length-1, 7, GREEN_TOTAL, true);

                XLSX.utils.book_append_sheet(wb, ws4, `📑 ${nextLabel} 수강신청`);
            }

            // ═════════════════════════════════════════════
            // 【차월】시트5: 신규접수자  ← 신규
            //  - 이번달 승인 = 차월부터 수강 시작
            //  - 중복수강 여부 표시
            // ═════════════════════════════════════════════
            {
                const newRows = d.next_new || [];
                const s5 = [];
                s5.push([`${nextLabel} 신규접수자`]);
                s5.push([`※ 이번달(${monthLabel}) 신청 승인 → ${nextLabel}부터 수강료 부과 시작 | 중복수강: 기존 수강 중 추가 신청`]);
                s5.push([]);
                s5.push(['동','호수','이름','전화번호','프로그램','희망시간','월수강료','중복수강']);

                newRows.forEach(r => {
                    s5.push([
                        r.dong, r.ho, r.name, r.phone||'',
                        r.program_name||'', r.preferred_time||'',
                        r.monthly_fee||'', r.is_duplicate ? '중복' : ''
                    ]);
                });

                s5.push([]);
                const totalNew = newRows.reduce((s,r) => s+(Number(r.monthly_fee)||0), 0);
                s5.push([`총 ${newRows.length}명`,'','','','','', totalNew,'']);

                const ws5 = XLSX.utils.aoa_to_sheet(s5);
                ws5['!cols'] = [{wch:6},{wch:7},{wch:10},{wch:14},{wch:22},{wch:10},{wch:12},{wch:10}];
                ws5['!merges'] = [
                    { s:{r:0,c:0}, e:{r:0,c:7} },
                    { s:{r:1,c:0}, e:{r:1,c:7} },
                ];
                const t5Ref = XLSX.utils.encode_cell({ r:0, c:0 });
                ws5[t5Ref].s = { fill: LIME_HDR, font:{ bold:true, sz:12 }, alignment:{ horizontal:'center' } };
                const d5Ref = XLSX.utils.encode_cell({ r:1, c:0 });
                if (!ws5[d5Ref]) ws5[d5Ref] = { v:'', t:'s' };
                ws5[d5Ref].s = { fill:{ fgColor:{ rgb:'EAFAF1' } }, font:{ italic:true, color:{ rgb:'1A5C35' }, sz:8 }, alignment:{ wrapText:true } };
                applyHdr(ws5, 3, 8, LIME_HDR);
                // 중복수강 행 연두 강조
                newRows.forEach((r, i) => {
                    if (r.is_duplicate) applyRow(ws5, 4+i, 8, LIGHT_GREEN);
                });
                applyRow(ws5, s5.length-1, 8, GREEN_TOTAL, true);

                XLSX.utils.book_append_sheet(wb, ws5, `🆕 ${nextLabel} 신규접수`);
            }

            // ─────────────────────────────────────────────
            // 파일 저장
            // ─────────────────────────────────────────────
            const complexName = d.complex_name || '';
            const filePrefix  = complexName ? `${complexName}_` : '';
            const fileName = `${filePrefix}${yr}년${mo}월_정산.xlsx`;
            XLSX.writeFile(wb, fileName);
            showToast(`✅ ${fileName} 다운로드 완료 (5시트)`, 'success');

        } catch(e) {
            showToast('엑셀 생성 오류: ' + e.message, 'error');
            console.error(e);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-file-excel"></i> 엑셀 다운로드 (5시트)';
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // 해지자 일괄등록
    // ══════════════════════════════════════════════════════
    openBulkModal() {
        const monthVal = document.getElementById('settlementMonth')?.value || '';
        const tm = document.getElementById('bulkTermMonth');
        if (tm && !tm.value && monthVal) tm.value = monthVal;
        document.getElementById('bulkCancelModal').style.display = 'block';
    },

    closeBulkModal() {
        document.getElementById('bulkCancelModal').style.display = 'none';
        const fi = document.getElementById('bulkFileInput');
        if (fi) fi.value = '';
        document.getElementById('bulkPreviewArea').style.display = 'none';
        const sb = document.getElementById('bulkSubmitBtn');
        if (sb) sb.style.display = 'none';
        this._bulkItems = [];
    },

    async onBulkFileChange(evt) {
        const file = evt.target.files?.[0];
        if (!file) return;
        try {
            await this._loadSheetJS();
            const XLSX = window.XLSX;
            const ab   = await file.arrayBuffer();
            const wb   = XLSX.read(ab, { type: 'array' });
            let wsName = wb.SheetNames[0];
            if (wb.SheetNames.length >= 3) wsName = wb.SheetNames[2];
            const ws   = wb.Sheets[wsName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            this._parseBulkRows(rows);
        } catch(e) {
            showToast('파일 파싱 오류: ' + e.message, 'error');
            console.error(e);
        }
    },

    _parseBulkRows(rows) {
        let headerIdx = -1;
        let colMap    = {};
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const r = rows[i].map(c => String(c).replace(/\s/g,''));
            const dongIdx = r.findIndex(c => c === '동');
            const hoIdx   = r.findIndex(c => c === '호수');
            const nameIdx = r.findIndex(c => c === '이름');
            if (dongIdx >= 0 && hoIdx >= 0 && nameIdx >= 0) {
                headerIdx = i;
                colMap = {
                    dong:    dongIdx, ho: hoIdx, name: nameIdx,
                    phone:   r.findIndex(c => c === '전화번호'),
                    program: r.findIndex(c => c.includes('프로그램')),
                    gubun:   r.findIndex(c => c === '구분'),
                    date:    r.findIndex(c => c === '해지일'),
                };
                break;
            }
        }
        if (headerIdx < 0) { showToast('헤더를 찾을 수 없습니다', 'error'); return; }
        const CANCEL_KEYWORDS = ['해지','중도해지','중도 해지','5월 수강 해지','차월해지'];
        const MID_KEYWORDS    = ['중도해지','중도 해지','중도'];
        const items = [];
        for (let i = headerIdx + 1; i < rows.length; i++) {
            const r    = rows[i];
            const dong = String(r[colMap.dong] ?? '').replace(/동/g,'').trim();
            const ho   = String(r[colMap.ho]   ?? '').replace(/호/g,'').trim();
            const name = String(r[colMap.name] ?? '').trim();
            if (!dong || !ho || !name || dong === '동' || name === '이름') continue;
            const phone   = colMap.phone   >= 0 ? String(r[colMap.phone]   ?? '').trim() : '';
            const program = colMap.program >= 0 ? String(r[colMap.program] ?? '').trim() : '';
            const gubun   = colMap.gubun   >= 0 ? String(r[colMap.gubun]   ?? '').trim() : '';
            const dateRaw = colMap.date    >= 0 ? String(r[colMap.date]    ?? '').trim() : '';
            if (colMap.gubun >= 0 && gubun && !CANCEL_KEYWORDS.some(k => gubun.includes(k))) continue;
            const isMid = MID_KEYWORDS.some(k => gubun.toLowerCase().includes(k.toLowerCase()));
            let termDate = '';
            if (dateRaw && dateRaw !== '' && dateRaw !== '0') {
                const asNum = Number(dateRaw);
                if (!isNaN(asNum) && asNum > 40000) {
                    const d = new Date(Math.round((asNum - 25569) * 86400 * 1000));
                    termDate = d.toISOString().slice(0, 10);
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
                    termDate = dateRaw;
                }
            }
            items.push({ dong, ho, name, phone, program, gubun, termDate, isMid, _selected: true });
        }
        this._bulkItems = items;
        this._renderBulkPreview();
    },

    _renderBulkPreview() {
        const area      = document.getElementById('bulkPreviewArea');
        const tableEl   = document.getElementById('bulkPreviewTable');
        const submitBtn = document.getElementById('bulkSubmitBtn');
        if (!this._bulkItems.length) {
            tableEl.innerHTML = `<div style="color:#e74c3c;padding:12px">파싱된 해지자가 없습니다.</div>`;
            area.style.display = 'block';
            if (submitBtn) submitBtn.style.display = 'none';
            return;
        }
        const midCount = this._bulkItems.filter(i => i.isMid).length;
        const endCount = this._bulkItems.length - midCount;
        const thS = `padding:7px 8px;border:1px solid #ddd;font-size:.75rem;font-weight:700;background:#f7f7f7;white-space:nowrap;text-align:center`;
        const thead = `<tr>
          <th style="${thS}"><input type="checkbox" id="bulkChkAll" checked onchange="settlement.toggleAllBulk(this.checked)"></th>
          <th style="${thS}">동</th><th style="${thS}">호수</th><th style="${thS}">이름</th>
          <th style="${thS}">전화번호</th><th style="${thS}">프로그램</th>
          <th style="${thS}">구분</th><th style="${thS}">해지일</th><th style="${thS}">유형</th>
        </tr>`;
        const tbody = this._bulkItems.map((it, idx) => {
            const tdS = `padding:5px 7px;border:1px solid #eee;font-size:.8rem;text-align:center;${idx%2?'background:#fafafa':''}`;
            const badge = it.isMid
                ? `<span style="background:#e74c3c;color:#fff;font-size:.68rem;padding:1px 7px;border-radius:10px">중도해지</span>`
                : `<span style="background:#e67e22;color:#fff;font-size:.68rem;padding:1px 7px;border-radius:10px">차월해지</span>`;
            return `<tr id="bulk-row-${idx}">
              <td style="${tdS}"><input type="checkbox" ${it._selected?'checked':''} onchange="settlement.toggleBulkRow(${idx},this.checked)"></td>
              <td style="${tdS}">${it.dong}</td><td style="${tdS}">${it.ho}</td>
              <td style="${tdS};font-weight:600">${it.name}</td>
              <td style="${tdS}">${it.phone}</td><td style="${tdS};font-size:.75rem">${it.program}</td>
              <td style="${tdS};font-size:.72rem;color:#777">${it.gubun}</td>
              <td style="${tdS}">${it.termDate||'-'}</td><td style="${tdS}">${badge}</td>
            </tr>`;
        }).join('');
        tableEl.innerHTML = `<div style="margin-bottom:8px;font-size:.82rem;color:#555">
            총 <b>${this._bulkItems.length}</b>건 파싱됨
            (<span style="color:#e74c3c">중도해지 ${midCount}건</span> / <span style="color:#e67e22">차월해지 ${endCount}건</span>)
          </div>
          <div style="overflow-x:auto;max-height:340px;overflow-y:auto">
            <table style="width:100%;border-collapse:collapse;min-width:680px">
              <thead>${thead}</thead><tbody>${tbody}</tbody>
            </table></div>`;
        area.style.display = 'block';
        if (submitBtn) submitBtn.style.display = '';
    },

    toggleAllBulk(checked) {
        this._bulkItems.forEach((it, idx) => {
            it._selected = checked;
            const cb = document.querySelector(`#bulk-row-${idx} input[type=checkbox]`);
            if (cb) cb.checked = checked;
        });
    },

    toggleBulkRow(idx, checked) {
        if (this._bulkItems[idx]) this._bulkItems[idx]._selected = checked;
    },

    async submitBulk() {
        const cid = getEffectiveComplexId();
        if (!cid) { showToast('단지를 선택해주세요', 'error'); return; }
        const termMonth = document.getElementById('bulkTermMonth')?.value;
        if (!termMonth) { showToast('해지 처리 월을 선택해주세요', 'error'); return; }
        const selected = this._bulkItems.filter(it => it._selected);
        if (!selected.length) { showToast('등록할 항목을 선택해주세요', 'error'); return; }
        const btn = document.getElementById('bulkSubmitBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 등록 중...'; }
        try {
            const items = selected.map(it => ({
                dong: it.dong, ho: it.ho, name: it.name,
                phone: it.phone || '-', program_name: it.program,
                termination_type: it.isMid ? 'mid' : 'end',
                termination_date: it.termDate || null,
                termination_month: termMonth,
            }));
            const res  = await fetch('/api/cancellations/bulk', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ complex_id: cid, items }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || '등록 실패');
            showToast(`✅ ${json.inserted}건 등록 완료` + (json.skipped ? ` / ${json.skipped}건 스킵` : ''), 'success');
            this.closeBulkModal();
            await this.load();
        } catch(e) {
            showToast('등록 오류: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> 확인 등록'; }
        }
    },

    // ══════════════════════════════════════════════════════
    // 헬퍼
    // ══════════════════════════════════════════════════════
    _parseDong(d) { return parseInt((d || '').replace(/[^0-9]/g, '')) || 0; },
    _parseHo(h)   { return parseInt((h || '').replace(/[^0-9]/g, '')) || 0; },
    _fmtFee(v) {
        if (v === null || v === undefined || v === '') return '-';
        const n = Number(v);
        if (isNaN(n) || n === 0) return '-';
        return n.toLocaleString('ko-KR') + '원';
    },

    _loadSheetJS() {
        return new Promise((resolve, reject) => {
            if (window.XLSX) { resolve(); return; }
            const s = document.createElement('script');
            s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
            s.onload  = resolve;
            s.onerror = () => reject(new Error('SheetJS 로드 실패'));
            document.head.appendChild(s);
        });
    },

    // ══════════════════════════════════════════════════════
    // 버튼1: 관리사무실 제출용 엑셀 (2시트)
    //   시트1) 수강현황    — 신규·유지·해지 통합 1시트 (구분 컬럼으로 구별)
    //   시트2) 동호수계    — 동, 호수, 부과금액
    //   ※ 동호수계(상세) 시트 삭제됨 (2025년 이후 불필요)
    // ══════════════════════════════════════════════════════
    async downloadMgmtOfficeExcel() {
        if (!this._data) { showToast('먼저 조회해주세요', 'error'); return; }
        try {
            await this._loadSheetJS();
            const XLSX = window.XLSX;
            const d    = this._data;
            const yr   = d.year;
            const mo   = String(d.month).padStart(2,'0');
            const monthLabel = `${yr}년 ${mo}월`;
            const nextLabel  = d.nextKey ? d.nextKey.replace('-', '년 ') + '월' : '차월';
            const wb   = XLSX.utils.book_new();

            // ── 색상 팔레트 ──────────────────────────────────
            const HDR_MAIN  = { fgColor: { rgb: 'D6EAF8' } };  // 파랑 — 수강현황 헤더
            const ROW_NEW   = { fgColor: { rgb: 'D5F5E3' } };  // 연두 — 신규 행
            const ROW_TERM  = { fgColor: { rgb: 'FADBD8' } };  // 분홍 — 해지 행
            const HDR_DH    = { fgColor: { rgb: 'FEF9E7' } };  // 연노 — 동호수계 헤더
            const TOTAL_BG  = { fgColor: { rgb: 'AED6F1' } };  // 합계행 배경

            // ── 헬퍼: 특정 행 전체에 fill 적용 ─────────────
            const applyFill = (ws, rowIdx, nCols, fill, bold = false) => {
                for (let c = 0; c < nCols; c++) {
                    const ref = XLSX.utils.encode_cell({ r: rowIdx, c });
                    if (!ws[ref]) ws[ref] = { v: '', t: 's' };
                    if (!ws[ref].s) ws[ref].s = {};
                    ws[ref].s.fill = fill;
                    if (bold) ws[ref].s.font = { bold: true };
                    ws[ref].s.alignment = { horizontal: 'center' };
                }
            };

            // ═══════════════════════════════════════════════
            // 시트1: 수강현황
            //  행 구성:
            //   - 신규(차월 신규접수자): 구분='신규'
            //   - 유지(해지 아닌 수강자): 구분='' (빈칸)
            //   - 해지(차월해지+중도해지): 구분='차월해지'/'중도해지'
            //  정렬: 구분(신규→유지→해지) → 프로그램 → 동 → 호수
            // ═══════════════════════════════════════════════
            {
                // 데이터 수집
                const newRows  = (d.next_new       || []).map(r => ({ ...r, _cat: '신규',   _catOrd: 0 }));
                const keepRows = (d.settlement_rows || [])
                    .filter(r => !r.is_end_cancel && !r.is_mid_cancel)
                    .map(r => ({ ...r, _cat: '', _catOrd: 1 }));
                const termRows = [
                    ...(d.end_cancel || []).map(r => ({ ...r, _cat: '차월해지', _catOrd: 2 })),
                    ...(d.mid_cancel || []).map(r => ({ ...r, _cat: '중도해지', _catOrd: 2 })),
                ];
                const allRows = [...newRows, ...keepRows, ...termRows];

                // 정렬: 구분순 → 프로그램 → 동(숫자) → 호수(숫자)
                allRows.sort((a, b) => {
                    if (a._catOrd !== b._catOrd) return a._catOrd - b._catOrd;
                    const pa = (a.program_name||''), pb = (b.program_name||'');
                    if (pa < pb) return -1; if (pa > pb) return 1;
                    const da = parseInt((a.dong||'').replace(/[^0-9]/g,''))||0;
                    const db = parseInt((b.dong||'').replace(/[^0-9]/g,''))||0;
                    if (da !== db) return da - db;
                    return (parseInt((a.ho||'').replace(/[^0-9]/g,''))||0)
                         - (parseInt((b.ho||'').replace(/[^0-9]/g,''))||0);
                });

                const totalCount = allRows.length;
                const newCount   = newRows.length;
                const termCount  = termRows.length;
                const keepCount  = keepRows.length;

                const s1 = [
                    [`${monthLabel} 수강현황 (전체 ${totalCount}명 — 신규 ${newCount}명 / 유지 ${keepCount}명 / 해지 ${termCount}명)`],
                    [],
                    ['동','호수','이름','전화번호','프로그램','희망시간','월수강료','구분'],
                ];

                // 행별 스타일 정보 수집
                const rowStyleInfo = []; // { rowIdx, fill }
                allRows.forEach((r, i) => {
                    s1.push([
                        r.dong||'', r.ho||'', r.name||'', r.phone||'',
                        r.program_name||'', r.preferred_time||'',
                        r.monthly_fee ? Number(r.monthly_fee) : '',
                        r._cat,
                    ]);
                    const dataRowIdx = 3 + i;
                    if (r._cat === '신규') rowStyleInfo.push({ rowIdx: dataRowIdx, fill: ROW_NEW });
                    if (r._cat === '차월해지' || r._cat === '중도해지') rowStyleInfo.push({ rowIdx: dataRowIdx, fill: ROW_TERM });
                });

                // 합계 행 — 신규(차월부터 부과)는 이번달 미청구이므로 합계에서 제외
                const totalFee = allRows
                    .filter(r => r._cat !== '신규')
                    .reduce((s, r) => s + (Number(r.monthly_fee)||0), 0);
                const chargeCount = totalCount - newCount; // 실제 청구 대상 인원
                s1.push([]); // 빈 행
                s1.push(['','','','','','', totalFee,
                    `청구 ${chargeCount}명 (신규 ${newCount}명 차월부터)`]);

                const ws1 = XLSX.utils.aoa_to_sheet(s1);
                ws1['!cols'] = [
                    { wch:6 },{ wch:7 },{ wch:10 },{ wch:14 },
                    { wch:22 },{ wch:10 },{ wch:11 },{ wch:10 },
                ];
                ws1['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:7} }];

                // 제목 행 스타일
                const t1Ref = XLSX.utils.encode_cell({ r:0, c:0 });
                ws1[t1Ref].s = { fill: HDR_MAIN, font:{ bold:true, sz:11 }, alignment:{ horizontal:'center' } };
                // 헤더 행 스타일
                applyFill(ws1, 2, 8, HDR_MAIN, true);
                // 신규·해지 행 강조
                rowStyleInfo.forEach(({ rowIdx, fill }) => applyFill(ws1, rowIdx, 8, fill));
                // 합계 행
                applyFill(ws1, s1.length - 1, 8, TOTAL_BG, true);

                XLSX.utils.book_append_sheet(wb, ws1, '수강현황');
            }

            // ═══════════════════════════════════════════════
            // 시트2: 동호수계
            //  컬럼: 동, 호수, 부과금액
            //  대상: 당월 수강자 (해지자 포함, 중도해지자 제외 — 후청구 방식)
            //  정렬: 동(숫자) → 호수(숫자)
            // ═══════════════════════════════════════════════
            {
                // 동호수별 부과금액 집계
                // settlement_rows 기준: 중도해지 제외 → 월수강료 합산
                const dhMap = new Map(); // "동_호" → { dong, ho, totalFee }
                (d.settlement_rows || []).forEach(r => {
                    if (r.is_mid_cancel) return; // 중도해지 제외
                    const fee = Number(r.monthly_fee) || 0;
                    if (!fee) return;
                    const key = `${r.dong}_${r.ho}`;
                    if (!dhMap.has(key)) dhMap.set(key, { dong: r.dong, ho: r.ho, totalFee: 0 });
                    dhMap.get(key).totalFee += fee;
                });

                // 신규(차월 신규접수자)는 이번달 부과 없음 → 제외
                // 동(숫자) → 호수(숫자) 정렬
                const dhRows = Array.from(dhMap.values()).sort((a, b) => {
                    const da = parseInt((a.dong||'').replace(/[^0-9]/g,''))||0;
                    const db = parseInt((b.dong||'').replace(/[^0-9]/g,''))||0;
                    if (da !== db) return da - db;
                    return (parseInt((a.ho||'').replace(/[^0-9]/g,''))||0)
                         - (parseInt((b.ho||'').replace(/[^0-9]/g,''))||0);
                });

                const s2 = [
                    [`${monthLabel} 동호수계`],
                    [],
                    ['동', '호수', '부과금액'],
                ];

                dhRows.forEach(r => {
                    s2.push([r.dong||'', r.ho||'', r.totalFee]);
                });

                const grandTotal = dhRows.reduce((s, r) => s + r.totalFee, 0);
                s2.push([]);
                s2.push(['', '합계', grandTotal]);

                const ws2 = XLSX.utils.aoa_to_sheet(s2);
                ws2['!cols'] = [{ wch:7 }, { wch:8 }, { wch:13 }];
                ws2['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:2} }];

                const t2Ref = XLSX.utils.encode_cell({ r:0, c:0 });
                ws2[t2Ref].s = { fill: HDR_DH, font:{ bold:true, sz:11 }, alignment:{ horizontal:'center' } };
                applyFill(ws2, 2, 3, HDR_DH, true);
                applyFill(ws2, s2.length - 1, 3, TOTAL_BG, true);

                XLSX.utils.book_append_sheet(wb, ws2, '동호수계');
            }

            const fileName = `${yr}년${mo}월_관리사무실제출.xlsx`;
            XLSX.writeFile(wb, fileName);
            showToast(`✅ ${fileName} 다운로드 완료 (수강현황 · 동호수계 2시트)`, 'success');
        } catch(e) {
            showToast('엑셀 생성 오류: ' + e.message, 'error');
            console.error(e);
        }
    },

    // ══════════════════════════════════════════════════════
    // 버튼2: 운영비 청구서 — 공문 형식 HTML → window.print() → PDF
    //   주식회사 아이콘 공문 형식
    //   수신: 아파트 입주자대표회의 / 관리사무소
    //   내용: 전월 강습 운영비(수강료 합계) 청구
    // ══════════════════════════════════════════════════════
    generateOperationBillPdf() {
        if (!this._data) { showToast('먼저 조회해주세요', 'error'); return; }
        const d     = this._data;
        const yr    = d.year;
        const moNum = d.month;
        // 정산 조회월 기준: 전월 강습 → 이번달 청구 (조회월 = 청구월, 조회월-1 = 강습월)
        const prevMo    = moNum === 1 ? 12 : moNum - 1;
        const prevYr    = moNum === 1 ? yr - 1 : yr;
        const prevMoStr = String(prevMo).padStart(2,'0');

        // 프로그램별 집계 (중도해지 제외)
        const progMap = {};
        (d.settlement_rows || []).forEach(r => {
            if (r.is_mid_cancel) return;
            const p = r.program_name || '미분류';
            if (!progMap[p]) progMap[p] = { fee: 0, count: 0 };
            progMap[p].count++;
            progMap[p].fee += (Number(r.monthly_fee) || 0);
        });
        const progEntries   = Object.entries(progMap);
        const grandTotal    = progEntries.reduce((s, [,v]) => s + v.fee, 0);
        const vatAmount     = Math.round(grandTotal * 0.1);
        const grandTotalVat = grandTotal + vatAmount;

        const complexName = d.complex_name || '○○아파트';
        const today   = new Date();
        const docDate = `${today.getFullYear()}년 ${today.getMonth()+1}월 ${today.getDate()}일`;
        const docNo   = `HR-제-${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

        const detailRows = progEntries.map(([prog, info]) => `
            <tr>
              <td>${prog}</td>
              <td>${info.count}명</td>
              <td>${info.fee.toLocaleString('ko-KR')}원</td>
            </tr>`).join('');

        const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${prevYr}년 ${prevMoStr}월 강습 운영비 청구서</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: '맑은 고딕', 'Malgun Gothic', '나눔고딕', sans-serif;
    font-size: 12pt;
    color: #111;
    background: #fff;
    padding: 30px 40px;
    max-width: 800px;
    margin: 0 auto;
  }
  .letterhead {
    text-align: center;
    margin-bottom: 18px;
    padding-bottom: 10px;
    border-bottom: 3px double #333;
  }
  .letterhead h1 {
    font-size: 22pt;
    font-weight: 900;
    letter-spacing: 6px;
    color: #111;
  }
  .meta-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 22px;
    font-size: 11pt;
  }
  .meta-table td { padding: 5px 8px; vertical-align: top; }
  .meta-table .label { font-weight: 700; white-space: nowrap; width: 80px; color: #333; }
  .meta-table .colon { width: 12px; text-align: center; }
  .body-section { margin-bottom: 20px; line-height: 2; }
  .body-section p { padding-left: 20px; }
  .para-num { display: inline-block; min-width: 20px; margin-left: -20px; }
  .divider {
    text-align: center; font-size: 13pt; font-weight: 700;
    margin: 18px 0; letter-spacing: 12px;
  }
  .item-list { margin: 10px 0 16px 0; line-height: 2.4; }
  .item-row { display: flex; align-items: baseline; }
  .item-num { min-width: 22px; font-weight: 700; }
  .item-label { min-width: 110px; font-weight: 700; }
  .item-value { flex: 1; }
  .detail-table {
    width: 88%; margin: 8px auto 14px auto;
    border-collapse: collapse; font-size: 10.5pt;
  }
  .detail-table th {
    background: #f0f0f0; border: 1px solid #bbb;
    padding: 5px 12px; text-align: center; font-weight: 700;
  }
  .detail-table td { border: 1px solid #bbb; padding: 5px 12px; text-align: center; }
  .detail-table .total-row td { font-weight: 700; background: #f9f9f9; }
  .detail-table .vat-total td { font-weight: 800; background: #e8f4ff; }
  .sign-area { margin-top: 50px; text-align: center; }
  .company-name-big { font-size: 20pt; font-weight: 900; letter-spacing: 4px; margin-bottom: 8px; }
  .stamp-note { font-size: 9pt; color: #888; margin-top: 4px; }
  .footer-info {
    margin-top: 40px; padding-top: 12px; border-top: 2px solid #333;
    font-size: 9pt; color: #444; display: flex;
    flex-wrap: wrap; gap: 4px; justify-content: space-between;
  }
  .footer-info div { min-width: 160px; }
  @media print {
    body { padding: 15px 20px; }
    .no-print { display: none !important; }
    @page { size: A4; margin: 18mm 15mm; }
  }
</style>
</head>
<body>
<div class="no-print" style="text-align:right;margin-bottom:16px">
  <button onclick="window.print()"
    style="padding:9px 22px;background:#117a65;color:#fff;border:none;border-radius:7px;
           font-size:13px;font-weight:700;cursor:pointer;margin-right:8px">
    🖨️ PDF 저장 / 인쇄
  </button>
  <button onclick="window.close()"
    style="padding:9px 16px;background:#888;color:#fff;border:none;border-radius:7px;
           font-size:13px;font-weight:700;cursor:pointer">
    ✕ 닫기
  </button>
</div>
<div class="letterhead"><h1>주 식 회 사 아 이 콘</h1></div>
<table class="meta-table">
  <tr><td class="label">문서번호</td><td class="colon">:</td><td>${docNo}</td></tr>
  <tr><td class="label">시행일자</td><td class="colon">:</td><td>${docDate}</td></tr>
  <tr><td class="label">수 &nbsp; 신</td><td class="colon">:</td><td>${complexName} 입주자대표회의, 관리사무소</td></tr>
  <tr><td class="label">참 &nbsp; 조</td><td class="colon">:</td><td>관리사무소장</td></tr>
  <tr><td class="label">제 &nbsp; 목</td><td class="colon">:</td>
    <td><strong>${prevYr}년 ${prevMoStr}월 강습 운영비 청구 건</strong></td></tr>
</table>
<div class="body-section">
  <p><span class="para-num">1.</span>안녕하십니까? 귀 단지의 무궁한 발전을 기원합니다.</p>
  <p><span class="para-num">2.</span>귀 단지와 당사 간의 체결한 주민공동시설 강습대행 운영계약에 의거 ${prevYr}년 ${prevMoStr}월분 강습 운영비를 아래와 같이 청구하오니 검토 후 결재하여 주시기 바랍니다.</p>
  <p><span class="para-num">3.</span>정산내역은 별첨 자료로 제출합니다.</p>
</div>
<div class="divider">- 아 &nbsp;&nbsp;&nbsp; 래 -</div>
<div class="item-list">
  <div class="item-row">
    <span class="item-num">1)</span>
    <span class="item-label">청 구 금 액 :</span>
    <span class="item-value"><strong>${grandTotalVat.toLocaleString('ko-KR')}원 (부가세 포함)</strong></span>
  </div>
  <div class="item-row">
    <span class="item-num">2)</span>
    <span class="item-label">정 산 내 역 :</span>
    <span class="item-value">청구서 별첨</span>
  </div>
  <div class="item-row">
    <span class="item-num">3)</span>
    <span class="item-label">입금계좌번호 :</span>
    <span class="item-value">하나은행 424-910038-39404 (예금주 주식회사 아이콘)</span>
  </div>
  <div class="item-row">
    <span class="item-num">4)</span>
    <span class="item-label">붙 &nbsp;&nbsp;&nbsp;&nbsp; 임 :</span>
    <span class="item-value">청구서 1부, 전자세금계산서 1부</span>
  </div>
</div>
<table class="detail-table">
  <thead>
    <tr><th>프로그램</th><th>수강인원</th><th>수강료 합계</th></tr>
  </thead>
  <tbody>
    ${detailRows}
    <tr class="total-row"><td>합 계 (공급가액)</td><td>-</td><td>${grandTotal.toLocaleString('ko-KR')}원</td></tr>
    <tr class="total-row"><td>부가세 (10%)</td><td>-</td><td>${vatAmount.toLocaleString('ko-KR')}원</td></tr>
    <tr class="vat-total"><td><strong>청구 합계 (VAT 포함)</strong></td><td>-</td><td><strong>${grandTotalVat.toLocaleString('ko-KR')}원</strong></td></tr>
  </tbody>
</table>
<div class="sign-area">
  <div class="company-name-big">주 식 회 사 아 이 콘</div>
  <div class="stamp-note">(직인 또는 서명)</div>
</div>
<div class="footer-info">
  <div><strong>발 &nbsp; 자</strong> : 본부장 김태용</div>
  <div><strong>이 &nbsp; 사</strong> : 진현태</div>
  <div><strong>대표이사</strong> : 김대희</div>
  <div style="width:100%;margin-top:3px"><strong>발신자 연락처</strong> : 010-2890-1004 &nbsp;|&nbsp; TEL.032-262-8834 &nbsp;|&nbsp; FAX.070-4755-9804</div>
  <div style="width:100%"><strong>본사소재지</strong> : 경기도 파주시 경의로 1114, 4층 405호 J47호(야당동, 에필타워) &nbsp;|&nbsp; E-MAIL : ikonworld1004@naver.com</div>
</div>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
        if (!win) {
            showToast('팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.', 'error');
            return;
        }
        win.document.write(html);
        win.document.close();
        showToast(`✅ 운영비 청구서 (${prevYr}년 ${prevMoStr}월분) 생성 완료 — 새 창에서 인쇄/PDF 저장하세요`, 'success');
    },

    // ══════════════════════════════════════════════════════
    // 버튼3: 강사 인건비 청구서 (강사별 1페이지씩 청구서 형식)
    //  - 강사명/연락처/주민등록번호/급여계좌번호 헤더
    //  - 프로그램별 수업 상세 테이블
    //  - 소계/전체합계 강조
    // ══════════════════════════════════════════════════════
    async downloadInstructorPayrollExcel() {
        if (!this._data) { showToast('먼저 조회해주세요', 'error'); return; }
        try {
            await this._loadSheetJS();
            const XLSX = window.XLSX;
            const d    = this._data;
            const yr   = d.year;
            const mo   = String(d.month).padStart(2,'0');
            const monthLabel = `${yr}년 ${mo}월`;
            const wb   = XLSX.utils.book_new();

            const cid = getEffectiveComplexId();
            const instrRes  = await fetch(`/api/instructors?complexId=${cid}`);
            const instrJson = await instrRes.json();
            const instructorList = instrJson.data || [];

            // 당월 타임별 수업횟수 맵 { program_name: { time_slot: count } }
            const slotSessionMap = this._sessionEdits || {};

            // ── 색상 팔레트 ──────────────────────────────────
            const C_TITLE     = { fgColor: { rgb: '4A235A' } }; // 진보라  — 문서 제목
            const C_HDR_INFO  = { fgColor: { rgb: 'D7BDE2' } }; // 연보라  — 강사정보 헤더
            const C_HDR_TBL   = { fgColor: { rgb: 'A569BD' } }; // 중보라  — 상세 테이블 헤더
            const C_INFO_VAL  = { fgColor: { rgb: 'F9F0FF' } }; // 극연보라— 강사정보 값
            const C_SUB       = { fgColor: { rgb: 'E8DAEF' } }; // 연보라  — 소계 행
            const C_GRAND     = { fgColor: { rgb: '6C3483' } }; // 진보라  — 전체합계 행
            const C_ODD       = { fgColor: { rgb: 'FAF5FF' } }; // 줄무늬 홀수
            const C_DIVIDER   = { fgColor: { rgb: 'EAECEE' } }; // 강사 구분선

            const TOTAL_COLS = 7;
            // [0]프로그램 [1]담당타임/수강생 [2]수업유형 [3]수업횟수 [4]단가 [5]인건비 [6](빈칸/비고)
            const COL_W = [{ wch:24 },{ wch:16 },{ wch:8 },{ wch:10 },{ wch:13 },{ wch:14 },{ wch:6 }];
            // 강사정보 영역은 A~G 전체 병합 (7컬럼)

            const data       = [];
            const merges     = [];
            const styleMap   = {}; // rowIdx → { fill, font, align, border }
            let rowIdx       = 0;

            // ─── 공통 헬퍼 ───────────────────────────────────
            const pushRow = (arr, style = null) => {
                data.push(arr);
                if (style) styleMap[rowIdx] = style;
                rowIdx++;
            };
            const applyStyle = (ws, ri, c0, cN, fill, font = null, align = null) => {
                for (let c = c0; c <= cN; c++) {
                    const ref = XLSX.utils.encode_cell({ r: ri, c });
                    if (!ws[ref]) ws[ref] = { v: '', t: 's' };
                    if (!ws[ref].s) ws[ref].s = {};
                    if (fill)  ws[ref].s.fill  = fill;
                    if (font)  ws[ref].s.font  = font;
                    if (align) ws[ref].s.alignment = align;
                }
            };

            // ─── 문서 제목 행 ─────────────────────────────────
            pushRow([`${monthLabel} 강사 인건비 청구서`]);
            merges.push({ s:{r:0,c:0}, e:{r:0,c:TOTAL_COLS-1} });
            pushRow([]); // 빈행

            let grandPayroll = 0;
            const subtotalRows = []; // { ri, name, total }

            instructorList.forEach((instr, instrIdx) => {
                const rates    = instr.hourly_rates    || {};
                const assigned = Array.isArray(instr.assigned_programs) ? instr.assigned_programs : [];
                const isLegacy = assigned.length > 0 && typeof assigned[0] === 'string';

                // ── 강사 정보 블록 (2행: 레이블 / 값) ─────────
                const infoLabelRow = rowIdx;
                pushRow(['강사명', '연락처', '주민등록번호', '급여계좌번호 (은행 · 번호 · 예금주)', '', '', '']);
                merges.push({ s:{r:infoLabelRow,c:3}, e:{r:infoLabelRow,c:6} }); // 계좌번호 레이블 병합

                const infoValRow = rowIdx;
                pushRow([
                    instr.name        || '',
                    instr.phone       || '',
                    instr.rrn         || '',
                    instr.bank_account|| '',
                    '', '', '',
                ]);
                merges.push({ s:{r:infoValRow,c:3}, e:{r:infoValRow,c:6} }); // 계좌번호 값 병합

                // ── 상세 테이블 헤더 ──────────────────────────
                const tblHdrRow = rowIdx;
                pushRow(['프로그램', '담당 타임 / 수강생', '수업\n유형', '월\n수업횟수', '타임당\n단가(원)', '인건비(원)', '']);

                // ── 수업 상세 행 ──────────────────────────────
                let instrTotal = 0;

                if (isLegacy || !assigned.length) {
                    const noDataRow = rowIdx;
                    pushRow(['(담당 타임 미설정 — 강사 관리에서 타임별 설정 필요)', '', '', '', '', '', '']);
                    merges.push({ s:{r:noDataRow,c:0}, e:{r:noDataRow,c:TOTAL_COLS-1} });
                } else {
                    assigned.forEach((a, ai) => {
                        const { program_name, time_slot, type } = a;
                        const rate = Number(rates[type]) || 0;
                        const typeLabel = { group:'그룹', private:'개인', duet:'듀엣' }[type] || type;

                        let sessions = 0;
                        if (time_slot === 'free') {
                            const pm = slotSessionMap[program_name] || {};
                            sessions = Object.values(pm).reduce((s,v) => s + (Number(v)||0), 0);
                        } else {
                            sessions = Number((slotSessionMap[program_name] || {})[time_slot]) || 0;
                        }

                        const payroll = sessions * rate;
                        instrTotal   += payroll;

                        const studentLabel = (time_slot === 'free' && a.student_name)
                            ? a.student_name + (a.student_dong ? ` (${a.student_dong}동 ${a.student_ho}호)` : '')
                            : (time_slot === 'free' ? '개인레슨' : time_slot);

                        const isOdd = ai % 2 === 1;
                        const dataRow = rowIdx;
                        pushRow([program_name, studentLabel, typeLabel, sessions, rate, payroll, '']);
                        if (isOdd) {
                            // 홀수행 배경색 표시용
                            styleMap[dataRow] = { _odd: true };
                        }
                    });
                }

                // ── 강사 소계 행 ─────────────────────────────
                const subRow = rowIdx;
                pushRow(['', `${instr.name} 소계`, '', '', '', instrTotal, '']);
                merges.push({ s:{r:subRow,c:0}, e:{r:subRow,c:1} }); // 소계 레이블 병합
                subtotalRows.push({ ri: subRow, total: instrTotal });
                grandPayroll += instrTotal;

                // ── 강사 구분 빈행 ────────────────────────────
                const divRow = rowIdx;
                pushRow(['', '', '', '', '', '', '']);
                styleMap[divRow] = { _divider: true };

                // ── 스타일 정보 기록 ──────────────────────────
                styleMap[infoLabelRow]  = { _infoLabel: true };
                styleMap[infoValRow]    = { _infoVal:   true };
                styleMap[tblHdrRow]     = { _tblHdr:    true };
            });

            // ── 전체 합계 행 ─────────────────────────────────
            const grandRow = rowIdx;
            pushRow(['전체 합계', '', '', '', '', grandPayroll, '']);
            merges.push({ s:{r:grandRow,c:0}, e:{r:grandRow,c:4} }); // 레이블 병합

            // ── 워크시트 생성 ────────────────────────────────
            const ws = XLSX.utils.aoa_to_sheet(data);
            ws['!cols']   = COL_W;
            ws['!merges'] = merges;

            // ── 문서 제목 스타일 ─────────────────────────────
            const titleRef = XLSX.utils.encode_cell({ r:0, c:0 });
            if (ws[titleRef]) {
                ws[titleRef].s = {
                    fill: C_TITLE,
                    font: { bold:true, sz:14, color:{ rgb:'FFFFFF' } },
                    alignment: { horizontal:'center', vertical:'center' },
                };
            }

            // ── 행별 스타일 적용 ─────────────────────────────
            Object.entries(styleMap).forEach(([ri, flag]) => {
                const r = parseInt(ri);
                if (flag._infoLabel) {
                    applyStyle(ws, r, 0, 1, C_HDR_INFO, { bold:true, sz:9 }, { horizontal:'center', vertical:'center' });
                    applyStyle(ws, r, 2, 2, { fgColor:{ rgb:'FADBD8' } }, { bold:true, sz:9 }, { horizontal:'center' });
                    applyStyle(ws, r, 3, 6, C_HDR_INFO, { bold:true, sz:9 }, { horizontal:'center', vertical:'center' });
                } else if (flag._infoVal) {
                    applyStyle(ws, r, 0, 1, C_INFO_VAL, { bold:true, sz:11 }, { horizontal:'center', vertical:'center' });
                    applyStyle(ws, r, 2, 2, { fgColor:{ rgb:'FFF0F0' } }, { sz:11 }, { horizontal:'center' });
                    applyStyle(ws, r, 3, 6, C_INFO_VAL, { sz:10 }, { vertical:'center', wrapText:true });
                } else if (flag._tblHdr) {
                    applyStyle(ws, r, 0, TOTAL_COLS-1, C_HDR_TBL,
                        { bold:true, sz:9, color:{ rgb:'FFFFFF' } },
                        { horizontal:'center', vertical:'center', wrapText:true });
                } else if (flag._odd) {
                    applyStyle(ws, r, 0, TOTAL_COLS-1, C_ODD, null, { vertical:'center' });
                } else if (flag._divider) {
                    applyStyle(ws, r, 0, TOTAL_COLS-1, C_DIVIDER, null, null);
                }
            });

            // ── 소계 행 스타일 ───────────────────────────────
            subtotalRows.forEach(({ ri }) => {
                applyStyle(ws, ri, 0, TOTAL_COLS-1, C_SUB,
                    { bold:true, sz:10 }, { horizontal:'center', vertical:'center' });
                // 금액 셀 오른쪽 정렬
                const amtRef = XLSX.utils.encode_cell({ r: ri, c: 5 });
                if (ws[amtRef]) {
                    if (!ws[amtRef].s) ws[amtRef].s = {};
                    ws[amtRef].s.alignment = { horizontal:'right', vertical:'center' };
                }
            });

            // ── 전체합계 행 스타일 ───────────────────────────
            applyStyle(ws, grandRow, 0, TOTAL_COLS-1, C_GRAND,
                { bold:true, sz:12, color:{ rgb:'FFFFFF' } },
                { horizontal:'center', vertical:'center' });
            const grandAmtRef = XLSX.utils.encode_cell({ r: grandRow, c: 5 });
            if (ws[grandAmtRef]) {
                if (!ws[grandAmtRef].s) ws[grandAmtRef].s = {};
                ws[grandAmtRef].s.alignment = { horizontal:'right', vertical:'center' };
            }

            // ── 데이터 행 기본 정렬 ─────────────────────────
            for (let r = 0; r < data.length; r++) {
                for (let c = 0; c < TOTAL_COLS; c++) {
                    const ref = XLSX.utils.encode_cell({ r, c });
                    if (!ws[ref]) continue;
                    if (!ws[ref].s) ws[ref].s = {};
                    if (!ws[ref].s.alignment) {
                        ws[ref].s.alignment = (c >= 3 && c <= 5)
                            ? { horizontal:'center', vertical:'center' }
                            : { vertical:'center' };
                    }
                }
            }

            // ── 시트 행 높이 ────────────────────────────────
            ws['!rows'] = [];
            ws['!rows'][0] = { hpt: 28 }; // 제목 행 높이

            XLSX.utils.book_append_sheet(wb, ws, `${mo}월 강사인건비`);

            const complexName = d.complex_name || '';
            const prefix      = complexName ? `${complexName}_` : '';
            const fileName    = `${prefix}${yr}년${mo}월_강사인건비청구서.xlsx`;
            XLSX.writeFile(wb, fileName);
            showToast(`✅ ${fileName} 다운로드 완료 (강사 ${instructorList.length}명 / 전체 ${grandPayroll.toLocaleString('ko-KR')}원)`, 'success');
        } catch(e) {
            showToast('엑셀 생성 오류: ' + e.message, 'error');
            console.error(e);
        }
    },
};
