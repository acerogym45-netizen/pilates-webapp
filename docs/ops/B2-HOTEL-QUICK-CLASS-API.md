# B-2 호텔 무료 클래스 원터치 신청 API

**파일**: `server/routes/hotel/quick-class.js`  
**단계**: Phase B — B-2  
**연결**: B-5에서 `server/index.js`에 `/api/hotel/quick-class` 마운트 예정 (현재 standalone)  
**작성일**: 2026-06-07

---

## 개요

아세로짐 라마다호텔점 투숙객·회원이 동/호 입력 없이 이름·전화번호만으로 무료 클래스를 신청할 수 있는 원터치 신청 API.

**설계 원칙**:
- 최소 정보 입력 — 동/호 주소 불필요 (빈 문자열로 DB NOT NULL 제약 준수)
- 대기열 없음 — 정원 마감 시 즉시 안내, 다음 회차 선택 유도
- 혼잡도·실시간 인원 노출 없음 — 잔여석 숫자와 만석 여부만 반환
- 노쇼 페널티 없음 — 강제 인증·블랙리스트 로직 부재
- 기존 아파트 단지 무영향 — Feature Flag 비활성화 시 이 경로 진입 불가

---

## Feature Flag 매핑

| Flag 이름        | 환경변수                    | 기본값  | 적용 엔드포인트              |
|------------------|-----------------------------|---------|------------------------------|
| `hotelQuickClass`| `ENABLE_HOTEL_QUICK_CLASS`  | `false` | GET /availability, POST /apply, POST /cancel (전체) |

> `ENABLE_HOTEL_QUICK_CLASS=true`로 설정하지 않으면 모든 엔드포인트가 `403`을 반환합니다.  
> `ENABLE_HOTEL_MODE=true` (hotelMode)도 함께 켜져 있어야 단지 검증이 정상 동작합니다.

운영 환경 활성화 방법은 [`A4-FEATURE-FLAGS.md`](./A4-FEATURE-FLAGS.md) 참조.

---

## 엔드포인트 명세

### 1. `GET /api/hotel/quick-class/availability`

프로그램의 정원 및 가용 여부를 조회합니다.

#### Query Parameters

| 파라미터      | 필수 | 설명                         |
|---------------|------|------------------------------|
| `complex_code`| ✅   | 단지 코드 (`complexes.code`) |
| `program_id`  | ✅   | 프로그램 UUID                |

#### Response 200

```json
{
  "success": true,
  "capacity": 15,
  "current_count": 9,
  "available": 6,
  "is_full": false
}
```

| 필드            | 타입    | 설명                             |
|-----------------|---------|----------------------------------|
| `capacity`      | number  | 프로그램 정원                    |
| `current_count` | number  | 현재 `status=approved` 신청 수   |
| `available`     | number  | 잔여석 수 (`capacity - current_count`, 최소 0) |
| `is_full`       | boolean | 정원 마감 여부                   |

#### Response — 오류

| 상태코드 | 조건                                          |
|----------|-----------------------------------------------|
| `400`    | `complex_code` 또는 `program_id` 누락         |
| `400`    | 운영 중이지 않은 프로그램 (`is_active=false`) |
| `400`    | 유료 프로그램 (`price ≠ 0`)                   |
| `403`    | Feature Flag 비활성화                         |
| `403`    | 호텔 단지가 아님 (`venue_type ≠ 'hotel'`)     |
| `404`    | 단지 또는 프로그램 없음                       |

---

### 2. `POST /api/hotel/quick-class/apply`

무료 클래스 원터치 신청. 성공 시 `status=approved`로 즉시 확정됩니다.

#### Request Body

```json
{
  "complex_code": "ht-lamada",
  "program_id": "uuid-of-free-class",
  "name": "홍길동",
  "phone": "010-1234-5678",
  "phone_last4": "5678",
  "member_token": "optional-32-char-hex-token"
}
```

| 파라미터       | 필수 | 설명                                                                 |
|----------------|------|----------------------------------------------------------------------|
| `complex_code` | ✅   | 단지 코드                                                            |
| `program_id`   | ✅   | 프로그램 UUID                                                        |
| `name`         | ✅   | 신청자 이름                                                          |
| `phone`        | ✅   | 전화번호 (형식 자유 — 숫자만 추출하여 검증)                         |
| `phone_last4`  | ✅   | 전화번호 뒷 4자리 (숫자만, `phone` 뒷부분과 일치해야 함)           |
| `member_token` | ❌   | 기존 회원 식별 토큰 (32자 hex, `member_tokens` 테이블). 없으면 guest |

#### Response 200

```json
{
  "success": true,
  "application_id": "uuid-of-created-application",
  "scheduled_info": {
    "program_name": "아침 요가",
    "complex_name": "아세로짐 라마다호텔점"
  }
}
```

#### Response — 오류

| 상태코드 | 조건                                                      |
|----------|-----------------------------------------------------------|
| `400`    | 필수 파라미터 누락                                        |
| `400`    | `phone_last4` 형식 오류 (숫자 4자리 아님)                 |
| `400`    | `phone`와 `phone_last4` 불일치                            |
| `400`    | 운영 중이지 않은 프로그램 또는 유료 프로그램              |
| `403`    | Feature Flag 비활성화                                     |
| `403`    | 호텔 단지가 아님                                          |
| `404`    | 단지 또는 프로그램 없음                                   |
| `409`    | 정원 마감 (`is_full: true`)                               |
| `409`    | 동일 회원 중복 신청 (`member_token` 사용 시)              |

#### 정원 마감 응답 예시 (409)

```json
{
  "success": false,
  "is_full": true,
  "error": "정원이 마감되었습니다. 다른 시간대를 선택해 주세요."
}
```

#### DB INSERT 필드 정책

| applications 컬럼 | 값                             | 비고                              |
|-------------------|--------------------------------|-----------------------------------|
| `complex_id`      | complex.id                     |                                   |
| `program_id`      | program.id                     |                                   |
| `program_name`    | program.name                   |                                   |
| `name`            | 입력값 (trim)                  |                                   |
| `phone`           | 입력값 원본                    |                                   |
| `dong`            | `''` (빈 문자열)               | NOT NULL 제약 준수, 호텔은 동 없음 |
| `ho`              | `''` (빈 문자열)               | NOT NULL 제약 준수, 호텔은 호 없음 |
| `user_type`       | `'member'` \| `'guest'`        | member_token 존재 여부로 결정      |
| `status`          | `'approved'`                   | 원터치 = 즉시 확정                |
| `waiting_order`   | `null`                         | 대기열 없음                       |

---

### 3. `POST /api/hotel/quick-class/cancel`

전화번호 뒷 4자리로 본인을 확인한 뒤 신청을 취소합니다.

#### Request Body

```json
{
  "application_id": "uuid-of-application",
  "phone_last4": "5678"
}
```

| 파라미터          | 필수 | 설명              |
|-------------------|------|-------------------|
| `application_id`  | ✅   | 신청 UUID         |
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
| `400`    | 이미 취소된 신청                                   |
| `403`    | Feature Flag 비활성화                              |
| `403`    | 전화번호 불일치 (본인 확인 실패)                   |
| `403`    | 호텔 단지 신청이 아님                              |
| `404`    | 신청 내역 없음                                     |

---

## 설계 결정 사유

### 왜 대기열 없는가

무료 체험 클래스에 대기열을 도입하면 고객 경험이 오히려 악화됩니다.

1. **기대 불확실성**: 대기 순번을 받아도 실제 입장 여부를 알 수 없어 일정을 잡기 어렵습니다.
2. **반복 확인 부담**: 앱/웹을 반복 확인하거나 노티를 설정해야 하는 번거로움이 생깁니다.
3. **더 나은 대안 존재**: 정원 마감 시 당일 다른 시간대 또는 익일 회차를 즉시 안내하는 것이 투숙객 입장에서 훨씬 명확합니다.
4. **무료 클래스 특성**: 유료 예매와 달리, 취소율이 높고 walk-in 수요도 있어 정원 회전이 빠릅니다. 실시간 잔여석 조회(`GET /availability`)로 충분히 대응 가능합니다.

따라서 `waiting_order = null`, 정원 초과 시 `409 is_full: true` 즉시 반환 정책을 채택했습니다.

---

### 왜 혼잡도·현재 신청자 명단을 노출하지 않는가

`GET /availability`는 `capacity`, `current_count`, `available`, `is_full`만 반환하며, 현재 신청자 명단·신청자 수 상세·개인 정보는 응답에 포함하지 않습니다.

이유:

1. **개인정보 보호**: 타인이 특정 시간대에 몇 명이 신청했는지 이름·전화번호를 알 필요가 없습니다.
2. **불필요한 심리적 압박 방지**: 실시간 혼잡도를 보여주면 고객이 "지금 신청 안 하면 마감될 것 같다"는 불필요한 압박을 받습니다. 잔여석 숫자만으로 충분합니다.
3. **UI 단순화**: 클라이언트는 `is_full`과 `available` 두 값만으로 신청 버튼 활성화 여부를 결정할 수 있습니다.
4. **운영 정보 보안**: 특정 시간대의 인기도·혼잡도 정보는 비즈니스 민감 데이터입니다.

---

## 공통 패턴 참고

| 항목                | 구현                                           |
|---------------------|------------------------------------------------|
| Supabase 클라이언트 | `require('../../db-supabase').getSupabase()`   |
| DB 오류 래핑        | `sbErr(error, '컨텍스트')`                     |
| Feature Flag        | `require('../../config/feature-flags')`        |
| 호텔 단지 검증      | `resolveHotelComplex(sb, code, res)` (내부 헬퍼) |
| 무료 프로그램 검증  | `resolveFreeProgram(sb, id, complexId, res)` (내부 헬퍼) |

---

## 관련 파일

| 파일                                  | 역할                                   |
|---------------------------------------|----------------------------------------|
| `server/routes/hotel/quick-class.js`  | 이 문서의 구현 파일                    |
| `server/config/feature-flags.js`      | Feature Flag 정의 (`hotelQuickClass`)  |
| `server/db-supabase.js`               | Supabase 클라이언트 및 오류 헬퍼       |
| `docs/ops/A4-FEATURE-FLAGS.md`        | Flag 활성화 운영 가이드                |
| `docs/ops/B1-HOTEL-AUTH-API.md`       | 호텔 인증 API (member_token 발급)      |
| `supabase/migrations/20260607_a2_add_hotel_mode_columns.sql` | `user_type`, `room_number` 컬럼 추가 마이그레이션 |
