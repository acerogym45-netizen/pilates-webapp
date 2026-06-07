# B-1 호텔 인증 API 명세
## `server/routes/hotel/auth.js`

> **Base path** (B-5에서 index.js 연결 후 확정):
> `/api/hotel/auth`
>
> **단계**: B-1 / **작성일**: 2026-06-07
> **연결 상태**: B-5 완료 전까지 실제 요청 불가 (index.js 미연결)

---

## 1. Feature Flag 매핑

| 엔드포인트 | 확인하는 Flag | 환경변수 |
|---|---|---|
| `POST /issue-member-token` | `hotelMemberPage` | `ENABLE_HOTEL_MEMBER_PAGE` |
| `POST /verify-member-token` | `hotelMemberPage` | `ENABLE_HOTEL_MEMBER_PAGE` |
| `POST /verify-staff` | `hotelStaffAuth` | `ENABLE_HOTEL_STAFF_AUTH` |
| `POST /verify-guest` | `hotelMode` | `ENABLE_HOTEL_MODE` |

Flag가 `false`이면 모든 엔드포인트는 **HTTP 403**을 반환하고 처리를 중단한다.  
기존 아파트 단지 라우트(`/api/applications` 등)는 이 파일과 완전히 무관하다.

---

## 2. 공통 규칙

- 모든 응답에 `success: boolean` 필드 포함
- 에러 응답 형태: `{ success: false, error: "메시지" }`
- DB 클라이언트: `require('../../db-supabase').getSupabase()` (기존 패턴 동일)
- 토큰 생성: `crypto.randomBytes(16).toString('hex')` → 32자리 hex

---

## 3. 엔드포인트 명세

### 3-1. POST /issue-member-token

**역할**: 회원(application) 에게 30일 유효 토큰 발급. 회원 전용 페이지 QR 접근용.

#### Request

```http
POST /api/hotel/auth/issue-member-token
Content-Type: application/json

{
  "application_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `application_id` | UUID string | ✅ | `applications.id` |

#### Response 200

```json
{
  "success": true,
  "token": "a3f2c1d4e5b6a7f8c9d0e1f2a3b4c5d6",
  "expires_at": "2026-07-07T00:00:00.000Z",
  "url": "https://your-domain.vercel.app/m?t=a3f2c1d4e5b6a7f8c9d0e1f2a3b4c5d6"
}
```

| 필드 | 설명 |
|---|---|
| `token` | 32자리 hex 토큰 (member_tokens 테이블에 저장됨) |
| `expires_at` | 발급 시점 + 30일 (ISO 8601) |
| `url` | `PUBLIC_APP_URL`(또는 `APP_BASE_URL`) + `/m?t=<token>` |

#### 에러

| 상태 코드 | 원인 | error 메시지 |
|---|---|---|
| 403 | Flag OFF | `해당 기능이 현재 비활성화되어 있습니다 (ENABLE_HOTEL_MEMBER_PAGE)` |
| 400 | application_id 누락 | `application_id가 필요합니다` |
| 404 | application 미존재 | `신청 내역을 찾을 수 없습니다` |
| 403 | 아파트 단지 application | `호텔 단지의 신청에만 토큰을 발급할 수 있습니다` |
| 500 | 서버 오류 | 오류 메시지 |

---

### 3-2. POST /verify-member-token

**역할**: 토큰 유효성 검증. 유효하면 `last_accessed_at` 업데이트.

#### Request

```http
POST /api/hotel/auth/verify-member-token
Content-Type: application/json

{
  "token": "a3f2c1d4e5b6a7f8c9d0e1f2a3b4c5d6"
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `token` | string | ✅ | 발급된 32자리 hex 토큰 |

#### Response 200 (유효한 토큰)

```json
{
  "success": true,
  "valid": true,
  "application_id": "550e8400-e29b-41d4-a716-446655440000",
  "complex_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
}
```

#### 에러

| 상태 코드 | 원인 | error 메시지 |
|---|---|---|
| 403 | Flag OFF | `해당 기능이 현재 비활성화되어 있습니다 (ENABLE_HOTEL_MEMBER_PAGE)` |
| 400 | token 누락 | `token이 필요합니다` |
| 401 | 토큰 미존재 | `유효하지 않은 토큰입니다` |
| 401 | 토큰 만료 | `만료된 토큰입니다` |
| 500 | 서버 오류 | 오류 메시지 |

> **참고**: `last_accessed_at` 업데이트는 fire-and-forget 방식. 업데이트 실패가 응답에 영향을 주지 않는다.

---

### 3-3. POST /verify-staff

**역할**: 임직원 인증. 사번 + 전화번호 뒷 4자리로 확인.

#### Request

```http
POST /api/hotel/auth/verify-staff
Content-Type: application/json

{
  "complex_code": "ht-lamada",
  "staff_no": "EMP-2024-001",
  "phone_last4": "5678"
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `complex_code` | string | ✅ | `complexes.code` |
| `staff_no` | string | ✅ | 직원 사번 (`hotel_staff.staff_no`) |
| `phone_last4` | string | ✅ | 전화번호 뒷 4자리 (숫자만) |

#### Response 200

```json
{
  "success": true,
  "discount_rate": 30,
  "is_vip": false,
  "complex_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
}
```

| 필드 | 설명 |
|---|---|
| `discount_rate` | 임직원 기본 할인율 30%. 향후 등급별 차등 가능 |
| `is_vip` | VIP 직원 여부 (`hotel_staff.is_vip`) |
| `complex_id` | 단지 UUID |

#### 에러

| 상태 코드 | 원인 | error 메시지 |
|---|---|---|
| 403 | Flag OFF | `해당 기능이 현재 비활성화되어 있습니다 (ENABLE_HOTEL_STAFF_AUTH)` |
| 400 | 필수값 누락 | `complex_code, staff_no, phone_last4가 모두 필요합니다` |
| 400 | phone_last4 형식 오류 | `phone_last4는 숫자 4자리여야 합니다` |
| 404 | 단지 미존재 | `단지를 찾을 수 없습니다` |
| 403 | 아파트 단지 | `호텔 단지에서만 임직원 인증이 가능합니다` |
| 401 | 인증 불일치 | `임직원 정보가 일치하지 않습니다` |
| 403 | 비활성 계정 | `비활성 상태의 임직원 계정입니다` |
| 500 | 서버 오류 | 오류 메시지 |

---

### 3-4. POST /verify-guest

**역할**: 투숙객 인증. 현 단계에서는 PMS 연동 없이 입력값만 받아 임시 토큰 발급.

#### Request

```http
POST /api/hotel/auth/verify-guest
Content-Type: application/json

{
  "complex_code": "ht-lamada",
  "room_number": "1205",
  "checkin_date": "2026-06-07"
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `complex_code` | string | ✅ | `complexes.code` |
| `room_number` | string | ✅ | 객실 번호 |
| `checkin_date` | string | ✅ | 체크인 날짜 (YYYY-MM-DD) |

#### Response 200

```json
{
  "success": true,
  "temp_token": "f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6",
  "valid_until": "2026-06-08T12:00:00.000Z"
}
```

| 필드 | 설명 |
|---|---|
| `temp_token` | 24시간 유효 임시 토큰 (현 단계: DB 저장 없음) |
| `valid_until` | 발급 시점 + 24시간 (ISO 8601) |

> **현 단계 제한**: PMS 연동이 없어 실제 투숙 여부를 검증하지 않음.  
> 이후 단계에서 `complexes.pms_integration` 컬럼 값에 따라 PMS API 호출 분기 예정.

#### 에러

| 상태 코드 | 원인 | error 메시지 |
|---|---|---|
| 403 | Flag OFF | `해당 기능이 현재 비활성화되어 있습니다 (ENABLE_HOTEL_MODE)` |
| 400 | 필수값 누락 | `complex_code, room_number, checkin_date가 모두 필요합니다` |
| 400 | 날짜 형식 오류 | `checkin_date 형식은 YYYY-MM-DD 이어야 합니다` |
| 404 | 단지 미존재 | `단지를 찾을 수 없습니다` |
| 403 | 아파트 단지 | `호텔 단지에서만 투숙객 인증이 가능합니다` |
| 500 | 서버 오류 | 오류 메시지 |

---

## 4. 에러 코드 일람

| HTTP 상태 | 의미 | 주요 발생 시나리오 |
|---|---|---|
| **400** Bad Request | 입력값 오류 | 필수 필드 누락, 형식 불일치 |
| **401** Unauthorized | 인증 실패 | 토큰 미존재·만료, 임직원 정보 불일치 |
| **403** Forbidden | 접근 거부 | Flag OFF, 아파트 단지 접근, 비활성 계정 |
| **404** Not Found | 리소스 미존재 | application·단지 미존재 |
| **500** Internal Error | 서버/DB 오류 | Supabase 연결 오류 등 |

---

## 5. DB 테이블 참조

| 테이블 | 라우트 | 조작 |
|---|---|---|
| `applications` | `/issue-member-token` | SELECT (존재·venue_type 확인) |
| `member_tokens` | `/issue-member-token` | INSERT |
| `member_tokens` | `/verify-member-token` | SELECT, UPDATE (last_accessed_at) |
| `complexes` | `/verify-staff`, `/verify-guest` | SELECT (venue_type 확인) |
| `hotel_staff` | `/verify-staff` | SELECT |

> 모든 테이블은 A-3에서 prod DB에 이미 적용 완료.

---

## 6. B-5 연결 시 추가 작업

`server/index.js`에 아래 코드 추가 (B-5에서 처리):

```javascript
const hotelAuthRouter = require('./routes/hotel/auth');
app.use('/api/hotel/auth', hotelAuthRouter);
```

---

*이 문서는 PMS 연동 구현 단계에서 §3-4 `/verify-guest` 명세를 갱신한다.*
