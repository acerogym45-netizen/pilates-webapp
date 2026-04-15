/**
 * Supabase 클라이언트 모듈
 * SQLite(better-sqlite3)를 Supabase PostgreSQL로 교체
 * 
 * 환경변수:
 *   SUPABASE_URL  - Supabase 프로젝트 URL
 *   SUPABASE_KEY  - Supabase anon/service_role key
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

let _client = null;

function getSupabase() {
    if (_client) return _client;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;

    if (!url || !key) {
        throw new Error(
            '❌ SUPABASE_URL 또는 SUPABASE_KEY 환경변수가 설정되지 않았습니다.\n' +
            '.env 파일 또는 Vercel 환경변수에 아래 항목을 추가하세요:\n' +
            '  SUPABASE_URL=https://xxxx.supabase.co\n' +
            '  SUPABASE_KEY=your-anon-or-service-role-key'
        );
    }

    _client = createClient(url, key, {
        auth: { persistSession: false }
    });

    return _client;
}

/**
 * Supabase 에러 핸들러
 * error 객체를 받아 표준 Error로 변환
 */
function sbErr(error, context = '') {
    const msg = error?.message || JSON.stringify(error);
    console.error(`[Supabase Error]${context ? ' ' + context : ''}: ${msg}`);
    return new Error(msg);
}

/**
 * 결과가 null이면 404 에러를 던지는 헬퍼
 */
function requireRow(row, label = '항목') {
    if (!row) throw new Error(`${label}을(를) 찾을 수 없습니다`);
    return row;
}

module.exports = { getSupabase, sbErr, requireRow };
