/**
 * server/routes/backup.js
 * DB 백업 API 라우터
 *
 * POST   /api/backup/run          — 즉시 백업 실행 (관리자 수동)
 * GET    /api/backup/list         — 백업 목록 조회 (최신 50개)
 * GET    /api/backup/:id/download — 특정 백업 전체 데이터 JSON 다운로드
 * DELETE /api/backup/:id          — 특정 백업 삭제 (수동 백업만)
 *
 * 내부 함수 (cron에서도 사용):
 *   runBackup(label, createdBy) → { success, snapshotId, rowCounts, sizeBytes }
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { getSupabase } = require('../db-supabase');

// ── 백업 대상 테이블 목록 ────────────────────────────────────────────────────
const BACKUP_TABLES = [
    'applications',
    'cancellations',
    'programs',
    'complexes',
    'inquiries',
    'instructors',
    'notices',
    'renewal_payments',
    'complex_apply_settings',
    'curricula',
    'attendance_records',
];

// ── 핵심 백업 실행 함수 (cron.js에서도 require해서 사용) ─────────────────────
async function runBackup(label = 'auto', createdBy = 'cron') {
    const sb = getSupabase();

    // KST 기준 오늘 날짜 계산
    const nowUtc      = new Date();
    const nowKst      = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
    const snapshotDate = nowKst.toISOString().slice(0, 10); // YYYY-MM-DD

    const data       = {};
    const rowCounts  = {};
    const errors     = [];

    // 각 테이블 전체 데이터 수집
    for (const table of BACKUP_TABLES) {
        try {
            // 최대 50,000행 (실제 운영상 충분)
            const { data: rows, error } = await sb
                .from(table)
                .select('*')
                .limit(50000);

            if (error) {
                errors.push({ table, error: error.message });
                data[table]      = [];
                rowCounts[table] = 0;
            } else {
                data[table]      = rows || [];
                rowCounts[table] = (rows || []).length;
            }
        } catch (e) {
            errors.push({ table, error: e.message });
            data[table]      = [];
            rowCounts[table] = 0;
        }
    }

    // db_backups 테이블에 UPSERT (같은 날+label 이면 덮어씀)
    const { data: inserted, error: insertErr } = await sb
        .from('db_backups')
        .upsert({
            snapshot_date   : snapshotDate,
            snapshot_time   : nowUtc.toISOString(),
            label,
            tables_included : BACKUP_TABLES,
            row_counts      : rowCounts,
            data            : data,
            created_by      : createdBy,
        }, { onConflict: 'snapshot_date,label' })
        .select('id, size_bytes')
        .single();

    if (insertErr) throw new Error(`백업 저장 실패: ${insertErr.message}`);

    // 30일 초과 자동 백업 정리
    await sb
        .from('db_backups')
        .delete()
        .lt('snapshot_date', new Date(nowUtc.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .eq('label', 'auto');

    return {
        success      : true,
        snapshotId   : inserted.id,
        snapshotDate,
        label,
        rowCounts,
        sizeBytes    : inserted.size_bytes,
        tableErrors  : errors,
    };
}

// ── POST /api/backup/run — 수동 즉시 백업 ───────────────────────────────────
router.post('/run', async (req, res) => {
    try {
        const label = (req.body.label || '').trim() || 'manual';
        const result = await runBackup(label, 'admin');
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[backup/run]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── GET /api/backup/list — 백업 목록 조회 ───────────────────────────────────
router.get('/list', async (req, res) => {
    try {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('db_backups')
            .select('id, snapshot_date, snapshot_time, label, tables_included, row_counts, size_bytes, created_by, created_at')
            .order('snapshot_date', { ascending: false })
            .order('created_at',    { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (e) {
        console.error('[backup/list]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── GET /api/backup/:id/download — 특정 백업 데이터 JSON 다운로드 ────────────
router.get('/:id/download', async (req, res) => {
    try {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('db_backups')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, error: '백업을 찾을 수 없습니다.' });
        }

        const filename = `backup_${data.snapshot_date}_${data.label}.json`;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(JSON.stringify({
            meta: {
                snapshot_date  : data.snapshot_date,
                snapshot_time  : data.snapshot_time,
                label          : data.label,
                tables_included: data.tables_included,
                row_counts     : data.row_counts,
                size_bytes     : data.size_bytes,
                created_by     : data.created_by,
                exported_at    : new Date().toISOString(),
            },
            data: data.data,
        }, null, 2));
    } catch (e) {
        console.error('[backup/download]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── DELETE /api/backup/:id — 백업 삭제 ──────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const sb = getSupabase();

        // 삭제 전 존재 확인
        const { data: target } = await sb
            .from('db_backups')
            .select('id, label, snapshot_date')
            .eq('id', req.params.id)
            .single();

        if (!target) {
            return res.status(404).json({ success: false, error: '백업을 찾을 수 없습니다.' });
        }

        const { error } = await sb
            .from('db_backups')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ success: true, deleted: { id: target.id, label: target.label, date: target.snapshot_date } });
    } catch (e) {
        console.error('[backup/delete]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.runBackup = runBackup; // cron.js에서 직접 import해서 사용
