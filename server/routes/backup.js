/**
 * server/routes/backup.js
 * DB 백업 API 라우터
 *
 * POST   /api/backup/run          — 즉시 백업 실행 (관리자 수동)
 * GET    /api/backup/list         — 백업 목록 조회 (최신 50개)
 * GET    /api/backup/:id/download — 특정 백업 전체 데이터 JSON 다운로드
 * DELETE /api/backup/:id          — 특정 백업 삭제 (수동 백업만)
 *
 * 저장소: 로컬 파일 시스템 (db_backups 테이블 RLS 우회)
 *   - 백업 디렉토리: ./backups/ (프로젝트 루트 기준)
 *   - 파일명: backup_YYYY-MM-DD_LABEL_ID.json
 *   - 메타 인덱스: ./backups/index.json (목록 캐시)
 *
 * 내부 함수 (cron에서도 사용):
 *   runBackup(label, createdBy) → { success, snapshotId, rowCounts, sizeBytes }
 */

'use strict';

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const { getSupabase } = require('../db-supabase');

// 백업 저장 디렉토리 (프로젝트 루트 기준)
const BACKUP_DIR = path.resolve(__dirname, '../../backups');

// 디렉토리 없으면 자동 생성
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ── 백업 대상 테이블 + 복구 메타 정보 ──────────────────────────────────────
const BACKUP_TABLE_META = [
    { name: 'complexes',             restore_order: 1,  pk: 'id', description: '단지 정보' },
    { name: 'programs',              restore_order: 2,  pk: 'id', description: '수업 프로그램' },
    { name: 'instructors',           restore_order: 3,  pk: 'id', description: '강사 정보' },
    { name: 'complex_apply_settings',restore_order: 4,  pk: 'id', description: '접수 기간 설정' },
    { name: 'curricula',             restore_order: 5,  pk: 'id', description: '커리큘럼/시간표' },
    { name: 'applications',          restore_order: 6,  pk: 'id', description: '수강 신청 내역' },
    { name: 'cancellations',         restore_order: 7,  pk: 'id', description: '해지 신청 내역' },
    { name: 'renewal_payments',      restore_order: 8,  pk: 'id', description: '연장/결제 내역' },
    { name: 'inquiries',             restore_order: 9,  pk: 'id', description: '문의 내역' },
    { name: 'notices',               restore_order: 10, pk: 'id', description: '공지사항' },
    { name: 'attendance_records',    restore_order: 11, pk: 'id', description: '출결 기록' },
];

const BACKUP_TABLES = BACKUP_TABLE_META.map(t => t.name);
const BACKUP_FORMAT_VERSION = '1.0';

// ── 인덱스 파일 읽기/쓰기 헬퍼 ──────────────────────────────────────────────
function readIndex() {
    const indexPath = path.join(BACKUP_DIR, 'index.json');
    if (!fs.existsSync(indexPath)) return [];
    try {
        return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch {
        return [];
    }
}

function writeIndex(list) {
    const indexPath = path.join(BACKUP_DIR, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(list, null, 2), 'utf8');
}

// ── 핵심 백업 실행 함수 (cron.js에서도 require해서 사용) ─────────────────────
async function runBackup(label = 'auto', createdBy = 'cron') {
    const sb = getSupabase();

    // KST 기준 오늘 날짜 계산
    const nowUtc       = new Date();
    const nowKst       = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
    const snapshotDate = nowKst.toISOString().slice(0, 10); // YYYY-MM-DD

    const data      = {};
    const rowCounts = {};
    const errors    = [];

    // 각 테이블 전체 데이터 수집
    for (const table of BACKUP_TABLES) {
        try {
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

    // ── 기존 목록에서 같은 날짜+label 항목 찾아서 덮어쓰기 (upsert 흉내) ──
    const index = readIndex();
    const existing = index.find(
        item => item.snapshot_date === snapshotDate && item.label === label
    );

    // 기존 파일 삭제 (upsert)
    if (existing) {
        const oldFile = path.join(BACKUP_DIR, existing.filename);
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
    }

    // 새 ID 생성 (UUID v4 흉내)
    const snapshotId = existing?.id || crypto.randomUUID();
    const filename   = `backup_${snapshotDate}_${label}_${snapshotId.slice(0, 8)}.json`;
    const filePath   = path.join(BACKUP_DIR, filename);

    // 파일 내용 구성
    const output = {
        __pilates_backup__: true,
        format_version    : BACKUP_FORMAT_VERSION,
        meta: {
            id            : snapshotId,
            snapshot_date : snapshotDate,
            snapshot_time : nowUtc.toISOString(),
            label,
            created_by    : createdBy,
            exported_at   : nowUtc.toISOString(),
        },
        summary: BACKUP_TABLE_META.map(t => ({
            table      : t.name,
            description: t.description,
            row_count  : rowCounts[t.name] ?? 0,
        })),
        restore_guide: {
            how_to_restore : '이 파일을 그대로 저에게(AI)에게 전달하면 복구해드립니다.',
            restore_order  : BACKUP_TABLE_META.map(t => `${t.restore_order}. ${t.name} (${t.description})`),
            pk_columns     : Object.fromEntries(BACKUP_TABLE_META.map(t => [t.name, t.pk])),
            caution        : '복구 시 해당 테이블의 현재 데이터가 백업 시점으로 덮어써집니다.',
        },
        row_counts : rowCounts,
        data       : Object.fromEntries(
            BACKUP_TABLE_META.map(t => [t.name, data[t.name] || []])
        ),
    };

    const jsonStr  = JSON.stringify(output);
    fs.writeFileSync(filePath, jsonStr, 'utf8');
    const sizeBytes = Buffer.byteLength(jsonStr, 'utf8');

    // 인덱스 업데이트
    const meta = {
        id            : snapshotId,
        snapshot_date : snapshotDate,
        snapshot_time : nowUtc.toISOString(),
        label,
        tables_included: BACKUP_TABLES,
        row_counts    : rowCounts,
        size_bytes    : sizeBytes,
        created_by    : createdBy,
        created_at    : nowUtc.toISOString(),
        filename,
    };

    const newIndex = [
        meta,
        ...index.filter(item => !(item.snapshot_date === snapshotDate && item.label === label)),
    ]
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date) || b.created_at.localeCompare(a.created_at))
        .slice(0, 200); // 최대 200개 유지

    writeIndex(newIndex);

    // 30일 초과 auto 백업 자동 정리
    const cutoff = new Date(nowUtc.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDelete = newIndex.filter(item => item.label === 'auto' && item.snapshot_date < cutoff);
    for (const item of toDelete) {
        const fp = path.join(BACKUP_DIR, item.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    if (toDelete.length > 0) {
        writeIndex(newIndex.filter(item => !toDelete.find(d => d.id === item.id)));
    }

    return {
        success     : true,
        snapshotId,
        snapshotDate,
        label,
        rowCounts,
        sizeBytes,
        tableErrors : errors,
    };
}

// ── POST /api/backup/run — 수동 즉시 백업 ───────────────────────────────────
router.post('/run', async (req, res) => {
    try {
        const label  = (req.body.label || '').trim() || 'manual';
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
        const index = readIndex();
        // 목록에서 data 필드 제외 (메타만 반환)
        const list = index.slice(0, 50).map(({ filename, ...rest }) => rest);
        res.json({ success: true, data: list });
    } catch (e) {
        console.error('[backup/list]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── GET /api/backup/:id/download — 특정 백업 데이터 JSON 다운로드 ────────────
router.get('/:id/download', async (req, res) => {
    try {
        const index = readIndex();
        const meta  = index.find(item => item.id === req.params.id);

        if (!meta) {
            return res.status(404).json({ success: false, error: '백업을 찾을 수 없습니다.' });
        }

        const filePath = path.join(BACKUP_DIR, meta.filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: '백업 파일이 존재하지 않습니다.' });
        }

        const content  = fs.readFileSync(filePath, 'utf8');
        const filename = `backup_${meta.snapshot_date}_${meta.label}.json`;

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
    } catch (e) {
        console.error('[backup/download]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── DELETE /api/backup/:id — 백업 삭제 ──────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const index  = readIndex();
        const target = index.find(item => item.id === req.params.id);

        if (!target) {
            return res.status(404).json({ success: false, error: '백업을 찾을 수 없습니다.' });
        }

        // 파일 삭제
        const filePath = path.join(BACKUP_DIR, target.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        // 인덱스에서 제거
        writeIndex(index.filter(item => item.id !== req.params.id));

        res.json({ success: true, deleted: { id: target.id, label: target.label, date: target.snapshot_date } });
    } catch (e) {
        console.error('[backup/delete]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.runBackup = runBackup; // cron.js에서 직접 import해서 사용
