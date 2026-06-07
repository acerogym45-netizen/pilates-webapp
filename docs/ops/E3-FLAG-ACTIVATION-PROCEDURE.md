# E3-FLAG-ACTIVATION-PROCEDURE: 호텔 모드 Feature Flag 단계적 활성화 절차서

> **단계**: E-3  
> **작성일**: 2026-06-07  
> **목적**: 프로덕션 Feature Flag를 단계적으로 활성화하여 위험을 최소화한다.  
> **현재 상태**: E-2 시드 적용 완료. 코드 전체 준비 완료. **Flag 전체 OFF 상태.**  
> **중요**: 이 문서는 절차서다. **실제 Flag 변경은 이 절차를 읽고 각 단계를 명시적으로 실행해야 한다.**

---

## 목차

1. [전제 조건 체크리스트](#1-전제-조건-체크리스트)
2. [Flag 구조 및 활성화 순서 개요](#2-flag-구조-및-활성화-순서-개요)
3. [Vercel 환경변수 설정 방법](#3-vercel-환경변수-설정-방법)
4. [Phase 1 — 마스터 스위치 (ENABLE_HOTEL_MODE)](#4-phase-1--마스터-스위치)
5. [Phase 2 — 무료 클래스 (ENABLE_HOTEL_QUICK_CLASS)](#5-phase-2--무료-클래스)
6. [Phase 3 — 리프레시 PT (ENABLE_HOTEL_REFRESH_PT)](#6-phase-3--리프레시-pt)
7. [Phase 4 — 마이페이지 (ENABLE_HOTEL_MEMBER_PAGE)](#7-phase-4--마이페이지)
8. [Phase 5 — 임직원 인증 (ENABLE_HOTEL_STAFF_AUTH)](#8-phase-5--임직원-인증)
9. [Phase 6 — 룸서비스 (ENABLE_HOTEL_MEAL_ORDER) — 보류](#9-phase-6--룸서비스-보류)
10. [사고 발생 시 즉시 OFF 절차 (90초 목표)](#10-사고-발생-시-즉시-off-절차-90초-목표)
11. [활성화 후 30분 모니터링 체크리스트](#11-활성화-후-30분-모니터링-체크리스트)
12. [기존 아파트 단지 무영향 검증 공통 절차](#12-기존-아파트-단지-무영향-검증-공통-절차)

---

## 1. 전제 조건 체크리스트

> Phase 1을 시작하기 전에 아래 항목을 **모두** 완료해야 한다.  
> 미완료 항목이 하나라도 있으면 Flag 활성화를 진행하지 않는다.

| # | 항목 | 확인 방법 | 상태 |
|---|------|-----------|------|
| 1 | ht-lamada 단지 `venue_type = 'hotel'` | Supabase SQL Editor → `SELECT venue_type FROM complexes WHERE code='ht-lamada'` | E-2 완료 ✅ |
| 2 | 트레이너 3명 등록 | `SELECT COUNT(*) FROM instructors i JOIN complexes c ON c.id=i.complex_id WHERE c.code='ht-lamada'` → 3 | E-2 완료 ✅ |
| 3 | 프로그램 2개 등록 (price=0, price=40000) | `SELECT name,price FROM programs p JOIN complexes c ON c.id=p.complex_id WHERE c.code='ht-lamada'` | E-2 완료 ✅ |
| 4 | 리프레시 PT `time_slots` 17개 | `SELECT jsonb_array_length(time_slots) FROM programs p JOIN complexes c ON c.id=p.complex_id WHERE c.code='ht-lamada' AND p.name='리프레시 PT'` → 17 | E-2 완료 ✅ |
| 5 | A-3 마이그레이션 5개 테이블 존재 | `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('hotel_staff','member_tokens','workout_reports','quick_class_reservations','refresh_pt_sessions')` → 5행 | |
| 6 | 서버 `/api/health` 정상 응답 | `curl $BASE_URL/api/health` → `{"status":"ok"}` | |
| 7 | 기존 아파트 단지 정상 동작 | 섹션 12 공통 절차 실행 | |
| 8 | 활성화 담당자 및 모니터링 담당자 지정 | 이름 기록: __________________ | |
| 9 | 즉시 OFF 권한 확인 (Vercel 접근 가능) | Vercel Dashboard 로그인 확인 | |
| 10 | `scripts/sh/e3-verify-after-flag-on.sh` 실행 준비 | `bash -n scripts/sh/e3-verify-after-flag-on.sh` 통과 확인 | |

---

## 2. Flag 구조 및 활성화 순서 개요

```
ENABLE_HOTEL_MODE=true          ← Phase 1 (마스터. 이것 없이 나머지 무효)
│
├── ENABLE_HOTEL_QUICK_CLASS=true   ← Phase 2 (무료 그룹 클래스)
├── ENABLE_HOTEL_REFRESH_PT=true    ← Phase 3 (1:1 PT 예약)
├── ENABLE_HOTEL_MEMBER_PAGE=true   ← Phase 4 (투숙객 마이페이지 + 운동 리포트)
├── ENABLE_HOTEL_STAFF_AUTH=true    ← Phase 5 (임직원 QR 인증)
└── ENABLE_HOTEL_MEAL_ORDER=true    ← Phase 6 (룸서비스 연동 — 미구현, 보류)
```

**핵심 원칙**:
- `ENABLE_HOTEL_MODE=false`이면 나머지 Flag가 `true`여도 `/api/hotel/*` 전체 **404**
- `ENABLE_HOTEL_MODE=true` + 하위 Flag `false`이면 해당 기능 엔드포인트 **403**
- 각 Phase 활성화 후 검증 통과 전까지 다음 Phase로 진행하지 않는다
- 기존 아파트 단지(apt-cjxi, apt-sclass) 라우트는 이 Flag와 **완전히 무관**

**Phase별 권장 간격**: 각 Phase 활성화 → 검증 → **이상 없음 확인 후 최소 10분 대기** → 다음 Phase

---

## 3. Vercel 환경변수 설정 방법

> 이 절차는 각 Phase마다 동일하게 반복한다.

### 3-1. 환경변수 추가/변경

```
① Vercel Dashboard (https://vercel.com) 로그인
② 프로젝트 선택 (pilates-webapp)
③ Settings 탭 → Environment Variables
④ 추가할 변수:
   - Name: ENABLE_HOTEL_MODE  (또는 해당 Phase의 변수명)
   - Value: true
   - Environment: Production (체크) / Preview (선택) / Development (선택)
⑤ Save 클릭
```

### 3-2. Redeploy 트리거

```
① Vercel Dashboard → Deployments 탭
② 최신 Production 배포 행 우측 "..." 메뉴 클릭
③ "Redeploy" 선택
④ "Use existing Build Cache" 체크 해제 (환경변수 변경이므로 fresh build)
⑤ Redeploy 클릭
⑥ 배포 완료까지 대기 (통상 60~120초)
```

### 3-3. 배포 완료 확인

```bash
# 배포 완료 후 헬스체크
curl -s $BASE_URL/api/health | grep '"status":"ok"'

# 서버 로그에서 호텔 모드 활성화 메시지 확인 (Vercel → Logs 탭)
# "[HOTEL MODE] Routes mounted under /api/hotel/*" 출력 여부
```

---

## 4. Phase 1 — 마스터 스위치

> **설정**: `ENABLE_HOTEL_MODE=true`  
> **목적**: 호텔 라우트를 서버에 마운트한다. 하위 Flag는 모두 `false` 유지.  
> **기대 효과**: `/api/hotel/*` 404 → 403 (마운트는 됐지만 기능 비활성)

### 4-1. Vercel 설정

| 변수명 | 값 |
|--------|----|
| `ENABLE_HOTEL_MODE` | `true` |

나머지 5개 하위 Flag는 **설정하지 않거나 `false`** 유지.

### 4-2. 검증

```bash
# 스크립트 실행
BASE_URL=https://your-app.vercel.app bash scripts/sh/e3-verify-after-flag-on.sh 1

# 또는 수동 curl
BASE_URL=https://your-app.vercel.app

# Phase 1 검증: 하위 Flag OFF → 403 반환 확인
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/hotel/quick-class/apply" \
  -H "Content-Type: application/json" \
  -d '{}'
# 기대값: 403 (Flag OFF) — 404이면 마운트 실패

curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/hotel/refresh-pt/instructors"
# 기대값: 403

curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/hotel/members/me"
# 기대값: 403

# verify-guest는 hotelMode 직접 사용 → 활성화 확인
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/hotel/auth/verify-guest" \
  -H "Content-Type: application/json" \
  -d '{"room_number":"","name":""}'
# 기대값: 400 (요청 도달, 입력값 오류) — 마운트 + 마스터 Flag 정상

# Vercel 로그 확인 메시지
# "[HOTEL MODE] Routes mounted under /api/hotel/*"
```

### 4-3. 아파트 단지 무영향 검증

→ **섹션 12 공통 절차** 실행 (Phase 1 활성화 후 필수)

### 4-4. Phase 1 완료 판단 기준

- [ ] `/api/hotel/quick-class/apply` → HTTP **403** 확인
- [ ] `/api/hotel/refresh-pt/instructors` → HTTP **403** 확인
- [ ] `/api/hotel/auth/verify-guest` → HTTP **400** (마운트 + 마스터 Flag 정상 진입)
- [ ] Vercel 로그 `[HOTEL MODE] Routes mounted` 메시지 확인
- [ ] 섹션 12 아파트 무영향 체크 통과
- [ ] 10분 대기 후 이상 없음 확인

---

## 5. Phase 2 — 무료 클래스

> **설정**: `ENABLE_HOTEL_QUICK_CLASS=true` 추가  
> **목적**: 아세로 순환 운동 클래스 예약 기능 활성화  
> **전제**: Phase 1 완료 및 이상 없음 확인

### 5-1. Vercel 설정

| 변수명 | 값 |
|--------|----|
| `ENABLE_HOTEL_MODE` | `true` (유지) |
| `ENABLE_HOTEL_QUICK_CLASS` | `true` |

### 5-2. 검증

```bash
BASE_URL=https://your-app.vercel.app

# 스크립트 실행
bash scripts/sh/e3-verify-after-flag-on.sh 2

# 또는 수동 curl
# [2-A] 가용 슬롯 조회 (program_id는 Supabase에서 조회)
curl -s "$BASE_URL/api/hotel/quick-class/availability?program_id=<program_uuid>&date=$(date +%Y-%m-%d)" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if 'slots' in d or 'available' in d else 'FAIL')"
# 기대값: 응답 본문에 슬롯 정보 포함 (200)

# [2-B] 잘못된 요청으로 입력 검증 확인
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/hotel/quick-class/apply" \
  -H "Content-Type: application/json" \
  -d '{"program_id":"invalid"}'
# 기대값: 400 (요청 도달, 입력값 오류)

# [2-C] 무료 클래스(price=0) 조건 확인 — price≠0이면 400
# quick-class API: resolveFreeProgram()에서 price=0 체크
# → 아세로 순환 운동 클래스 price=0 시드 데이터가 올바르게 적용됐으면 통과
```

### 5-3. 아파트 단지 무영향 검증

→ **섹션 12 공통 절차** 실행

### 5-4. Phase 2 완료 판단 기준

- [ ] `/api/hotel/quick-class/availability` → HTTP **200** 응답
- [ ] `/api/hotel/quick-class/apply` 잘못된 요청 → HTTP **400** (요청 도달 확인)
- [ ] `/api/hotel/refresh-pt/instructors` → HTTP **403** 유지 (Phase 3 미활성)
- [ ] 섹션 12 아파트 무영향 체크 통과
- [ ] 10분 대기 후 이상 없음 확인

---

## 6. Phase 3 — 리프레시 PT

> **설정**: `ENABLE_HOTEL_REFRESH_PT=true` 추가  
> **목적**: 1:1 퍼스널 트레이닝 예약 기능 활성화  
> **전제**: Phase 2 완료 및 이상 없음 확인

### 6-1. Vercel 설정

| 변수명 | 값 |
|--------|----|
| `ENABLE_HOTEL_MODE` | `true` (유지) |
| `ENABLE_HOTEL_QUICK_CLASS` | `true` (유지) |
| `ENABLE_HOTEL_REFRESH_PT` | `true` |

### 6-2. 검증

```bash
BASE_URL=https://your-app.vercel.app

# 스크립트 실행
bash scripts/sh/e3-verify-after-flag-on.sh 3

# 또는 수동 curl
# [3-A] 트레이너 목록 조회
curl -s "$BASE_URL/api/hotel/refresh-pt/instructors?complex_id=<complex_uuid>" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"트레이너 {len(d.get('instructors',[]))}명\")"
# 기대값: 트레이너 3명 (전민수, 이도현, 유기현)

# [3-B] 슬롯 조회
curl -s "$BASE_URL/api/hotel/refresh-pt/slots?instructor_id=<instructor_uuid>&date=$(date +%Y-%m-%d)" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"슬롯 {len(d.get('slots',[]))}개\")"
# 기대값: 슬롯 최대 17개 (09:00~20:15, 예약된 슬롯 제외)

# [3-C] 잘못된 요청 검증
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/hotel/refresh-pt/book" \
  -H "Content-Type: application/json" \
  -d '{}'
# 기대값: 400 또는 401 (요청 도달 확인)
```

### 6-3. 아파트 단지 무영향 검증

→ **섹션 12 공통 절차** 실행

### 6-4. Phase 3 완료 판단 기준

- [ ] `/api/hotel/refresh-pt/instructors` → HTTP **200**, 트레이너 3명 응답
- [ ] 슬롯 조회 → HTTP **200**, 17개 이하 슬롯 응답
- [ ] `/api/hotel/members/me` → HTTP **403** 유지 (Phase 4 미활성)
- [ ] 섹션 12 아파트 무영향 체크 통과
- [ ] 10분 대기 후 이상 없음 확인

---

## 7. Phase 4 — 마이페이지

> **설정**: `ENABLE_HOTEL_MEMBER_PAGE=true` 추가  
> **목적**: 투숙객 마이페이지 + 운동 리포트 조회/작성 기능 활성화  
> **전제**: Phase 3 완료 및 이상 없음 확인

### 7-1. Vercel 설정

| 변수명 | 값 |
|--------|----|
| `ENABLE_HOTEL_MODE` | `true` (유지) |
| `ENABLE_HOTEL_QUICK_CLASS` | `true` (유지) |
| `ENABLE_HOTEL_REFRESH_PT` | `true` (유지) |
| `ENABLE_HOTEL_MEMBER_PAGE` | `true` |

### 7-2. 검증

```bash
BASE_URL=https://your-app.vercel.app

# 스크립트 실행
bash scripts/sh/e3-verify-after-flag-on.sh 4

# 또는 수동 curl
# [4-A] 비인증 요청 → 401 (요청 도달 확인)
curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/hotel/members/me"
# 기대값: 401 (인증 토큰 없음) — 403이면 Flag 미활성

# [4-B] 운동 리포트 목록 (비인증)
curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/hotel/workout-reports"
# 기대값: 401

# [4-C] 투숙객 인증 흐름 확인 (verify-guest → 토큰 발급)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/hotel/auth/verify-guest" \
  -H "Content-Type: application/json" \
  -d '{"room_number":"101","name":"테스트"}'
# 기대값: 200 또는 400/404 (PMS 미연동 상태에 따라 다름) — 500이면 오류
```

### 7-3. 아파트 단지 무영향 검증

→ **섹션 12 공통 절차** 실행

### 7-4. Phase 4 완료 판단 기준

- [ ] `/api/hotel/members/me` → HTTP **401** (403이 아닌 것 확인 — Flag 활성 증거)
- [ ] `/api/hotel/workout-reports` → HTTP **401**
- [ ] `/api/hotel/auth/verify-staff` → HTTP **403** 유지 (Phase 5 미활성)
- [ ] 섹션 12 아파트 무영향 체크 통과
- [ ] 10분 대기 후 이상 없음 확인

---

## 8. Phase 5 — 임직원 인증

> **설정**: `ENABLE_HOTEL_STAFF_AUTH=true` 추가  
> **목적**: 호텔 임직원 QR 인증 및 직원 명부 관리 기능 활성화  
> **전제**: Phase 4 완료 및 이상 없음 확인

### 8-1. Vercel 설정

| 변수명 | 값 |
|--------|----|
| `ENABLE_HOTEL_MODE` | `true` (유지) |
| `ENABLE_HOTEL_QUICK_CLASS` | `true` (유지) |
| `ENABLE_HOTEL_REFRESH_PT` | `true` (유지) |
| `ENABLE_HOTEL_MEMBER_PAGE` | `true` (유지) |
| `ENABLE_HOTEL_STAFF_AUTH` | `true` |

### 8-2. 검증

```bash
BASE_URL=https://your-app.vercel.app

# 스크립트 실행
bash scripts/sh/e3-verify-after-flag-on.sh 5

# 또는 수동 curl
# [5-A] 잘못된 phone_last4 입력 → 400 (요청 도달 + 입력검증 확인)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/hotel/auth/verify-staff" \
  -H "Content-Type: application/json" \
  -d '{"phone_last4":"123456"}'
# 기대값: 400 (5자리 이상 거부)

# [5-B] 빈 요청 → 400 (요청 도달 확인)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/hotel/auth/verify-staff" \
  -H "Content-Type: application/json" \
  -d '{}'
# 기대값: 400

# [5-C] 직원 명부 목록 (비인증)
curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/hotel/staff"
# 기대값: 401 또는 400 (요청 도달 확인)
```

### 8-3. 아파트 단지 무영향 검증

→ **섹션 12 공통 절차** 실행

### 8-4. Phase 5 완료 판단 기준

- [ ] `/api/hotel/auth/verify-staff` 빈 요청 → HTTP **400** (403이 아닌 것 확인)
- [ ] `phone_last4` 5자리 이상 → HTTP **400** 입력 검증 정상 동작
- [ ] 섹션 12 아파트 무영향 체크 통과
- [ ] 10분 대기 후 이상 없음 확인
- [ ] **Phase 5까지 완료 = 호텔 모드 전체 활성화 완료** 🎉

---

## 9. Phase 6 — 룸서비스 (보류)

> **설정**: `ENABLE_HOTEL_MEAL_ORDER=true`  
> **현재 상태**: 서버 라우트 미구현 (미탑재) — **이번 단계에서 활성화하지 않는다.**  
> **활성화 조건**: 룸서비스 라우트 구현 및 테스트 완료 후 별도 절차서 작성

```bash
# Phase 6 활성화 시 검증할 항목 (예약)
# - /api/hotel/meal-order/* 엔드포인트 정상 응답
# - 주문 생성 → 상태 조회 흐름
# - 아파트 단지 무영향
```

**주의**: `ENABLE_HOTEL_MEAL_ORDER=true`를 지금 설정해도 라우트가 없으므로 404 반환.  
설정해도 기능적 영향은 없지만, 혼동 방지를 위해 현재는 설정하지 않는다.

---

## 10. 사고 발생 시 즉시 OFF 절차 (90초 목표)

> **발동 조건**: 아래 중 하나라도 해당하면 즉시 실행
> - 기존 아파트 단지 신청/조회 오류 발생
> - Vercel 에러율 급증 (5xx 응답)
> - Supabase 연결 오류
> - 예상 외 데이터 변경 감지
> - 투숙객 또는 아파트 주민 이상 접수

### 10-1. 즉시 OFF 실행 (목표: 90초 이내)

```
[0초]  사고 인지
[10초] Vercel Dashboard 접속
[20초] Settings → Environment Variables
[30초] ENABLE_HOTEL_MODE 값을 false로 변경 → Save
[40초] Deployments → 최신 배포 → Redeploy (Cache 무효화)
[90초] 배포 완료 확인
```

### 10-2. OFF 확인 curl

```bash
BASE_URL=https://your-app.vercel.app

# 호텔 라우트 전체 차단 확인 (404 반환 = 마운트 해제)
curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/hotel/quick-class/availability"
# 기대값: 404

curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/hotel/refresh-pt/instructors"
# 기대값: 404

curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/hotel/auth/verify-staff" \
  -H "Content-Type: application/json" \
  -d '{}'
# 기대값: 404

# 기존 아파트 단지 정상 복구 확인
curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/complexes"
# 기대값: 200
```

### 10-3. OFF 완료 판단 기준

- [ ] `/api/hotel/*` 전체 HTTP **404** 반환
- [ ] `/api/complexes` HTTP **200** 정상
- [ ] 기존 아파트 단지 신청 화면 정상 로드
- [ ] Vercel 로그 `[HOTEL MODE] Disabled` 메시지 확인
- [ ] 사고 원인 분석 시작

### 10-4. OFF 후 재활성화

- 원인 분석 및 수정 완료 후 처음부터 전제 조건 체크리스트(섹션 1)를 재실행
- Phase 1부터 순서대로 재진행

---

## 11. 활성화 후 30분 모니터링 체크리스트

> 각 Phase 활성화 후 30분간 아래 항목을 모니터링한다.

### 11-1. Vercel 로그 모니터링

```
Vercel Dashboard → 프로젝트 → Logs 탭
```

| 확인 항목 | 정상 기준 | 이상 기준 |
|----------|----------|----------|
| 5xx 응답 비율 | 0% | 1건 이상 → 즉시 OFF |
| `/api/hotel/*` 요청 처리 시간 | < 2000ms | > 5000ms 연속 → 확인 |
| `[HOTEL MODE] Routes mounted` 메시지 | 배포 직후 1회 출력 | 미출력 → 배포 실패 |

### 11-2. Supabase 에러 로그 모니터링

```
Supabase Dashboard → Logs → API Logs
```

| 확인 항목 | 정상 기준 | 이상 기준 |
|----------|----------|----------|
| DB 쿼리 에러 | 0건 | 1건 이상 → 원인 확인 |
| 연결 수 | 정상 범위 | 급증 → 즉시 OFF |
| instructors / programs 테이블 이상 접근 | 정상 SELECT만 | 예상 외 UPDATE/DELETE → 즉시 확인 |

### 11-3. 기존 아파트 단지 사용자 모니터링

```
활성화 후 30분간 아파트 단지 관련 문의 채널을 실시간 확인
```

| 확인 채널 | 확인 담당자 | 이상 기준 |
|----------|------------|----------|
| apt-cjxi 관리자 문의 | | 신청 오류 접수 → 즉시 OFF |
| apt-sclass 관리자 문의 | | 신청 오류 접수 → 즉시 OFF |
| admin 페이지 정상 | | 데이터 이상 → 즉시 OFF |

### 11-4. 30분 이후 정기 모니터링

- Phase 전체 완료 후 **24시간**: Vercel 에러 로그 1회 확인
- **7일 후**: Supabase 쿼리 성능 확인 (인덱스 필요 여부 점검)

---

## 12. 기존 아파트 단지 무영향 검증 공통 절차

> **각 Phase마다 반드시 실행한다.**  
> 이 검증 없이 다음 Phase로 진행하지 않는다.

### 12-1. API 레벨 검증

```bash
BASE_URL=https://your-app.vercel.app

# [A] 단지 목록 조회 (호텔 단지 포함되지 않아야 함)
curl -s "$BASE_URL/api/complexes" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
complexes = d if isinstance(d, list) else d.get('complexes', d.get('data', []))
apt = [c for c in complexes if c.get('code','').startswith('apt-')]
hotel = [c for c in complexes if c.get('venue_type') == 'hotel']
print(f'아파트 단지 {len(apt)}개, 호텔 단지 {len(hotel)}개')
print('OK' if len(apt) > 0 else 'FAIL: 아파트 단지 없음')
"

# [B] apt-cjxi 단지 직접 조회
curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/complexes/apt-cjxi"
# 기대값: 200

# [C] apt-sclass 단지 직접 조회
curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/complexes/apt-sclass"
# 기대값: 200

# [D] 기존 신청 API (아파트 단지) 정상 응답 확인
curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/applications?complex_id=<apt_cjxi_uuid>&limit=1"
# 기대값: 200
```

### 12-2. Admin 페이지 레벨 검증

```
① admin 페이지 접속 (https://your-app.vercel.app/admin/)
② 단지 선택 드롭다운에서 apt-cjxi 선택 → 정상 로드 확인
③ 단지 선택 드롭다운에서 apt-sclass 선택 → 정상 로드 확인
④ 신청 목록 페이지 → 기존 데이터 정상 표시 확인
⑤ 프로그램 관리 페이지 → 기존 프로그램 정상 표시 확인
```

### 12-3. 무영향 검증 완료 기준

- [ ] `/api/complexes` → 아파트 단지 목록 정상 포함
- [ ] `apt-cjxi`, `apt-sclass` 단지 API → **200** 응답
- [ ] admin 단지 선택 → 기존 단지 정상 작동
- [ ] 기존 신청 데이터 이상 없음

---

## 부록: Flag 활성화 상태 요약표

| Phase | 완료 일시 | 담당자 | 비고 |
|-------|----------|--------|------|
| Phase 1: ENABLE_HOTEL_MODE | | | |
| Phase 2: ENABLE_HOTEL_QUICK_CLASS | | | |
| Phase 3: ENABLE_HOTEL_REFRESH_PT | | | |
| Phase 4: ENABLE_HOTEL_MEMBER_PAGE | | | |
| Phase 5: ENABLE_HOTEL_STAFF_AUTH | | | |
| Phase 6: ENABLE_HOTEL_MEAL_ORDER | 보류 | — | 미구현 |

> 이 표를 복사하여 실제 활성화 시 작성한다.
