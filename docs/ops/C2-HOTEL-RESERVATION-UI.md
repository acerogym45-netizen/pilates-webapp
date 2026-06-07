# C2-HOTEL-RESERVATION-UI

아세로짐 라마다 대전점 — 예약 UI 설계 문서  
단계: **Phase C-2** / 작성일: 2026-06-07

---

## 1. 개요

C-2는 랜딩 페이지(C-1)에서 연결되는 두 개의 서비스 페이지를 구현합니다.

| 페이지 | 파일 | 연동 API |
|---|---|---|
| 무료 운동 클래스 신청 | `public/hotel/quick-class.html` | `GET /api/hotel/quick-class/availability`<br>`POST /api/hotel/quick-class/apply` |
| 리프레시 PT 예약 | `public/hotel/refresh-pt.html` | `GET /api/hotel/refresh-pt/instructors`<br>`GET /api/hotel/refresh-pt/available-slots`<br>`POST /api/hotel/refresh-pt/reserve` |

공통 모듈: `public/hotel/js/api-client.js` (hotelApi fetch 래퍼)

---

## 2. 사용자 흐름 다이어그램

### 2-1. 무료 운동 클래스 신청

```
랜딩(index.html)
  │
  ▼ [무료 클래스 신청] 버튼 탭
quick-class.html 진입
  │
  ├─► loadAvailability()
  │     GET /api/hotel/quick-class/availability
  │     ?complex_code=ht-lamada&program_id={uuid}
  │     │
  │     ├─ 정원 있음 → 일정 카드에 "잔여 N석" 표시 (N ≤ 3 → 노란색)
  │     └─ 정원 마감(is_full) → "이번 회차 마감" 표시, 제출 버튼 비활성화
  │
  ├─► prefillFromToken()   (토큰 있을 때만, 실패 시 silent)
  │     GET /api/hotel/members/me
  │     → 이름만 자동 채움 (전화번호는 보안상 미반환)
  │
  ▼ 사용자: 이름 입력 + 전화번호 입력 + 약관 체크
  │         ↑ 세 조건 충족 시 "신청하기" 버튼 활성화
  │
  ▼ [신청하기] 탭
  POST /api/hotel/quick-class/apply
  {
    complex_code, name, phone, phone_last4,
    program_id (있을 때),
    member_token (토큰 있을 때)
  }
  │
  ├─ 200 OK
  │   → formArea 숨김, doneScreen 표시
  │   → "클래스 당일 피트니스 센터로 오시면 됩니다" 안내
  │   → "처음 화면으로" 링크 (자동 리다이렉트 없음)
  │
  ├─ 409 is_full=true
  │   → 정원 마감 안내 (info 상태 박스)
  │   → "이번 회차는 방금 마감되었습니다. 다음 회차: 매주 월·수 오전 10시"
  │   → 대기열 UI 없음, 자동 리다이렉트 없음
  │
  └─ 기타 오류
      → 에러 메시지 표시, 버튼 재활성화
```

### 2-2. 리프레시 PT 예약

```
랜딩(index.html)
  │
  ▼ [리프레시 PT 예약] 버튼 탭
refresh-pt.html 진입
  │
  ├─► loadInstructors()
  │     GET /api/hotel/refresh-pt/instructors
  │     ?complex_code=ht-lamada
  │     → 가로 스크롤 트레이너 카드 렌더링
  │       (사진 or 이모지 fallback + 이름 + 전문분야)
  │
  ├─► renderDateGrid()
  │     오늘 ~ +7일 날짜 버튼 그리드 (로컬 타임 기준)
  │
  ├─► prefillFromToken()   (토큰 있을 때만, 실패 시 silent)
  │     이름만 자동 채움
  │
  ▼ 사용자: 트레이너 선택
  │         → selectedInstructor 갱신
  │         → 날짜가 이미 선택된 경우 즉시 슬롯 로드
  │
  ▼ 사용자: 날짜 선택
  │         → selectedDate 갱신
  │         → 트레이너가 이미 선택된 경우 즉시 슬롯 로드
  │
  ├─► loadSlots(instructorId, date)   (트레이너+날짜 선택 시 자동 호출)
  │     GET /api/hotel/refresh-pt/available-slots
  │     ?complex_code=ht-lamada&instructor_id={id}&date=YYYY-MM-DD
  │     │
  │     ├─ available_slots: ['09:00','09:45',...] → 슬롯 버튼 그리드 렌더링
  │     └─ [] → "선택하신 날짜에 가능한 시간이 없습니다"
  │
  ▼ 사용자: 슬롯 선택 + 이름 + 전화 + 약관 체크
  │         ↑ 6가지 조건 충족 시 "예약하기" 버튼 활성화
  │
  ▼ [예약하기] 탭
  POST /api/hotel/refresh-pt/reserve
  {
    complex_code, instructor_id,
    scheduled_at: "YYYY-MM-DDTHH:MM:00+09:00",   ← KST ISO8601
    name, phone,
    payment_method: "card",
    member_token (토큰 있을 때)
  }
  │
  ├─ 200 OK
  │   → formArea 숨김, doneScreen 표시
  │   → 예약 확인 박스: 트레이너, 일시, 소요시간, 결제금액, 결제방법
  │   → 카카오 알림 안내
  │   → "처음 화면으로" 링크 (자동 리다이렉트 없음)
  │
  ├─ 409 (24시간 이내 reschedule 거부 등)
  │   → 에러 메시지 표시, 버튼 재활성화
  │
  └─ 기타 오류
      → 에러 메시지 표시, 버튼 재활성화
```

---

## 3. 입력 폼 필드 명세

### 3-1. 무료 운동 클래스 신청

| 필드 | HTML ID | type | autocomplete | maxlength | 필수 | 검증 |
|---|---|---|---|---|---|---|
| 이름 | `inputName` | `text` | `name` | 20 | ✅ | 2자 이상 |
| 휴대폰 번호 | `inputPhone` | `tel` | `tel` | 13 | ✅ | 숫자 10자 이상 (자동 포맷: `010-XXXX-XXXX`) |
| 약관 동의 | `termsCheck` | `checkbox` | — | — | ✅ | 체크 여부 |

**POST body 매핑:**
```
name        ← inputName.value.trim()
phone       ← inputPhone.value.trim()
phone_last4 ← phone 뒤 4자리 (숫자만)
complex_code← URL ?complex 파라미터 or 'ht-lamada'
program_id  ← URL ?program 파라미터 (없으면 생략)
member_token← localStorage['hotel_member_token'] (없으면 생략)
```

### 3-2. 리프레시 PT 예약

| 필드 | HTML ID | type | autocomplete | maxlength | 필수 | 검증 |
|---|---|---|---|---|---|---|
| 트레이너 선택 | `instructorList` 내 카드 | — | — | — | ✅ | 하나 선택 |
| 날짜 선택 | `dateGrid` 내 버튼 | — | — | — | ✅ | 하나 선택 |
| 시간 선택 | `slotGrid` 내 버튼 | — | — | — | ✅ | 하나 선택 |
| 이름 | `inputName` | `text` | `name` | 20 | ✅ | 2자 이상 |
| 휴대폰 번호 | `inputPhone` | `tel` | `tel` | 13 | ✅ | 숫자 10자 이상 |
| 약관 동의 | `termsCheck` | `checkbox` | — | — | ✅ | 체크 여부 |

**POST body 매핑:**
```
complex_code   ← URL ?complex 파라미터 or 'ht-lamada'
instructor_id  ← selectedInstructor.id
scheduled_at   ← `${selectedDate}T${selectedSlot}:00+09:00`  (KST ISO8601)
name           ← inputName.value.trim()
phone          ← inputPhone.value.trim()
payment_method ← 'card'  (Phase 1 고정)
member_token   ← localStorage['hotel_member_token'] (없으면 생략)
```

---

## 4. 설계 결정 사유

### 4-1. 동/호 입력을 받지 않는 이유

기존 아파트 단지 시스템은 `dong`, `ho` 컬럼을 사용해 세대를 식별합니다.  
호텔 투숙객은 세대 개념이 없고 객실 번호가 고정 식별자가 아닙니다(체크아웃 후 무의미).

- **DB 제약 충족**: `applications` 테이블의 `dong NOT NULL`, `ho NOT NULL` 제약을  
  `dong=''`, `ho=''`(빈 문자열)로 충족합니다. 이는 Additive-only 원칙(기존 스키마 무수정)을  
  지키면서 기존 코드와의 충돌을 방지합니다.
- **최소 입력 원칙**: 호텔 투숙객이 입력해야 하는 정보를 최소화하여 신청 완료율을 높입니다.
- **기존 시스템 보호**: `dong`/`ho` 기반으로 동작하는 아파트 기능(대기열, 정원 집계)에  
  호텔 데이터가 혼입되지 않도록 완전히 분리합니다.

### 4-2. 약관 페이지를 별도로 만들지 않는 이유

- **즉시 신청 경험**: 별도 페이지 전환은 투숙객의 이탈을 유발합니다.  
  QR 스캔 → 즉시 신청 완료까지 단계를 최소화하는 것이 목표입니다.
- **인라인 토글 충분**: 개인정보 수집 항목이 단순합니다  
  (이름, 휴대폰 번호 / 목적: 예약 관리 / 보유: 1개월).  
  법적으로 요구되는 내용을 접기/펼치기 토글로 완전히 표시합니다.
- **체크박스 동의 유효성**: 한국 개인정보보호법 기준으로 체크박스 명시적 동의는  
  별도 페이지 없이도 유효한 동의 방식으로 인정됩니다.

### 4-3. 혼잡도/타인 예약 정보를 표시하지 않는 이유

- **프라이버시 보호**: 다른 투숙객의 예약 현황(시간대별 인원 등)은 개인정보 보호 관점에서  
  노출하지 않습니다.
- **심리적 압박 제거**: "몇 명이 예약했다"는 정보는 불필요한 경쟁심을 유발할 수 있습니다.  
  호텔 투숙객 서비스는 차분하고 품격 있는 경험을 제공해야 합니다.
- **API 설계 반영**: `GET /api/hotel/quick-class/availability`는 `current_count`를  
  반환하지만 클라이언트는 `available`(잔여석)만 사용합니다.  
  `GET /api/hotel/refresh-pt/available-slots`는 예약 가능한 슬롯 목록만 반환하고  
  예약된 슬롯은 목록 자체에서 제외합니다.

### 4-4. 대기열을 만들지 않는 이유

- **호텔 서비스 특성**: 투숙객은 체크아웃 전까지만 서비스를 이용합니다.  
  대기열에 등록했다가 체크아웃으로 이탈하는 상황이 발생하면 운영 복잡도가 높아집니다.
- **노쇼 페널티 없음**: 운영 초기에는 강제 이행 수단이 없습니다.  
  대기열이 있어도 노쇼 발생 시 관리가 불가능합니다.
- **대안 제공**: 정원 마감 시 다음 회차 일정을 안내하여 재방문을 유도합니다.

### 4-5. 결제를 카드 결제만 제공하는 이유 (Phase 1)

- **객실 청구(room_charge)** 는 호텔 PMS(숙박 관리 시스템) 연동이 필요합니다.  
  이 연동은 Phase 2에서 구현합니다.
- Phase 1에서는 `payment_method='card'`를 고정하고, 현장 결제 안내를 표시합니다.
- API(`POST /refresh-pt/reserve`)는 이미 `payment_method` 필드를 지원하므로  
  Phase 2 전환 시 클라이언트 수정만 필요합니다.

### 4-6. 자동 리다이렉트를 하지 않는 이유

- 신청/예약 완료 후 자동으로 다른 페이지로 이동하면 사용자가 확인 내용을 읽기 전에  
  화면이 바뀌는 문제가 발생합니다.
- 완료 화면에서 "처음 화면으로" 링크를 명시적으로 제공하여 사용자가 직접 이동합니다.

---

## 5. 슬롯 시간 규칙 (서버 참조)

`server/routes/hotel/refresh-pt.js` 기준:
- 운영 시간: 09:00 ~ 20:15 (KST)
- 간격: 45분
- 슬롯 수: 17개
  - 09:00, 09:45, 10:30, 11:15, 12:00, 12:45, 13:30, 14:15,
    15:00, 15:45, 16:30, 17:15, 18:00, 18:45, 19:30, 20:15 외 1개

---

## 6. 파일 목록

| 파일 | 역할 |
|---|---|
| `public/hotel/js/api-client.js` | 공통 fetch 래퍼 (토큰 자동 헤더, 에러 변환) |
| `public/hotel/quick-class.html` | 무료 클래스 신청 페이지 HTML |
| `public/hotel/js/quick-class.js` | 무료 클래스 신청 페이지 스크립트 |
| `public/hotel/refresh-pt.html` | 리프레시 PT 예약 페이지 HTML |
| `public/hotel/js/refresh-pt.js` | 리프레시 PT 예약 페이지 스크립트 |

---

## 7. 절대 금지 항목 (준수 확인)

| 항목 | 상태 |
|---|---|
| 동/호 입력 필드 | ❌ 없음 |
| 혼잡도/현재 신청자 수 표시 | ❌ 없음 |
| 타인 예약 정보 표시 | ❌ 없음 |
| 대기열 UI | ❌ 없음 |
| 강제 회원가입 | ❌ 없음 |
| 노쇼 페널티 표시 | ❌ 없음 |
| 자동 리다이렉트 | ❌ 없음 |
| 기존 public/index.html 수정 | ❌ 수정 없음 |
| 기존 public/css/ 수정 | ❌ 수정 없음 |
| 기존 public/js/ 수정 | ❌ 수정 없음 |
| C-1 결과물(hotel/index.html 등) 수정 | ❌ 수정 없음 |

---

*문서 관리: Phase C-3 이후 내용은 별도 C3-*.md 문서로 분리합니다.*
