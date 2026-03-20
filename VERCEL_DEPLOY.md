# GitHub + Vercel 배포 가이드

## 🚀 빠른 시작

### 1단계: GitHub에 코드 푸시

#### 화면 상단의 "GitHub" 탭 클릭
1. **GitHub** 탭을 클릭하세요
2. GitHub 계정 연동이 안되어 있다면 연동하세요
3. 새 리포지토리를 생성하거나 기존 리포지토리를 선택하세요

#### 또는 수동으로 푸시:
```bash
# 1. GitHub에서 새 리포지토리 생성 (예: pilates-webapp)

# 2. 로컬에서 푸시
cd /home/user/webapp
git remote add origin https://github.com/YOUR_USERNAME/pilates-webapp.git
git branch -M main
git push -u origin main
```

### 2단계: Vercel에 배포

#### A. Vercel 웹사이트 사용 (권장)

1. **Vercel 가입**
   - https://vercel.com 접속
   - GitHub 계정으로 로그인

2. **새 프로젝트 생성**
   - "New Project" 클릭
   - GitHub 리포지토리에서 `pilates-webapp` 선택

3. **배포 설정**
   ```
   Framework Preset: Other
   Root Directory: ./
   Build Command: (비워두기)
   Output Directory: (비워두기)
   Install Command: npm install
   ```

4. **환경 변수 (선택사항)**
   ```
   PORT=3000
   ```

5. **Deploy 클릭**
   - 자동으로 배포 시작
   - 2-3분 후 배포 완료

#### B. Vercel CLI 사용

```bash
# Vercel CLI 설치
npm install -g vercel

# 로그인
vercel login

# 배포
cd /home/user/webapp
vercel

# 프로덕션 배포
vercel --prod
```

### 3단계: 배포 확인

배포가 완료되면 Vercel이 자동으로 URL을 제공합니다:
```
https://pilates-webapp.vercel.app
```

#### 테스트:
- **주민 페이지**: `https://your-app.vercel.app/index.html`
- **관리자**: `https://your-app.vercel.app/admin-main.html`
- **API**: `https://your-app.vercel.app/api/health`

## 📝 중요 사항

### ✅ 장점
- **데이터베이스 포함**: SQLite 파일이 배포에 포함됨
- **설정 불필요**: Supabase 같은 외부 DB 불필요
- **자동 배포**: GitHub push 시 자동 재배포
- **무료**: Hobby 플랜 무료 사용 가능

### ⚠️ 주의사항
- **데이터 영속성**: Vercel은 데이터베이스 파일 변경이 재배포 시 사라짐
- **읽기 전용 권장**: 프로덕션에서는 읽기 전용으로 사용 권장
- **데이터 쓰기 필요 시**: Supabase, PlanetScale 등 외부 DB 연결 필요

### 💡 프로덕션 권장 사항

**현재 구조 (개발/테스트용)**:
- ✅ 빠른 배포
- ✅ 설정 간단
- ⚠️ 데이터가 재배포 시 초기화됨

**프로덕션용 (실제 운영)**:
- Railway, Render 사용 (영구 스토리지 지원)
- 또는 Supabase/PlanetScale 연결

## 🔄 자동 배포 설정

GitHub에 push하면 자동으로 Vercel에 배포됩니다:

```bash
# 코드 수정 후
git add .
git commit -m "Update feature"
git push origin main

# Vercel이 자동으로 새 버전 배포
```

## 🌐 커스텀 도메인

Vercel 대시보드에서:
1. 프로젝트 선택
2. Settings → Domains
3. 도메인 추가 및 DNS 설정

## 📊 모니터링

Vercel 대시보드에서 확인 가능:
- 배포 상태
- 로그
- 에러
- 트래픽 통계

## ❓ 문제 해결

### 배포 실패 시
```bash
# 로컬에서 테스트
node server.js

# 로그 확인
vercel logs
```

### API 호출 실패 시
- Vercel 로그 확인
- CORS 설정 확인
- 환경 변수 확인

## 📞 도움말

- Vercel 문서: https://vercel.com/docs
- 현재 작동 중인 샌드박스: https://3000-ih3eb58m0wu0t0q9r2ap8-2b54fc91.sandbox.novita.ai

---

**완료 시간**: 약 5분
**난이도**: ⭐ (매우 쉬움)
