# B-3 호텔 리프레시 PT 예약 API

**파일**: `server/routes/hotel/refresh-pt.js`  
**단계**: Phase B — B-3  
**연결**: B-5에서 `server/index.js`에 `/api/hotel/refresh-pt` 마운트 예정 (현재 standalone)  
**작성일**: 2026-06-07

---

## 개요

아세로짐 라마다호텔점 투숙객·회원이 원하는 트레이너와 시간대를 선택해 45분 PT를 예약하는 API.

**설계 원칙**:
- 최소 정보 입력 — 동/호 주소 불필요, 이름·전화번호·시간대만 필요
- 대기열 없음 — 슬롯 중복 시 즉시 409, 다른 시간 선택 유도
- 혼잡도·타인 예약 정보 노출 없음 — 가능 슬롯 목록만 반환
- 노쇼·취소 패널티 없음 — 24시간 이내 변경은 거부하되, 취소는 허용 후 사유만 기록
- 기존 아파트 단지 무영향 — Feature Flag 미활성화 시 진입 불가

---

## Feature Flag 매핑

| Flag 이름        | 환경변수                   | 기본값  | 적용 엔드포인트                      |
|------------------|----------------------------|---------|--------------------------------------|
| `hotelRefreshPt` | `ENABLE_HOTEL_REFRESH_PT`  | `false` | 5개 엔드포인트 전체                  |

> `ENABLE_HOTEL_REFRESH_PT=true`로 설정하지 않으면 모든 엔드포인트가 `403`을 반환합니다.  
> `ENABLE_HOTEL_MODE=true`도 함께 켜야 단지 검증이 정상 동작합니다.

운영 환경 활성화 방법은 [`A4-FEATURE-FLAGS.md`](./A4-FEATURE-FLAGS.md) 참조.

---

## 가격 계산 로직

```
기본가(BASE_PRICE) = 40,000원  (45분 세션)

할인율(discount_rate) = 0        → total_amount = 40,000원
할인율(discount_rate) = 30 (VIP/임직원) → total_amount = 40,000 × 0.7 = 28,000원
```

**할인율 결정 흐름**:
1. `member_token` 없음 → `user_type='guest'`, `discount_rate=0`
2. `member_token` 있고 유효 → `member_tokens.discount_rate` 값 사용
   - 임직원 인증 토큰(`verify-staff`)으로 발급된 경우: `discount_rate=30`
   - 일반 회원 토큰(`issue-member-token`)으로 발급된 경우: `discount_rate=0` (기본)
3. 토큰이 만료되었거나 유효하지 않으면 guest로 처리

---

## 예약 가능 시간대

| 항목          | 값                           |
|---------------|------------------------------|
| 운영 시작     | 09:00                        |
| 마지막 슬롯   | 20:15 (세션 종료 21:00)      |
| 슬롯 간격     | 45분                         |
| 전체 슬롯 수  | 17개                         |

**전체 슬롯 목록**: `09:00, 09:45, 10:30, 11:15, 12:00, 12:45, 13:30, 14:15, 15:00, 15:45, 16:30, 17:15, 18:00, 18:45, 19:30, 20:15`

---

## 24시간 이내 변경·취소 정책

| 상황                              | 변경 (`/reschedule`) | 취소 (`/cancel`) |
|-----------------------------------|-----------------------|------------------|
| 예약 시작 24시간 이상 전          | ✅ 가능               | ✅ 가능          |
| 예약 시작 24시간 미만 전          | ❌ 거부 (409)         | ✅ 가능 (사유 기록) |
| 패널티·위약금·블랙리스트 조치     | 없음                  | 없음             |

24시간 이내 취소 시: `cancel_note='short_notice'`를 `applications` 테이블에 기록 (컬럼 없으면 무시, 운영자 참고용).

---

## 엔드포인트 명세

### 1. `GET /api/hotel/refresh-pt/instructors`

호텔 소속 트레이너 목록을 조회합니다.

#### Query Parameters

| 파라미터      | 필수 | 설명                         |
|---------------|------|------------------------------|
| `complex_code`| ✅   | 단지 코드 (`complexes.code`) |

#### Response 200

```json
{
  "success": true,
  "instructors": [
    {
      "id": "uuid-instructor-1",
      "name": "김필라",
      "photo_url": "https://...",
      "specialty": "스트레칭, 코어 강화"
    }
  ]
}
```

> ⚠️ 응답에 다른 예약자 정보·예약 현황·혼잡도 미포함

#### Response — 오류

| 상태코드 | 조건                                      |
|----------|-------------------------------------------|
| `400`    | `complex_code` 누락                       |
| `403`    | Feature Flag 비활성화                     |
| `403`    | 호텔 단지가 아님 (`venue_type ≠ 'hotel'`) |
| `404`    | 단지 없음                                 |

---

### 2. `GET /api/hotel/refresh-pt/available-slots`

특정 날짜·트레이너의 예약 가능 시간대를 조회합니다.

#### Query Parameters

| 파라미터        | 필수 | 설명                                      |
|-----------------|------|-------------------------------------------|
| `complex_code`  | ✅   | 단지 코드                                 |
| `instructor_id` | ✅   | 트레이너 UUID                             |
| `date`          | ✅   | 조회 날짜 (YYYY-MM-DD)                    |

#### Response 200

```json
{
  "success": true,
  "slots": ["09:00", "09:45", "11:15", "14:15", "20:15"]
}
```

- 반환되는 슬롯은 **예약 가능한 시간만** 포함됩니다. 이미 예약된 슬롯은 제외.
- 모든 슬롯이 예약된 경우: `"slots": []`

> ⚠️ 응답에 예약자 수·혼잡도·타인 예약 정보 절대 미포함

#### Response — 오류

| 상태코드 | 조건                                              |
|----------|---------------------------------------------------|
| `400`    | 필수 파라미터 누락 또는 `date` 형식 오류          |
| `403`    | Feature Flag 비활성화                             |
| `403`    | 호텔 단지가 아님                                  |
| `404`    | 단지 또는 트레이너 없음                           |

---

### 3. `POST /api/hotel/refresh-pt/reserve`

리프레시 PT를 예약합니다. 성공 시 `status=approved`로 즉시 확정됩니다.

#### Request Body

```json
{
  "complex_code": "ht-lamada",
  "instructor_id": "uuid-instructor-1",
  "scheduled_at": "2026-06-10T09:45:00+09:00",
  "name": "홍길동",
  "phone": "010-1234-5678",
  "room_number": "305",
  "member_token": "optional-32-char-hex-token",
  "payment_method": "room_charge"
}
```

| 파라미터         | 필수 | 설명                                                               |
|------------------|------|--------------------------------------------------------------------|
| `complex_code`   | ✅   | 단지 코드                                                          |
| `instructor_id`  | ✅   | 트레이너 UUID                                                      |
| `scheduled_at`   | ✅   | 예약 시각 (ISO 8601, KST 기준 09:00~20:15 사이 45분 단위)         |
| `name`           | ✅   | 예약자 이름                                                        |
| `phone`          | ✅   | 전화번호                                                           |
| `room_number`    | ❌   | 객실 번호 (선택 — 제공 시 applications.room_number에 저장)         |
| `member_token`   | ❌   | 회원 토큰 (32자 hex). 없으면 guest, 있으면 할인율 적용 가능        |
| `payment_method` | ✅   | `'card'` 또는 `'room_charge'`                                      |

#### Response 200

```json
{
  "success": true,
  "application_id": "uuid-of-reservation",
  "scheduled_at": "2026-06-10T09:45:00+09:00",
  "instructor_name": "김필라",
  "total_amount": 28000
}
```

| 필드              | 타입   | 설명                                             |
|-------------------|--------|--------------------------------------------------|
| `application_id`  | string | 생성된 예약 UUID                                 |
| `scheduled_at`    | string | 입력받은 ISO 8601 그대로 에코                    |
| `instructor_name` | string | 트레이너 이름                                    |
| `total_amount`    | number | 최종 결제 금액 (원). 할인 적용 후               |

#### Response — 오류

| 상태코드 | 조건                                                         |
|----------|--------------------------------------------------------------|
| `400`    | 필수 파라미터 누락                                           |
| `400`    | `payment_method` 값 오류                                     |
| `400`    | `scheduled_at` 형식 오류 또는 운영 시간 외 슬롯             |
| `400`    | 비활성 트레이너                                              |
| `403`    | Feature Flag 비활성화                                        |
| `403`    | 호텔 단지가 아님                                             |
| `404`    | 단지 또는 트레이너 없음                                      |
| `409`    | 해당 슬롯 이미 예약됨 — 다른 시간 선택 유도                 |

#### DB INSERT 필드 정책

| applications 컬럼 | 값                          | 비고                               |
|-------------------|-----------------------------|------------------------------------|
| `complex_id`      | complex.id                  |                                    |
| `program_name`    | `'리프레시 PT'`             | 고정값                             |
| `instructor_id`   | instructor_id               |                                    |
| `preferred_time`  | `HH:MM` (KST 시각)          | `scheduled_at`에서 추출            |
| `preferred_date`  | `YYYY-MM-DD` (KST 날짜)     | `scheduled_at`에서 추출            |
| `name`            | 입력값 (trim)               |                                    |
| `phone`           | 입력값 원본                 |                                    |
| `dong`            | `''` (빈 문자열)            | NOT NULL 제약 준수, 호텔은 동 없음 |
| `ho`              | `''` (빈 문자열)            | NOT NULL 제약 준수, 호텔은 호 없음 |
| `user_type`       | `'guest'` \| `'pt_member'` | member_token 유효 여부로 결정      |
| `discount_rate`   | `0` \| `30`                | 토큰의 discount_rate 반영          |
| `payment_method`  | `'card'` \| `'room_charge'` |                                    |
| `room_number`     | 입력값 또는 미포함          | 선택 컬럼                          |
| `status`          | `'approved'`                | 즉시 확정                          |
| `waiting_order`   | `null`                      | 대기열 없음                        |

---

### 4. `POST /api/hotel/refresh-pt/reschedule`

예약 시간을 변경합니다. 예약 시작 24시간 이내는 변경 불가.

#### Request Body

```json
{
  "application_id": "uuid-of-reservation",
  "phone_last4": "5678",
  "new_scheduled_at": "2026-06-10T14:15:00+09:00"
}
```

| 파라미터           | 필수 | 설명                    |
|--------------------|------|-------------------------|
| `application_id`   | ✅   | 예약 UUID               |
| `phone_last4`      | ✅   | 전화번호 뒷 4자리       |
| `new_scheduled_at` | ✅   | 변경할 시각 (ISO 8601)  |

#### Response 200

```json
{
  "success": true,
  "application_id": "uuid-of-reservation",
  "new_scheduled_at": "2026-06-10T14:15:00+09:00"
}
```

#### Response — 오류

| 상태코드 | 조건                                                                |
|----------|---------------------------------------------------------------------|
| `400`    | 필수 파라미터 누락 또는 형식 오류                                   |
| `400`    | 이미 취소된 예약                                                    |
| `403`    | Feature Flag 비활성화                                               |
| `403`    | 전화번호 불일치                                                     |
| `403`    | 호텔 단지 예약이 아님                                               |
| `404`    | 예약 내역 없음                                                      |
| `409`    | 예약 시작 24시간 이내 변경 시도                                     |
| `409`    | 새 시간대 이미 예약됨                                               |

---

### 5. `POST /api/hotel/refresh-pt/cancel`

예약을 취소합니다. 24시간 이내 취소도 패널티 없이 허용됩니다.

#### Request Body

```json
{
  "application_id": "uuid-of-reservation",
  "phone_last4": "5678"
}
```

| 파라미터          | 필수 | 설명              |
|-------------------|------|-------------------|
| `application_id`  | ✅   | 예약 UUID         |
| `phone_last4`     | ✅   | 전화번호 뒷 4자리 |

#### Response 200

```json
{
  "success": true
}
```

#### Response — 오류

| 상태코드 | 조건                                               |
|----------|----------------------------------------------------|
| `400`    | 필수 파라미터 누락 또는 `phone_last4` 형식 오류    |
| `400`    | 이미 취소된 예약                                   |
| `403`    | Feature Flag 비활성화                              |
| `403`    | 전화번호 불일치                                    |
| `403`    | 호텔 단지 예약이 아님                              |
| `404`    | 예약 내역 없음                                     |

---

## 설계 결정 사유

### 왜 노쇼 페널티가 없는가

1. **투숙객 특성**: 라마다호텔 투숙객은 1~3박 단기 체류가 대부분입니다. 노쇼 페널티를 부과해도 재방문 억제력이 없고, 체크아웃 후 추심이 불가능합니다.

2. **고객 경험 훼손**: PT 예약에 위약금·블랙리스트 공포를 심으면 예약 자체를 꺼리게 됩니다. 무료 체험 클래스와 달리 유료 PT이므로, 취소 자체가 고객 손실이기도 합니다.

3. **운영 실효성 없음**: 현장 직원이 패널티를 집행할 기준·시스템이 없습니다. 결국 기록만 남고 집행이 안 되는 규정은 불신만 낳습니다.

4. **대안 존재**: 트레이너 스케줄 효율화는 노쇼 패널티보다 24시간 이내 **변경 거부** 정책으로 달성합니다. 당일 스케줄이 확정되면 트레이너가 시간을 믿고 준비할 수 있습니다.

따라서 취소는 언제나 허용하되, 24시간 이내 취소는 `cancel_note='short_notice'`를 기록하여 운영자가 트렌드를 파악하는 데만 활용합니다.

---

### 왜 변경은 24시간 이내 거부하는가

- 트레이너 입장: 당일 스케줄 변경은 준비 시간 손실과 공백 슬롯 낭비를 초래합니다.
- 취소는 허용하므로 고객이 완전히 막히지는 않습니다. 취소 후 다른 슬롯으로 재예약 가능합니다.
- 이는 패널티가 아니라 **운영 효율을 위한 최소한의 규칙**입니다.

---

### 왜 예약 가능 슬롯만 반환하는가 (`/available-slots`)

- `/available-slots`은 가능 슬롯 목록만 반환합니다. 몇 명이 예약했는지, 누가 예약했는지는 반환하지 않습니다.
- 이유: 타인의 예약 시각이 노출되면 특정 트레이너의 인기도·스케줄이 역추적 가능합니다. 이는 트레이너 개인정보 및 비즈니스 민감 정보 보호 원칙에 위배됩니다.
- 클라이언트는 반환된 슬롯 배열에서 선택 UI를 구성하면 됩니다.

---

## 공통 패턴 참고

| 항목                | 구현                                             |
|---------------------|--------------------------------------------------|
| Supabase 클라이언트 | `require('../../db-supabase').getSupabase()`     |
| DB 오류 래핑        | `sbErr(error, '컨텍스트')`                       |
| Feature Flag        | `require('../../config/feature-flags')`          |
| 호텔 단지 검증      | `resolveHotelComplex(sb, code, res)` (내부 헬퍼) |
| 트레이너 검증       | `resolveInstructor(sb, id, complexId, res)` (내부 헬퍼) |
| 예약 슬롯 집합      | `getBookedSlots(sb, complexId, instructorId, dateYMD)` (내부 헬퍼) |

---

## 관련 파일

| 파일                                       | 역할                                      |
|--------------------------------------------|-------------------------------------------|
| `server/routes/hotel/refresh-pt.js`        | 이 문서의 구현 파일                       |
| `server/config/feature-flags.js`           | Feature Flag 정의 (`hotelRefreshPt`)      |
| `server/db-supabase.js`                    | Supabase 클라이언트 및 오류 헬퍼          |
| `docs/ops/A4-FEATURE-FLAGS.md`             | Flag 활성화 운영 가이드                   |
| `docs/ops/B1-HOTEL-AUTH-API.md`            | 회원/임직원 토큰 발급 (member_token 출처) |
| `docs/ops/B2-HOTEL-QUICK-CLASS-API.md`     | 무료 클래스 원터치 신청                   |
| `supabase/migrations/20260607_a2_add_hotel_mode_columns.sql` | `user_type`, `room_number`, `preferred_date`, `discount_rate`, `payment_method` 컬럼 추가 |
