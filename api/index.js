/**
 * Vercel 서버리스 함수 엔트리포인트 - Supabase 버전 v3.15
 */
require('dotenv').config();

if (!process.env.MASTER_PASSWORD) {
    process.env.MASTER_PASSWORD = 'master2026';
}

// Vercel 환경 명시 (upload.js의 IS_VERCEL 감지에 사용)
if (!process.env.VERCEL) {
    process.env.VERCEL = '1';
}

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const fs      = require('fs');
const { getSupabase } = require('../server/db-supabase');

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
app.use(helmet({
    contentSecurityPolicy: false,
    frameguard: false
}));
// X-Frame-Options 헤더 강제 제거 (Vercel이 SAMEORIGIN을 자동 삽입하므로 명시적 제거)
app.use((req, res, next) => {
    res.removeHeader('X-Frame-Options');
    next();
});
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── 정적 파일 서빙 (API보다 먼저 - js/css 파일 우선) ──────────────────────────
// js/, css/ 파일을 직접 명시해서 서빙
app.get('/js/:file', (req, res) => {
    // 루트 js/ 먼저, 없으면 public/js/ 에서 서빙 (public/index.html이 /js/app.js 등 참조)
    const filePath        = path.join(ROOT_DIR, 'js', req.params.file);
    const fallbackPath    = path.join(ROOT_DIR, 'public', 'js', req.params.file);
    const target = fs.existsSync(filePath) ? filePath : (fs.existsSync(fallbackPath) ? fallbackPath : null);
    if (target) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        res.sendFile(target);
    } else {
        res.status(404).send('Not found');
    }
});

app.get('/css/:file', (req, res) => {
    // 루트 css/ 먼저, 없으면 public/css/ 에서 서빙
    const filePath     = path.join(ROOT_DIR, 'css', req.params.file);
    const fallbackPath = path.join(ROOT_DIR, 'public', 'css', req.params.file);
    const target = fs.existsSync(filePath) ? filePath : (fs.existsSync(fallbackPath) ? fallbackPath : null);
    if (target) {
        res.setHeader('Content-Type', 'text/css; charset=UTF-8');
        res.sendFile(target);
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

// ── 루트: OG 태그 동적 삽입 ──────────────────────────────────────────────────
// 지원 URL 형식:
//   ① /apt-sclass          (경로 방식 — 네이버 QR 권장)
//   ② /?complex=apt-sclass (쿼리파라미터 방식 — 기존 호환)
// 크롤러가 쿼리스트링을 무시하는 경우를 대비해 경로 방식을 우선 처리
app.get('*', async (req, res) => {
    const indexPath = path.join(ROOT_DIR, 'index.html');
    let html;
    try {
        html = fs.readFileSync(indexPath, 'utf8');
    } catch (e) {
        return res.status(500).send('index.html을 읽을 수 없습니다.');
    }

    // 기본값 (complex 파라미터 없거나 DB 조회 실패 시)
    let complexName = '레슨 신청';
    let pageTitle   = '레슨 신청';
    let pageDesc    = '수업 신청, 취소, 변경을 간편하게 처리하세요.';
    const pageUrl   = `https://apt-webapp.vercel.app${req.originalUrl}`;

    // ① 경로 방식 우선: /apt-sclass → complexCode = 'apt-sclass'
    // ② 쿼리파라미터 방식 폴백: ?complex=apt-sclass
    const pathMatch = req.path.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
    const complexCode = (pathMatch && pathMatch[1] !== 'admin')
        ? pathMatch[1]
        : req.query.complex;

    if (complexCode) {
        try {
            const sb = getSupabase();
            const { data } = await sb
                .from('complexes')
                .select('name')
                .eq('code', complexCode)
                .single();
            if (data?.name) {
                complexName = data.name;
                pageTitle   = `레슨 신청 - ${data.name}`;
                pageDesc    = `${data.name} 수업 신청, 취소, 변경을 간편하게 처리하세요.`;
            }
        } catch (_) {
            // DB 오류 시 기본값 유지
        }
    }

    // OG 메타태그 블록 (중복 삽입 방지: </head> 바로 앞에 한 번만 삽입)
    const ogBlock = `
    <!-- OG 태그 (서버사이드 동적 생성) -->
    <meta property="og:type"        content="website">
    <meta property="og:url"         content="${pageUrl}">
    <meta property="og:title"       content="${pageTitle}">
    <meta property="og:description" content="${pageDesc}">
    <meta property="og:site_name"   content="${complexName}">
    <meta name="twitter:card"       content="summary">
    <meta name="twitter:title"      content="${pageTitle}">
    <meta name="twitter:description" content="${pageDesc}">`;

    // <title> 교체 + OG 블록 삽입
    html = html
        .replace(/<title>[^<]*<\/title>/, `<title>${pageTitle}</title>`)
        .replace('</head>', `${ogBlock}\n</head>`);

    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    // 캐시 완전 비활성화 — 크롤러(네이버 QR 등)가 항상 최신 단지명을 가져가도록
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.send(html);
});

// ── 에러 핸들러 ───────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Server Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
});

module.exports = app;
