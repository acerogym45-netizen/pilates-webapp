# 필라테스 레슨 신청 시스템 (webapp)

청주SK뷰자이 필라테스 레슨 신청 및 관리 시스템입니다.

## 📋 프로젝트 개요

- **버전**: v12.2.6
- **플랫폼**: Cloudflare Pages + Hono Framework
- **데이터베이스**: Cloudflare D1 (SQLite)
- **기술 스택**: TypeScript, Hono, Vite, TailwindCSS

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
- ✅ 개인 레슨 시간 자유 입력
- ✅ 문의사항 관리 및 답변
- ✅ 공지사항 관리
- ✅ 강사 프로필 관리
- ✅ 월간 커리큘럼 관리
- ✅ 취소/환불 신청 처리
- ✅ 다중 단지 관리
- ✅ 월별 통계 리포트 (CSV 다운로드)
- ✅ 서명 이미지 확인

## 🔌 API 엔드포인트

### 기본
- `GET /api/health` - 헬스 체크

### 프로그램 (Programs)
- `GET /api/programs` - 모든 프로그램 조회
- `GET /api/programs/:id` - 특정 프로그램 조회
- `POST /api/programs` - 새 프로그램 생성
- `PUT /api/programs/:id` - 프로그램 전체 수정
- `PATCH /api/programs/:id` - 프로그램 부분 수정
- `DELETE /api/programs/:id` - 프로그램 삭제

### 계약서/신청서 (Contracts)
- `GET /api/contracts` - 모든 계약서 조회
- `GET /api/contracts/:id` - 특정 계약서 조회
- `POST /api/contracts` - 새 계약서 생성
- `PUT /api/contracts/:id` - 계약서 전체 수정
- `PATCH /api/contracts/:id` - 계약서 부분 수정
- `DELETE /api/contracts/:id` - 계약서 삭제

### 문의사항 (Inquiries)
- `GET /api/inquiries` - 모든 문의사항 조회
- `GET /api/inquiries?public=true` - 공개 문의사항만 조회
- `GET /api/inquiries/:id` - 특정 문의사항 조회
- `POST /api/inquiries` - 새 문의사항 생성
- `PUT /api/inquiries/:id` - 문의사항 전체 수정
- `PATCH /api/inquiries/:id` - 문의사항 부분 수정
- `DELETE /api/inquiries/:id` - 문의사항 삭제

### 공지사항 (Notices)
- `GET /api/notices` - 모든 공지사항 조회
- `GET /api/notices/:id` - 특정 공지사항 조회
- `POST /api/notices` - 새 공지사항 생성
- `PUT /api/notices/:id` - 공지사항 전체 수정
- `PATCH /api/notices/:id` - 공지사항 부분 수정
- `DELETE /api/notices/:id` - 공지사항 삭제

### 강사 (Instructors)
- `GET /api/instructors` - 모든 강사 조회
- `GET /api/instructors/:id` - 특정 강사 조회
- `POST /api/instructors` - 새 강사 생성
- `PUT /api/instructors/:id` - 강사 전체 수정
- `PATCH /api/instructors/:id` - 강사 부분 수정
- `DELETE /api/instructors/:id` - 강사 삭제

### 커리큘럼 (Curriculums)
- `GET /api/curriculums` - 모든 커리큘럼 조회
- `GET /api/curriculums/:id` - 특정 커리큘럼 조회
- `POST /api/curriculums` - 새 커리큘럼 생성
- `PUT /api/curriculums/:id` - 커리큘럼 전체 수정
- `PATCH /api/curriculums/:id` - 커리큘럼 부분 수정
- `DELETE /api/curriculums/:id` - 커리큘럼 삭제

### 취소/환불 (Cancellations)
- `GET /api/cancellations` - 모든 취소/환불 신청 조회
- `GET /api/cancellations/:id` - 특정 취소/환불 신청 조회
- `POST /api/cancellations` - 새 취소/환불 신청 생성
- `PUT /api/cancellations/:id` - 취소/환불 신청 전체 수정
- `PATCH /api/cancellations/:id` - 취소/환불 신청 부분 수정
- `DELETE /api/cancellations/:id` - 취소/환불 신청 삭제

### 단지 설정 (Complex Settings)
- `GET /api/complex-settings` - 모든 단지 설정 조회
- `GET /api/complex-settings/:id` - 특정 단지 설정 조회
- `POST /api/complex-settings` - 새 단지 설정 생성
- `PUT /api/complex-settings/:id` - 단지 설정 전체 수정
- `PATCH /api/complex-settings/:id` - 단지 설정 부분 수정
- `DELETE /api/complex-settings/:id` - 단지 설정 삭제

### 통계 (Statistics)
- `GET /api/statistics/dashboard` - 대시보드 통계

### 레거시 호환성
모든 `/tables/*` 엔드포인트도 지원됩니다:
- `GET /tables/programs`
- `GET /tables/pilates_contracts`
- `GET /tables/pilates_inquiries`
- `GET /tables/notices`
- `GET /tables/instructors`
- `GET /tables/curriculums`
- `GET /tables/pilates_cancellations`
- `GET /tables/complex_settings`

## 📊 데이터베이스 구조

### 주요 테이블
1. **programs** - 프로그램 정보
2. **pilates_contracts** - 신청서/계약서
3. **pilates_inquiries** - 문의사항
4. **notices** - 공지사항
5. **instructors** - 강사 정보
6. **curriculums** - 월간 커리큘럼
7. **pilates_cancellations** - 취소/환불 신청
8. **complex_settings** - 단지 설정
9. **guestbook** - 방명록 (향후 사용)

### 데이터 모델
- **자동 생성 UUID** - 모든 레코드는 고유한 UUID를 가집니다
- **타임스탬프** - created_at, updated_at 자동 관리
- **단지 코드** - complex_code로 다중 단지 지원
- **상태 관리** - status 필드로 승인/대기/거부 관리

## 🚀 로컬 개발

### 설치
```bash
cd /home/user/webapp
npm install
```

### 데이터베이스 마이그레이션
```bash
# 로컬 D1 데이터베이스 마이그레이션
npx wrangler d1 migrations apply webapp-db --local
```

### 빌드
```bash
npm run build
```

### 개발 서버 시작
```bash
# PM2로 시작 (권장)
pm2 start ecosystem.config.cjs

# 또는 직접 실행
npm run dev:sandbox
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

### 테스트 스크립트
```bash
# 전체 API 테스트
./test_api.sh
```

## 📦 배포

### Cloudflare Pages 배포

1. **Cloudflare API 키 설정**
   - Deploy 탭에서 API 키를 설정하세요

2. **데이터베이스 생성**
   ```bash
   npx wrangler d1 create webapp-db
   ```
   
   생성된 database_id를 `wrangler.jsonc`에 입력하세요

3. **마이그레이션 실행**
   ```bash
   # 프로덕션 데이터베이스 마이그레이션
   npx wrangler d1 migrations apply webapp-db
   ```

4. **프로젝트 생성**
   ```bash
   npx wrangler pages project create webapp \
     --production-branch main \
     --compatibility-date 2024-01-01
   ```

5. **배포**
   ```bash
   npm run deploy
   ```

## 🔒 관리자 접근

### 방법 1: 로고 5회 클릭
1. 주민 페이지에서 상단 로고를 5회 클릭
2. 비밀번호 입력 (기본값: `admin1234`)
3. 관리자 페이지로 이동

### 방법 2: 직접 URL
```
https://your-domain.com/admin-main.html
```

## 📁 프로젝트 구조

```
webapp/
├── src/
│   └── index.tsx                 # Hono API 서버
├── public/                        # 정적 파일
│   ├── index.html                # 주민 신청 페이지
│   ├── instructors.html          # 강사 소개
│   ├── admin-main.html           # 관리자 메인
│   ├── admin-programs.html       # 프로그램 관리
│   ├── admin-inquiry.html        # 문의사항 관리
│   ├── admin-notices.html        # 공지사항 관리
│   ├── admin-instructors.html    # 강사 관리
│   ├── admin-cancellation.html   # 취소/환불 관리
│   ├── admin-complex.html        # 단지 관리
│   ├── css/                      # 스타일시트
│   └── js/                       # 프론트엔드 스크립트
├── migrations/
│   └── 0001_initial_schema.sql   # 데이터베이스 스키마
├── wrangler.jsonc                # Cloudflare 설정
├── vite.config.ts                # Vite 설정
├── package.json                  # 의존성
└── README.md                     # 이 파일
```

## 🧪 테스트 결과

✅ **모든 API 엔드포인트 테스트 통과**
- Health check: OK
- Programs CRUD: OK
- Contracts CRUD: OK
- Inquiries CRUD: OK
- Notices CRUD: OK
- Instructors CRUD: OK
- Curriculums CRUD: OK
- Cancellations CRUD: OK
- Complex Settings CRUD: OK
- Statistics: OK

## 🎯 다음 단계

### 필수
1. ⏳ Cloudflare API 키 설정 (Deploy 탭에서)
2. ⏳ 프로덕션 D1 데이터베이스 생성
3. ⏳ 프로덕션 마이그레이션 실행
4. ⏳ Cloudflare Pages 배포

### 선택 사항
1. GitHub 리포지토리 연결
2. 기존 데이터 임포트
3. 커스텀 도메인 설정
4. 환경 변수 설정 (secrets)

## 📝 버전 히스토리

- **v12.2.6** - 커리큘럼 조회 수정
- **v12.2.0** - 자동화 및 대기열 관리
- **v12.0.0** - 프로그램 관리 시스템
- **v11.0.0** - 다중 단지 지원
- **v10.0.0** - UI 현대화
- **v9.0.0** - 최종 완성
- **v8.1.0** - 초기 버전

## 🛠️ 기술 상세

### Backend
- **Hono** - 경량 웹 프레임워크
- **Cloudflare Workers** - 엣지 런타임
- **D1 Database** - 서버리스 SQLite
- **TypeScript** - 타입 안정성

### Frontend
- **Vanilla JavaScript** - 프레임워크 없는 순수 JS
- **TailwindCSS** - 유틸리티 CSS
- **Font Awesome** - 아이콘
- **Signature Pad** - 전자 서명

### DevOps
- **Vite** - 빌드 도구
- **Wrangler** - Cloudflare CLI
- **PM2** - 프로세스 관리
- **Git** - 버전 관리

## 📄 라이선스

이 프로젝트는 청주SK뷰자이 아파트 전용입니다.

## 🙋 문의

관리자 페이지에서 문의사항을 확인하세요.

---

**Created**: 2026-03-20
**Last Updated**: 2026-03-20
**Status**: ✅ Production Ready (배포 대기 중)
