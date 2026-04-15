/**
 * Vercel 서버리스 함수 엔트리포인트 - Supabase 버전 v3.3
 *
 * 환경변수 설정 (Vercel Dashboard → Settings → Environment Variables):
 *   SUPABASE_URL  = https://xxxx.supabase.co
 *   SUPABASE_KEY  = your-anon-or-service-role-key
 *   MASTER_PASSWORD = master2026
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
// Vercel: __dirname = /var/task (프로젝트 루트)
// 로컬:   __dirname = /home/user/webapp/api → 루트 = ../
const ROOT_DIR = fs.existsSync(path.join(__dirname, 'index.html'))
    ? __dirname
    : path.join(__dirname, '..');

// ── 미들웨어 ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── 디버그: js 폴더 내용 확인 ──────────────────────────────────────────────────
app.get('/api/debug-files', (req, res) => {
    const jsDir = path.join(ROOT_DIR, 'js');
    const cssDir = path.join(ROOT_DIR, 'css');
    const adminJsDir = path.join(ROOT_DIR, 'admin', 'js');
    const safeRead = (dir) => {
        try { return fs.readdirSync(dir); } catch(e) { return `ERROR: ${e.message}`; }
    };
    res.json({
        ROOT_DIR,
        __dirname,
        cwd: process.cwd(),
        jsDirExists: fs.existsSync(jsDir),
        jsFiles: safeRead(jsDir),
        cssDirExists: fs.existsSync(cssDir),
        cssFiles: safeRead(cssDir),
        adminJsDirExists: fs.existsSync(adminJsDir),
        adminJsFiles: safeRead(adminJsDir),
        mainJsExists: fs.existsSync(path.join(jsDir, 'main.js')),
    });
});

// ── 헬스체크 ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
    res.json({
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '3.3.1',
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

// ── 정적 파일 서빙 ───────────────────────────────────────────────────────────
app.use(express.static(ROOT_DIR, {
    index: false,
    dotfiles: 'ignore',
}));

// ── SPA 라우팅 ────────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'admin', 'index.html'));
});

app.get('/admin/*', (req, res) => {
    const filePath = path.join(ROOT_DIR, req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.sendFile(filePath);
    } else {
        res.sendFile(path.join(ROOT_DIR, 'admin', 'index.html'));
    }
});

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

module.exports = app;
