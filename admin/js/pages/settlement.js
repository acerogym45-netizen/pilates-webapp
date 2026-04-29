/** 월별 정산 리포트 - v4.0
 *  엑셀 통합 2시트:
 *    시트1) 동호수별 부과내역  (동↑ 호↑, 전화번호 포함, 프로그램별 소계)
 *    시트2) 상세내역          (수강자현황 + 중도해지 + 차월해지 + 차월신규접수)
 *
 *  중도해지 청구 공식:
 *    위약금       = 월수강료 × 10%
 *    수강료       = 수강횟수 × 15,000원 (회당단가)
 *    총청구금액   = 위약금 + 수강료
 *
 *  수강횟수 입력 UI:
 *    - 중도해지 섹션에서 인라인으로 수강횟수 입력
 *    - 입력 즉시 위약금/수강료/총청구금액 자동 계산 표시
 *    - [저장] 버튼으로 DB 반영 (PUT /api/cancellations/:id)
 */
const settlement = {
    _data:        null,
    _midEdits:    {},   // { cancellation_id: { attended, billing } } — 로컬 편집 상태
    SESSION_FEE:  15000, // 회당 단가 (원)
    PENALTY_RATE: 0.10,  // 위약금 비율 (10%)

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
              <div style="font-size:.8rem;color:#888;margin-top:2px">수강자 현황 · 중도해지 · 차월해지 · 차월신규접수 자동 분류 → 엑셀 통합 다운로드 (2시트)</div>
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
              <i class="fas fa-file-excel"></i> 엑셀 다운로드 (2시트 통합)
            </button>
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

    async load() {
        const monthVal = document.getElementById('settlementMonth')?.value;
        if (!monthVal) return;
        const [yr, mo] = monthVal.split('-').map(Number);

        const resEl    = document.getElementById('settlementResult');
        const sumEl    = document.getElementById('settlementSummary');
        const excelBtn = document.getElementById('settlementExcelBtn');
        if (excelBtn) excelBtn.style.display = 'none';
        if (sumEl)    sumEl.style.display     = 'none';
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

            // DB에 저장된 수강횟수 / billing 값을 편집 상태에 초기화
            (json.mid_cancel || []).forEach(r => {
                if (r.id) {
                    this._midEdits[r.id] = {
                        attended: r.attended_sessions ?? '',
                        billing:  r.billing_amount    ?? null,
                    };
                }
            });

            this._render(json);
            if (excelBtn) excelBtn.style.display = '';

            // 요약 뱃지
            if (sumEl) {
                const s = json.summary;
                sumEl.style.display = 'block';
                sumEl.innerHTML =
                    `<span style="font-size:.82rem;color:#555;display:flex;gap:14px;flex-wrap:wrap;align-items:center">
                      <span><i class="fas fa-users" style="color:#2980b9;margin-right:3px"></i>
                        수강자 <strong style="color:#2980b9">${s.approved_count}</strong>명</span>
                      <span style="color:#ddd">|</span>
                      <span>기존 <strong style="color:#6f42c1">${s.existing_count}</strong>명</span>
                      <span style="color:#ddd">|</span>
                      <span>차월신규 <strong style="color:#27ae60">${s.next_new_count}</strong>건</span>
                      <span style="color:#ddd">|</span>
                      <span>중도해지 <strong style="color:#e74c3c">${s.mid_cancel_count}</strong>건</span>
                      <span style="color:#ddd">|</span>
                      <span>차월해지 <strong style="color:#e67e22">${s.end_cancel_count}</strong>건</span>
                      <span style="color:#ddd">|</span>
                      <span>총부과 <strong style="color:#8e44ad">${this._fmtFee(s.total_charge)}</strong>
                        <span style="font-size:.72rem;color:#aaa">(중도해지 제외)</span></span>
                    </span>`;
            }
        } catch(e) {
            resEl.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c">
              <i class="fas fa-exclamation-triangle fa-2x"></i><br><br>${e.message}</div>`;
        }
    },

    // ──────────────────────────────────────────────────
    // 청구금액 계산
    //   위약금   = monthly_fee × 10%
    //   수강료   = attended × 15,000
    //   총청구   = 위약금 + 수강료
    // ──────────────────────────────────────────────────
    _calcBilling(monthlyFee, attended) {
        const fee      = Number(monthlyFee) || 0;
        const cnt      = Number(attended)   || 0;
        const penalty  = Math.round(fee * this.PENALTY_RATE);
        const courseFee= cnt * this.SESSION_FEE;
        const total    = penalty + courseFee;
        return { penalty, courseFee, total };
    },

    // ──────────────────────────────────────────────────
    // 화면 렌더링
    // ──────────────────────────────────────────────────
    _render(d) {
        const resEl  = document.getElementById('settlementResult');
        const yr     = d.year, mo = d.month;
        const nextKey = d.nextKey;

        let html = '';

        // ── 1. 현재 수강자
        const approvedSorted = [...(d.approved || [])].sort((a, b) => {
            const da = this._parseDong(a.dong), db = this._parseDong(b.dong);
            if (da !== db) return da - db;
            return this._parseHo(a.ho) - this._parseHo(b.ho);
        });
        html += this._sectionCard(
            `<i class="fas fa-users" style="color:#2980b9"></i> ${yr}년 ${mo}월 수강자 현황`,
            '#2980b9', '#f0f7ff',
            approvedSorted,
            d.summary.approved_count,
            ['dong','ho','name','phone','program_name','preferred_time','monthly_fee'],
            ['동','호수','이름','연락처','프로그램','시간','월수강료'],
            { monthly_fee: v => this._fmtFee(v) }
        );

        // ── 2. 중도해지자 — 수강횟수 입력 특수 테이블
        html += this._midCancelCard(d.mid_cancel || [], d.summary.mid_cancel_count);

        // ── 3. 차월해지자
        html += this._sectionCard(
            `<i class="fas fa-calendar-times" style="color:#e67e22"></i> 차월해지자
             <small style="font-weight:400;color:#888;font-size:.8rem">(${nextKey} 미부과 대상)</small>`,
            '#e67e22', '#fffaf5',
            d.end_cancel || [],
            d.summary.end_cancel_count,
            ['dong','ho','name','phone','program_name','termination_date','note'],
            ['동','호수','이름','연락처','프로그램','해지일','비고'],
            {}
        );

        // ── 4. 차월신규접수
        html += this._sectionCard(
            `<i class="fas fa-user-plus" style="color:#27ae60"></i> 차월신규접수
             <small style="font-weight:400;color:#888;font-size:.8rem">(${nextKey}부터 부과 대상)</small>`,
            '#27ae60', '#f0fff4',
            d.next_new || [],
            d.summary.next_new_count,
            ['dong','ho','name','phone','program_name','preferred_time','monthly_fee','approved_at','note'],
            ['동','호수','이름','연락처','프로그램','시간','월수강료','승인일','비고'],
            { monthly_fee: v => this._fmtFee(v) }
        );

        resEl.innerHTML = html;
    },

    // ──────────────────────────────────────────────────
    // 중도해지 특수 카드 (수강횟수 입력 + 자동계산)
    // ──────────────────────────────────────────────────
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
            const thead = `
              <tr>
                <th style="${thStyle}">동</th>
                <th style="${thStyle}">호수</th>
                <th style="${thStyle}">이름</th>
                <th style="${thStyle}">연락처</th>
                <th style="${thStyle}">프로그램</th>
                <th style="${thStyle}">해지일</th>
                <th style="${thStyle}">월수강료</th>
                <th style="${thStyle}">수강횟수<br><span style="font-weight:400;font-size:.7rem;color:#e74c3c">직접 입력</span></th>
                <th style="${thStyle}">위약금<br><span style="font-weight:400;font-size:.7rem;color:#888">월수강료×10%</span></th>
                <th style="${thStyle}">수강료<br><span style="font-weight:400;font-size:.7rem;color:#888">횟수×15,000</span></th>
                <th style="${thStyle}">총청구금액</th>
                <th style="${thStyle}">저장</th>
              </tr>`;

            const tbodyRows = rows.map((r, i) => {
                const id        = r.id || `idx_${i}`;
                const fee       = Number(r.monthly_fee) || 0;
                const savedAtt  = this._midEdits[id]?.attended ?? '';
                const calc      = savedAtt !== '' ? this._calcBilling(fee, savedAtt) : null;
                const bgRow     = i % 2 ? 'background:#fafafa' : '';

                const tdS = `padding:6px 8px;border:1px solid #eee;font-size:.82rem;text-align:center;${bgRow}`;
                return `<tr id="mid-row-${id}">
                  <td style="${tdS}">${r.dong||''}</td>
                  <td style="${tdS}">${r.ho||''}</td>
                  <td style="${tdS};font-weight:600">${r.name||''}</td>
                  <td style="${tdS}">${r.phone||''}</td>
                  <td style="${tdS}">${r.program_name||''}</td>
                  <td style="${tdS}">${r.termination_date||''}</td>
                  <td style="${tdS};color:#2980b9;font-weight:600">${fee ? fee.toLocaleString('ko-KR')+'원' : '-'}</td>
                  <td style="${tdS}">
                    <input type="number" min="0" max="99"
                      id="att-${id}"
                      value="${savedAtt}"
                      oninput="settlement._onAttendChange('${id}', ${fee})"
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
                    <button onclick="settlement._saveMidBilling('${id}', ${fee})"
                      id="save-btn-${id}"
                      style="padding:4px 12px;background:#e74c3c;color:#fff;border:none;
                             border-radius:5px;font-size:.78rem;font-weight:700;cursor:pointer;
                             white-space:nowrap">
                      <i class="fas fa-save"></i> 저장
                    </button>
                  </td>
                </tr>`;
            }).join('');

            body = `<div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;min-width:800px">
                <thead>${thead}</thead>
                <tbody>${tbodyRows}</tbody>
              </table>
            </div>`;
        }

        return `
        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:18px;overflow:hidden">
          <div style="background:#fff5f5;border-bottom:2px solid #e74c3c;padding:12px 18px;
                      display:flex;align-items:center;flex-wrap:wrap;gap:6px">
            <span style="font-size:.95rem;font-weight:700;color:#222">
              <i class="fas fa-cut" style="color:#e74c3c"></i> 중도해지자${badge}
              <small style="font-weight:400;color:#888;font-size:.8rem;margin-left:6px">(관리비 후청구)</small>
            </span>
            ${formula}
          </div>
          ${body}
        </div>`;
    },

    // 수강횟수 입력 시 실시간 계산
    _onAttendChange(id, monthlyFee) {
        const input = document.getElementById(`att-${id}`);
        if (!input) return;
        const attended = input.value;
        this._midEdits[id] = { ...(this._midEdits[id]||{}), attended };

        const calc = attended !== '' && attended >= 0
            ? this._calcBilling(monthlyFee, attended)
            : null;

        const penEl    = document.getElementById(`penalty-${id}`);
        const courseEl = document.getElementById(`course-${id}`);
        const totalEl  = document.getElementById(`total-${id}`);

        if (penEl) penEl.innerHTML = calc
            ? `<span style="color:#e67e22;font-weight:600">${calc.penalty.toLocaleString('ko-KR')}원</span>`
            : `<span style="color:#ccc">-</span>`;
        if (courseEl) courseEl.innerHTML = calc
            ? `<span style="color:#2980b9;font-weight:600">${calc.courseFee.toLocaleString('ko-KR')}원</span>`
            : `<span style="color:#ccc">-</span>`;
        if (totalEl) totalEl.innerHTML = calc
            ? `<span style="color:#e74c3c;font-weight:700;font-size:.9rem">${calc.total.toLocaleString('ko-KR')}원</span>`
            : `<span style="color:#ccc">-</span>`;
    },

    // 저장 버튼 → DB 반영
    async _saveMidBilling(id, monthlyFee) {
        const input = document.getElementById(`att-${id}`);
        if (!input) return;
        const attended = parseInt(input.value);
        if (isNaN(attended) || attended < 0) {
            showToast('수강횟수를 올바르게 입력해주세요', 'error'); return;
        }

        const btn = document.getElementById(`save-btn-${id}`);
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

        try {
            const calc = this._calcBilling(monthlyFee, attended);

            // id가 idx_ 로 시작하면 실제 DB id가 없는 경우 (비정상)
            if (id.startsWith('idx_')) throw new Error('저장할 수 없는 레코드입니다 (id 없음)');

            const res = await fetch(`/api/cancellations/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attended_sessions: attended,
                    session_fee:       this.SESSION_FEE,
                    billing_amount:    calc.total,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || '저장 실패');

            // 로컬 상태 업데이트
            this._midEdits[id] = { attended, billing: calc.total };

            // _data 내 mid_cancel도 업데이트 (엑셀 다운로드 시 반영)
            if (this._data?.mid_cancel) {
                const row = this._data.mid_cancel.find(r => r.id === id);
                if (row) {
                    row.attended_sessions = attended;
                    row.billing_amount    = calc.total;
                }
            }

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> 저장됨';
                btn.style.background = '#27ae60';
                setTimeout(() => {
                    if (btn) {
                        btn.innerHTML = '<i class="fas fa-save"></i> 저장';
                        btn.style.background = '#e74c3c';
                    }
                }, 2000);
            }
            showToast(`${this._data?.mid_cancel?.find(r=>r.id===id)?.name || ''} 저장 완료`, 'success');

        } catch(e) {
            showToast('저장 오류: ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
        }
    },

    // ──────────────────────────────────────────────────
    // 공통 섹션 카드
    // ──────────────────────────────────────────────────
    _sectionCard(title, color, bg, rows, count, cols, labels, fmtMap) {
        const badge = `<span style="background:${color};color:#fff;font-size:.72rem;font-weight:700;
          padding:2px 9px;border-radius:20px;margin-left:8px;vertical-align:middle">${count}건</span>`;

        let tableHtml = '';
        if (!rows || !rows.length) {
            tableHtml = `<div style="text-align:center;padding:22px;color:#bbb;font-size:.9rem">해당 없음</div>`;
        } else {
            const thead = labels.map(l =>
                `<th style="padding:7px 8px;border:1px solid #ddd;font-size:.78rem;font-weight:700;
                  background:#f7f7f7;white-space:nowrap;text-align:center">${l}</th>`
            ).join('');
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
          </div>
          ${tableHtml}
        </div>`;
    },

    _parseDong(d) { return parseInt((d || '').replace(/[^0-9]/g, '')) || 0; },
    _parseHo(h)   { return parseInt((h || '').replace(/[^0-9]/g, '')) || 0; },

    _fmtFee(v) {
        if (v === null || v === undefined || v === '') return '-';
        const n = Number(v);
        if (isNaN(n) || n === 0) return '-';
        return n.toLocaleString('ko-KR') + '원';
    },

    // ══════════════════════════════════════════════════════
    // 엑셀 2시트 통합 다운로드
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
            const wb   = XLSX.utils.book_new();

            // ─────────────────────────────────────────────
            // 시트1: 동호수별 부과내역
            // ─────────────────────────────────────────────
            const s1 = [];
            s1.push([`${monthLabel} 필라테스 관리비 부과내역`]);
            s1.push([]);
            s1.push(['동', '호수', '이름', '연락처', '프로그램종류', '희망시간대', '요금', '비고']);

            let grandTotal1 = 0;
            (d.dongho_rows || []).forEach(dh => {
                dh.items.forEach(it => {
                    const isMid = it.is_mid_cancel;
                    const fee   = isMid ? '' : (it.monthly_fee || '');
                    const note  = isMid ? '중도해지(후청구)' : (it.is_next_new ? '차월신규' : '');
                    s1.push([
                        dh.dong, dh.ho,
                        it.name,
                        it.phone || dh.phone || '',
                        it.program_name   || '',
                        it.preferred_time || '',
                        fee, note
                    ]);
                    if (!isMid) grandTotal1 += Number(it.monthly_fee) || 0;
                });
                if (dh.items.length > 1) {
                    const sub = dh.items.reduce((s, it) =>
                        it.is_mid_cancel ? s : s + (Number(it.monthly_fee)||0), 0);
                    s1.push(['', '', `[${dh.dong} ${dh.ho} 소계]`, '', '', '', sub, '']);
                }
            });
            s1.push([]);
            s1.push(['', '', '', '', '', '합계', grandTotal1, '']);

            const ws1 = XLSX.utils.aoa_to_sheet(s1);
            ws1['!cols'] = [{wch:8},{wch:8},{wch:10},{wch:14},{wch:24},{wch:16},{wch:10},{wch:16}];
            ws1['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:7} }];
            XLSX.utils.book_append_sheet(wb, ws1, '동호수별 부과내역');

            // ─────────────────────────────────────────────
            // 시트2: 상세내역
            // ─────────────────────────────────────────────
            const s2 = [];

            // ① 수강자 현황
            s2.push([`[${monthLabel} 수강자 현황]  총 ${d.summary.approved_count}명`]);
            s2.push(['동','호수','이름','연락처','프로그램종류','희망시간대','요금']);

            const progOrder = [];
            const progMap   = new Map();
            const appSorted = [...(d.approved||[])].sort((a,b) =>
                (a.program_name||'') < (b.program_name||'') ? -1 :
                (a.program_name||'') > (b.program_name||'') ?  1 : 0);
            appSorted.forEach(a => {
                const p = a.program_name || '미분류';
                if (!progMap.has(p)) { progMap.set(p,[]); progOrder.push(p); }
                progMap.get(p).push(a);
            });

            let grandTotal2 = 0;
            progOrder.forEach(prog => {
                const items = progMap.get(prog);
                items.forEach(a => s2.push([
                    a.dong, a.ho, a.name, a.phone||'',
                    a.program_name||'', a.preferred_time||'', a.monthly_fee||''
                ]));
                const sub = items.reduce((s,a)=>s+(Number(a.monthly_fee)||0),0);
                grandTotal2 += sub;
                s2.push(['','','','', prog, '소계', sub]);
            });
            s2.push(['','','','','','합계', grandTotal2]);
            s2.push([]);

            // ② 중도해지자 — 수강횟수·청구 포함
            if (d.mid_cancel && d.mid_cancel.length) {
                s2.push([`[중도해지자]  ${d.mid_cancel.length}명  ※ 위약금(월수강료×10%) + 수강료(횟수×15,000원)`]);
                s2.push(['동','호수','이름','연락처','프로그램종류','해지일',
                         '월수강료','수강횟수','위약금(10%)','수강료(×15,000)','총청구금액']);
                d.mid_cancel.forEach(r => {
                    const id       = r.id;
                    const att      = this._midEdits[id]?.attended ?? r.attended_sessions ?? '';
                    const fee      = Number(r.monthly_fee) || 0;
                    const calc     = (att !== '' && att >= 0) ? this._calcBilling(fee, att) : null;
                    s2.push([
                        r.dong, r.ho, r.name, r.phone||'',
                        r.program_name||'', r.termination_date||'',
                        fee || '',
                        att !== '' ? att : '',
                        calc ? calc.penalty   : '',
                        calc ? calc.courseFee : '',
                        calc ? calc.total     : '',
                    ]);
                });
                s2.push([]);
            }

            // ③ 차월해지자
            if (d.end_cancel && d.end_cancel.length) {
                s2.push([`[차월해지자]  ${d.end_cancel.length}명  ※ ${d.nextKey} 미부과 대상`]);
                s2.push(['동','호수','이름','연락처','프로그램종류','해지일','비고']);
                d.end_cancel.forEach(r => s2.push([
                    r.dong, r.ho, r.name, r.phone||'',
                    r.program_name||'', r.termination_date||'', r.note||''
                ]));
                s2.push([]);
            }

            // ④ 차월신규접수
            if (d.next_new && d.next_new.length) {
                s2.push([`[차월신규접수]  ${d.next_new.length}명  ※ ${d.nextKey}부터 부과 대상`]);
                s2.push(['동','호수','이름','연락처','프로그램종류','희망시간대','요금','승인일','비고']);
                d.next_new.forEach(r => s2.push([
                    r.dong, r.ho, r.name, r.phone||'',
                    r.program_name||'', r.preferred_time||'',
                    r.monthly_fee||'', r.approved_at||'', r.note||''
                ]));
            }

            const ws2 = XLSX.utils.aoa_to_sheet(s2);
            ws2['!cols'] = [
                {wch:8},{wch:8},{wch:10},{wch:14},{wch:24},{wch:12},
                {wch:10},{wch:8},{wch:10},{wch:12},{wch:12}
            ];
            XLSX.utils.book_append_sheet(wb, ws2, '상세내역');

            const fileName = `${yr}년${mo}월_필라테스_정산.xlsx`;
            XLSX.writeFile(wb, fileName);
            showToast(`${fileName} 다운로드 완료`, 'success');

        } catch(e) {
            showToast('엑셀 생성 오류: ' + e.message, 'error');
            console.error(e);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-file-excel"></i> 엑셀 다운로드 (2시트 통합)';
            }
        }
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
};
