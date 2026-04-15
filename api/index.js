/**
 * Vercel 서버리스 함수 엔트리포인트 - Supabase 버전 v3.2
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

// ── 정적파일 루트 경로 찾기 ────────────────────────────────────────────────────
// Vercel 서버리스: __dirname = /var/task (api 폴더가 아닌 루트)
// process.cwd() = /var/task
// 실제 파일은 /var/task/index.html 에 있음
function findRootDir() {
    const candidates = [
        __dirname,                          // /var/task
        path.join(__dirname, '..'),         // /var/task/.. = /
        process.cwd(),                      // /var/task
        path.join(process.cwd(), '..'),     // /var/task/..
        '/var/task',
    ];
    for (const dir of candidates) {
        if (fs.existsSync(path.join(dir, 'index.html'))) {
            return dir;
        }
    }
    return __dirname; // fallback
}

const ROOT_DIR = findRootDir();

// ── 미들웨어 ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── 헬스체크 ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
    const indexExists = fs.existsSync(path.join(ROOT_DIR, 'index.html'));
    const cssExists   = fs.existsSync(path.join(ROOT_DIR, 'css', 'style.css'));
    res.json({
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '3.2.0',
        database: hasSupabase ? 'supabase' : 'not-configured',
        platform: 'vercel',
        __dirname,
        cwd: process.cwd(),
        ROOT_DIR,
        indexExists,
        cssExists,
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
