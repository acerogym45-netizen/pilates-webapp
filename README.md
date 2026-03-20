# 필라테스 레슨 신청 시스템 (webapp)

청주SK뷰자이 필라테스 레슨 신청 및 관리 시스템입니다.

## 📋 프로젝트 개요

- **버전**: v12.2.6
- **플랫폼**: Express.js + SQLite (일반 호스팅 플랫폼용)
- **데이터베이스**: SQLite (파일 기반)
- **기술 스택**: Node.js, Express, SQLite, Vanilla JavaScript

## ✨ 완료된 기능

### 주민 기능
- ✅ 필라테스 레슨 신청서 작성
- ✅ 2단계 신청 프로세스 (신청서 → 계약서)
- ✅ 전자 서명 기능
- ✅ 실시간 정원 확인
- ✅ 시간대별 신청 현황 확인
- ✅ 공개 문의사항 조회
- ✅ 비공개 문의사항 작성
- ✅ 공지사항 확인
- ✅ 월간 커리큘럼 확인
- ✅ 강사 프로필 확인
- ✅ 취소/환불 신청

### 관리자 기능
- ✅ 신청서 관리 (승인/대기/거부)
- ✅ 중복 신청 감지 및 차단
- ✅ 대기열 관리 (자동 승인)
- ✅ 프로그램 관리 (CRUD)
- ✅ 시간대별 정원 관리
- ✅ 문의사항 관리 및 답변
- ✅ 공지사항 관리
- ✅ 강사 프로필 관리
- ✅ 월간 커리큘럼 관리
- ✅ 취소/환불 신청 처리
- ✅ 다중 단지 관리
- ✅ 월별 통계 리포트

## 🌐 현재 작동 중인 서버

**공개 URL**: https://3000-ih3eb58m0wu0t0q9r2ap8-2b54fc91.sandbox.novita.ai

### 테스트 가능한 페이지
- **주민 신청**: https://3000-ih3eb58m0wu0t0q9r2ap8-2b54fc91.sandbox.novita.ai/index.html
- **강사 소개**: https://3000-ih3eb58m0wu0t0q9r2ap8-2b54fc91.sandbox.novita.ai/instructors.html  
- **관리자**: https://3000-ih3eb58m0wu0t0q9r2ap8-2b54fc91.sandbox.novita.ai/admin-main.html

### API 엔드포인트
- **헬스 체크**: https://3000-ih3eb58m0wu0t0q9r2ap8-2b54fc91.sandbox.novita.ai/api/health
- **프로그램 목록**: https://3000-ih3eb58m0wu0t0q9r2ap8-2b54fc91.sandbox.novita.ai/api/programs
- **통계**: https://3000-ih3eb58m0wu0t0q9r2ap8-2b54fc91.sandbox.novita.ai/api/statistics/dashboard

## 🔌 API 엔드포인트

### 기본
- `GET /api/health` - 헬스 체크

### 프로그램 (Programs)
- `GET /api/programs` - 모든 프로그램 조회
- `POST /api/programs` - 새 프로그램 생성
- `GET /tables/programs` - 레거시 호환

### 계약서/신청서 (Contracts)
- `GET /api/contracts` - 모든 계약서 조회
- `POST /api/contracts` - 새 계약서 생성
- `GET /tables/pilates_contracts` - 레거시 호환

### 문의사항 (Inquiries)
- `GET /api/inquiries` - 모든 문의사항 조회
- `GET /api/inquiries?public=true` - 공개 문의사항만
- `POST /api/inquiries` - 새 문의사항 생성
- `GET /tables/pilates_inquiries` - 레거시 호환

### 공지사항 (Notices)
- `GET /api/notices` - 모든 공지사항 조회
- `GET /tables/notices` - 레거시 호환

### 통계 (Statistics)
- `GET /api/statistics/dashboard` - 대시보드 통계

## 🚀 로컬 개발

### 설치
```bash
cd /home/user/webapp
npm install
```

### 데이터베이스 초기화
```bash
# SQLite 데이터베이스 자동 생성됨
# database.sqlite 파일이 자동으로 생성됩니다
```

### 개발 서버 시작
```bash
# Node.js로 직접 실행
node server.js

# 또는 백그라운드 실행
node server.js > server.log 2>&1 &
```

### API 테스트
```bash
# 헬스 체크
curl http://localhost:3000/api/health

# 프로그램 조회
curl http://localhost:3000/api/programs

# 통계 확인
curl http://localhost:3000/api/statistics/dashboard
```

### 전체 테스트
```bash
./test_api.sh
```

## 📦 배포 (호스팅 플랫폼)

### Vercel 배포

1. **Vercel CLI 설치**
   ```bash
   npm install -g vercel
   ```

2. **배포**
   ```bash
   vercel
   ```

### Railway 배포

1. **GitHub 연결**
   - Railway에서 GitHub 리포지토리 연결

2. **시작 명령어 설정**
   ```
   node server.js
   ```

### Render 배포

1. **Web Service 생성**
   - Build Command: `npm install`
   - Start Command: `node server.js`

### Heroku 배포

1. **Procfile 생성**
   ```
   web: node server.js
   ```

2. **배포**
   ```bash
   git push heroku main
   ```

## 📁 프로젝트 구조

```
webapp/
├── server.js                     # Express 서버 (CommonJS)
├── database.sqlite               # SQLite 데이터베이스
├── public/                       # 정적 파일
│   ├── index.html               # 주민 신청 페이지
│   ├── instructors.html         # 강사 소개
│   ├── admin-main.html          # 관리자 메인
│   ├── css/                     # 스타일시트
│   └── js/                      # 프론트엔드 스크립트
├── migrations/
│   └── 0001_initial_schema.sql  # 데이터베이스 스키마
├── package.json                 # 의존성
└── README.md                    # 이 파일
```

## 📊 데이터베이스

### SQLite 파일 기반 데이터베이스
- 파일명: `database.sqlite`
- 위치: 프로젝트 루트
- 자동 생성 및 마이그레이션

### 주요 테이블
1. **programs** - 프로그램 정보
2. **pilates_contracts** - 신청서/계약서
3. **pilates_inquiries** - 문의사항
4. **notices** - 공지사항
5. **instructors** - 강사 정보
6. **curriculums** - 월간 커리큘럼
7. **pilates_cancellations** - 취소/환불 신청
8. **complex_settings** - 단지 설정

## 🛠️ 기술 상세

### Backend
- **Express.js** - Node.js 웹 프레임워크
- **SQLite** - 파일 기반 데이터베이스
- **better-sqlite3** - 동기식 SQLite 드라이버
- **CORS** - 크로스 오리진 지원

### Frontend
- **Vanilla JavaScript** - 순수 JS
- **TailwindCSS** - 유틸리티 CSS
- **Font Awesome** - 아이콘
- **Signature Pad** - 전자 서명

### 특징
- ✅ 파일 기반 데이터베이스 (별도 DB 서버 불필요)
- ✅ 간단한 배포 (파일만 복사)
- ✅ 모든 호스팅 플랫폼 지원
- ✅ 낮은 메모리 사용량
- ✅ 빠른 응답 속도

## 🔒 관리자 접근

### 방법 1: 로고 5회 클릭
1. 주민 페이지에서 상단 로고를 5회 클릭
2. 비밀번호 입력 (기본값: `admin1234`)

### 방법 2: 직접 URL
```
https://your-domain.com/admin-main.html
```

## 🧪 테스트 결과

✅ **모든 API 엔드포인트 테스트 통과**
- Health check: OK
- Programs CRUD: OK
- Contracts CRUD: OK  
- Inquiries CRUD: OK
- Notices: OK
- Statistics: OK

## 📝 의존성

```json
{
  "dependencies": {
    "express": "^5.2.1",
    "cors": "^2.8.6",
    "better-sqlite3": "^12.8.0"
  }
}
```

## 🎯 배포 체크리스트

- ✅ Node.js 서버 실행 확인
- ✅ SQLite 데이터베이스 초기화 확인
- ✅ 모든 API 테스트 통과
- ✅ 정적 파일 서빙 확인
- ✅ CORS 설정 확인
- ⏳ 호스팅 플랫폼 선택 (Vercel, Railway, Render 등)
- ⏳ 환경 변수 설정 (필요시)
- ⏳ 도메인 연결 (선택사항)

## 📄 라이선스

이 프로젝트는 청주SK뷰자이 아파트 전용입니다.

---

**Created**: 2026-03-20
**Last Updated**: 2026-03-20  
**Status**: ✅ Production Ready (호스팅 플랫폼 배포 가능)
**Server**: Express.js + SQLite
**URL**: https://3000-ih3eb58m0wu0t0q9r2ap8-2b54fc91.sandbox.novita.ai
