/**
 * Vercel 서버리스 함수 엔트리포인트 - Supabase 버전 v3.4
 */
require('dotenv').config();

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

// ── 정적파일 루트 경로 ─────────────────────────────────────────────────────────
// Vercel: __dirname = /var/task/api → 루트 = /var/task
// 로컬:   __dirname = /webapp/api   → 루트 = /webapp
const ROOT_DIR = path.resolve(__dirname, '..');

// ── 미들웨어 ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── 정적 파일 서빙 (API보다 먼저 - js/css 파일 우선) ──────────────────────────
// js/, css/ 파일을 직접 명시해서 서빙
app.get('/js/:file', (req, res) => {
    const filePath = path.join(ROOT_DIR, 'js', req.params.file);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        res.sendFile(filePath);
    } else {
        res.status(404).send('Not found');
    }
});

app.get('/css/:file', (req, res) => {
    const filePath = path.join(ROOT_DIR, 'css', req.params.file);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'text/css; charset=UTF-8');
        res.sendFile(filePath);
    } else {
        res.status(404).send('Not found');
    }
});

app.get('/admin/js/:file', (req, res) => {
    const filePath = path.join(ROOT_DIR, 'admin', 'js', req.params.file);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        res.sendFile(filePath);
    } else {
        res.status(404).send('Not found');
    }
});

app.get('/admin/js/pages/:file', (req, res) => {
    const filePath = path.join(ROOT_DIR, 'admin', 'js', 'pages', req.params.file);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        res.sendFile(filePath);
    } else {
        res.status(404).send('Not found');
    }
});

app.get('/admin/css/:file', (req, res) => {
    const filePath = path.join(ROOT_DIR, 'admin', 'css', req.params.file);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'text/css; charset=UTF-8');
        res.sendFile(filePath);
    } else {
        res.status(404).send('Not found');
    }
});

// ── 디버그 ────────────────────────────────────────────────────────────────────
app.get('/api/debug-files', (req, res) => {
    const jsDir = path.join(ROOT_DIR, 'js');
    const safeRead = (dir) => {
        try { return fs.readdirSync(dir); } catch(e) { return `ERROR: ${e.message}`; }
    };
    res.json({
        ROOT_DIR, __dirname,
        jsDirExists: fs.existsSync(jsDir),
        jsFiles: safeRead(jsDir),
        mainJsExists: fs.existsSync(path.join(jsDir, 'main.js')),
    });
});

// ── 헬스체크 ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
    res.json({
        success: true, status: 'ok',
        timestamp: new Date().toISOString(),
        version: '3.4.0',
        database: hasSupabase ? 'supabase' : 'not-configured',
        platform: 'vercel',
    });
});

// ── API 라우터 등록 ───────────────────────────────────────────────────────────
app.use('/api/complexes',    complexesRouter);
app.use('/api/programs',     programsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api',              miscRouter);
app.use('/api/upload',       uploadRouter);

// ── 나머지 정적파일 (express.static) ─────────────────────────────────────────
app.use(express.static(ROOT_DIR, { index: false, dotfiles: 'ignore' }));

// ── HTML 파일 직접 서빙 ──────────────────────────────────────────────────────
// 루트에 있는 *.html 파일을 직접 서빙 (master-admin.html 등)
app.get('/:file([^/]+\\.html)', (req, res) => {
    const filePath = path.join(ROOT_DIR, req.params.file);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        res.sendFile(filePath);
    } else {
        res.sendFile(path.join(ROOT_DIR, 'index.html'));
    }
});

// ── SPA 라우팅 ────────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'admin', 'index.html'));
});
app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'admin', 'index.html'));
});
app.get('*', (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// ── 에러 핸들러 ───────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Server Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
});

module.exports = app;
