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

// ── 백업 대상 테이블 + 복구 메타 정보 ──────────────────────────────────────
// restore_order: 복구 시 이 순서대로 덮어써야 외래키 오류가 안 남
//   (부모 테이블 먼저 → 자식 테이블 나중)
// pk: 각 테이블의 기본키 컬럼명 (복구 시 upsert 기준)
// description: 사람이 읽기 쉬운 설명
const BACKUP_TABLE_META = [
    { name: 'complexes',             restore_order: 1,  pk: 'id',              description: '단지 정보' },
    { name: 'programs',              restore_order: 2,  pk: 'id',              description: '수업 프로그램' },
    { name: 'instructors',           restore_order: 3,  pk: 'id',              description: '강사 정보' },
    { name: 'complex_apply_settings',restore_order: 4,  pk: 'id',              description: '접수 기간 설정' },
    { name: 'curricula',             restore_order: 5,  pk: 'id',              description: '커리큘럼/시간표' },
    { name: 'applications',          restore_order: 6,  pk: 'id',              description: '수강 신청 내역' },
    { name: 'cancellations',         restore_order: 7,  pk: 'id',              description: '해지 신청 내역' },
    { name: 'renewal_payments',      restore_order: 8,  pk: 'id',              description: '연장/결제 내역' },
    { name: 'inquiries',             restore_order: 9,  pk: 'id',              description: '문의 내역' },
    { name: 'notices',               restore_order: 10, pk: 'id',              description: '공지사항' },
    { name: 'attendance_records',    restore_order: 11, pk: 'id',              description: '출결 기록' },
];

const BACKUP_TABLES = BACKUP_TABLE_META.map(t => t.name);

// 백업 파일 포맷 버전 — 구조가 바뀔 때마다 올림 (복구 시 버전 체크용)
const BACKUP_FORMAT_VERSION = '1.0';

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

        // ── 복구에 필요한 모든 정보를 포함한 정형화된 구조 ──────────────
        const output = {
            // ① 이 파일이 뭔지 식별하는 헤더
            __pilates_backup__: true,
            format_version    : BACKUP_FORMAT_VERSION,

            // ② 언제 어떻게 만들어진 백업인지
            meta: {
                snapshot_date  : data.snapshot_date,       // KST 기준 날짜 (YYYY-MM-DD)
                snapshot_time  : data.snapshot_time,       // 실제 백업 실행 시각 (UTC)
                label          : data.label,               // 'auto' | 'manual' | 직접 입력한 메모
                created_by     : data.created_by,          // 'cron' | 'admin'
                exported_at    : new Date().toISOString(),  // 이 파일을 다운로드한 시각
                size_bytes     : data.size_bytes,
                total_rows     : Object.values(data.row_counts || {}).reduce((s, n) => s + n, 0),
            },

            // ③ 테이블별 행 수 요약 (복구 전 내용 미리 파악용)
            summary: BACKUP_TABLE_META.map(t => ({
                table      : t.name,
                description: t.description,
                row_count  : (data.row_counts || {})[t.name] ?? 0,
            })),

            // ④ 복구 방법 안내 (이 파일만 있으면 복구 지시가 가능하도록)
            restore_guide: {
                how_to_restore : '이 파일을 그대로 저에게(AI)에게 전달하면 복구해드립니다.',
                restore_order  : BACKUP_TABLE_META.map(t => `${t.restore_order}. ${t.name} (${t.description})`),
                pk_columns     : Object.fromEntries(BACKUP_TABLE_META.map(t => [t.name, t.pk])),
                caution        : '복구 시 해당 테이블의 현재 데이터가 백업 시점으로 덮어써집니다. 전체 복구가 아닌 특정 테이블만 복구도 가능합니다.',
            },

            // ⑤ 실제 데이터 (테이블명: [행 배열])
            data: Object.fromEntries(
                BACKUP_TABLE_META.map(t => [t.name, (data.data || {})[t.name] || []])
            ),
        };

        res.send(JSON.stringify(output, null, 2));
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
