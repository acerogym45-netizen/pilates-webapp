/**
 * 메인 서버 엔트리포인트
 * - 오류 발생 시 해당 라우터만 재시작 가능
 * - 각 모듈이 독립적으로 관리됨
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { initializeSchema, seedDefaultData } = require('./database');

// ── 라우터 import ─────────────────────────────────────────────────────────────
const complexesRouter     = require('./routes/complexes');
const programsRouter      = require('./routes/programs');
const applicationsRouter  = require('./routes/applications');
const miscRouter          = require('./routes/misc');
const uploadRouter        = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

// ── 미들웨어 ──────────────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false  // CSP를 별도로 관리하기 위해 비활성화
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiting (API 보호)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: '너무 많은 요청입니다. 잠시 후 다시 시도하세요.' }
});
app.use('/api/', apiLimiter);

// ── 정적 파일 ─────────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.use(express.static(path.join(__dirname, '../public')));

// ── API 라우터 등록 ───────────────────────────────────────────────────────────
app.use('/api/complexes',    complexesRouter);
app.use('/api/programs',     programsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api',              miscRouter);
app.use('/api/upload',       uploadRouter);

// ── 헬스체크 ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    });
});

// ── SPA 라우팅 (프론트엔드) ───────────────────────────────────────────────────
app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin/index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── 전역 에러 핸들러 ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
});

// ── 서버 시작 ─────────────────────────────────────────────────────────────────
async function startServer() {
    try {
        // DB 초기화 (서버 시작 시 1회)
        initializeSchema();
        seedDefaultData();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log('🏢 ========================================');
            console.log('   아파트 단지 QR 무인 응대 시스템 v2.0');
            console.log('🏢 ========================================');
            console.log(`✅ Server: http://localhost:${PORT}`);
            console.log(`📱 입주민 페이지: http://localhost:${PORT}/`);
            console.log(`🔧 관리자 페이지: http://localhost:${PORT}/admin/`);
            console.log(`📡 API: http://localhost:${PORT}/api/`);
            console.log('🏢 ========================================');
            console.log('');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('📴 Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 Shutting down gracefully...');
    process.exit(0);
});

startServer();
