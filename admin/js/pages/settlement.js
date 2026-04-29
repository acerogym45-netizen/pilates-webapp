/** 월별 정산 리포트 - v3.0
 *  엑셀 통합 2시트:
 *    시트1) 동호수별 부과내역  (동↑ 호↑, 전화번호 포함, 프로그램별 소계)
 *    시트2) 상세내역          (수강자현황 + 중도해지 + 차월해지 + 차월신규접수)
 *
 *  분류 정의:
 *    현재수강자   = applications.status='approved' 전체
 *    기존수강자   = 현재수강자 중 approved_at < monthStart
 *    차월신규접수 = 현재수강자 - 기존수강자 (해당월에 새로 승인)
 *    중도해지     = cancellations.status='approved' 중 termination_date가 말일 아닌 경우
 *    차월해지     = cancellations.status='approved' 중 중도해지 제외 (말일 or 날짜미상)
 *    취소         = applications.status='cancelled' → 집계 제외 (수강 시작 전 취소)
 */
const settlement = {
    _data: null,

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
          <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:16px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
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
          <div id="settlementSummary" style="display:none;background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;gap:18px;flex-wrap:wrap;align-items:center"></div>

          <!-- 범례 -->
          <div style="background:#fffbf0;border:1px solid #f0e0b0;border-radius:8px;padding:10px 16px;margin-bottom:14px;font-size:.8rem;color:#7a6020;line-height:1.7">
            <strong>분류 기준</strong> &nbsp;|&nbsp;
            <span style="color:#2980b9">■ 현재수강자</span>: status=approved 전체 &nbsp;
            <span style="color:#6f42c1">■ 기존수강자</span>: 조회월 이전부터 수강 중 &nbsp;
            <span style="color:#27ae60">■ 차월신규접수</span>: 해당월에 승인 → 다음달 부과 &nbsp;
            <span style="color:#e74c3c">■ 중도해지</span>: 월 중간 해지 → 관리비 후청구 &nbsp;
            <span style="color:#e67e22">■ 차월해지</span>: 말일 해지 → 다음달 미부과 &nbsp;
            <span style="color:#999">■ 취소</span>: 수강 시작 전 취소 → 집계 제외
          </div>

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
        resEl.innerHTML = `<div style="text-align:center;padding:40px;color:#aaa">
          <i class="fas fa-spinner fa-spin fa-2x"></i><br><br>데이터 조회 중...</div>`;

        try {
            const cid = getEffectiveComplexId();
            if (!cid) throw new Error('단지를 선택해주세요');

            const resp = await fetch(`/api/settlement-report?complexId=${cid}&year=${yr}&month=${mo}`);
            const json = await resp.json();
            if (!json.success) throw new Error(json.error);

            this._data = json;
            this._render(json);

            if (excelBtn) excelBtn.style.display = '';

            // 요약 뱃지
            if (sumEl) {
                const s = json.summary;
                sumEl.style.display = 'flex';
                sumEl.innerHTML =
                    `<span style="font-size:.82rem;color:#555">
                      <i class="fas fa-users" style="color:#2980b9;margin-right:3px"></i>
                      수강자 <strong style="color:#2980b9">${s.approved_count}</strong>명
                      <span style="color:#bbb;margin:0 4px">|</span>
                      기존 <strong style="color:#6f42c1">${s.existing_count}</strong>명
                      <span style="color:#bbb;margin:0 4px">|</span>
                      차월신규 <strong style="color:#27ae60">${s.next_new_count}</strong>건
                      <span style="color:#bbb;margin:0 4px">|</span>
                      중도해지 <strong style="color:#e74c3c">${s.mid_cancel_count}</strong>건
                      <span style="color:#bbb;margin:0 4px">|</span>
                      차월해지 <strong style="color:#e67e22">${s.end_cancel_count}</strong>건
                      <span style="color:#bbb;margin:0 4px">|</span>
                      총부과 <strong style="color:#8e44ad">${this._fmtFee(s.total_charge)}</strong>
                      <span style="font-size:.75rem;color:#aaa">(중도해지 제외)</span>
                    </span>`;
            }
        } catch(e) {
            resEl.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c">
              <i class="fas fa-exclamation-triangle fa-2x"></i><br><br>${e.message}</div>`;
        }
    },

    // ──────────────────────────────────────────────────
    // 화면 렌더링
    // ──────────────────────────────────────────────────
    _render(d) {
        const resEl = document.getElementById('settlementResult');
        const yr    = d.year, mo = d.month;
        const nextKey = d.nextKey;

        let html = '';

        // ── 1. 현재 수강자 (동↑ 호↑ 이미 정렬된 approved 목록)
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

        // ── 2. 중도해지자 (관리비 후청구)
        html += this._sectionCard(
            `<i class="fas fa-cut" style="color:#e74c3c"></i> 중도해지자
             <small style="font-weight:400;color:#888;font-size:.8rem">(관리비 후청구 — 해지일 기준 일할 청구)</small>`,
            '#e74c3c', '#fff5f5',
            d.mid_cancel || [],
            d.summary.mid_cancel_count,
            ['dong','ho','name','phone','program_name','termination_date','note'],
            ['동','호수','이름','연락처','프로그램','해지일','비고'],
            {}
        );

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

    _parseDong(d) { return parseInt((d || '').replace(/[^0-9]/g, '')) || 0; },
    _parseHo(h)   { return parseInt((h || '').replace(/[^0-9]/g, '')) || 0; },

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

    _fmtFee(v) {
        if (v === null || v === undefined || v === '') return '-';
        const n = Number(v);
        if (isNaN(n) || n === 0) return '-';
        return n.toLocaleString('ko-KR') + '원';
    },

    // ──────────────────────────────────────────────────────
    // 엑셀 2시트 통합 다운로드
    //
    //  시트1: 동호수별 부과내역
    //    - 동↑ 호↑ 정렬 (이미 API에서 정렬됨)
    //    - 컬럼: 동, 호수, 이름, 연락처, 프로그램, 희망시간대, 요금, 비고
    //    - 프로그램별 소계 행, 최종 합계 행
    //    - 중도해지자는 비고에 '중도해지(후청구)' 표시, 금액은 '-'
    //
    //  시트2: 상세내역
    //    - [수강자현황] 프로그램별 정렬, 소계/합계 포함
    //    - [중도해지자] 동, 호수, 이름, 연락처, 프로그램, 해지일, 비고
    //    - [차월해지자] 동, 호수, 이름, 연락처, 프로그램, 해지일, 비고
    //    - [차월신규접수] 동, 호수, 이름, 연락처, 프로그램, 희망시간대, 요금, 승인일, 비고
    // ──────────────────────────────────────────────────────
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

            // ══════════════════════════════════════════════
            // 시트1: 동호수별 부과내역
            //   행 구성: 각 세대의 수강자를 1행씩 펼침
            //   프로그램별 소계는 시트1에서는 생략 (참조파일 형식)
            //   세대 내 수강자 2명 이상이면 소계 행 추가
            //   마지막에 총 합계 행
            // ══════════════════════════════════════════════
            const s1 = [];
            s1.push([`${monthLabel} 필라테스 관리비 부과내역`]);
            s1.push([]); // 빈 행
            s1.push(['동', '호수', '이름', '연락처', '프로그램종류', '희망시간대', '요금', '비고']);

            let grandTotal1 = 0;

            (d.dongho_rows || []).forEach(dh => {
                dh.items.forEach(it => {
                    const isMid  = it.is_mid_cancel;
                    const fee    = isMid ? '' : (it.monthly_fee || '');
                    const note   = isMid ? '중도해지(후청구)' : (it.is_next_new ? '차월신규' : '');
                    s1.push([
                        dh.dong,
                        dh.ho,
                        it.name,
                        it.phone || dh.phone || '',
                        it.program_name || '',
                        it.preferred_time || '',
                        fee,
                        note
                    ]);
                    if (!isMid) grandTotal1 += Number(it.monthly_fee) || 0;
                });
                // 세대 내 수강자 2명 이상: 소계 행
                if (dh.items.length > 1) {
                    const subFee = dh.items.reduce((sum, it) =>
                        it.is_mid_cancel ? sum : sum + (Number(it.monthly_fee) || 0), 0);
                    s1.push(['', '', `[${dh.dong} ${dh.ho} 소계]`, '', '', '', subFee, '']);
                }
            });

            s1.push([]); // 빈 행
            s1.push(['', '', '', '', '', '합계', grandTotal1, '']);

            const ws1 = XLSX.utils.aoa_to_sheet(s1);
            ws1['!cols'] = [
                {wch:8},{wch:8},{wch:10},{wch:14},{wch:24},{wch:16},{wch:10},{wch:16}
            ];
            // 첫 행 병합 (제목)
            ws1['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:7} }];
            XLSX.utils.book_append_sheet(wb, ws1, '동호수별 부과내역');

            // ══════════════════════════════════════════════
            // 시트2: 상세내역
            //   ① 수강자 현황 (프로그램별 정렬 + 소계 + 합계)
            //   ② 중도해지자  (동, 호수, 이름, 연락처, 프로그램, 해지일, 비고)
            //   ③ 차월해지자  (동, 호수, 이름, 연락처, 프로그램, 해지일, 비고)
            //   ④ 차월신규접수(동, 호수, 이름, 연락처, 프로그램, 희망시간대, 요금, 승인일, 비고)
            // ══════════════════════════════════════════════
            const s2 = [];

            // ① 수강자 현황
            s2.push([`[${monthLabel} 수강자 현황]  총 ${d.summary.approved_count}명`]);
            s2.push(['동', '호수', '이름', '연락처', '프로그램종류', '희망시간대', '요금']);

            // 프로그램별 그룹
            const progOrder = [];
            const progMap   = new Map();
            const approvedSorted = [...(d.approved || [])].sort((a, b) => {
                if ((a.program_name||'') < (b.program_name||'')) return -1;
                if ((a.program_name||'') > (b.program_name||'')) return 1;
                return 0;
            });
            approvedSorted.forEach(a => {
                const p = a.program_name || '미분류';
                if (!progMap.has(p)) { progMap.set(p, []); progOrder.push(p); }
                progMap.get(p).push(a);
            });

            let grandTotal2 = 0;
            progOrder.forEach(prog => {
                const items = progMap.get(prog);
                items.forEach(a => {
                    s2.push([
                        a.dong, a.ho, a.name, a.phone || '',
                        a.program_name || '', a.preferred_time || '',
                        a.monthly_fee || ''
                    ]);
                });
                const sub = items.reduce((s, a) => s + (Number(a.monthly_fee) || 0), 0);
                grandTotal2 += sub;
                s2.push(['', '', '', '', prog, '소계', sub]);
            });
            s2.push(['', '', '', '', '', '합계', grandTotal2]);
            s2.push([]); // 빈 줄

            // ② 중도해지자
            if (d.mid_cancel && d.mid_cancel.length) {
                s2.push([`[중도해지자]  ${d.mid_cancel.length}명  ※ 관리비 후청구 (해지일 기준 일할 계산)`]);
                s2.push(['동', '호수', '이름', '연락처', '프로그램종류', '해지일', '비고']);
                d.mid_cancel.forEach(r => {
                    s2.push([
                        r.dong, r.ho, r.name, r.phone || '',
                        r.program_name || '', r.termination_date || '', r.note || ''
                    ]);
                });
                s2.push([]); // 빈 줄
            }

            // ③ 차월해지자
            if (d.end_cancel && d.end_cancel.length) {
                s2.push([`[차월해지자]  ${d.end_cancel.length}명  ※ ${d.nextKey} 미부과 대상`]);
                s2.push(['동', '호수', '이름', '연락처', '프로그램종류', '해지일', '비고']);
                d.end_cancel.forEach(r => {
                    s2.push([
                        r.dong, r.ho, r.name, r.phone || '',
                        r.program_name || '', r.termination_date || '', r.note || ''
                    ]);
                });
                s2.push([]); // 빈 줄
            }

            // ④ 차월신규접수
            if (d.next_new && d.next_new.length) {
                s2.push([`[차월신규접수]  ${d.next_new.length}명  ※ ${d.nextKey}부터 부과 대상`]);
                s2.push(['동', '호수', '이름', '연락처', '프로그램종류', '희망시간대', '요금', '승인일', '비고']);
                d.next_new.forEach(r => {
                    s2.push([
                        r.dong, r.ho, r.name, r.phone || '',
                        r.program_name || '', r.preferred_time || '',
                        r.monthly_fee || '', r.approved_at || '', r.note || ''
                    ]);
                });
            }

            const ws2 = XLSX.utils.aoa_to_sheet(s2);
            ws2['!cols'] = [
                {wch:8},{wch:8},{wch:10},{wch:14},{wch:24},{wch:16},{wch:10},{wch:12},{wch:18}
            ];
            XLSX.utils.book_append_sheet(wb, ws2, '상세내역');

            // 다운로드
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
