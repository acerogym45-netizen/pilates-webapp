/**
 * Supabase 테이블 상태 확인 스크립트
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkTable(tableName) {
  const { error } = await sb.from(tableName).select('*', { count: 'exact', head: true });
  if (error && error.code === 'PGRST205') {
    console.log(`❌ ${tableName}: 테이블 없음`);
    return false;
  } else if (error) {
    console.log(`⚠️  ${tableName}: ${error.message}`);
    return false;
  } else {
    console.log(`✅ ${tableName}: OK`);
    return true;
  }
}

async function main() {
  console.log('=== Supabase 테이블 상태 확인 ===');
  console.log('URL:', process.env.SUPABASE_URL);
  console.log('');

  const tables = ['complexes','programs','instructors','applications','cancellations','notices','inquiries','curricula'];
  let allExist = true;

  for (const t of tables) {
    const exists = await checkTable(t);
    if (!exists) allExist = false;
  }

  console.log('');
  if (!allExist) {
    console.log('⚠️  일부 테이블이 없습니다. SQL Editor에서 실행 필요');
    console.log('🔗 https://supabase.com/dashboard/project/vkmscnpmlvgdejolfjhj/sql/new');
  } else {
    console.log('🎉 모든 테이블 준비 완료!');
  }
}

main().catch(console.error);
