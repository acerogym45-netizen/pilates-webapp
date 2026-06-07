# B-4 호텔 회원 마이페이지 API

**파일**: `server/routes/hotel/members.js`  
**단계**: Phase B — B-4  
**연결**: B-5에서 `server/index.js`에 `/api/hotel/members` 마운트 예정 (현재 standalone)  
**작성일**: 2026-06-07

---

## 개요

아세로짐 라마다호텔점 회원이 토큰 하나로 자신의 멤버십 현황·PT 잔여 회수·다가오는 예약·혜택·운동 리포트를 한 번에 확인하는 마이페이지 API.

**설계 원칙**:
- 토큰 한 번으로 모든 개인 정보 접근 — 추가 인증 강제 금지
- 응답에 다른 회원 정보 절대 미포함 — 본인 데이터만 반환
- 기존 아파트 단지 무영향 — Feature Flag 미활성화 시 진입 불가
- 개인 데이터 접근 시 `last_accessed_at` 자동 갱신 (fire-and-forget)

---

## Feature Flag 매핑

| Flag 이름        | 환경변수                    | 기본값  | 적용 엔드포인트              |
|------------------|-----------------------------|---------|------------------------------|
| `hotelMemberPage`| `ENABLE_HOTEL_MEMBER_PAGE`  | `false` | 5개 엔드포인트 전체          |

> `ENABLE_HOTEL_MEMBER_PAGE=true`로 설정하지 않으면 모든 엔드포인트가 `403`을 반환합니다.

운영 환경 활성화 방법은 [`A4-FEATURE-FLAGS.md`](./A4-FEATURE-FLAGS.md) 참조.

---

## 토큰 라이프사이클

```
[B-1 /issue-member-token] 호출
         │
         ▼
  token 발급 (30일 유효)
  member_tokens 테이블에 저장
         │
         │  30일 동안 사용
         │  ← 모든 /me, /workout-reports 등 호출 시 last_accessed_at 갱신
         │
    만료 7일 전 도달
         │
         ▼
  POST /refresh-token 호출 가능
  ┌──────────────────────────────────────┐
  │ 새 토큰 30일 발급                    │
  │ 기존 토큰 즉시 무효화(expires_at=now) │
  └──────────────────────────────────────┘
         │
    만료 7일 이상 남은 경우
         │
         ▼
  400 반환 — "기존 토큰 계속 사용하세요"
         │
    토큰이 이미 만료된 경우
         │
         ▼
  401 반환 — 재로그인 필요
  [B-1 /issue-member-token] 재호출
```

| 단계            | 설명                                      |
|-----------------|-------------------------------------------|
| 발급            | B-1 `POST /issue-member-token`으로 발급. 30일 유효. |
| 정상 사용       | 모든 마이페이지 엔드포인트에 `?token=` 또는 body에 `token` 전달 |
| 갱신 가능 기간  | 만료 **7일 이내** 에서 `POST /refresh-token` 가능 |
| 갱신 후         | 기존 토큰 즉시 무효화. 새 토큰 30일 유효. |
| 만료 후         | 401 응답. B-1로 재발급 필요.              |

---

## 공통 토큰 검증 헬퍼

모든 엔드포인트는 `verifyToken(sb, token, res)` 내부 헬퍼를 통해 토큰을 검증합니다.

```
verifyToken()
  ├─ token 없음          → 400 "token이 필요합니다"
  ├─ member_tokens 미존재 → 401 "유효하지 않은 토큰입니다"
  └─ expires_at < now    → 401 "만료된 토큰입니다. 재로그인이 필요합니다."
```

검증 성공 시 `{ token, application_id, complex_id, expires_at, discount_rate }` 반환.

---

## 엔드포인트 명세

### 1. `GET /api/hotel/members/me`

회원 전체 현황을 조회합니다.

#### Query Parameters

| 파라미터 | 필수 | 설명             |
|----------|------|------------------|
| `token`  | ✅   | 회원 토큰 (32자 hex) |

#### Response 200

```json
{
  "success": true,
  "member": {
    "name": "홍길동",
    "membership": {
      "type": "리프레시 PT 10회",
      "expires_at": "2026-08-31",
      "d_day": 85
    },
    "pt_status": {
      "total": 10,
      "remaining": 7,
      "next_session": {
        "scheduled_at": "2026-06-12T10:30:00+09:00"
      }
    },
    "benefits": {
      "ramada_room_code_available": true,
      "fnb_lounge_eligible": true
    }
  }
}
```

| 필드                          | 타입          | 설명                                                                      |
|-------------------------------|---------------|---------------------------------------------------------------------------|
| `membership.type`             | string\|null  | `applications.program_name` 값                                            |
| `membership.expires_at`       | string\|null  | `applications.expiry_date` (YYYY-MM-DD)                                   |
| `membership.d_day`            | number\|null  | 만료일까지 남은 일수. 양수=미래, 0=오늘, 음수=이미 만료                  |
| `pt_status.total`             | number\|null  | `applications.total_sessions`                                             |
| `pt_status.remaining`         | number\|null  | `applications.remaining_sessions`                                         |
| `pt_status.next_session`      | object\|null  | 다음 PT 예약 (`preferred_date`+`preferred_time` → ISO 8601 KST)          |
| `benefits.ramada_room_code_available` | boolean | `true`이면 `POST /issue-room-discount` 호출 가능 (기존 유효 코드 없음)  |
| `benefits.fnb_lounge_eligible`| boolean       | `remaining_sessions >= 5` 또는 멤버십 유효(`status=approved` + d_day≥0) |

> ⚠️ `last_accessed_at` 자동 갱신 (fire-and-forget)

#### Response — 오류

| 상태코드 | 조건                     |
|----------|--------------------------|
| `400`    | `token` 누락             |
| `401`    | 토큰 무효 또는 만료      |
| `403`    | Feature Flag 비활성화    |
| `404`    | 회원 정보 없음           |

---

### 2. `GET /api/hotel/members/workout-reports`

본인의 운동 리포트 목록을 조회합니다.

#### Query Parameters

| 파라미터 | 필수 | 설명             |
|----------|------|------------------|
| `token`  | ✅   | 회원 토큰        |

#### Response 200

```json
{
  "success": true,
  "reports": [
    {
      "id": "uuid-report-1",
      "phase": 1,
      "created_at": "2026-06-01T10:30:00+09:00",
      "pdf_url": "https://..."
    },
    {
      "id": "uuid-report-2",
      "phase": 2,
      "created_at": "2026-06-15T10:30:00+09:00",
      "pdf_url": "https://..."
    }
  ]
}
```

- `phase` 오름차순 정렬
- 리포트가 없으면 `"reports": []`
- 본인 `application_id`에 연결된 리포트만 반환 (타인 리포트 미포함)

#### Response — 오류

| 상태코드 | 조건                     |
|----------|--------------------------|
| `400`    | `token` 누락             |
| `401`    | 토큰 무효 또는 만료      |
| `403`    | Feature Flag 비활성화    |

---

### 3. `POST /api/hotel/members/issue-room-discount`

라마다 객실 10% 할인 코드를 발급합니다.

#### Request Body

```json
{
  "token": "32-char-hex-member-token"
}
```

#### 발급 정책

| 상황                                   | 동작                          |
|----------------------------------------|-------------------------------|
| 유효한 미사용 코드가 이미 있음         | 기존 코드 반환 (재발급 없음)  |
| 유효한 미사용 코드 없음                | 신규 코드 생성 후 반환        |

- 코드 형식: `ACRGYM-` + 6자리 대문자 영숫자 (예: `ACRGYM-A3F9B2`)
- 코드 유효 기간: 발급일로부터 30일
- `discount_codes` 테이블에 `discount_type='ramada_room_10'`으로 저장

#### Response 200

```json
{
  "success": true,
  "code": "ACRGYM-A3F9B2",
  "expires_at": "2026-07-07T10:30:00.000Z"
}
```

#### Response — 오류

| 상태코드 | 조건                     |
|----------|--------------------------|
| `400`    | `token` 누락             |
| `401`    | 토큰 무효 또는 만료      |
| `403`    | Feature Flag 비활성화    |

---

### 4. `GET /api/hotel/members/next-reservations`

다가오는 예약 전체(리프레시 PT + 무료 클래스)를 조회합니다.

#### Query Parameters

| 파라미터 | 필수 | 설명             |
|----------|------|------------------|
| `token`  | ✅   | 회원 토큰        |

#### Response 200

```json
{
  "success": true,
  "reservations": [
    {
      "application_id": "uuid-1",
      "program_name": "리프레시 PT",
      "scheduled_at": "2026-06-10T09:45:00+09:00",
      "instructor_name": "김필라"
    },
    {
      "application_id": "uuid-2",
      "program_name": "아침 요가",
      "scheduled_at": "2026-06-11T07:00:00+09:00",
      "instructor_name": null
    }
  ]
}
```

| 필드               | 타입          | 설명                                                |
|--------------------|---------------|-----------------------------------------------------|
| `application_id`   | string        | 예약 UUID                                           |
| `program_name`     | string        | 프로그램명                                          |
| `scheduled_at`     | string\|null  | ISO 8601 KST (`preferred_date`+`preferred_time` 합성) |
| `instructor_name`  | string\|null  | 트레이너 이름. 무료 클래스 등 트레이너 없는 예약은 null |

- 오늘 이후 예약, `status=approved`, 날짜·시각 오름차순 정렬
- 본인 `phone` + 본인 `complex_id`에 연결된 예약만 반환

> ⚠️ 타인의 예약·신청 정보 절대 미포함

#### Response — 오류

| 상태코드 | 조건                     |
|----------|--------------------------|
| `400`    | `token` 누락             |
| `401`    | 토큰 무효 또는 만료      |
| `403`    | Feature Flag 비활성화    |
| `404`    | 회원 정보 없음           |

---

### 5. `POST /api/hotel/members/refresh-token`

토큰을 갱신합니다. 만료 7일 이내에만 갱신 가능합니다.

#### Request Body

```json
{
  "token": "32-char-hex-member-token"
}
```

#### 갱신 정책

| 상황                          | 동작                                                                  |
|-------------------------------|-----------------------------------------------------------------------|
| 만료 7일 이내                 | 새 토큰 30일 발급, 기존 토큰 즉시 무효화(`expires_at=now`)           |
| 만료 7일 초과 남음            | 400 반환. 기존 토큰 계속 사용 유도.                                  |
| 이미 만료                     | 401 반환. 재로그인(B-1 재발급) 필요.                                 |

#### Response 200

```json
{
  "success": true,
  "new_token": "new-32-char-hex-token",
  "expires_at": "2026-07-07T10:30:00.000Z"
}
```

#### Response 400 (갱신 불필요)

```json
{
  "success": false,
  "error": "토큰 갱신은 만료 7일 이내에만 가능합니다. 기존 토큰을 계속 사용하세요.",
  "expires_at": "2026-07-14T10:30:00.000Z"
}
```

#### Response — 오류

| 상태코드 | 조건                                  |
|----------|---------------------------------------|
| `400`    | `token` 누락 또는 갱신 불필요(7일 초과) |
| `401`    | 토큰 무효 또는 이미 만료              |
| `403`    | Feature Flag 비활성화                 |

---

## 설계 결정 사유

### 왜 토큰 한 번이면 모든 정보가 보이는가

1. **고객 경험 최우선**: 투숙객·회원은 호텔에 머무는 동안 빠르게 내 정보를 확인하고 싶습니다. 매번 로그인·OTP·전화번호 재입력을 요구하면 사용 자체를 포기합니다.

2. **토큰 자체가 인증 수단**: `member_tokens` 테이블에 저장된 32자 hex 토큰은 암호학적으로 안전한 `crypto.randomBytes(16)`으로 생성됩니다. 추측이 사실상 불가능하며, 이 토큰 소지 자체가 인증 증명입니다.

3. **노출 범위 제한**: 응답에는 오직 해당 `application_id`와 동일한 `phone`에 연결된 데이터만 포함됩니다. 토큰이 유출되어도 타인의 정보는 노출되지 않습니다.

4. **단기 체류 특성**: 라마다호텔 투숙객은 1~3박 단기 체류가 대부분입니다. 2단계 인증을 설치할 시간적·심리적 여유가 없습니다.

5. **주기적 갱신으로 보안 유지**: 30일 유효 토큰 + 만료 7일 이내 갱신 정책으로, 장기간 방치된 토큰은 자연 소멸됩니다. 분실 시 만료를 기다리면 자동 무효화됩니다.

---

### `last_accessed_at` fire-and-forget 처리 이유

`last_accessed_at` 업데이트는 API 응답 시간에 영향을 주지 않도록 `await` 없이 처리합니다. 이 값은 운영자의 활성 회원 파악용 보조 지표이며, 업데이트 실패가 회원 서비스에 영향을 미치면 안 됩니다.

---

## 공통 패턴 참고

| 항목                | 구현                                                  |
|---------------------|-------------------------------------------------------|
| Supabase 클라이언트 | `require('../../db-supabase').getSupabase()`          |
| DB 오류 래핑        | `sbErr(error, '컨텍스트')`                            |
| Feature Flag        | `require('../../config/feature-flags')`               |
| 토큰 검증           | `verifyToken(sb, token, res)` — 모든 핸들러 공통 헬퍼 |
| 접근 시각 갱신      | `touchLastAccessed(sb, token)` — fire-and-forget      |

---

## 관련 파일

| 파일                                       | 역할                                      |
|--------------------------------------------|-------------------------------------------|
| `server/routes/hotel/members.js`           | 이 문서의 구현 파일                       |
| `server/config/feature-flags.js`           | Feature Flag 정의 (`hotelMemberPage`)     |
| `server/db-supabase.js`                    | Supabase 클라이언트 및 오류 헬퍼          |
| `docs/ops/A4-FEATURE-FLAGS.md`             | Flag 활성화 운영 가이드                   |
| `docs/ops/B1-HOTEL-AUTH-API.md`            | 토큰 발급 원본 (`issue-member-token`)     |
| `docs/ops/B2-HOTEL-QUICK-CLASS-API.md`     | 무료 클래스 신청 (next-reservations에 포함) |
| `docs/ops/B3-HOTEL-REFRESH-PT-API.md`      | 리프레시 PT 예약 (next-reservations에 포함) |
| `supabase/migrations/20260607_a2_add_hotel_mode_columns.sql` | `user_type`, `preferred_date`, `discount_rate` 등 신규 컬럼 |
