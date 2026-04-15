/**
 * Vercel 서버리스 함수 엔트리포인트 - Supabase 버전 v3.1
 *
 * 환경변수 설정 (Vercel Dashboard → Settings → Environment Variables):
 *   SUPABASE_URL  = https://xxxx.supabase.co
 *   SUPABASE_KEY  = your-anon-or-service-role-key
 *   MASTER_PASSWORD = master2026
 */
require('dotenv').config();

// 환경변수 기본값
if (!process.env.MASTER_PASSWORD) {
    process.env.MASTER_PASSWORD = 'master2026';
}

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const fs      = require('fs');

// ── 라우터 ────────────────────────────────────────────────────────────────────
const complexesRouter    = require('../server/routes/complexes');
const programsRouter     = require('../server/routes/programs');
const applicationsRouter = require('../server/routes/applications');
const miscRouter         = require('../server/routes/misc');
const uploadRouter       = require('../server/routes/upload');

const app = express();

// ── 정적파일 루트 경로 ────────────────────────────────────────────────────────
// Vercel: api/index.js 기준 __dirname은 /var/task/api → 루트는 한 단계 위
const ROOT_DIR = path.join(__dirname, '..');

// ── 미들웨어 ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── 헬스체크 ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
    res.json({
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '3.1.0',
        database: hasSupabase ? 'supabase' : 'not-configured',
        platform: 'vercel',
        rootDir: ROOT_DIR
    });
});

// ── API 라우터 등록 ───────────────────────────────────────────────────────────
app.use('/api/complexes',    complexesRouter);
app.use('/api/programs',     programsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api',              miscRouter);
app.use('/api/upload',       uploadRouter);

// ── 정적 파일 서빙 ───────────────────────────────────────────────────────────
// js/, css/, admin/js/, admin/css/, admin/pages/ 등 정적 에셋
app.use(express.static(ROOT_DIR, {
    index: false,         // index.html 자동 서빙은 SPA fallback에서 처리
    dotfiles: 'ignore',
    extensions: ['html', 'js', 'css', 'png', 'jpg', 'ico', 'svg', 'woff', 'woff2', 'ttf']
}));

// ── SPA 라우팅 ────────────────────────────────────────────────────────────────
// /admin/* → admin/index.html
app.get('/admin', (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'admin', 'index.html'));
});
app.get('/admin/*', (req, res) => {
    // 실제 파일이 있으면 그 파일을, 없으면 admin SPA
    const filePath = path.join(ROOT_DIR, req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.sendFile(filePath);
    } else {
        res.sendFile(path.join(ROOT_DIR, 'admin', 'index.html'));
    }
});

// /* → index.html (메인 SPA)
app.get('*', (req, res) => {
    const filePath = path.join(ROOT_DIR, req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.sendFile(filePath);
    } else {
        res.sendFile(path.join(ROOT_DIR, 'index.html'));
    }
});

// ── 에러 핸들러 ───────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Server Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
});

// Vercel 서버리스 함수로 내보내기
module.exports = app;
