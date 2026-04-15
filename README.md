# 아파트 단지 QR 무인 응대 시스템 v2.0

아파트 단지에서 QR 코드 스캔을 통해 무인으로 필라테스 레슨을 신청하고 관리하는 시스템입니다.

## 🚀 v2.0 주요 변경사항

| 항목 | v1.x (기존) | v2.0 (신규) |
|------|------------|------------|
| 백엔드 | GenSpark API 의존 | Node.js + Express + SQLite 독립 서버 |
| 오류 수정 | 서버 전체 초기화 필요 | 해당 모듈만 수정 |
| 단지 관리 | 하드코딩 | DB 기반 다중 단지 지원 |
| 코드 구조 | 단일 파일 2000줄 | 기능별 모듈 분리 |
| 배포 | GenSpark 전용 | 어디서나 배포 가능 |

## 📋 프로젝트 구조

```
├── server/                 # 백엔드 (Node.js + Express)
│   ├── index.js            # 서버 메인 엔트리포인트
│   ├── database.js         # SQLite 스키마 & 시드 데이터
│   └── routes/
│       ├── complexes.js    # 단지 관리 API
│       ├── programs.js     # 프로그램/시간대 API
│       ├── applications.js # 신청/해지 API
│       ├── misc.js         # 공지사항/문의/강사/커리큘럼
│       └── upload.js       # 파일 업로드
│
├── public/                 # 입주민 QR 페이지
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── api.js          # API 클라이언트
│       └── app.js          # 앱 로직
│
├── admin/                  # 관리자 SPA
│   ├── index.html
│   ├── css/admin.css
│   └── js/
│       ├── admin-app.js    # 코어 (라우팅, 인증)
│       └── pages/
│           ├── dashboard.js
│           ├── applications.js
│           ├── cancellations.js
│           ├── inquiries.js
│           ├── notices.js
│           ├── programs.js
│           ├── instructors.js
│           ├── curricula.js
│           └── complexes.js
│
└── data/                   # SQLite DB 파일 (자동 생성)
```

## 🛠 설치 및 실행

```bash
# 의존성 설치
npm install

# 서버 실행 (포트 3001)
node server/index.js

# 개발 모드 (코드 변경시 자동 재시작)
node --watch server/index.js
```

## 🔗 접속 URL

| 페이지 | URL |
|--------|-----|
| 입주민 QR 페이지 | `http://localhost:3001/?complex=<단지코드>` |
| 관리자 페이지 | `http://localhost:3001/admin/` |
| API 헬스체크 | `http://localhost:3001/api/health` |

## 🔑 기본 접속 정보

- **기본 단지 코드**: `apt-demo`
- **관리자 비밀번호**: `admin1234`
- **마스터 비밀번호**: `master2026`

## ✨ 주요 기능

### 입주민 (QR 스캔)
- ✅ 프로그램 선택 및 시간대별 정원 실시간 확인
- ✅ 2단계 신청 프로세스 (신청서 → 전자서명)
- ✅ 중복 신청 자동 차단
- ✅ 정원 초과시 대기열 자동 등록
- ✅ 내 신청 현황 조회 (동/호수/전화번호 뒷4자리)
- ✅ 해지 신청
- ✅ 공지사항/문의사항/커리큘럼/강사 소개 확인

### 관리자
- ✅ 실시간 대시보드 통계
- ✅ 신청 목록 필터링/검색/승인/거부
- ✅ 해지 신청 관리
- ✅ 문의 답변 관리
- ✅ 공지사항 CRUD
- ✅ 프로그램/시간대 관리
- ✅ 강사 관리 (사진 업로드)
- ✅ 월별 커리큘럼 관리
- ✅ CSV 내보내기
- ✅ QR 코드 자동 생성

### 마스터 관리자
- ✅ 다중 단지 관리 (추가/수정/삭제)
- ✅ 단지별 색상 테마 설정

## 🌍 환경변수 (.env)

```env
PORT=3001
MASTER_PASSWORD=master2026
NODE_ENV=production
```

## 📦 배포

### Node.js 호스팅 (권장)
```bash
# PM2로 프로세스 관리
npm install -g pm2
pm2 start server/index.js --name apartment-qr
pm2 save
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3001
CMD ["node", "server/index.js"]
```

## 🔧 오류 수정 방법

기존 v1.x와 달리 **서버 전체 초기화 없이** 해당 모듈만 수정하면 됩니다:

```
신청 관련 오류 → server/routes/applications.js 수정
프로그램 관련 오류 → server/routes/programs.js 수정
공지/문의 관련 오류 → server/routes/misc.js 수정
입주민 화면 오류 → public/js/app.js 수정
관리자 화면 오류 → admin/js/pages/<해당모듈>.js 수정
```
