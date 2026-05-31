/**
 * admin/js/pages/backup.js
 * 관리자 DB 백업 관리 페이지
 *
 * - 백업 목록 테이블 (날짜 / 라벨 / 행수 / 용량 / 생성자)
 * - 즉시 백업 실행 버튼
 * - 각 백업 → JSON 다운로드 / 삭제
 */

'use strict';

const backup = (() => {

    // ── 유틸 ──────────────────────────────────────────────────────────────────
    function fmtDate(iso) {
        if (!iso) return '-';
        const d   = new Date(iso);
        const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const pad = n => String(n).padStart(2, '0');
        return `${kst.getUTCFullYear()}.${pad(kst.getUTCMonth()+1)}.${pad(kst.getUTCDate())} `
             + `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
    }

    function fmtSize(bytes) {
        if (!bytes && bytes !== 0) return '-';
        if (bytes < 1024)          return `${bytes} B`;
        if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }

    function fmtRows(rowCounts) {
        if (!rowCounts) return '-';
        const total = Object.values(rowCounts).reduce((s, n) => s + n, 0);
        return `${total.toLocaleString()}행`;
    }

    function labelBadge(label) {
        if (label === 'auto')   return `<span class="badge badge-blue">자동</span>`;
        if (label === 'manual') return `<span class="badge badge-green">수동</span>`;
        return `<span class="badge badge-gray">${label}</span>`;
    }

    function creatorBadge(by) {
        if (by === 'cron')  return `<span style="color:#6b7280;font-size:.8rem">크론</span>`;
        if (by === 'admin') return `<span style="color:#7c3aed;font-size:.8rem">관리자</span>`;
        return `<span style="color:#6b7280;font-size:.8rem">${by}</span>`;
    }

    // ── 렌더 ─────────────────────────────────────────────────────────────────
    function render() {
        const main = document.getElementById('pageContent');
        main.innerHTML = `
        <div class="page-header">
            <h2 class="page-title"><i class="fas fa-database"></i> DB 백업 관리</h2>
            <button class="btn btn-primary" onclick="backup.runNow()" id="btnRunBackup">
                <i class="fas fa-play"></i> 지금 백업 실행
            </button>
        </div>

        <div class="card" style="margin-bottom:16px;background:#eff6ff;border:1.5px solid #bfdbfe">
            <div style="padding:12px 16px;font-size:.85rem;color:#1e40af;line-height:1.7">
                <i class="fas fa-info-circle"></i>
                <strong>자동 백업</strong>은 매일 <strong>KST 06:00</strong>에 실행됩니다.
                모든 핵심 테이블(신청·해지·프로그램·단지·문의·강사·공지사항 등)이
                <strong>30일간</strong> 보관됩니다.<br>
                수동 백업은 라벨에 관계없이 <strong>자동 삭제되지 않습니다</strong>.
                복원이 필요한 경우 JSON을 다운로드한 뒤 Supabase에 직접 임포트하세요.
            </div>
        </div>

        <div class="card">
            <div id="backupTableWrap">
                <div class="loading-spinner" style="padding:40px;text-align:center">
                    <i class="fas fa-spinner fa-spin fa-2x" style="color:#6b7280"></i>
                    <p style="margin-top:8px;color:#6b7280">백업 목록 불러오는 중...</p>
                </div>
            </div>
        </div>

        <!-- 수동 백업 메모 모달 -->
        <div id="backupLabelModal" style="display:none;position:fixed;inset:0;z-index:9999;
             background:rgba(17,24,39,.55);backdrop-filter:blur(2px);
             display:flex;align-items:center;justify-content:center">
            <div style="background:#fff;border-radius:12px;padding:24px;width:360px;
                        box-shadow:0 20px 60px rgba(0,0,0,.25)">
                <h3 style="margin:0 0 12px;font-size:1rem;font-weight:700">
                    <i class="fas fa-save"></i> 수동 백업 실행
                </h3>
                <p style="font-size:.85rem;color:#6b7280;margin-bottom:12px">
                    이 백업에 붙일 메모(라벨)를 입력하세요.<br>
                    비워두면 'manual'로 저장됩니다.
                </p>
                <input type="text" id="backupLabelInput"
                       placeholder="예: 신청기간 오픈 전 스냅샷"
                       style="width:100%;box-sizing:border-box;padding:9px 12px;
                              border:1.5px solid #d1d5db;border-radius:7px;font-size:.9rem;margin-bottom:14px">
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button class="btn btn-secondary" onclick="backup.closeLabelModal()">취소</button>
                    <button class="btn btn-primary" onclick="backup.confirmRunNow()">
                        <i class="fas fa-play"></i> 실행
                    </button>
                </div>
            </div>
        </div>`;

        loadList();
    }

    // ── 목록 불러오기 ─────────────────────────────────────────────────────────
    async function loadList() {
        const wrap = document.getElementById('backupTableWrap');
        if (!wrap) return;

        try {
            const res  = await fetch('/api/backup/list');
            const json = await res.json();

            if (!json.success) throw new Error(json.error);

            const list = json.data || [];

            if (list.length === 0) {
                wrap.innerHTML = `
                    <div style="padding:40px;text-align:center;color:#9ca3af">
                        <i class="fas fa-inbox fa-2x" style="display:block;margin-bottom:8px"></i>
                        아직 백업 내역이 없습니다.<br>
                        <small>'지금 백업 실행' 버튼을 눌러 첫 백업을 생성하세요.</small>
                    </div>`;
                return;
            }

            wrap.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>날짜 (KST)</th>
                            <th>라벨</th>
                            <th>총 행수</th>
                            <th>용량</th>
                            <th>생성자</th>
                            <th>작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${list.map(b => `
                        <tr>
                            <td style="font-weight:600">${b.snapshot_date}</td>
                            <td>${labelBadge(b.label)}</td>
                            <td>${fmtRows(b.row_counts)}</td>
                            <td>${fmtSize(b.size_bytes)}</td>
                            <td>${creatorBadge(b.created_by)}<br>
                                <small style="color:#9ca3af">${fmtDate(b.snapshot_time)}</small>
                            </td>
                            <td style="white-space:nowrap">
                                <button class="btn btn-sm btn-secondary"
                                        onclick="backup.download('${b.id}','${b.snapshot_date}','${b.label}')"
                                        title="JSON 다운로드">
                                    <i class="fas fa-download"></i> 다운로드
                                </button>
                                <button class="btn btn-sm btn-danger"
                                        onclick="backup.remove('${b.id}','${b.snapshot_date}','${b.label}')"
                                        title="삭제" style="margin-left:4px">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
                <p style="padding:8px 16px;font-size:.78rem;color:#9ca3af">
                    총 ${list.length}개 | 자동 백업은 30일 후 자동 삭제됩니다.
                </p>`;
        } catch (e) {
            wrap.innerHTML = `
                <div style="padding:24px;text-align:center;color:#ef4444">
                    <i class="fas fa-exclamation-circle"></i> 목록 조회 실패: ${e.message}
                </div>`;
        }
    }

    // ── 즉시 백업 (라벨 모달) ─────────────────────────────────────────────────
    function runNow() {
        const modal = document.getElementById('backupLabelModal');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => document.getElementById('backupLabelInput')?.focus(), 100);
        }
    }

    function closeLabelModal() {
        const modal = document.getElementById('backupLabelModal');
        if (modal) modal.style.display = 'none';
    }

    async function confirmRunNow() {
        const label = (document.getElementById('backupLabelInput')?.value || '').trim() || 'manual';
        closeLabelModal();

        const btn = document.getElementById('btnRunBackup');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 실행 중...'; }

        try {
            const res  = await fetch('/api/backup/run', {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ label }),
            });
            const json = await res.json();

            if (!json.success) throw new Error(json.error);

            const d = json.data;
            const total = Object.values(d.rowCounts || {}).reduce((s,n) => s+n, 0);
            showToast(`백업 완료 — ${total.toLocaleString()}행 / ${fmtSize(d.sizeBytes)}`, 'success');
            loadList();
        } catch (e) {
            showToast(`백업 실패: ${e.message}`, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play"></i> 지금 백업 실행'; }
        }
    }

    // ── 다운로드 ─────────────────────────────────────────────────────────────
    function download(id, date, label) {
        const a = document.createElement('a');
        a.href = `/api/backup/${id}/download`;
        a.download = `backup_${date}_${label}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // ── 삭제 ─────────────────────────────────────────────────────────────────
    async function remove(id, date, label) {
        if (!confirm(`[${date}] ${label} 백업을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

        try {
            const res  = await fetch(`/api/backup/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            showToast('백업이 삭제되었습니다.', 'success');
            loadList();
        } catch (e) {
            showToast(`삭제 실패: ${e.message}`, 'error');
        }
    }

    // ── public API ────────────────────────────────────────────────────────────
    return { render, runNow, closeLabelModal, confirmRunNow, download, remove };
})();
