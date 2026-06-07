# E-1: 호텔 모드 End-to-End 통합 테스트 시나리오

> **단계**: E-1  
> **작성일**: 2026-06-07  
> **목적**: Flag 활성화 전·후 전체 검증 절차를 정의한다. 이 문서만으로 검증을 완료할 수 있어야 한다.  
> **현재 상태**: `ENABLE_HOTEL_MODE=false` — 코드 완성, Flag 미활성화  
> **주의**: 이 문서는 검증 계획 문서다. Flag 실제 변경은 별도 승인 후 수행한다.

---

## 목차

1. [사전 점검 체크리스트 (DB)](#1-사전-점검-체크리스트-db)
2. [Feature Flag 활성화 절차](#2-feature-flag-활성화-절차-vercel)
3. [기존 아파트 단지 무영향 검증](#3-기존-아파트-단지-무영향-검증-최우선)
4. [호텔 모드 4종 페르소나 시나리오](#4-호텔-모드-4종-페르소나-시나리오)
5. [각 시나리오별 상세 검증 항목](#5-각-시나리오별-상세-검증-항목)
6. [사고 발생 시 즉시 OFF 절차](#6-사고-발생-시-즉시-off-절차)
7. [검증 완료 판단 기준](#7-검증-완료-판단-기준)

---

## 1. 사전 점검 체크리스트 (DB)

> **이 섹션은 Flag를 켜기 전에 완료해야 한다.**  
> Supabase 대시보드 → SQL Editor에서 아래 쿼리를 순서대로 실행한다.

### 1-A. ht-lamada 단지 venue_type 확인

```sql
-- 기대 결과: venue_type = 'hotel' 1건
SELECT
    id,
    code,
    name,
    venue_type,
    pms_integration,
    hotel_billing_enabled
FROM complexes
WHERE code = 'ht-lamada';
```

**✅ 통과 조건**:
- `venue_type = 'hotel'` 확인
- `id` 값을 메모해 둔다 (이후 curl 테스트에 사용)

**❌ 실패 시**: `UPDATE complexes SET venue_type = 'hotel' WHERE code = 'ht-lamada';` 후 재확인

---

### 1-B. 호텔 전용 테이블 5개 존재 확인

```sql
-- 기대 결과: 5행 (각 테이블 이름 1건씩)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'hotel_staff',
      'member_tokens',
      'workout_reports',
      'discount_codes',
      'meal_orders'
  )
ORDER BY table_name;
```

**✅ 통과 조건**: 5개 테이블 모두 조회됨  
**❌ 실패 시**: A-3 마이그레이션(`supabase/migrations/20260607_a2_add_hotel_mode_columns.sql`) 미적용 → 재적용 필요

---

### 1-C. applications 테이블 신규 컬럼 6개 확인

```sql
-- 기대 결과: 6행
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'applications'
  AND column_name  IN (
      'user_type',
      'room_number',
      'checkin_date',
      'checkout_date',
      'discount_rate',
      'converted_from'
  )
ORDER BY column_name;
```

**✅ 통과 조건**: 6개 컬럼 모두 조회됨  
**기대 기본값**:
| 컬럼 | 기본값 |
|------|--------|
| `user_type` | `'member'` |
| `room_number` | `NULL` |
| `checkin_date` | `NULL` |
| `checkout_date` | `NULL` |
| `discount_rate` | `0` |
| `converted_from` | `NULL` |

---

### 1-D. complexes 테이블 신규 컬럼 3개 확인

```sql
-- 기대 결과: 3행
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'complexes'
  AND column_name  IN (
      'venue_type',
      'pms_integration',
      'hotel_billing_enabled'
  )
ORDER BY column_name;
```

**✅ 통과 조건**: 3개 컬럼 모두 조회됨  
**기대 기본값**:
| 컬럼 | 기본값 |
|------|--------|
| `venue_type` | `'apartment'` |
| `pms_integration` | `NULL` |
| `hotel_billing_enabled` | `false` |

---

### 1-E. 기존 아파트 단지 신청 데이터 카운트 (기준값 기록)

```sql
-- ⚠️ 이 숫자를 반드시 기록해 둔다 (Flag ON 후 재확인용)
SELECT
    c.code,
    c.name,
    c.venue_type,
    COUNT(a.id) AS application_count
FROM complexes c
LEFT JOIN applications a ON a.complex_id = c.id
GROUP BY c.id, c.code, c.name, c.venue_type
ORDER BY c.venue_type, c.code;
```

**✅ 기록 형식** (예시):

| code | name | venue_type | application_count |
|------|------|------------|-------------------|
| apt-cjxi | 청주자이 | apartment | **(기록)** |
| apt-sclass | S클래스 | apartment | **(기록)** |
| ht-lamada | 라마다 | hotel | 0 (예상) |

> ⚠️ **이 숫자는 Flag ON 후 3번 섹션에서 반드시 재확인한다.**  
> apartment 단지의 수치가 변경되었다면 즉시 조사한다.

---

## 2. Feature Flag 활성화 절차 (Vercel)

> **이 섹션은 1번 체크리스트가 모두 ✅인 상태에서만 수행한다.**  
> 실제 Flag 변경은 별도 승인 필요. 아래는 절차 문서다.

### 2-A. Vercel 대시보드 접근

```
1. https://vercel.com 로그인
2. 프로젝트 선택: pilates-webapp
3. 상단 탭: Settings
4. 좌측 메뉴: Environment Variables
```

### 2-B. 마스터 스위치 설정 (가장 먼저)

| 환경변수 | 값 | 적용 범위 |
|---------|-----|----------|
| `ENABLE_HOTEL_MODE` | `true` | Production |

> ⚠️ **마스터 스위치만 켜도 `/api/hotel/*` 라우트가 마운트된다.**  
> 하위 Flag가 모두 `false`이면 각 엔드포인트는 403을 반환하므로 실제 기능은 작동하지 않는다.

### 2-C. 하위 Flag 5개 개별 설정

| 환경변수 | 값 | 기능 |
|---------|-----|------|
| `ENABLE_HOTEL_QUICK_CLASS` | `true` | 당일 단회 수업 신청 |
| `ENABLE_HOTEL_REFRESH_PT` | `true` | 리프레시 PT 예약 |
| `ENABLE_HOTEL_MEMBER_PAGE` | `true` | 회원 마이페이지 + 운동 리포트 |
| `ENABLE_HOTEL_STAFF_AUTH` | `true` | 임직원 인증 |
| `ENABLE_HOTEL_MEAL_ORDER` | `true` | 식사 주문 연동 |

> 💡 **단계적 활성화 권장**: 마스터 + `ENABLE_HOTEL_QUICK_CLASS`만 켜고 검증 → 이상 없으면 다음 Flag 순차 활성화

### 2-D. 재배포 트리거

```
방법 1 (권장): Vercel 대시보드 → Deployments → 최신 배포 → 우측 ⋯ → Redeploy
방법 2: git 빈 커밋 push
  git commit --allow-empty -m "chore: trigger redeploy for hotel mode activation"
  git push origin main
방법 3: Vercel CLI
  vercel --prod
```

> ⏱️ 재배포 소요 시간: 약 30~90초  
> ✅ 재배포 완료 후 `/api/health` 응답으로 서버 재기동 확인

### 2-E. 활성화 직후 즉시 확인 (30초 이내)

```bash
# 서버 정상 여부
curl -s https://{YOUR_DOMAIN}/api/health | jq .

# 기존 아파트 신청 화면 정상 (HTTP 200 필수)
curl -o /dev/null -s -w "%{http_code}" https://{YOUR_DOMAIN}/?complex=apt-cjxi
curl -o /dev/null -s -w "%{http_code}" https://{YOUR_DOMAIN}/?complex=apt-sclass

# 호텔 라우트 마운트 확인 (Flag ON: 400 또는 200, OFF: 404)
curl -s https://{YOUR_DOMAIN}/api/hotel/quick-class/availability | jq .status
```

---

## 3. 기존 아파트 단지 무영향 검증 (최우선)

> **가장 중요한 검증이다.**  
> 호텔 모드 활성화가 기존 297건 신청 데이터와 아파트 단지 UI에 영향을 주면 안 된다.

### 3-A. 아파트 신청 화면 정상 로드 확인

```bash
# apt-cjxi 신청 화면 (HTTP 200 필수)
curl -o /dev/null -s -w "apt-cjxi: %{http_code}\n" \
    "https://{YOUR_DOMAIN}/?complex=apt-cjxi"

# apt-sclass 신청 화면 (HTTP 200 필수)
curl -o /dev/null -s -w "apt-sclass: %{http_code}\n" \
    "https://{YOUR_DOMAIN}/?complex=apt-sclass"
```

**✅ 통과 조건**: 양쪽 모두 HTTP 200

**브라우저 확인 항목**:
- [ ] 신청 폼 정상 렌더링
- [ ] 프로그램 목록 정상 표시
- [ ] 신청 버튼 정상 동작
- [ ] 기존 신청 내역 조회 정상

---

### 3-B. admin 대시보드 정상 동작 확인

```bash
# admin 메인 (HTTP 200 필수)
curl -o /dev/null -s -w "admin: %{http_code}\n" \
    "https://{YOUR_DOMAIN}/admin/"

# 기존 신청 목록 API (HTTP 200 + data 배열 확인)
curl -s "https://{YOUR_DOMAIN}/api/applications?limit=5" | jq '{
    success: .success,
    count: (.data | length)
}'
```

**✅ 통과 조건**: HTTP 200, `success: true`, `data` 배열 포함

**admin 화면 확인 항목**:
- [ ] apt-cjxi 선택 → 신청 목록 정상 표시
- [ ] apt-sclass 선택 → 신청 목록 정상 표시
- [ ] 신청 승인/거절 버튼 정상 동작
- [ ] 기존 통계 위젯 수치 정상

---

### 3-C. 신청 데이터 카운트 재확인 (1-E와 비교)

Flag ON 후 아래 쿼리를 다시 실행하여 **1-E에서 기록한 수치와 정확히 일치하는지** 확인한다.

```sql
SELECT
    c.code,
    c.name,
    c.venue_type,
    COUNT(a.id) AS application_count
FROM complexes c
LEFT JOIN applications a ON a.complex_id = c.id
GROUP BY c.id, c.code, c.name, c.venue_type
ORDER BY c.venue_type, c.code;
```

**✅ 통과 조건**:
- `apt-cjxi`의 `application_count` = 1-E 기록값과 동일
- `apt-sclass`의 `application_count` = 1-E 기록값과 동일
- `ht-lamada`의 `application_count` = 0 (테스트 전)

---

### 3-D. 아파트 신청 API 직접 검증

```bash
# 기존 아파트 신청 API — 호텔 Flag와 완전히 무관하게 동작해야 함
curl -s "https://{YOUR_DOMAIN}/api/complexes" | jq '[
    .[] | select(.venue_type == "apartment") | {code, name, venue_type}
]'
```

**✅ 통과 조건**:
- `apt-cjxi`, `apt-sclass`가 응답에 포함됨
- 각 단지의 `venue_type`이 `"apartment"`로 표시됨
- `ht-lamada`는 `venue_type = "hotel"`로 표시됨

---

## 4. 호텔 모드 4종 페르소나 시나리오

### 시나리오 개요

| 번호 | 페르소나 | 목표 | 핵심 엔드포인트 |
|------|---------|------|----------------|
| S-1 | 투숙객 — 무료 클래스 신청 | 체크인 정보로 당일 무료 수업 예약 | `POST /api/hotel/quick-class/apply` |
| S-2 | 투숙객 — 리프레시 PT | 리프레시 PT 예약 및 트레이너 선택 | `POST /api/hotel/refresh-pt/reserve` |
| S-3 | 회원 마이페이지 접근 | 토큰 기반 내 현황 조회 | `GET /api/hotel/members/me` |
| S-4 | 임직원 30% 할인 | staff_no + phone_last4로 할인 신청 | `POST /api/hotel/auth/verify-staff` |

---

### 시나리오 1 (S-1): 투숙객 — 무료 클래스 신청

**전제 조건**:
- ht-lamada 단지에 퀵클래스 프로그램 1개 이상 등록
- `ENABLE_HOTEL_QUICK_CLASS=true`

**흐름**:
```
1. GET  /api/hotel/quick-class/availability
       ?complex_code=ht-lamada&program_id={프로그램ID}
   → 잔여석 확인

2. POST /api/hotel/quick-class/apply
   Body: {
     complex_code: "ht-lamada",
     program_id: "{프로그램ID}",
     name: "홍길동",
     room_number: "301",
     checkin_date: "2026-06-08",
     checkout_date: "2026-06-10",
     phone: "01012341234"
   }
   → application row 생성, user_type='guest', discount_rate=0

3. (확인) Supabase에서 신청 row 조회
   SELECT * FROM applications
   WHERE complex_id = '{ht-lamada UUID}'
   ORDER BY created_at DESC LIMIT 1;
```

**검증 항목**:
- [ ] `GET /availability` → HTTP 200, `available: true/false` 포함
- [ ] `POST /apply` → HTTP 201, `application_id` 포함
- [ ] DB: `user_type = 'guest'`, `room_number = '301'` 확인
- [ ] DB: `complex_id`가 ht-lamada UUID인지 확인
- [ ] apt-cjxi/apt-sclass 신청 데이터 카운트 변동 없음

---

### 시나리오 2 (S-2): 투숙객 — 리프레시 PT 예약

**전제 조건**:
- ht-lamada 단지에 트레이너 1명 이상 등록
- `ENABLE_HOTEL_REFRESH_PT=true`

**흐름**:
```
1. GET  /api/hotel/refresh-pt/instructors
       ?complex_code=ht-lamada
   → 트레이너 목록 조회

2. GET  /api/hotel/refresh-pt/available-slots
       ?complex_code=ht-lamada&instructor_id={트레이너ID}&date=2026-06-08
   → 예약 가능 시간대 조회

3. POST /api/hotel/refresh-pt/reserve
   Body: {
     complex_code: "ht-lamada",
     instructor_id: "{트레이너ID}",
     name: "김철수",
     phone: "01056785678",
     preferred_date: "2026-06-08",
     preferred_time: "10:00",
     room_number: "502",
     checkin_date: "2026-06-07",
     checkout_date: "2026-06-09"
   }
   → application row 생성 (리프레시 PT 프로그램)
```

**검증 항목**:
- [ ] `GET /instructors` → HTTP 200, `instructors` 배열 (비어있어도 200)
- [ ] `GET /available-slots` → HTTP 200, `slots` 배열
- [ ] `POST /reserve` → HTTP 201, `application_id` 포함
- [ ] DB: `program_name = '리프레시 PT'`, `status = 'pending'` 확인
- [ ] DB: `preferred_date`, `preferred_time` 정상 저장 확인

---

### 시나리오 3 (S-3): 회원 마이페이지 접근

**전제 조건**:
- S-1 또는 S-2에서 생성된 `application_id` 존재
- `ENABLE_HOTEL_MEMBER_PAGE=true`
- member_token 발급 필요 (`POST /api/hotel/auth/issue-member-token`)

**흐름**:
```
1. POST /api/hotel/auth/issue-member-token
   Body: {
     application_id: "{S-1 또는 S-2에서 생성된 ID}",
     phone: "01012341234"
   }
   → token 발급 (30일 유효)

2. GET  /api/hotel/members/me
       ?token={발급된 토큰}
   → 회원 전체 현황 조회

3. GET  /api/hotel/members/workout-reports
       ?token={발급된 토큰}
   → 운동 리포트 목록 (초기: 빈 배열)
```

**검증 항목**:
- [ ] `POST /issue-member-token` → HTTP 200, `token` 포함
- [ ] `GET /me` → HTTP 200, `member.name`, `member.membership` 포함
- [ ] `GET /workout-reports` → HTTP 200, `reports: []` (초기 상태)
- [ ] DB: `member_tokens` 테이블에 토큰 row 생성 확인
- [ ] 타인 토큰으로 접근 시 401 응답 확인

---

### 시나리오 4 (S-4): 임직원 30% 할인

**전제 조건**:
- ht-lamada 단지에 임직원 1명 이상 등록 (`hotel_staff` 테이블)
- `ENABLE_HOTEL_STAFF_AUTH=true`
- `ENABLE_HOTEL_QUICK_CLASS=true` (할인 신청을 위해)

**흐름**:
```
1. (사전) admin에서 임직원 등록
   POST /api/hotel/staff
   Body: {
     complex_id: "{ht-lamada UUID}",
     staff_no: "EMP001",
     name: "이영희",
     phone_last4: "5678",
     department: "프론트",
     is_vip: false
   }

2. POST /api/hotel/auth/verify-staff
   Body: {
     complex_code: "ht-lamada",
     staff_no: "EMP001",
     phone_last4: "5678"
   }
   → staff 인증 성공 (200), discount_info 포함

3. POST /api/hotel/quick-class/apply
   Body: {
     complex_code: "ht-lamada",
     program_id: "{프로그램ID}",
     name: "이영희",
     staff_no: "EMP001",
     phone_last4: "5678",
     phone: "01098765678"
   }
   → discount_rate=30 적용된 신청 row 생성
```

**검증 항목**:
- [ ] 임직원 등록 → HTTP 201
- [ ] `POST /verify-staff` → HTTP 200, `discount_rate: 30` 확인
- [ ] 잘못된 staff_no/phone_last4 → HTTP 401 확인
- [ ] DB: `applications.discount_rate = 30`, `user_type = 'staff'` 확인
- [ ] phone_last4 5자리 입력 시 → HTTP 400 (`/^\d{4}$/` 검증)

---

## 5. 각 시나리오별 상세 검증 항목

### 5-A. HTTP 상태 코드 기대값 표

| 엔드포인트 | Flag OFF | Flag ON (정상) | Flag ON (잘못된 입력) |
|-----------|---------|---------------|---------------------|
| `GET /api/hotel/quick-class/availability` | 404 (라우트 미마운트) | 200 | 400 |
| `POST /api/hotel/quick-class/apply` | 404 | 201 | 400/409 |
| `POST /api/hotel/auth/verify-staff` | 404 | 200 | 400/401 |
| `POST /api/hotel/auth/issue-member-token` | 404 | 200 | 400/401 |
| `GET /api/hotel/refresh-pt/instructors` | 404 | 200 | 400 |
| `GET /api/hotel/members/me` | 404 | 200 | 401 |
| `GET /api/hotel/workout-reports` | 404 | 200 | 400/403 |
| `POST /api/hotel/workout-reports` | 404 | 201 | 400 |
| `GET /api/hotel/staff` | 404 | 200 | 400/403 |

> **주의**: `ENABLE_HOTEL_MODE=false`이면 `/api/hotel/*` 라우트 자체가 마운트되지 않으므로 **404** 반환.  
> `ENABLE_HOTEL_MODE=true`이지만 하위 Flag가 `false`이면 **403** 반환.

### 5-B. 응답 본문 형식 검증

**공통 성공 형식**:
```json
{
    "success": true,
    "data": { ... }
}
```

**공통 오류 형식**:
```json
{
    "success": false,
    "error": "오류 메시지"
}
```

**Feature Flag OFF 응답 (403)**:
```json
{
    "success": false,
    "error": "해당 기능이 현재 비활성화되어 있습니다 (ENABLE_HOTEL_QUICK_CLASS)"
}
```

### 5-C. DB row 생성 확인 쿼리

**무료 클래스 신청 확인**:
```sql
SELECT
    id,
    name,
    user_type,
    room_number,
    checkin_date,
    checkout_date,
    discount_rate,
    status,
    created_at
FROM applications
WHERE complex_id = (SELECT id FROM complexes WHERE code = 'ht-lamada')
ORDER BY created_at DESC
LIMIT 5;
```

**임직원 할인 확인**:
```sql
SELECT id, name, user_type, discount_rate, status
FROM applications
WHERE complex_id = (SELECT id FROM complexes WHERE code = 'ht-lamada')
  AND user_type = 'staff';
```

**member_tokens 확인**:
```sql
SELECT token, application_id, expires_at, last_accessed_at
FROM member_tokens
ORDER BY created_at DESC
LIMIT 3;
```

**hotel_staff 임직원 등록 확인**:
```sql
SELECT id, staff_no, name, department, is_vip, is_active
FROM hotel_staff
WHERE complex_id = (SELECT id FROM complexes WHERE code = 'ht-lamada');
```

### 5-D. Feature Flag 개별 OFF 시 403 확인

```bash
# (ENABLE_HOTEL_MODE=true, ENABLE_HOTEL_QUICK_CLASS=false 상태에서)
curl -s "https://{YOUR_DOMAIN}/api/hotel/quick-class/availability" \
    | jq '{success: .success, error: .error}'
# 기대: {"success": false, "error": "...ENABLE_HOTEL_QUICK_CLASS..."}
```

---

## 6. 사고 발생 시 즉시 OFF 절차

> **판단 기준**: 아래 중 하나라도 발생하면 즉시 OFF 처리한다.
> - apt-cjxi 또는 apt-sclass 신청 화면이 500/404 오류
> - 기존 신청 데이터 카운트 변동 발생
> - 예상치 못한 데이터 유출 징후
> - 서버 오류율이 평소 대비 5% 이상 상승

### 6-A. 즉시 OFF 절차 (목표: 90초 이내 완료)

```
[Step 1] Vercel 대시보드 접근
  → https://vercel.com → pilates-webapp → Settings → Environment Variables

[Step 2] 마스터 스위치만 변경 (하위 Flag는 건드리지 않는다)
  → ENABLE_HOTEL_MODE = false (기존 값 true → false 로 변경)
  → Save

[Step 3] 즉시 재배포
  → Deployments → 최신 → Redeploy
  → 또는: git commit --allow-empty -m "hotfix: disable hotel mode" && git push origin main

[Step 4] 차단 확인 (재배포 후 30초 이내)
  → curl -s https://{YOUR_DOMAIN}/api/hotel/quick-class/availability | jq .
  → 기대: HTTP 404 (라우트 미마운트)

[Step 5] 기존 아파트 서비스 정상 확인
  → curl -o /dev/null -s -w "%{http_code}" https://{YOUR_DOMAIN}/?complex=apt-cjxi
  → 기대: 200
```

### 6-B. OFF 확인 쿼리 (DB 영향 없음 확인)

```sql
-- Flag OFF 후 실행 — 기존 신청 데이터 무변동 확인
SELECT
    c.code,
    COUNT(a.id) AS application_count
FROM complexes c
LEFT JOIN applications a ON a.complex_id = c.id
WHERE c.venue_type = 'apartment'
GROUP BY c.code;
```

**✅ 기대**: 1-E에서 기록한 값과 동일

### 6-C. 호텔 테스트 데이터 정리 (선택, OFF 후 필요 시)

```sql
-- 테스트 중 생성된 호텔 신청 데이터만 삭제 (기존 아파트 데이터 무관)
DELETE FROM applications
WHERE complex_id = (SELECT id FROM complexes WHERE code = 'ht-lamada')
  AND created_at > '2026-06-07';  -- 테스트 시작 시각 이후만

-- 테스트 토큰 정리
DELETE FROM member_tokens
WHERE created_at > '2026-06-07';

-- 테스트 hotel_staff 정리 (등록한 경우)
DELETE FROM hotel_staff
WHERE complex_id = (SELECT id FROM complexes WHERE code = 'ht-lamada')
  AND created_at > '2026-06-07';
```

> ⚠️ 삭제 전 반드시 `SELECT COUNT(*)` 로 대상 건수를 확인한다.

---

## 7. 검증 완료 판단 기준

### 최소 통과 기준 (Go/No-Go)

| 항목 | 통과 조건 | 담당 |
|------|---------|------|
| 사전 DB 체크 (1-A~D) | 전 항목 ✅ | |
| 아파트 신청 화면 정상 (3-A) | HTTP 200 양쪽 | |
| 신청 데이터 카운트 동일 (3-C) | 1-E 기록값과 일치 | |
| S-1 무료 클래스 신청 완료 | HTTP 201 + DB row | |
| S-4 임직원 할인 적용 확인 | discount_rate=30 DB 확인 | |
| Flag OFF 즉시 차단 확인 | HTTP 404 30초 이내 | |

### 선택 통과 기준 (권장)

| 항목 | 통과 조건 |
|------|---------|
| S-2 리프레시 PT 예약 완료 | HTTP 201 + DB row |
| S-3 회원 마이페이지 접근 | token 발급 + /me 200 |
| 운동 리포트 작성 (D-3) | POST 201 + DB row |
| 임직원 명단 CSV 업로드 (D-2) | POST /bulk 200 |

### 전체 검증 소요 시간 예상

| 단계 | 소요 시간 |
|------|---------|
| 사전 DB 체크 (1번) | 10분 |
| Flag 활성화 + 재배포 (2번) | 5분 |
| 아파트 무영향 검증 (3번) | 15분 |
| 4종 페르소나 시나리오 (4~5번) | 30분 |
| **총계** | **약 60분** |

---

## 부록: 관련 문서 참조

| 문서 | 내용 |
|------|------|
| `docs/ops/A4-FEATURE-FLAGS.md` | Flag 상세 설계, `toBool()` 동작 |
| `docs/ops/B1-HOTEL-AUTH-API.md` | 인증 API 상세 명세 |
| `docs/ops/B2-HOTEL-QUICK-CLASS-API.md` | 퀵클래스 API 상세 명세 |
| `docs/ops/B3-HOTEL-REFRESH-PT-API.md` | 리프레시 PT API 상세 명세 |
| `docs/ops/B4-HOTEL-MEMBERS-API.md` | 회원 마이페이지 API 상세 명세 |
| `docs/ops/D2-HOTEL-STAFF-ROSTER.md` | 임직원 명단 CSV 포맷 |
| `docs/ops/D3-HOTEL-WORKOUT-REPORTS.md` | 운동 리포트 FMS 기준 |
| `scripts/sh/e1-smoke-test.sh` | 자동화 스모크 테스트 스크립트 |
