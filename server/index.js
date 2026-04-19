/**
 * 메인 서버 엔트리포인트 - Supabase 버전 v3.0
 * - SQLite → Supabase PostgreSQL 전환
 * - 로컬 개발: .env의 SUPABASE_URL / SUPABASE_KEY 사용
 * - 프로덕션(Vercel): 환경변수로 자동 연결
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

// ── 라우터 import ─────────────────────────────────────────────────────────────
const complexesRouter     = require('./routes/complexes');
const programsRouter      = require('./routes/programs');
const applicationsRouter  = require('./routes/applications');
const miscRouter          = require('./routes/misc');
const uploadRouter        = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3001;

// ── 미들웨어 ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: '너무 많은 요청입니다. 잠시 후 다시 시도하세요.' }
});
app.use('/api/', apiLimiter);

// ── 정적 파일 ─────────────────────────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../public/uploads');
app.use('/uploads', express.static(uploadDir));
// Vercel(/tmp) 환경 폴백: /tmp/refund-docs 도 /uploads/refund-docs 로 서빙
const tmpRefundDir = '/tmp/refund-docs';
if (!require('fs').existsSync(tmpRefundDir)) {
    try { require('fs').mkdirSync(tmpRefundDir, { recursive: true }); } catch(e) {}
}
app.use('/uploads/refund-docs', require('express').static(tmpRefundDir));
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
    const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
    res.json({
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        database: hasSupabase ? 'supabase' : 'not-configured',
        supabase_url: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/https:\/\/([^.]+).*/, 'https://$1.supabase.co') : null
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
    console.error('❌ Server Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
});

// ── 서버 시작 ─────────────────────────────────────────────────────────────────
async function startServer() {
    // Supabase 연결 확인
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.warn('⚠️  SUPABASE_URL / SUPABASE_KEY 미설정');
        console.warn('   .env 파일에 추가하거나 Vercel 환경변수를 설정하세요');
        console.warn('   supabase-setup.sql을 Supabase SQL Editor에서 실행하세요');
    } else {
        console.log('✅ Supabase 연결 설정 확인됨:', supabaseUrl.replace(/https:\/\/([^.]+).*/, 'https://$1.supabase.co'));
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('🏢 ============================================');
        console.log('   필라테스 단지 QR 관리 시스템 v3.0 (Supabase)');
        console.log('🏢 ============================================');
        console.log(`✅ Server: http://localhost:${PORT}`);
        console.log(`📱 입주민 페이지: http://localhost:${PORT}/`);
        console.log(`🔧 관리자 페이지: http://localhost:${PORT}/admin/`);
        console.log(`📡 API: http://localhost:${PORT}/api/`);
        console.log('🏢 ============================================');
        console.log('');
    });
}

process.on('SIGTERM', () => { console.log('📴 Shutting down...'); process.exit(0); });
process.on('SIGINT',  () => { console.log('📴 Shutting down...'); process.exit(0); });

startServer();
