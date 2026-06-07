# B-5 server/index.js 호텔 라우터 통합

**수정 파일**: `server/index.js`  
**단계**: Phase B — B-5 (Phase B 최종 단계)  
**작성일**: 2026-06-07

---

## 개요

B-1~B-4에서 만든 4개의 호텔 라우터 파일을 `server/index.js`에 통합합니다.  
`ENABLE_HOTEL_MODE=false`(기본값)인 한 기존 아파트 단지 서비스에 **런타임 영향이 전혀 없습니다.**

---

## 변경 내용 (diff 요약)

```
추가: 20줄  /  변경: 0줄  /  삭제: 0줄
```

### 추가 1 — require 블록 (27번째 줄 이후, 8줄 추가)

**위치**: 기존 `const { startCron } = require('./cron');` 바로 다음 줄

```javascript
// ── 호텔 모드 라우터 import (B-1~B-4) ────────────────────────────────────────
// Feature Flag OFF(기본값) 시 require는 실행되지만 app.use에 등록되지 않음 → 런타임 영향 0
const flags                = require('./config/feature-flags');
const hotelAuthRouter      = require('./routes/hotel/auth');
const hotelQuickClassRouter = require('./routes/hotel/quick-class');
const hotelRefreshPtRouter = require('./routes/hotel/refresh-pt');
const hotelMembersRouter   = require('./routes/hotel/members');
```

**현재 파일 기준 줄 번호**: 28~34번째 줄

### 추가 2 — app.use 블록 (renewalRouter 등록 직후, 12줄 추가)

**위치**: `app.use('/', renewalRouter);` 바로 다음 줄  
**현재 파일 기준 줄 번호**: 119~129번째 줄

```javascript
// ── 호텔 모드 라우터 등록 (ENABLE_HOTEL_MODE=true 시에만 활성화) ──────────────
// 기존 라우트(/api/complexes 등)와 경로 충돌 없음 — /api/hotel/* 네임스페이스 격리
if (flags.hotelMode) {
    app.use('/api/hotel/auth',        hotelAuthRouter);
    app.use('/api/hotel/quick-class', hotelQuickClassRouter);
    app.use('/api/hotel/refresh-pt',  hotelRefreshPtRouter);
    app.use('/api/hotel/members',     hotelMembersRouter);
    console.log('[HOTEL MODE] Routes mounted under /api/hotel/*');
} else {
    console.log('[HOTEL MODE] Disabled — hotel routes not mounted');
}
```

---

## 기존 라우트 등록 순서 (변경 없음)

아래 순서는 **전혀 변경되지 않았습니다.** 호텔 라우트 블록은 `renewalRouter` 이후에 삽입되었습니다.

```
app.use('/api/complexes',    complexesRouter);    ← 순서 유지
app.use('/api/programs',     programsRouter);     ← 순서 유지
app.use('/api/applications', applicationsRouter); ← 순서 유지
app.use('/api/backup',       backupRouter);       ← 순서 유지
app.use('/api',              miscRouter);         ← 순서 유지
app.use('/api/upload',       uploadRouter);       ← 순서 유지
app.use('/',                 renewalRouter);      ← 순서 유지

// ▼ 여기에 호텔 블록 추가 (Flag OFF 시 라우트 미등록) ▼
if (flags.hotelMode) { ... }
```

---

## Flag OFF 시 동작 원리

```
서버 시작
   │
   ├─ require('./config/feature-flags')  → flags.hotelMode = false (env 미설정)
   ├─ require('./routes/hotel/auth')     → 모듈 로드 (메모리에만 존재)
   ├─ require('./routes/hotel/quick-class') → 모듈 로드
   ├─ require('./routes/hotel/refresh-pt')  → 모듈 로드
   ├─ require('./routes/hotel/members')     → 모듈 로드
   │
   └─ if (flags.hotelMode) → false
        └─ else: console.log('[HOTEL MODE] Disabled — hotel routes not mounted')
             → app.use('/api/hotel/*') 미실행
             → 어떤 HTTP 요청도 호텔 라우트로 도달하지 않음
             → 기존 아파트 서비스 런타임 영향 0
```

**require는 실행되나 문제가 없는 이유**:
- 4개 호텔 라우트 파일은 최상위 레벨에서 Supabase 연결을 시도하지 않습니다.
- `getSupabase()`는 라우트 핸들러 내부에서만 호출됩니다.
- 모듈 로드 자체는 단순히 Express Router 객체를 생성하는 것이므로 부작용 없음.

---

## Flag ON 전환 절차 (운영 준비 완료 시)

> ⚠️ 아래 절차는 라마다호텔점 운영 시작이 확정된 후에만 실행합니다.

### Vercel 환경변수 설정

```
Vercel 대시보드 → 프로젝트 선택
→ Settings → Environment Variables
→ 아래 변수 추가 (값: true)
```

| 환경변수                   | 값     | 활성화되는 기능              |
|----------------------------|--------|------------------------------|
| `ENABLE_HOTEL_MODE`        | `true` | 호텔 라우트 마운트 (필수)    |
| `ENABLE_HOTEL_QUICK_CLASS` | `true` | 무료 클래스 원터치 신청      |
| `ENABLE_HOTEL_REFRESH_PT`  | `true` | 리프레시 PT 예약             |
| `ENABLE_HOTEL_MEMBER_PAGE` | `true` | 회원 마이페이지              |
| `ENABLE_HOTEL_STAFF_AUTH`  | `true` | 임직원 인증 (선택)           |

### 재배포

```bash
# Vercel CLI 사용 시
vercel --prod

# 또는 Vercel 대시보드 → Deployments → Redeploy
```

### 재배포 후 확인

```bash
# 헬스체크
curl https://your-domain.vercel.app/api/health

# 호텔 라우트 확인 (Flag ON 시 403 대신 다른 응답이 와야 함)
curl "https://your-domain.vercel.app/api/hotel/quick-class/availability?complex_code=ht-lamada&program_id=test"
# → {"success":false,"error":"단지를 찾을 수 없습니다"} (404) 이면 정상 (라우트 등록됨)
# → {"success":false,"error":"해당 기능이 현재 비활성화..."} (403) 이면 Flag 미적용
```

---

## 사고 발생 시 즉시 OFF 방법

### 방법 1 — 환경변수 OFF (권장, 재배포 필요)

```
Vercel 대시보드 → Settings → Environment Variables
→ ENABLE_HOTEL_MODE 값을 false 또는 삭제
→ Redeploy
```

**효과**: 재배포 후 호텔 라우트 전체 미등록. 기존 서비스 완전 보호.

### 방법 2 — 즉각 롤백 (재배포 불필요)

```
Vercel 대시보드 → Deployments
→ 직전 성공한 배포 선택 → "..." → "Promote to Production"
```

**효과**: 수초 내 이전 배포로 복구. 환경변수 변경 없이 즉시 적용.

### 방법 3 — 코드 롤백 (Git)

```bash
git revert HEAD  # 또는 특정 커밋 지정
git push origin main
```

---

## 경로 충돌 검증

호텔 라우트는 `/api/hotel/*` 네임스페이스 아래 격리됩니다.  
기존 라우트와 접두사가 겹치지 않음을 확인합니다.

| 기존 경로 접두사       | 호텔 경로 접두사             | 충돌 여부 |
|------------------------|------------------------------|-----------|
| `/api/complexes`       | `/api/hotel/auth`            | ❌ 없음   |
| `/api/programs`        | `/api/hotel/quick-class`     | ❌ 없음   |
| `/api/applications`    | `/api/hotel/refresh-pt`      | ❌ 없음   |
| `/api/backup`          | `/api/hotel/members`         | ❌ 없음   |
| `/api` (misc)          | `/api/hotel/*`               | ❌ 없음   |
| `/api/upload`          | `/api/hotel/*`               | ❌ 없음   |
| `/` (renewal)          | `/api/hotel/*`               | ❌ 없음   |

> **참고**: Express는 `/api`에 등록된 miscRouter보다 `/api/hotel/*`를 먼저 매칭할 수 있도록,  
> 호텔 블록은 miscRouter 등록 이후에 위치합니다. 다만 `/api/hotel/*` 경로는 miscRouter 내부에  
> 존재하지 않으므로 실질적 충돌은 없습니다.

---

## 관련 파일

| 파일                                    | 역할                                          |
|-----------------------------------------|-----------------------------------------------|
| `server/index.js`                       | 이 문서의 수정 파일                           |
| `server/config/feature-flags.js`        | `flags.hotelMode` 정의 (A-4)                  |
| `server/routes/hotel/auth.js`           | B-1: 호텔 인증 라우터                         |
| `server/routes/hotel/quick-class.js`    | B-2: 무료 클래스 원터치 신청 라우터           |
| `server/routes/hotel/refresh-pt.js`     | B-3: 리프레시 PT 예약 라우터                  |
| `server/routes/hotel/members.js`        | B-4: 회원 마이페이지 라우터                   |
| `docs/ops/A4-FEATURE-FLAGS.md`          | Flag 운영 가이드 전체                         |
