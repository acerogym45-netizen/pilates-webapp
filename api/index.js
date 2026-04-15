/**
 * Vercel Serverless Function - API Entry Point
 * server/ 디렉토리의 라우터를 그대로 재사용
 */
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const path     = require('path');

// Vercel 환경에서 DB 경로를 /tmp로 설정 (쓰기 가능 경로)
if (!process.env.DB_PATH) {
    process.env.DB_PATH = '/tmp/apartment.db';
}
// Vercel 환경에서 업로드 경로도 /tmp로 설정
if (!process.env.UPLOAD_DIR) {
    process.env.UPLOAD_DIR = '/tmp/uploads';
}

const { initializeSchema, seedDefaultData } = require('../server/database');

// ── 라우터 import ─────────────────────────────────────────────────────────────
const complexesRouter    = require('../server/routes/complexes');
const programsRouter     = require('../server/routes/programs');
const applicationsRouter = require('../server/routes/applications');
const miscRouter         = require('../server/routes/misc');
const uploadRouter       = require('../server/routes/upload');

const app = express();

// ── 미들웨어 ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── 정적 파일 (admin, public) ─────────────────────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.use(express.static(path.join(__dirname, '../public')));

// ── DB 초기화 (콜드 스타트 시 1회) ───────────────────────────────────────────
let _dbReady = false;
function ensureDb() {
    if (!_dbReady) {
        try {
            initializeSchema();
            seedDefaultData();
            _dbReady = true;
        } catch (e) {
            console.error('DB init error:', e.message);
        }
    }
}

app.use((req, res, next) => {
    ensureDb();
    next();
});

// ── API 라우터 등록 ───────────────────────────────────────────────────────────
app.use('/api/complexes',    complexesRouter);
app.use('/api/programs',     programsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/upload',       uploadRouter);
app.use('/api',              miscRouter);

// ── 헬스체크 ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.3.0',
        env: process.env.NODE_ENV || 'production'
    });
});

// ── SPA 라우팅 ────────────────────────────────────────────────────────────────
app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin/index.html'));
});
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── 전역 에러 핸들러 ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Server Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
});

// Vercel serverless export
module.exports = app;
