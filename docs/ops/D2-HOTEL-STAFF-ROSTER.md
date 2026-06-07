# D-2 호텔 임직원 명단 관리 설계 문서

> **단계**: D-2 · **작성일**: 2026-06-07  
> **대상**: 관리자(운영진) 전용 · **격리 원칙**: `venue_type='hotel'` 단지에서만 활성화

---

## 1. 개요

라마다 호텔 HR로부터 전달받은 임직원 명단을 등록·관리하는 admin 페이지다.  
임직원 인증(`/verify-staff`)이 작동하려면 `hotel_staff` 테이블에 사전 등록이 필요하다.

### 진입 경로

```
admin/index.html 사이드바 메뉴
  └─ onclick="navigate('hotel-staff-roster')"
       └─ hotelStaffRoster.render()   ← D-2 진입점
```

> **admin-app.js 수정 금지** 원칙에 따라, `navigate()` 케이스 추가는 운영자 수동 반영.  
> `hotel-staff-roster.js` 하단 주석에 연동 가이드 삽입.

---

## 2. 파일 목록 (D-2 신규 생성)

| 파일 | 설명 | 상태 |
|---|---|---|
| `admin/js/pages/hotel-staff-roster.js` | 페이지 로직 (`hotelStaffRoster` 객체) | ✅ 생성 |
| `admin/css/hotel-staff-roster.css` | 전용 스타일 (`.sr-*` 네임스페이스) | ✅ 생성 |
| `docs/ops/D2-HOTEL-STAFF-ROSTER.md` | 본 설계 문서 | ✅ 생성 |

**수정한 기존 파일**: **0개**

---

## 3. hotel_staff 테이블 스키마

```sql
CREATE TABLE hotel_staff (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    complex_id  UUID        NOT NULL,
    staff_no    TEXT        NOT NULL,        -- 사번 (단지 내 고유)
    name        TEXT        NOT NULL,        -- 이름
    phone_last4 TEXT        NOT NULL,        -- 휴대폰 뒤 4자리 (인증용)
    department  TEXT,                        -- 부서 (선택)
    is_vip      BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (complex_id, staff_no)            -- 단지 내 사번 중복 금지
);
```

> 마이그레이션 파일: `supabase/migrations/20260607_a2_add_hotel_mode_columns.sql`

---

## 4. CSV 업로드 포맷 명세

### 4.1 파일 형식

| 항목 | 규격 |
|---|---|
| 인코딩 | UTF-8 (BOM 있어도 자동 제거) |
| 확장자 | `.csv` |
| 구분자 | 쉼표 `,` |
| 헤더 행 | 반드시 첫 번째 행 |
| 인용부호 | 쌍따옴표 `"` (값에 쉼표 포함 시) |

### 4.2 헤더 및 컬럼

```
staff_no,name,phone_last4,department,is_vip
```

| 컬럼 | 필수 | 형식 | 예시 | 설명 |
|---|---|---|---|---|
| `staff_no` | **필수** | 문자열, 최대 50자 | `EMP001` | 사번 (단지 내 고유) |
| `name` | **필수** | 문자열, 최대 50자 | `홍길동` | 이름 |
| `phone_last4` | **필수** | 숫자 4자리 | `1234` | 휴대폰 뒤 4자리만 (전체 번호 금지) |
| `department` | 선택 | 문자열, 최대 100자 | `프론트` | 부서명 (없으면 빈 값) |
| `is_vip` | 선택 | `true`/`false`/`1`/`0`/`yes`/`no`/`예` | `false` | VIP 여부 (기본: false) |

### 4.3 예시 CSV

```csv
staff_no,name,phone_last4,department,is_vip
EMP001,홍길동,1234,프론트,false
EMP002,김영희,5678,하우스키핑,false
EMP003,이철수,9012,F&B,true
EMP004,박민준,3456,보안,false
EMP005,최지현,7890,,false
```

### 4.4 업로드 흐름

```
파일 선택 (클릭 or 드래그앤드롭)
  → 클라이언트에서 CSV 파싱
  → 행별 유효성 검사
      ┣ 오류 행 → 제외 목록에 기록
      └ 정상 행 → 미리보기 테이블
  → 운영자가 미리보기 확인
  → "일괄 등록" 클릭
  → POST /api/hotel/staff/bulk
  → 결과 안내:
      · N명 등록 완료
      · M명 중복 사번으로 건너뜀 (staff_no 목록)
```

### 4.5 중복 사번 처리

- `UNIQUE (complex_id, staff_no)` 제약으로 DB 레벨에서 중복 거부
- 서버 응답 `{ inserted: N, skipped: M, duplicates: [{ staff_no, name }, ...] }` 반환
- 클라이언트는 중복 목록을 `alert()`으로 운영자에게 고지 후 건너뜀
- 기존 레코드를 덮어쓰지 않음 (overwrite 미지원 — 의도적 설계)

---

## 5. 수동 추가 폼 필드 명세

| 필드 ID | 레이블 | 필수 | 유효성 | 비고 |
|---|---|---|---|---|
| `addStaffNo` | 사번 | ✅ | 최대 50자 | |
| `addName` | 이름 | ✅ | 최대 50자 | |
| `addPhoneLast4` | 휴대폰 뒤 4자리 | ✅ | `\d{4}` | 전화번호 전체 입력 불가 |
| `addDepartment` | 부서 | 선택 | 최대 100자 | |
| `addIsVip` | VIP 여부 | — | 체크박스 | 기본값 false |

### 유효성 실패 시:
- 모달 내 `.sr-form-err` 인라인 오류 메시지 표시
- 서버 전송 없음 (클라이언트에서 차단)

---

## 6. 왜 휴대폰 전체 번호를 수집하지 않는가

### 6.1 개인정보보호법 최소 수집 원칙

「개인정보보호법」 제16조는 필요 최소한의 개인정보만 수집하도록 규정한다.  
임직원 인증 목적에 **전체 전화번호**는 필요하지 않다.

아세로짐 호텔 모드에서 임직원 인증은 다음 복합 키로 이루어진다:
```
complex_id + staff_no + phone_last4
```

사번(staff_no)은 호텔 내부 식별자이며, 사번을 아는 외부인이 무작위로 추측하더라도  
phone_last4 는 0000~9999 중 하나이므로, 전체 번호 없이도 **충분한 보안성**을 확보한다.

### 6.2 저장 데이터 최소화

| 수집 방식 | 저장 내용 | 위험 등급 |
|---|---|---|
| 전체 번호 저장 | `010-XXXX-XXXX` | 고 (개인정보 유출 시 연락처 노출) |
| 뒤 4자리만 저장 | `XXXX` | 저 (4자리만으로 개인 식별 불가) |

전체 번호를 저장하면 DB 유출 시 임직원 전체의 개인 연락처가 노출된다.  
뒤 4자리만 저장하면 비식별화 효과가 있어 개인정보 침해 위험이 현저히 낮다.

### 6.3 기술 구현

```javascript
// hotel-staff-roster.js _submitAdd() 내부
if (!/^\d{4}$/.test(phoneLast4))
    return this._showFormErr(errEl, '휴대폰 뒤 4자리는 숫자 4자리여야 합니다.');
```

```javascript
// CSV 파싱 유효성 검사
if (!/^\d{4}$/.test(row.phone_last4)) {
    errors.push(`행 ${row._rowNum}: phone_last4 형식 오류 (숫자 4자리 필요)`);
    continue;
}
```

- 수동 추가 폼: `maxlength="4"`, `pattern="[0-9]{4}"` → 4자리 초과 입력 불가
- CSV 파싱: `\d{4}` 정규식 검사 → 전체 번호가 들어오면 제외 처리

---

## 7. 호텔 HR로부터 명단 받는 절차

### 7.1 수령 방법

1. **이메일 수신**: 라마다 대전점 HR 담당자로부터 CSV 파일 수령
2. **파일 검토**: 수령 CSV에 전화번호 전체가 포함된 경우 → **운영자가 직접 뒤 4자리만 추출 후 업로드**
3. **업로드**: admin 페이지 → 임직원 명단 → CSV 업로드

### 7.2 CSV 변환 안내 (HR 담당자용)

HR에서 전달할 CSV 양식 예시 (아세로짐 측이 배포):

```
staff_no,name,phone_last4,department,is_vip
```

> 전화번호 전체를 제공하지 말 것. 뒤 4자리만 제공.  
> 예: 010-1234-5678 → `5678`

### 7.3 갱신 주기

- 신규 임직원 입사 시 수동 추가 또는 CSV 일괄 업로드
- 퇴직/이직 시 admin에서 비활성 처리 (`is_active = false`)
  - 비활성 처리 즉시 `/verify-staff` 인증 거부됨
- 정기 갱신: 분기 1회 HR로부터 전체 명단 재수령 후 교차 검증 권장

### 7.4 명단 보안 관리

- 임직원 명단이 포함된 CSV 파일은 전달 후 즉시 삭제 권장
- admin 계정은 마스터 또는 해당 단지 admin으로 접근 제한
- DB 내 `hotel_staff` 테이블은 Supabase RLS로 서비스 롤(service_role)만 접근 가능

---

## 8. 액션 버튼 4개 명세

| 버튼 | 기능 | 세부 동작 |
|---|---|---|
| 수동 추가 | 1건 INSERT | 모달 폼 → 유효성 검사 → `POST /api/hotel/staff` |
| CSV 업로드 | 다건 INSERT | 파일 선택(or 드래그앤드롭) → 파싱 → 미리보기 → `POST /api/hotel/staff/bulk` |
| CSV 다운로드 | 현재 명단 export | 클라이언트에서 Blob 생성 → `.csv` 파일 다운로드 (서버 요청 없음) |
| 검색 | 사번/이름 필터 | 350ms debounce → `GET /api/hotel/staff?search=` |

---

## 9. 테이블 컬럼 명세

| 컬럼 | 헤더명 | 내용 |
|---|---|---|
| `staff_no` | 사번 | `<code>` 태그로 모노스페이스 표시 |
| `name` | 이름 | 일반 텍스트 |
| `phone_last4` | 휴대폰 뒤 4자리 | `···· XXXX` 마스킹 형태 표시 |
| `department` | 부서 | 없으면 `—` |
| `is_vip` | VIP | VIP 배지(노랑) / 일반 배지(회색) |
| `is_active` | 활성 | 활성(초록) / 비활성(빨강) 토글 버튼 — 클릭 즉시 전환 |
| `created_at` | 등록일 | `YYYY.MM.DD` 형태 |
| (액션) | — | 삭제 버튼 (휴지통 아이콘) |

---

## 10. API 엔드포인트 명세 (서버 연동 가이드)

> ⚠️ `server/routes/hotel/staff-roster.js` 미생성 상태 (server/ 수정 금지 원칙).  
> 운영자 또는 백엔드 담당자가 아래 명세로 구현 후 `server/index.js`에 마운트한다.

### 10.1 목록 조회

```
GET /api/hotel/staff?complex_id=<UUID>&search=<string>&limit=500
```

응답:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "complex_id": "uuid",
      "staff_no": "EMP001",
      "name": "홍길동",
      "phone_last4": "1234",
      "department": "프론트",
      "is_vip": false,
      "is_active": true,
      "created_at": "2026-06-07T00:00:00+09:00"
    }
  ]
}
```

### 10.2 1건 등록

```
POST /api/hotel/staff
Body: { complex_id, staff_no, name, phone_last4, department?, is_vip? }
```

응답 200 / 409 (중복 사번)

### 10.3 PATCH (활성/비활성 토글)

```
PATCH /api/hotel/staff/:id
Body: { is_active: boolean }
```

### 10.4 1건 삭제

```
DELETE /api/hotel/staff/:id
```

### 10.5 일괄 등록

```
POST /api/hotel/staff/bulk
Body: {
  complex_id: "UUID",
  records: [
    { staff_no, name, phone_last4, department?, is_vip? },
    ...
  ]
}
```

응답:
```json
{
  "success": true,
  "inserted": 45,
  "skipped": 2,
  "duplicates": [
    { "staff_no": "EMP001", "name": "홍길동" }
  ]
}
```

중복 행은 INSERT 시도 후 `ON CONFLICT DO NOTHING` 처리 권장.

---

## 11. CSS 격리 설계 (`hotel-staff-roster.css`)

```
admin/css/
├── admin.css              ← 기존 (절대 수정 금지)
├── hotel-dashboard.css    ← D-1 (절대 수정 금지)
└── hotel-staff-roster.css ← D-2 신규
```

- 클래스 네임스페이스 `.sr-*` — admin.css, hotel-dashboard.css와 충돌 없음
- CSS 변수 `--sr-*` — `--color-primary` 등 타 파일 변수 일절 참조 없음

---

## 12. 완료 체크리스트

| 항목 | 결과 |
|---|---|
| 기존 admin 파일 수정 0건 | ✅ |
| D-1 결과물(hotel-dashboard.*) 수정 0건 | ✅ |
| 휴대폰 전체 번호 수집 0건 | ✅ (`phone_last4` 4자리만, `\d{4}` 검증) |
| `venue_type='hotel'` 클라이언트 필터 | ✅ |
| Feature Flag 가드 (API 실패 → 안내 화면) | ✅ (`_flagOffHtml()`) |
| VIP 등급 외 별도 등급 시스템 없음 | ✅ (`is_vip` boolean만) |
| 출입 로그 / 혼잡도 컬럼 추가 없음 | ✅ |
| CSS 독립 격리 (`.sr-*`, `--sr-*`) | ✅ |
| CSV 드래그앤드롭 스타일 포함 | ✅ |
| 중복 사번 건너뜀 + 운영자 고지 | ✅ |
| XSS 방어 (`_e()` 전역 적용) | ✅ |
