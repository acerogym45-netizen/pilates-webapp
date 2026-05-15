/** 월별 정산 리포트 - v5.2
 *  엑셀 3시트 출력:
 *    시트1) 정산 내역      (당월 수강생 + 하단 신규 섹션)
 *    시트2) 동호수계        (세대별 월수강료 합산)
 *    시트3) 수강신청 내역   (다음달 수강 예정자 전체)
 *
 *  단가: 15,000원/회 (강사 인건비 계산 전용)
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
              <div style="font-size:.8rem;color:#888;margin-top:2px">정산 내역 · 동호수계 · 수강신청 내역 → 엑셀 3시트 다운로드</div>
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
              <i class="fas fa-file-excel"></i> 엑셀 다운로드 (3시트)
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
            <button onclick="settlement.downloadOperationBillExcel()"
              style="padding:8px 18px;background:#117a65;color:#fff;border:none;border-radius:7px;
                     font-size:.88rem;font-weight:700;cursor:pointer">
              <i class="fas fa-receipt"></i> 운영비 청구서
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
              <span style="font-size:.78rem;color:#999">수업횟수 입력 → 저장 시 요금 자동 반영 (회당 15,000원)</span>
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

            // 요약 뱃지
            if (sumEl) {
                const s = json.summary;
                const yr2 = json.year, mo2 = json.month;
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
                      <span>합계액 <strong style="color:#6f42c1">${this._fmtFee(s.settlement_fee_sum ?? s.total_charge)}</strong></span>
                    </span>`;
            }
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
        html += this._sectionCard(
            `<i class="fas fa-calendar-times" style="color:#e67e22"></i> 차월해지자
             <small style="font-weight:400;color:#888;font-size:.8rem">(${d.nextKey} 미부과 대상)</small>`,
            '#e67e22', '#fffaf5',
            d.end_cancel || [], d.summary.end_cancel_count,
            ['dong','ho','name','phone','program_name','termination_date'],
            ['동','호수','이름','연락처','프로그램','해지일'], {}
        );

        // ── 4. 차월신규접수
        html += this._sectionCard(
            `<i class="fas fa-user-plus" style="color:#27ae60"></i> 차월신규접수
             <small style="font-weight:400;color:#888;font-size:.8rem">(${d.nextKey}부터 수강 예정)</small>`,
            '#27ae60', '#f0fff4',
            d.next_new || [], d.summary.next_new_count,
            ['dong','ho','name','phone','program_name','preferred_time','monthly_fee'],
            ['동','호수','이름','연락처','프로그램','시간','월수강료'],
            { monthly_fee: v => this._fmtFee(v) }
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

                // 구분 배지
                let catBadge = '';
                if (r.category === '중도해지') {
                    catBadge = `<span style="background:#e74c3c;color:#fff;font-size:.68rem;padding:2px 7px;border-radius:10px">중도해지</span>`;
                } else if (r.category && r.category.includes('해지')) {
                    catBadge = `<span style="background:#e67e22;color:#fff;font-size:.68rem;padding:2px 7px;border-radius:10px">${r.category}</span>`;
                } else if (r.category === '중도합류') {
                    catBadge = `<span style="background:#8e44ad;color:#fff;font-size:.68rem;padding:2px 7px;border-radius:10px">중도합류</span>`;
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

        // 합계 행
        const totalFeeSum = rows.reduce((s, r) => s + (Number(r.monthly_fee) || 0), 0);
        tbodyRows += `<tr style="background:#1a5276">
          <td colspan="6" style="padding:7px 8px;border:1px solid #0d3349;font-size:.85rem;font-weight:700;color:#fff;text-align:right">
            등록세대 ${totalRows}명 / 해지 ${cancelRows}명</td>
          <td style="padding:7px 8px;border:1px solid #0d3349;font-size:.85rem;font-weight:800;color:#fff;text-align:center">
            ${totalFeeSum.toLocaleString('ko-KR')}원</td>
          <td style="border:1px solid #0d3349"></td>
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
            : `<div style="text-align:center;padding:22px;color:#bbb;font-size:.9rem">해당 없음</div>`;

        return `
        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:18px;overflow:hidden">
          <div style="background:#f0f7ff;border-bottom:2px solid #2980b9;padding:12px 18px;
                      display:flex;align-items:center;flex-wrap:wrap;gap:6px">
            <span style="font-size:.95rem;font-weight:700;color:#222">
              <i class="fas fa-list-alt" style="color:#2980b9"></i> ${yr}년 ${mo}월 정산 내역${badge}
            </span>
            <span style="font-size:.75rem;color:#888;margin-left:8px">월수강료 기준 정산</span>
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
            body = `<div style="text-align:center;padding:22px;color:#bbb;font-size:.9rem">해당 없음</div>`;
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
    // ══════════════════════════════════════════════════════
    _sectionCard(title, color, bg, rows, count, cols, labels, fmtMap) {
        const badge = `<span style="background:${color};color:#fff;font-size:.72rem;font-weight:700;
          padding:2px 9px;border-radius:20px;margin-left:8px;vertical-align:middle">${count}건</span>`;
        let tableHtml = '';
        if (!rows || !rows.length) {
            tableHtml = `<div style="text-align:center;padding:22px;color:#bbb;font-size:.9rem">해당 없음</div>`;
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
        return `
        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:18px;overflow:hidden">
          <div style="background:${bg};border-bottom:2px solid ${color};padding:12px 18px">
            <span style="font-size:.95rem;font-weight:700;color:#222">${title}${badge}</span>
          </div>${tableHtml}
        </div>`;
    },

    // ══════════════════════════════════════════════════════
    // 엑셀 3시트 다운로드
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

            // ─────────────────────────────────────────────
            // 시트1: 정산 내역
            // ─────────────────────────────────────────────
            const s1 = [];
            const LIGHT_GREEN = { fgColor: { rgb: 'D5F5D0' } };  // 연한 연두색
            const YELLOW_BG   = { fgColor: { rgb: 'FFF9C4' } };
            const BLUE_HDR    = { fgColor: { rgb: 'D6EAF8' } };
            const GREEN_HDR   = { fgColor: { rgb: 'D5F5E3' } };
            const SUB_BG      = { fgColor: { rgb: 'E8F4FD' } };
            const TOTAL_BG    = { fgColor: { rgb: '1A5276' } };

            // 헤더
            s1.push([`${monthLabel} 정산 내역`]);
            s1.push([]);
            s1.push(['동','호수','이름','전화번호','프로그램종류','희망시간대','요금','구분']);

            const settlementRows = d.settlement_rows || [];
            const newSectionRows = d.new_section_rows || [];

            // 프로그램별 그룹핑 (소계용)
            const progOrder = [];
            const progMap   = {};
            settlementRows.forEach(r => {
                const p = r.program_name || '미분류';
                if (!progMap[p]) { progMap[p] = []; progOrder.push(p); }
                progMap[p].push(r);
            });

            const cellStyles  = {}; // { 'R:C': style }
            let   rowIdx      = 3;  // 0-based (s1 현재 3행)

            progOrder.forEach(prog => {
                const items = progMap[prog];
                items.forEach(r => {
                    s1.push([
                        r.dong, r.ho, r.name, r.phone || '',
                        r.program_name || '', r.preferred_time || '',
                        r.monthly_fee || '', r.category || ''
                    ]);
                    rowIdx++;
                });
                // 소계 행
                const subFee = items.reduce((s, r) => s + (Number(r.monthly_fee) || 0), 0);
                s1.push(['', '', '', '', prog, '소계', subFee, '']);
                rowIdx++;
            });

            // 합계 행
            const totalFeeSum = settlementRows.reduce((s, r) => s + (Number(r.monthly_fee) || 0), 0);
            const cancelCount = settlementRows.filter(r => r.is_end_cancel || r.is_mid_cancel).length;

            s1.push([]);
            s1.push([
                `등록세대 ${settlementRows.length}명`, '', '',
                `해지세대 ${cancelCount}명`, '', '',
                totalFeeSum, '합계액'
            ]);
            rowIdx += 2;

            // 신규 섹션 (하단)
            if (newSectionRows.length) {
                s1.push([]);
                s1.push([`▼ ${nextLabel} 신규 수강 예정자`]);
                s1.push(['동','호수','이름','전화번호','프로그램종류','희망시간대','요금','구분']);
                rowIdx += 3;

                newSectionRows.forEach(r => {
                    s1.push([
                        r.dong, r.ho, r.name, r.phone || '',
                        r.program_name || '', r.preferred_time || '',
                        r.monthly_fee || '', r.category || ''
                    ]);
                    if (r.is_duplicate) {
                        cellStyles[`dup_${rowIdx}`] = true;
                    }
                    rowIdx++;
                });
            }

            const ws1 = XLSX.utils.aoa_to_sheet(s1);
            ws1['!cols'] = [{wch:6},{wch:7},{wch:10},{wch:14},{wch:22},{wch:10},{wch:10},{wch:18}];
            ws1['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:7} }];

            // 헤더 행 배경
            const hdrRow = 2; // 0-based
            for (let c = 0; c < 8; c++) {
                const cellRef = XLSX.utils.encode_cell({ r: hdrRow, c });
                if (!ws1[cellRef]) ws1[cellRef] = { v: '', t: 's' };
                ws1[cellRef].s = { fill: BLUE_HDR, font: { bold: true }, alignment: { horizontal: 'center' } };
            }

            // 소계/합계 행 배경
            let r1 = 3;
            progOrder.forEach(prog => {
                const cnt = progMap[prog].length;
                r1 += cnt;
                // 소계 행
                for (let c = 0; c < 8; c++) {
                    const cellRef = XLSX.utils.encode_cell({ r: r1, c });
                    if (!ws1[cellRef]) ws1[cellRef] = { v: '', t: 's' };
                    if (!ws1[cellRef].s) ws1[cellRef].s = {};
                    ws1[cellRef].s.fill = SUB_BG;
                    ws1[cellRef].s.font = { bold: true, color: { rgb: '1A5276' } };
                }
                r1++;
            });

            XLSX.utils.book_append_sheet(wb, ws1, '정산 내역');

            // ─────────────────────────────────────────────
            // 시트2: 동호수계
            // ─────────────────────────────────────────────
            const s2 = [];
            s2.push([`${monthLabel} 동호수계`]);
            s2.push([]);
            s2.push(['동','호수','이름','전화번호','프로그램','희망시간','요금','동호수계']);

            const dhRows = d.dongho_settlement_rows || [];
            const s2CellInfo = []; // { rowIdx, isMulti, isSum }
            let r2 = 3;

            dhRows.forEach(dh => {
                const items = dh.items;
                const isMulti = items.length > 1;

                if (isMulti) {
                    // 개별 행
                    items.forEach(it => {
                        s2.push([dh.dong, dh.ho, it.name, it.phone || '', it.program_name || '', it.preferred_time || '', it.final_charge || '', '']);
                        s2CellInfo.push({ rowIdx: r2, isMulti: true, isSum: false });
                        r2++;
                    });
                    // 합계 행
                    const total = items.reduce((s, it) => s + (Number(it.final_charge) || 0), 0);
                    s2.push(['', '', '', '', '', '', '', total]);
                    s2CellInfo.push({ rowIdx: r2, isMulti: true, isSum: true });
                    r2++;
                } else {
                    // 1명 세대
                    const it = items[0];
                    const fc = Number(it.final_charge) || '';
                    s2.push([dh.dong, dh.ho, it.name, it.phone || '', it.program_name || '', it.preferred_time || '', fc, fc]);
                    s2CellInfo.push({ rowIdx: r2, isMulti: false, isSum: false });
                    r2++;
                }
            });

            const ws2 = XLSX.utils.aoa_to_sheet(s2);
            ws2['!cols'] = [{wch:6},{wch:7},{wch:10},{wch:14},{wch:22},{wch:10},{wch:10},{wch:12}];
            ws2['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:7} }];

            // 헤더 스타일
            for (let c = 0; c < 8; c++) {
                const cellRef = XLSX.utils.encode_cell({ r: 2, c });
                if (!ws2[cellRef]) ws2[cellRef] = { v: '', t: 's' };
                ws2[cellRef].s = { fill: GREEN_HDR, font: { bold: true }, alignment: { horizontal: 'center' } };
            }

            // 다인세대 연두색 스타일
            s2CellInfo.forEach(info => {
                if (!info.isMulti) return;
                for (let c = 0; c < 8; c++) {
                    const cellRef = XLSX.utils.encode_cell({ r: info.rowIdx, c });
                    if (!ws2[cellRef]) ws2[cellRef] = { v: '', t: 's' };
                    if (!ws2[cellRef].s) ws2[cellRef].s = {};
                    ws2[cellRef].s.fill = LIGHT_GREEN;
                    if (info.isSum) {
                        ws2[cellRef].s.font = { bold: true };
                    }
                }
            });

            XLSX.utils.book_append_sheet(wb, ws2, '동호수계');

            // ─────────────────────────────────────────────
            // 시트3: 수강신청 내역
            // ─────────────────────────────────────────────
            const s3 = [];
            s3.push([`${nextLabel} 수강신청 내역`]);
            s3.push([]);
            s3.push(['동','호수','이름','전화번호','프로그램','희망시간','요금']);

            (d.enrollment_rows || []).forEach(r => {
                s3.push([
                    r.dong, r.ho, r.name, r.phone || '',
                    r.program_name || '', r.preferred_time || '',
                    r.monthly_fee || ''
                ]);
            });

            const ws3 = XLSX.utils.aoa_to_sheet(s3);
            ws3['!cols'] = [{wch:6},{wch:7},{wch:10},{wch:14},{wch:22},{wch:10},{wch:10}];
            ws3['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:6} }];

            // 헤더 스타일
            for (let c = 0; c < 7; c++) {
                const cellRef = XLSX.utils.encode_cell({ r: 2, c });
                if (!ws3[cellRef]) ws3[cellRef] = { v: '', t: 's' };
                ws3[cellRef].s = { fill: { fgColor: { rgb: 'FEF9E7' } }, font: { bold: true }, alignment: { horizontal: 'center' } };
            }

            XLSX.utils.book_append_sheet(wb, ws3, '수강신청 내역');

            // ─────────────────────────────────────────────
            // 파일명: 단지명_YYYY년MM월_정산.xlsx
            // ─────────────────────────────────────────────
            const fileName = `${yr}년${mo}월_필라테스_정산.xlsx`;
            XLSX.writeFile(wb, fileName);
            showToast(`${fileName} 다운로드 완료`, 'success');

        } catch(e) {
            showToast('엑셀 생성 오류: ' + e.message, 'error');
            console.error(e);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-file-excel"></i> 엑셀 다운로드 (3시트)';
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
    // 버튼1: 관리사무실 제출용 엑셀 (신규 / 유지 / 해지 3시트)
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

            const HDR_NEW  = { fgColor: { rgb: 'D5F5E3' } };  // 연두 — 신규
            const HDR_KEEP = { fgColor: { rgb: 'D6EAF8' } };  // 파랑 — 유지
            const HDR_TERM = { fgColor: { rgb: 'FADBD8' } };  // 분홍 — 해지
            const colsDef  = [
                { wch: 6 }, { wch: 7 }, { wch: 10 }, { wch: 14 },
                { wch: 22 }, { wch: 10 }, { wch: 11 },
            ];
            const cols = ['동','호수','이름','전화번호','프로그램','희망시간','월수강료'];

            const makeSheet = (title, rows, hdrFill) => {
                const data = [[title], [], cols];
                rows.forEach(r => data.push([
                    r.dong||'', r.ho||'', r.name||'', r.phone||'',
                    r.program_name||'', r.preferred_time||'',
                    r.monthly_fee ? Number(r.monthly_fee) : '',
                ]));
                const ws = XLSX.utils.aoa_to_sheet(data);
                ws['!cols']   = colsDef;
                ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:6} }];
                // 헤더 스타일
                for (let c = 0; c < 7; c++) {
                    const ref = XLSX.utils.encode_cell({ r:2, c });
                    if (!ws[ref]) ws[ref] = { v:'', t:'s' };
                    ws[ref].s = { fill: hdrFill, font:{ bold:true }, alignment:{ horizontal:'center' } };
                }
                return ws;
            };

            // ① 신규: 차월 신규 접수자
            const newRows  = d.next_new || [];
            const ws1 = makeSheet(`${nextLabel} 신규 수강 신청자 (${newRows.length}명)`, newRows, HDR_NEW);
            XLSX.utils.book_append_sheet(wb, ws1, '신규');

            // ② 유지: 당월 정산 내역 중 해지 제외
            const keepRows = (d.settlement_rows || []).filter(r => !r.is_end_cancel && !r.is_mid_cancel);
            const ws2 = makeSheet(`${monthLabel} 유지 수강자 (${keepRows.length}명)`, keepRows, HDR_KEEP);
            XLSX.utils.book_append_sheet(wb, ws2, '유지');

            // ③ 해지: 차월해지 + 중도해지 통합
            const termRows = [
                ...(d.end_cancel || []).map(r => ({ ...r, _type: '차월해지' })),
                ...(d.mid_cancel || []).map(r => ({ ...r, _type: '중도해지' })),
            ];
            const termData = [[`${monthLabel} 해지자 (${termRows.length}명)`], [],
                [...cols, '구분', '해지일']];
            termRows.forEach(r => termData.push([
                r.dong||'', r.ho||'', r.name||'', r.phone||'',
                r.program_name||'', r.preferred_time||'',
                r.monthly_fee ? Number(r.monthly_fee) : '',
                r._type, r.termination_date||'',
            ]));
            const ws3 = XLSX.utils.aoa_to_sheet(termData);
            ws3['!cols']   = [...colsDef, { wch:8 }, { wch:12 }];
            ws3['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:8} }];
            for (let c = 0; c < 9; c++) {
                const ref = XLSX.utils.encode_cell({ r:2, c });
                if (!ws3[ref]) ws3[ref] = { v:'', t:'s' };
                ws3[ref].s = { fill: HDR_TERM, font:{ bold:true }, alignment:{ horizontal:'center' } };
            }
            XLSX.utils.book_append_sheet(wb, ws3, '해지');

            const fileName = `${yr}년${mo}월_관리사무실제출.xlsx`;
            XLSX.writeFile(wb, fileName);
            showToast(`${fileName} 다운로드 완료`, 'success');
        } catch(e) {
            showToast('엑셀 생성 오류: ' + e.message, 'error');
            console.error(e);
        }
    },

    // ══════════════════════════════════════════════════════
    // 버튼2: 운영비 청구서 (프로그램별 수강료 합계)
    // ══════════════════════════════════════════════════════
    async downloadOperationBillExcel() {
        if (!this._data) { showToast('먼저 조회해주세요', 'error'); return; }
        try {
            await this._loadSheetJS();
            const XLSX = window.XLSX;
            const d    = this._data;
            const yr   = d.year;
            const mo   = String(d.month).padStart(2,'0');
            const monthLabel = `${yr}년 ${mo}월`;
            const wb   = XLSX.utils.book_new();

            // 프로그램별 집계 (해지자 포함 — 당월 실부과액 기준)
            const progMap = {};
            (d.settlement_rows || []).forEach(r => {
                const p = r.program_name || '미분류';
                if (!progMap[p]) progMap[p] = { fee: 0, count: 0, cancel: 0 };
                progMap[p].count++;
                progMap[p].fee += (Number(r.monthly_fee) || 0);
                if (r.is_end_cancel || r.is_mid_cancel) progMap[p].cancel++;
            });

            const ORANGE_HDR = { fgColor: { rgb: 'FAD7A0' } };
            const data = [
                [`${monthLabel} 운영비 청구서`], [],
                ['프로그램', '수강인원', '해지인원', '수강료 합계(원)'],
            ];
            let grandTotal = 0;
            let grandCount = 0;
            Object.entries(progMap).forEach(([prog, info]) => {
                data.push([prog, info.count, info.cancel, info.fee]);
                grandTotal += info.fee;
                grandCount += info.count;
            });
            data.push([]); // 빈 행
            data.push(['합계', grandCount, '', grandTotal]);

            const ws = XLSX.utils.aoa_to_sheet(data);
            ws['!cols']   = [{ wch:28 }, { wch:10 }, { wch:10 }, { wch:16 }];
            ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:3} }];

            // 헤더 스타일
            for (let c = 0; c < 4; c++) {
                const ref = XLSX.utils.encode_cell({ r:2, c });
                if (!ws[ref]) ws[ref] = { v:'', t:'s' };
                ws[ref].s = { fill: ORANGE_HDR, font:{ bold:true }, alignment:{ horizontal:'center' } };
            }

            // 합계 행 굵게
            const sumRow = data.length - 1;
            for (let c = 0; c < 4; c++) {
                const ref = XLSX.utils.encode_cell({ r: sumRow, c });
                if (!ws[ref]) ws[ref] = { v:'', t:'s' };
                if (!ws[ref].s) ws[ref].s = {};
                ws[ref].s.font = { bold: true };
                ws[ref].s.fill = { fgColor: { rgb: 'FEF9E7' } };
            }

            XLSX.utils.book_append_sheet(wb, ws, '운영비 청구서');
            const fileName = `${yr}년${mo}월_운영비청구서.xlsx`;
            XLSX.writeFile(wb, fileName);
            showToast(`${fileName} 다운로드 완료`, 'success');
        } catch(e) {
            showToast('엑셀 생성 오류: ' + e.message, 'error');
            console.error(e);
        }
    },

    // ══════════════════════════════════════════════════════
    // 버튼3: 강사 인건비 (강사별 담당 타임 × 타임별 횟수 × 단가)
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
            // 강사 목록 (assigned_programs: 객체 배열 신형)
            const instrRes  = await fetch(`/api/instructors?complexId=${cid}`);
            const instrJson = await instrRes.json();
            const instructorList = instrJson.data || [];

            // 당월 타임별 수업횟수 맵 { program_name: { time_slot: count } }
            const slotSessionMap = this._sessionEdits || {};

            const PURPLE_HDR  = { fgColor: { rgb: 'E8DAEF' } };
            const SUBTOTAL_BG = { fgColor: { rgb: 'F5EEF8' } };
            const GRAND_BG    = { fgColor: { rgb: 'EDE7F6' } };

            // 헤더: 강사명 / 프로그램 / 담당타임 / 수업유형 / 타임별횟수 / 타임당단가 / 인건비
            const data = [
                [`${monthLabel} 강사 인건비 정산서`], [],
                ['강사명', '프로그램', '담당 타임/수강생', '수업 유형', '월 수업횟수', '타임당 단가(원)', '인건비(원)'],
            ];
            const styleRows = []; // { rowIdx, style:'subtotal'|'grand' }
            let rowIdx = 3;

            let grandPayroll = 0;

            instructorList.forEach(instr => {
                const rates    = instr.hourly_rates    || {};
                const assigned = Array.isArray(instr.assigned_programs) ? instr.assigned_programs : [];

                // 구형 문자열 배열 하위호환
                const isLegacy = assigned.length > 0 && typeof assigned[0] === 'string';
                if (isLegacy || !assigned.length) {
                    data.push([instr.name, '(담당 타임 미설정 — 강사 관리에서 타임별 설정 필요)', '', '', '', '', '']);
                    rowIdx++;
                    return;
                }

                let instrTotal = 0;

                assigned.forEach(a => {
                    const { program_name, time_slot, type } = a;
                    const rate = Number(rates[type]) || 0;
                    const typeLabel = { group:'그룹', private:'개인', duet:'듀엣' }[type] || type;

                    let sessions = 0;
                    if (time_slot === 'free') {
                        // 개인/듀엣: 전체 슬롯 합계 (_total 포함)
                        const pm = slotSessionMap[program_name] || {};
                        sessions = Object.values(pm).reduce((a,b) => a + (Number(b)||0), 0);
                    } else {
                        sessions = Number((slotSessionMap[program_name] || {})[time_slot]) || 0;
                    }

                    const payroll = sessions * rate;
                    instrTotal   += payroll;

                    // 개인/듀엣: 수강생 이름 표시 (application_id 기반)
                    const studentLabel = (time_slot === 'free' && a.student_name)
                        ? a.student_name + (a.student_dong ? ` (${a.student_dong}동 ${a.student_ho}호)` : '')
                        : (time_slot === 'free' ? '자유시간' : time_slot);

                    data.push([
                        instr.name,
                        program_name,
                        studentLabel,
                        typeLabel,
                        sessions,
                        rate,
                        payroll,
                    ]);
                    rowIdx++;
                });

                // 소계
                data.push(['', `${instr.name} 소계`, '', '', '', '', instrTotal]);
                styleRows.push({ rowIdx, style: 'subtotal' });
                rowIdx++;
                data.push([]); // 빈 행
                rowIdx++;

                grandPayroll += instrTotal;
            });

            // 전체 합계
            data.push(['전체 합계', '', '', '', '', '', grandPayroll]);
            styleRows.push({ rowIdx, style: 'grand' });

            const ws = XLSX.utils.aoa_to_sheet(data);
            ws['!cols'] = [
                { wch:12 }, { wch:24 }, { wch:10 }, { wch:8 }, { wch:12 }, { wch:14 }, { wch:14 },
            ];
            ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:6} }];

            // 헤더 스타일
            for (let c = 0; c < 7; c++) {
                const ref = XLSX.utils.encode_cell({ r:2, c });
                if (!ws[ref]) ws[ref] = { v:'', t:'s' };
                ws[ref].s = { fill: PURPLE_HDR, font:{ bold:true }, alignment:{ horizontal:'center' } };
            }

            // 소계/합계 스타일
            styleRows.forEach(({ rowIdx: ri, style }) => {
                const fill = style === 'grand' ? GRAND_BG : SUBTOTAL_BG;
                for (let c = 0; c < 7; c++) {
                    const ref = XLSX.utils.encode_cell({ r: ri, c });
                    if (!ws[ref]) ws[ref] = { v:'', t:'s' };
                    if (!ws[ref].s) ws[ref].s = {};
                    ws[ref].s.fill = fill;
                    ws[ref].s.font = { bold: true };
                }
            });

            XLSX.utils.book_append_sheet(wb, ws, '강사 인건비');
            const fileName = `${yr}년${mo}월_강사인건비.xlsx`;
            XLSX.writeFile(wb, fileName);
            showToast(`${fileName} 다운로드 완료`, 'success');
        } catch(e) {
            showToast('엑셀 생성 오류: ' + e.message, 'error');
            console.error(e);
        }
    },
};
