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
// Vercel 서버리스 환경:
//   - __dirname = /var/task  (api/index.js 가 /var/task에 위치)
//   - 프로젝트 파일들도 /var/task/ 에 있음 (index.html, js/, css/, admin/ 등)
// 로컬 개발 환경:
//   - __dirname = /home/user/webapp/api
//   - 프로젝트 루트 = /home/user/webapp
const ROOT_DIR = fs.existsSync(path.join(__dirname, 'index.html'))
    ? __dirname                    // Vercel: __dirname = /var/task = 프로젝트루트
    : path.join(__dirname, '..');  // 로컬: __dirname/.. = 프로젝트루트

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
        version: '3.3.0',
        database: hasSupabase ? 'supabase' : 'not-configured',
        platform: 'vercel',
        ROOT_DIR,
        indexExists: fs.existsSync(path.join(ROOT_DIR, 'index.html')),
        cssExists:   fs.existsSync(path.join(ROOT_DIR, 'css', 'style.css')),
    });
});

// ── API 라우터 등록 ───────────────────────────────────────────────────────────
app.use('/api/complexes',    complexesRouter);
app.use('/api/programs',     programsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api',              miscRouter);
app.use('/api/upload',       uploadRouter);

// ── 정적 파일 서빙 ───────────────────────────────────────────────────────────
// express.static으로 js/, css/, admin/ 등 서빙
app.use(express.static(ROOT_DIR, {
    index: false,   // SPA fallback에서 처리
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
