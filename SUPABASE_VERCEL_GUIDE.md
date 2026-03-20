# Supabase + Vercel 배포 가이드

## 1단계: Supabase 프로젝트 생성

1. **Supabase 가입**: https://supabase.com 접속 후 GitHub로 로그인
2. **새 프로젝트 생성**:
   - "New Project" 클릭
   - Project name: `pilates-webapp`
   - Database Password: 안전한 비밀번호 생성 (저장해두기!)
   - Region: `Northeast Asia (Seoul)` 선택 (한국 서버)
   - "Create new project" 클릭
   - 프로젝트 생성 완료까지 약 2분 대기

## 2단계: 데이터베이스 마이그레이션

1. **SQL Editor 접속**:
   - 왼쪽 메뉴에서 "SQL Editor" 클릭
   - "New query" 클릭

2. **마이그레이션 SQL 실행**:
   - `/home/user/webapp/supabase_migration.sql` 파일 내용 전체 복사
   - SQL Editor에 붙여넣기
   - 오른쪽 하단 "Run" 버튼 클릭
   - 성공 메시지 확인: "Success. No rows returned"

3. **테이블 확인**:
   - 왼쪽 메뉴에서 "Table Editor" 클릭
   - 생성된 테이블 목록 확인:
     - programs
     - pilates_contracts
     - pilates_inquiries
     - notices
     - instructors
     - curriculums
     - pilates_cancellations
     - complex_settings
     - guestbook

## 3단계: 데이터베이스 연결 정보 가져오기

1. **Settings → Database 이동**:
   - 왼쪽 메뉴 하단 톱니바퀴 아이콘(Settings) 클릭
   - "Database" 탭 클릭

2. **Connection string 복사**:
   - "Connection string" 섹션에서 "URI" 선택
   - 아래 형식의 URL이 표시됨:
     ```
     postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxxx.supabase.co:5432/postgres
     ```
   - **중요**: `[YOUR-PASSWORD]` 부분을 실제 비밀번호로 교체
   - 전체 URL 복사 (이것이 `DATABASE_URL`입니다)

## 4단계: Vercel 환경 변수 설정

1. **Vercel 프로젝트 접속**:
   - https://vercel.com 로그인
   - `pilates-webapp` 프로젝트 선택

2. **환경 변수 추가**:
   - 상단 메뉴에서 "Settings" 클릭
   - 왼쪽 메뉴에서 "Environment Variables" 클릭
   - "Add New" 버튼 클릭

3. **DATABASE_URL 설정**:
   - **Name**: `DATABASE_URL`
   - **Value**: 3단계에서 복사한 Supabase connection string 붙여넣기
   - **Environment**: 모두 선택 (Production, Preview, Development)
   - "Save" 클릭

## 5단계: 재배포

1. **자동 재배포 트리거**:
   - Vercel이 환경 변수 변경을 감지하면 자동으로 재배포됨
   - 또는 "Deployments" 탭에서 최신 배포를 찾아 "⋯" → "Redeploy" 클릭

2. **배포 완료 대기**:
   - 약 1-2분 대기
   - "Ready" 상태 확인

## 6단계: 배포 테스트

1. **헬스 체크**:
   ```bash
   curl https://pilates-webapp-xxx.vercel.app/api/health
   ```
   응답 예시:
   ```json
   {
     "status": "ok",
     "version": "12.2.6",
     "timestamp": "2026-03-20T...",
     "database": "connected",
     "storage": "postgresql"
   }
   ```

2. **웹 페이지 접속**:
   - 사용자 페이지: https://pilates-webapp-xxx.vercel.app/index.html
   - 관리자 페이지: https://pilates-webapp-xxx.vercel.app/admin-main.html

3. **API 테스트**:
   - 프로그램 목록: https://pilates-webapp-xxx.vercel.app/api/programs
   - 계약서 목록: https://pilates-webapp-xxx.vercel.app/api/contracts
   - 통계: https://pilates-webapp-xxx.vercel.app/api/statistics/dashboard

## 문제 해결

### 데이터베이스 연결 오류
- Supabase 프로젝트가 일시 중지되었을 수 있음 → Supabase 대시보드에서 프로젝트 재시작
- 비밀번호가 올바른지 확인
- Connection string에 특수문자가 있으면 URL 인코딩 필요

### 배포 실패
- Vercel 로그 확인: Deployments → 실패한 배포 클릭 → "Building" 로그 확인
- 환경 변수가 올바르게 설정되었는지 확인

### API 500 오류
- Vercel Functions 로그 확인: Deployments → Runtime Logs
- SQL 쿼리 오류일 가능성 → Supabase SQL Editor에서 직접 쿼리 테스트

## 비용 정보

- **Supabase 무료 플랜**:
  - 500MB 데이터베이스 저장공간
  - 월 5GB 데이터 전송
  - 50,000 월간 활성 사용자
  - 완벽한 소규모/중규모 프로젝트용

- **Vercel 무료 플랜**:
  - 100GB 대역폭/월
  - 6,000분 서버리스 함수 실행 시간
  - 무제한 배포

## 다음 단계

배포가 완료되면:
1. ✅ GitHub에 코드 푸시 → 자동 재배포
2. ✅ Supabase 대시보드에서 실시간 데이터 모니터링
3. ✅ 커스텀 도메인 연결 (선택사항)
