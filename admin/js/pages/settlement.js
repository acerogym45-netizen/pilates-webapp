/** 월별 정산 리포트 - v1.0 */
const settlement = {
    _data: null,

    async render() {
        const now  = new Date();
        const yr   = now.getFullYear();
        const mo   = now.getMonth() + 1;
        const defMonth = `${yr}-${String(mo).padStart(2,'0')}`;

        const html = `
        <div style="max-width:1100px;margin:0 auto;padding:0 4px">

          <!-- 헤더 -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px">
            <div>
              <h2 style="margin:0;font-size:1.3rem;font-weight:800;color:#1a252f">
                <i class="fas fa-file-invoice-dollar" style="color:#e67e22;margin-right:6px"></i>월별 정산 리포트
              </h2>
              <div style="font-size:.8rem;color:#888;margin-top:2px">중도해지 · 차월해지 · 차월신규접수 자동 분류</div>
            </div>
          </div>

          <!-- 월 선택 + 조회 -->
          <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:16px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <label style="font-size:.88rem;font-weight:700;color:#444"><i class="fas fa-calendar-alt" style="color:#e67e22;margin-right:4px"></i>조회 월</label>
            <input type="month" id="settlementMonth" value="${defMonth}"
              style="padding:7px 12px;border:1.5px solid #ddd;border-radius:7px;font-size:.92rem;color:#333;font-weight:600">
            <button onclick="settlement.load()"
              style="padding:8px 22px;background:#e67e22;color:#fff;border:none;border-radius:7px;font-size:.9rem;font-weight:700;cursor:pointer">
              <i class="fas fa-search"></i> 조회
            </button>
            <div id="settlementSummary" style="margin-left:auto;font-size:.82rem;color:#777"></div>
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

        const resEl = document.getElementById('settlementResult');
        resEl.innerHTML = `<div style="text-align:center;padding:40px;color:#aaa"><i class="fas fa-spinner fa-spin fa-2x"></i><br><br>데이터 조회 중...</div>`;

        try {
            const cid = getEffectiveComplexId();
            const resp = await fetch(`/api/settlement-report?complexId=${cid}&year=${yr}&month=${mo}`);
            const json = await resp.json();
            if (!json.success) throw new Error(json.error);

            this._data = json;
            this._render(json);

            // 요약
            const sumEl = document.getElementById('settlementSummary');
            if (sumEl) sumEl.innerHTML =
                `중도해지 <strong style="color:#e74c3c">${json.summary.mid_cancel_count}</strong>건 &nbsp;|&nbsp; ` +
                `차월해지 <strong style="color:#e67e22">${json.summary.end_cancel_count}</strong>건 &nbsp;|&nbsp; ` +
                `차월신규 <strong style="color:#27ae60">${json.summary.next_new_count}</strong>건`;
        } catch(e) {
            resEl.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c"><i class="fas fa-exclamation-triangle"></i> ${e.message}</div>`;
        }
    },

    _render(d) {
        const resEl = document.getElementById('settlementResult');
        const yr = d.year, mo = d.month;
        const monthLabel = `${yr}년 ${mo}월`;

        if (!d.mid_cancel.length && !d.end_cancel.length && !d.next_new.length) {
            resEl.innerHTML = `<div style="text-align:center;padding:60px;color:#aaa;font-size:1rem">
              <i class="fas fa-inbox fa-3x" style="margin-bottom:12px;display:block"></i>
              ${monthLabel} 해당 데이터가 없습니다
            </div>`;
            return;
        }

        let html = '';

        // ── 1. 중도해지자
        html += this._sectionHtml(
            'mid_cancel',
            `<i class="fas fa-scissors" style="color:#e74c3c"></i> 중도해지자 <span style="font-size:.85rem;font-weight:400;color:#888">(${monthLabel} 월중 해지 → 일할 계산 대상)</span>`,
            '#e74c3c',
            '#fff5f5',
            d.mid_cancel,
            [
                { key:'dong',             label:'동' },
                { key:'ho',               label:'호수' },
                { key:'name',             label:'이름' },
                { key:'phone',            label:'연락처' },
                { key:'program_name',     label:'프로그램' },
                { key:'preferred_time',   label:'시간' },
                { key:'termination_date', label:'해지일' },
                { key:'total_sessions',   label:'총수업횟수' },
                { key:'attended_sessions',label:'수강횟수' },
                { key:'monthly_fee',      label:'월수강료', fmt: this._fmtFee },
                { key:'charge_amount',    label:'부과액', fmt: this._fmtFee },
                { key:'refund_amount',    label:'환불액', fmt: this._fmtFee },
                { key:'note',             label:'비고' },
            ]
        );

        // ── 2. 차월해지자
        html += this._sectionHtml(
            'end_cancel',
            `<i class="fas fa-calendar-times" style="color:#e67e22"></i> 차월해지자 <span style="font-size:.85rem;font-weight:400;color:#888">(${monthLabel} 말 해지 → ${d.nextKey} 미부과)</span>`,
            '#e67e22',
            '#fffaf5',
            d.end_cancel,
            [
                { key:'dong',             label:'동' },
                { key:'ho',               label:'호수' },
                { key:'name',             label:'이름' },
                { key:'phone',            label:'연락처' },
                { key:'program_name',     label:'프로그램' },
                { key:'preferred_time',   label:'시간' },
                { key:'termination_date', label:'해지일' },
                { key:'note',             label:'비고' },
            ]
        );

        // ── 3. 차월신규접수
        html += this._sectionHtml(
            'next_new',
            `<i class="fas fa-user-plus" style="color:#27ae60"></i> 차월신규접수 <span style="font-size:.85rem;font-weight:400;color:#888">(${monthLabel} 신청 승인 → ${d.nextKey}부터 부과)</span>`,
            '#27ae60',
            '#f0fff4',
            d.next_new,
            [
                { key:'dong',           label:'동' },
                { key:'ho',             label:'호수' },
                { key:'name',           label:'이름' },
                { key:'phone',          label:'연락처' },
                { key:'program_name',   label:'프로그램' },
                { key:'preferred_time', label:'시간' },
                { key:'approved_at',    label:'승인일' },
                { key:'monthly_fee',    label:'월수강료', fmt: this._fmtFee },
                { key:'note',           label:'비고' },
            ]
        );

        resEl.innerHTML = html;
    },

    _sectionHtml(key, title, color, bg, rows, cols) {
        const countBadge = `<span style="background:${color};color:#fff;font-size:.75rem;font-weight:700;padding:2px 9px;border-radius:20px;margin-left:8px">${rows.length}건</span>`;

        let tableHtml = '';
        if (!rows.length) {
            tableHtml = `<div style="text-align:center;padding:22px;color:#bbb;font-size:.9rem">해당 없음</div>`;
        } else {
            const thead = cols.map(c =>
                `<th style="padding:7px 8px;border:1px solid #ddd;font-size:.78rem;font-weight:700;background:#f7f7f7;white-space:nowrap;text-align:center">${c.label}</th>`
            ).join('');

            const tbody = rows.map((r, i) => {
                const tds = cols.map(c => {
                    let val = r[c.key] ?? '';
                    if (c.fmt) val = c.fmt(val);
                    return `<td style="padding:6px 8px;border:1px solid #eee;font-size:.82rem;text-align:center;${i%2?'background:#fafafa':''}">${val}</td>`;
                }).join('');
                return `<tr>${tds}</tr>`;
            }).join('');

            tableHtml = `
            <div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;min-width:620px">
                <thead><tr>${thead}</tr></thead>
                <tbody>${tbody}</tbody>
              </table>
            </div>`;
        }

        return `
        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:18px;overflow:hidden">
          <div style="background:${bg};border-bottom:2px solid ${color};padding:12px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div style="font-size:.95rem;font-weight:700;color:#222">${title}${countBadge}</div>
            ${rows.length ? `<button onclick="settlement._downloadExcel('${key}')"
              style="padding:6px 16px;background:${color};color:#fff;border:none;border-radius:6px;font-size:.82rem;font-weight:700;cursor:pointer">
              <i class="fas fa-file-excel"></i> 엑셀 다운로드</button>` : ''}
          </div>
          ${tableHtml}
        </div>`;
    },

    _fmtFee(v) {
        if (v === null || v === undefined || v === '') return '-';
        const n = Number(v);
        if (isNaN(n)) return v;
        return n.toLocaleString('ko-KR') + '원';
    },

    _downloadExcel(key) {
        if (!this._data) return;
        const d   = this._data;
        const rows = d[key];
        if (!rows || !rows.length) { showToast('다운로드할 데이터가 없습니다', 'error'); return; }

        const labelMap = {
            mid_cancel: '중도해지자',
            end_cancel: '차월해지자',
            next_new:   '차월신규접수',
        };

        const colMap = {
            mid_cancel: ['dong','ho','name','phone','program_name','preferred_time','termination_date','total_sessions','attended_sessions','monthly_fee','charge_amount','refund_amount','note'],
            end_cancel: ['dong','ho','name','phone','program_name','preferred_time','termination_date','note'],
            next_new:   ['dong','ho','name','phone','program_name','preferred_time','approved_at','monthly_fee','note'],
        };
        const headerMap = {
            dong:'동', ho:'호수', name:'이름', phone:'연락처',
            program_name:'프로그램', preferred_time:'시간',
            termination_date:'해지일', total_sessions:'총수업횟수',
            attended_sessions:'수강횟수', monthly_fee:'월수강료',
            charge_amount:'부과액', refund_amount:'환불액',
            approved_at:'승인일', note:'비고'
        };

        const cols = colMap[key];
        const headers = cols.map(c => headerMap[c] || c);

        // BOM + CSV
        let csv = '\uFEFF'; // UTF-8 BOM (Excel 한글 깨짐 방지)
        csv += headers.join(',') + '\n';
        rows.forEach(r => {
            const line = cols.map(c => {
                let v = r[c] ?? '';
                if (v === null || v === undefined) v = '';
                v = String(v).replace(/"/g, '""');
                if (v.includes(',') || v.includes('\n') || v.includes('"')) v = `"${v}"`;
                return v;
            }).join(',');
            csv += line + '\n';
        });

        const monthLabel = `${d.year}년${String(d.month).padStart(2,'0')}월`;
        const fileName   = `${monthLabel}_${labelMap[key]}.csv`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
        showToast(`${fileName} 다운로드 완료`, 'success');
    },

    // 전체 통합 엑셀 다운로드 (3개 분류 합본)
    _downloadAll() {
        if (!this._data) return;
        const d = this._data;
        const monthLabel = `${d.year}년${String(d.month).padStart(2,'0')}월`;

        const sections = [
            { key:'mid_cancel', label:'중도해지자' },
            { key:'end_cancel', label:'차월해지자' },
            { key:'next_new',   label:'차월신규접수' },
        ];

        let csv = '\uFEFF';
        sections.forEach(sec => {
            const rows = d[sec.key];
            if (!rows.length) return;
            csv += `[${sec.label}]\n`;
            csv += `동,호수,이름,연락처,프로그램,시간,비고\n`;
            rows.forEach(r => {
                csv += [r.dong,r.ho,r.name,r.phone,r.program_name,r.preferred_time,r.note||'']
                    .map(v => { v=String(v||''); if(v.includes(','))v=`"${v}"`; return v; })
                    .join(',') + '\n';
            });
            csv += '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `${monthLabel}_정산리포트_전체.csv`; a.click();
        URL.revokeObjectURL(url);
        showToast('전체 정산 리포트 다운로드 완료', 'success');
    }
};
