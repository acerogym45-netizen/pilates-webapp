# A-4 Feature Flag 운영 가이드
## 호텔 모드 기능 격리 시스템

> **목적**: 호텔 모드 기능을 환경변수 한 줄로 통째로 ON/OFF한다.
> 기존 아파트 단지는 어떤 Flag 조합에서도 영향받지 않는다.
>
> **구현 위치**: `server/config/feature-flags.js`
> **단계**: A-4 / **작성일**: 2026-06-07

---

## 1. Flag 목록

| 환경변수명 | 내부 key | 기본값 | 역할 |
|---|---|---|---|
| `ENABLE_HOTEL_MODE` | `hotelMode` | `false` | **마스터 스위치**. false이면 하위 Flag 전부 무효. 기존 아파트 단지에 영향 없음. |
| `ENABLE_HOTEL_QUICK_CLASS` | `hotelQuickClass` | `false` | 퀵클래스(당일 단회 수업) 기능 활성화 |
| `ENABLE_HOTEL_REFRESH_PT` | `hotelRefreshPt` | `false` | 리프레시 PT 패키지 기능 활성화 |
| `ENABLE_HOTEL_MEMBER_PAGE` | `hotelMemberPage` | `false` | 호텔 전용 회원 페이지 기능 활성화 |
| `ENABLE_HOTEL_STAFF_AUTH` | `hotelStaffAuth` | `false` | 직원 인증 기능 활성화 |
| `ENABLE_HOTEL_MEAL_ORDER` | `hotelMealOrder` | `false` | 식사 주문 연동 기능 활성화 |

### 마스터 스위치 동작 원칙

```
ENABLE_HOTEL_MODE=false → 나머지 Flag를 true로 설정해도 호텔 라우트 진입 불가
ENABLE_HOTEL_MODE=true  → 각 Flag 개별 값에 따라 기능 활성화
```

---

## 2. 코드에서 사용하는 방법

### 기본 패턴 (A-5 이후 호텔 전용 라우트에서만 사용)

```javascript
// server/routes/hotel-*.js (A-5 이후 생성될 파일)
const flags = require('../config/feature-flags');

router.get('/hotel/quick-class', async (req, res) => {
    // ① 마스터 스위치 + 단지 타입 동시 검증
    const complex = await getComplexById(req.query.complex_id);
    if (!flags.isHotelComplex(complex)) {
        return res.status(404).json({ success: false, error: '서비스를 찾을 수 없습니다' });
    }

    // ② 개별 기능 Flag 검증
    if (!flags.hotelQuickClass) {
        return res.status(404).json({ success: false, error: '서비스를 찾을 수 없습니다' });
    }

    // ③ 실제 기능 처리
    // ...
});
```

### isHotelComplex 헬퍼 동작

```javascript
const flags = require('../config/feature-flags');

// ENABLE_HOTEL_MODE=false 상태
flags.isHotelComplex({ venue_type: 'hotel' })     // → false (마스터 OFF)
flags.isHotelComplex({ venue_type: 'apartment' }) // → false

// ENABLE_HOTEL_MODE=true 상태
flags.isHotelComplex({ venue_type: 'hotel' })     // → true  ✅
flags.isHotelComplex({ venue_type: 'apartment' }) // → false (아파트 단지 보호)
flags.isHotelComplex(null)                        // → false (null 안전)
```

### 아파트 단지 기존 라우트는 이 파일을 require하지 않는다

```javascript
// server/routes/applications.js — 기존 코드 (변경 없음)
// feature-flags require 없음 → 호텔 Flag 값과 완전히 무관하게 동작
```

---

## 3. Flag ON 전환 절차

> 호텔 기능 준비 완료 후(A-5 이후) 아래 절차로 활성화한다.

### Step 1 — 개별 기능 검증 완료 확인

- [ ] 활성화할 기능의 코드가 staging에서 테스트 완료됨
- [ ] 기존 아파트 단지 스모크 테스트 통과 확인

### Step 2 — Vercel 환경변수 추가

```
Vercel 대시보드 → 프로젝트 선택
→ Settings → Environment Variables
→ Add New
   Key:   ENABLE_HOTEL_MODE
   Value: true
   Environment: Production (필요 시 Preview 포함)
→ Save
```

### Step 3 — Redeploy

```
Vercel 대시보드 → Deployments
→ 최신 배포 항목 오른쪽 ⋯ → Redeploy
→ 약 30~60초 후 완료
```

### Step 4 — 활성화 확인

```bash
# 호텔 전용 엔드포인트 응답 확인 (A-5 이후 생성될 라우트)
curl -s https://<your-domain>/api/hotel/status?complex=ht-lamada
# 200 OK이면 활성화 성공
```

---

## 4. OFF 즉시 차단 절차 (사고 발생 시 5분 내 무효화)

> 호텔 기능에서 장애 발생 시, 아래 절차로 5분 내에 완전 차단 가능하다.
> 기존 아파트 단지는 이 절차와 무관하게 정상 동작을 유지한다.

### ⚡ 긴급 차단 (가장 빠름, 약 1~2분)

```
1. Vercel 대시보드 → Settings → Environment Variables
2. ENABLE_HOTEL_MODE 항목 찾기
3. 값을 false 로 변경 → Save
4. Deployments → 최신 배포 ⋯ → Redeploy
5. 재배포 완료(~60초) 후 호텔 라우트 전체 차단 확인
```

### 차단 확인 방법

```bash
# 차단 후 호텔 엔드포인트가 404를 반환해야 정상
curl -s -o /dev/null -w "%{http_code}" \
    https://<your-domain>/api/hotel/status?complex=ht-lamada
# → 404 이면 차단 성공

# 기존 아파트 단지는 정상 응답 유지 확인
curl -s -o /dev/null -w "%{http_code}" \
    https://<your-domain>/api/applications?complex_id=<apt-cjxi-uuid>
# → 200 이면 기존 단지 정상
```

### 환경변수 삭제로 완전 제거 (더 강력한 차단)

```
Vercel → Settings → Environment Variables
→ ENABLE_HOTEL_MODE 항목 → Delete
→ 모든 호텔 Flag 항목 삭제
→ Redeploy
```
> 삭제 시 `toBool(undefined) = false` 이므로 코드 오류 없이 차단됨.

---

## 5. 운영 이력

| 날짜 | 작업 | Flag | 변경 전 | 변경 후 | 담당자 |
|---|---|---|---|---|---|
| 2026-06-07 | A-4 인프라 생성 | 전체 | — | false (기본값) | |
| | | | | | |

---

## 6. 주의 사항

- **Flag 추가 금지 범위**: check-in, 혼잡도, 인원카운트 관련 Flag는 이 시스템에 추가하지 않는다.
- **아파트 라우트 격리**: `server/routes/applications.js` 등 기존 라우트는 이 파일을 절대 require하지 않는다. 호텔 전용 라우트(A-5 이후)에서만 사용한다.
- **서버 재시작 필요**: Flag는 프로세스 시작 시 환경변수를 1회 읽어 고정된다. Vercel의 경우 Redeploy로 반영된다. 로컬 개발 환경에서는 서버 재시작 필요.

---

*이 문서는 새 Flag 추가 시 §1 표와 §5 이력을 갱신한다.*
