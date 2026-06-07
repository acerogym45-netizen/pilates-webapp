# D-3: 회원 운동 리포트 작성 (Hotel Workout Reports)

> **단계**: D-3  
> **작성일**: 2026-06-07  
> **관련 Feature Flag**: `ENABLE_HOTEL_MEMBER_PAGE`  
> **영향 범위**: 신규 파일 4개 + `server/index.js` 1줄 추가 — 기존 파일 수정 없음

---

## 1. 개요

트레이너가 호텔 단지 회원의 **FMS(Functional Movement Screen) 7동작 점수**와 **인바디 측정 데이터**를 입력하여 운동 리포트를 생성하는 admin 전용 도구다.

작성된 리포트는 **회원 마이페이지(C-3)에서 자동으로 노출**된다. 별도 알림 발송은 없다.

---

## 2. 전체 워크플로우

```
트레이너 (admin 페이지)           DB                   회원 (마이페이지 C-3)
─────────────────────────────────────────────────────────────────────────
1. 단지 선택 (venue_type='hotel')
2. 회원 검색 (이름 / 전화 뒤 4자리)
3. 회원 선택 → 좌/우 분할 화면
   ├── 좌: 기존 리포트 목록 (phase 순)
   └── 우: 신규 입력 폼
4. FMS 7동작 점수 입력 (0~3점)
5. 인바디 데이터 입력 (선택)
6. 트레이너 코멘트 입력 (선택)
7. [저장] 버튼 클릭
   ─→ POST /api/hotel/workout-reports ──→ workout_reports INSERT
8. [PDF 생성] 버튼 클릭
   ─→ POST /api/hotel/workout-reports/:id/pdf-url
      (Phase 2까지는 placeholder URL 저장)                    ↓ 자동 노출
                                                    GET /hotel/members/workout-reports
                                                    응답에 포함 → 마이페이지에 리스트
```

---

## 3. FMS 7동작 점수 기준

| 동작 (영문)                  | 동작 (한글)         | 0점              | 1점                  | 2점              | 3점           |
|-----------------------------|--------------------|-----------------|--------------------|-----------------|---------------|
| Deep Squat                  | 딥 스쿼트           | 통증 있음         | 패턴 불가           | 보상 패턴 사용    | 정상 수행      |
| Hurdle Step                 | 허들 스텝           | 통증 있음         | 패턴 불가           | 보상 패턴 사용    | 정상 수행      |
| In-line Lunge               | 인라인 런지          | 통증 있음         | 패턴 불가           | 보상 패턴 사용    | 정상 수행      |
| Shoulder Mobility           | 어깨 유연성          | 통증 있음         | 패턴 불가           | 제한적 움직임     | 정상 수행      |
| Active SLR                  | 능동 하지 거상       | 통증 있음         | 패턴 불가           | 제한적 가동역     | 정상 수행      |
| Trunk Stability Push-up     | 몸통 안정성 푸쉬업   | 통증 있음         | 패턴 불가           | 무릎 지지 사용    | 정상 수행      |
| Rotary Stability            | 회전 안정성          | 통증 있음         | 패턴 불가           | 보상 패턴 사용    | 정상 수행      |

- **합계 범위**: 0~21점 (7동작 × 최대 3점)
- **합계 14점 미만**: 부상 위험군 — 운동 프로그램 수정 권장
- **부분 입력 허용**: 모든 동작을 입력하지 않아도 저장 가능
- **서버 검증**: 각 항목 0~3 정수 외 값은 HTTP 400 반환

### DB 저장 형식 (`fms_scores` JSONB)

```json
{
  "deep_squat":             2,
  "hurdle_step":            3,
  "inline_lunge":           2,
  "shoulder_mobility":      1,
  "active_slr":             2,
  "trunk_stability_pushup": 3,
  "rotary_stability":       2
}
```

---

## 4. 인바디 필드 명세

| 필드 키                | 한글명       | 단위   | 타입   | 필수여부 |
|-----------------------|-------------|------|--------|---------|
| `weight`              | 체중         | kg   | number | 선택     |
| `skeletal_muscle`     | 골격근량      | kg   | number | 선택     |
| `body_fat_pct`        | 체지방률      | %    | number | 선택     |
| `body_water`          | 체수분        | L    | number | 선택     |
| `bmi`                 | BMI          | —    | number | 선택     |
| `basal_metabolic_rate`| 기초대사량    | kcal | number | 선택     |

- **모든 필드 미입력 허용** — `inbody_data: null`로 저장
- **허용 필드 외 키는 서버에서 자동 제거** (`sanitizeInbodyData`)
- **음수·비정수 차단**: 서버에서 `isFinite(val)` 검증

### DB 저장 형식 (`inbody_data` JSONB)

```json
{
  "weight": 72.5,
  "skeletal_muscle": 32.1,
  "body_fat_pct": 18.3,
  "body_water": 41.2,
  "bmi": 23.8,
  "basal_metabolic_rate": 1680
}
```

---

## 5. API 엔드포인트 명세

모든 엔드포인트는 `flags.hotelMemberPage`가 `false`이면 **HTTP 403** 반환.

| 메서드  | 경로                             | 설명                        |
|--------|----------------------------------|---------------------------|
| GET    | `/api/hotel/workout-reports`      | 회원 리포트 목록 조회          |
| GET    | `/api/hotel/workout-reports/:id`  | 단일 리포트 상세 조회          |
| POST   | `/api/hotel/workout-reports`      | 신규 리포트 등록              |
| POST   | `/api/hotel/workout-reports/:id/pdf-url` | PDF URL 생성 (Phase 2 placeholder) |

### GET `/api/hotel/workout-reports`

**Query**: `application_id` (UUID, 필수)

**Response 200**:
```json
{
  "success": true,
  "reports": [
    {
      "id": "uuid",
      "phase": 1,
      "fms_scores": { "deep_squat": 2, "..." : 3 },
      "inbody_data": { "weight": 72.5, "..." : 0 },
      "trainer_comment": "코멘트",
      "pdf_url": null,
      "created_at": "2026-06-07T10:00:00Z"
    }
  ]
}
```

### POST `/api/hotel/workout-reports`

**Body**:
```json
{
  "application_id": "uuid",
  "phase": 1,
  "fms_scores": { "deep_squat": 2 },
  "inbody_data": { "weight": 72.5 },
  "trainer_comment": "자유 텍스트 (최대 2,000자)"
}
```

**Response 201**:
```json
{ "success": true, "id": "새 리포트 UUID" }
```

**검증 오류 400 예시**:
```json
{ "success": false, "error": "fms_scores.deep_squat 값이 유효하지 않습니다: 4. 0~3 정수만 허용됩니다" }
```

### POST `/api/hotel/workout-reports/:id/pdf-url`

**Response 200**:
```json
{
  "success": true,
  "pdf_url": "https://placeholder.example.com/workout-reports/{id}/report-phase1.pdf"
}
```

> ⚠️ Phase 2에서 WeasyPrint 또는 Puppeteer 기반 실제 PDF 생성으로 교체 예정

---

## 6. 서버 검증 체계

### venue_type='hotel' 이중 검증

```
클라이언트:  API.complexes.list() → filter(cx => cx.venue_type === 'hotel')
서버:        application_id → applications → complex_id → complexes.venue_type === 'hotel'
```

- **클라이언트 필터 우회 시**에도 서버에서 반드시 거부
- `resolveHotelApplicationById(sb, applicationId, res)` 유틸이 모든 엔드포인트에서 실행

### FMS 점수 검증 흐름

```
validateFmsScores(fmsScores, res)
  ├── null/undefined → 통과 (미입력 허용)
  ├── 배열 or 비객체 → 400
  ├── 허용 키 외 키 발견 → 400
  └── 각 값이 0~3 정수가 아닌 경우 → 400
```

---

## 7. CSS 네임스페이스 격리

| 단계  | 접두사   | 파일                              |
|------|---------|----------------------------------|
| D-1  | `.hd-*` | `admin/css/hotel-dashboard.css`   |
| D-2  | `.sr-*` | `admin/css/hotel-staff-roster.css`|
| D-3  | `.wr-*` | `admin/css/hotel-workout-reports.css` |

- `--wr-*` 독립 CSS 변수 사용 — `admin.css`의 `--color-*` 참조 없음
- FMS 점수별 색상: `--wr-fms-0` (빨강) ~ `--wr-fms-3` (초록)

---

## 8. 왜 회원에게 별도 알림을 강제하지 않는가

### 원칙: 고객 경험 최소 간섭

리포트가 작성되는 즉시 알림톡이나 푸시를 전송하면 다음 문제가 발생한다:

1. **회원 피로도**: 운동 직후 알림을 받으면 부담감으로 작용할 수 있음
2. **개인정보 처리**: 별도 알림 전송 시 개인정보처리방침에 마케팅 정보 수신 동의 항목을 명시해야 하는 법적 절차 추가
3. **트레이너 운영 유연성**: 리포트를 초안 상태로 저장해 두고 수정 후 최종 제출하는 시나리오에서 즉시 알림이 부적절
4. **마이페이지 자동 노출로 충분**: 회원이 앱/마이페이지를 열면 최신 리포트가 즉시 보임 — 별도 알림 없이도 열람 가능

### 설계 결론

- 리포트 저장 시 `workout_reports` 테이블에 INSERT만 수행
- 마이페이지(C-3)의 `GET /hotel/members/workout-reports`가 자동으로 최신 리포트를 반환
- 알림 발송이 필요하다면 Phase 2에서 별도 알림 토글 옵션 추가 예정 (강제 아님)

---

## 9. Feature Flag 가드

```
ENABLE_HOTEL_MEMBER_PAGE=true  → 전 엔드포인트 정상 동작
ENABLE_HOTEL_MEMBER_PAGE=false → HTTP 403 { success: false, error: '...(ENABLE_HOTEL_MEMBER_PAGE)' }
```

**4개 엔드포인트 모두 첫 줄**:
```javascript
if (!flags.hotelMemberPage) return flagOff(res, 'ENABLE_HOTEL_MEMBER_PAGE');
```

클라이언트는 403 응답 수신 시 `_flagOffHtml(e.message)` 안내 화면으로 전환.

---

## 10. 기존 파일 영향 없음 확인

| 파일                              | 상태          | 비고 |
|----------------------------------|--------------|------|
| `admin/index.html`               | 미수정        | 운영자 연동 가이드 참조 |
| `admin/css/admin.css`            | 미수정        | CSS 격리 완료 |
| `admin/js/admin-app.js`          | 미수정        | 운영자 연동 가이드 참조 |
| `admin/js/api.js`                | 미수정        | hotel fetch는 `_api()` 직접 구현 |
| 기존 `admin/js/pages/*.js`       | 미수정        | 독립 파일 신규 생성만 |
| `server/routes/hotel/members.js` | 미수정        | workout_reports 조회 경로 공존 |
| `server/index.js`                | 1줄 추가만    | hotelMode 블록 내 마운트 1줄 |

---

## 11. 운영자 연동 체크리스트

- [ ] `server/.env`에 `ENABLE_HOTEL_MEMBER_PAGE=true` 설정
- [ ] `admin/index.html` `<head>`에 CSS 추가:
  ```html
  <link rel="stylesheet" href="css/hotel-workout-reports.css" />
  ```
- [ ] `admin/index.html` `<body>`에 컨테이너 추가:
  ```html
  <div id="wr-root"></div>
  ```
- [ ] `admin/index.html` 사이드바에 메뉴 추가:
  ```html
  <li><a href="#" onclick="navigate('hotel-workout-reports')">🏋️ 운동 리포트</a></li>
  ```
- [ ] `admin/js/admin-app.js` `pageMap`에 항목 추가:
  ```javascript
  'hotel-workout-reports': hotelWorkoutReports,
  ```
- [ ] `admin/index.html` 스크립트 로드 추가:
  ```html
  <script src="js/pages/hotel-workout-reports.js"></script>
  ```

---

## 12. Phase 2 계획 (참고)

| 항목                       | 현재 (D-3)               | Phase 2                         |
|---------------------------|--------------------------|--------------------------------|
| PDF 생성                  | placeholder URL 반환      | WeasyPrint / Puppeteer 서버 렌더  |
| 알림 발송                 | 없음                     | 트레이너 선택적 알림톡 전송 (선택) |
| 리포트 수정 기능           | 없음                     | PUT /:id 엔드포인트 추가          |
| FMS 추이 차트              | 없음                     | phase별 꺾은선 그래프             |
