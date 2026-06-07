# D-1 호텔 운영 대시보드 설계 문서

> **단계**: D-1 · **작성일**: 2026-06-07  
> **대상**: 관리자(운영진) 전용 · **격리 원칙**: `venue_type='hotel'` 단지에서만 데이터 조회

---

## 1. 개요

아세로짐 호텔 모드(라마다 대전점 등) 운영자를 위한 관리자 페이지다.  
기존 admin 대시보드(`admin/js/pages/dashboard.js`)를 수정하지 않고, **독립 페이지 객체 `hotelDashboard`** 로 격리 구현했다.

### 진입 경로

```
admin/index.html 사이드바 메뉴
  └─ onclick="navigate('hotel-dashboard')"
       └─ hotelDashboard.render()   ← D-1 진입점
```

> **admin-app.js 수정 금지** 원칙에 따라, `navigate()` 케이스 추가는 운영자가 수동으로 반영하거나  
> admin-app.js 담당팀에 별도 요청한다. hotel-dashboard.js 하단 주석에 연동 가이드를 삽입해 두었다.

---

## 2. 파일 목록 (D-1 신규 생성)

| 파일 | 설명 | 상태 |
|---|---|---|
| `admin/js/pages/hotel-dashboard.js` | 페이지 로직 (`hotelDashboard` 객체) | ✅ 생성 |
| `admin/css/hotel-dashboard.css` | 전용 스타일 (`.hd-*` 네임스페이스) | ✅ 생성 |
| `docs/ops/D1-HOTEL-DASHBOARD.md` | 본 설계 문서 | ✅ 생성 |

**수정한 기존 파일**: **0개** (모든 기존 admin 파일 미수정)

---

## 3. 위젯 6개 명세

### W-1 오늘의 PT 예약 수

| 항목 | 내용 |
|---|---|
| **표시 정보** | 오늘 날짜(`YYYY-MM-DD`) 기준 확정된 리프레시 PT 신청 건수 |
| **카드 색상** | Blue (`--hd-kpi-blue`) |
| **데이터 소스** | `API.applications.list({ complexId, program_name:'리프레시 PT', status:'approved', dateFrom:today, dateTo:today })` |
| **집계 방식** | `response.data.length` |
| **갱신 주기** | 페이지 로드 + 새로고침 버튼 클릭 시 |
| **빈 상태** | `0` 그대로 표시 (이상 없음) |

### W-2 이번 주 무료 클래스 신청 수

| 항목 | 내용 |
|---|---|
| **표시 정보** | 이번 주 월요일 ~ 7일 후 사이 확정 신청 중 `program_name ≠ '리프레시 PT'` 건수 |
| **카드 색상** | Green (`--hd-kpi-green`) |
| **데이터 소스** | `API.applications.list({ complexId, status:'approved', dateFrom:weekStart, dateTo:day7After })` |
| **집계 방식** | `filter(a => a.program_name !== '리프레시 PT').length` |
| **설계 이유** | 무료 클래스(요가·필라테스·스트레칭 등)는 별도 program_name을 가지므로 PT를 제외한 건이 무료 클래스 합계가 됨 |

### W-3 이번 달 PT 매출 추정

| 항목 | 내용 |
|---|---|
| **표시 정보** | 이번 달 1일 ~ 오늘 사이 확정 리프레시 PT 건수 × ₩40,000 |
| **카드 색상** | Gold (`--hd-kpi-gold`) |
| **데이터 소스** | W-3·W-4·W-5 공용 쿼리(`allMonth`) — `API.applications.list({ complexId, status:'approved', dateFrom:monthStart, dateTo:today })` |
| **집계 방식** | `filter(a => a.program_name === '리프레시 PT').length × 40000` |
| **부제 표시** | `{N}건 × ₩40,000` |
| **설계 이유** | 직접 결제 API(`/payment`, `/settlement`) 미연동 상태이므로 PT 건수 × 단가(PT_BASE_PRICE=40,000)로 추정값 표시. 실제 정산과 차이가 있을 수 있음을 운영자에게 고지 |

### W-4 만료 임박 회원 수 (D-7 이내)

| 항목 | 내용 |
|---|---|
| **표시 정보** | 멤버십 만료일이 오늘~7일 후 사이인 승인 신청 건수 |
| **카드 색상** | Orange (건수 > 0) / Muted (건수 = 0) |
| **데이터 소스** | `API.applications.list({ complexId, status:'approved', expiryFrom:today, expiryTo:day7After })` |
| **집계 방식** | `response.data.length` |
| **경고 표시** | 건수 > 0일 때 부제에 `⚠ D-7 이내` 표시, 카드 오렌지 전환 |
| **0건 상태** | Muted 카드 + `D-7 이내 없음` 부제 |

### W-5 이번 달 신규 회원 수

| 항목 | 내용 |
|---|---|
| **표시 정보** | 이번 달 approved 신청 중 고유 `phone` 수 |
| **카드 색상** | Purple (`--hd-kpi-purple`) |
| **데이터 소스** | W-3 공용 쿼리(`allMonth`) 재사용 |
| **집계 방식** | `new Set(allMonth.map(a => a.phone).filter(Boolean)).size` |
| **설계 이유** | 별도 `/users` 또는 `/members` 집계 API 없으므로 이번 달 신청에 등장한 고유 전화번호 수로 근사값 산출 |

### W-6 다가오는 PT 예약 목록 (다음 7일)

| 항목 | 내용 |
|---|---|
| **표시 형태** | 테이블 (날짜 · 시각 · 이름 · 트레이너 · 상태) |
| **데이터 소스** | `API.applications.list({ complexId, program_name:'리프레시 PT', status:'approved', dateFrom:today, dateTo:day7After, limit:100 })` |
| **정렬** | `preferred_date + preferred_time` 오름차순 |
| **빈 상태** | `다음 7일 PT 예약 없음` 메시지 |
| **연결 링크** | 패널 우상단 "신청 관리에서 전체 보기 →" 버튼 → `navigate('applications')` |
| **⚠️ 절대 미포함** | 실시간 인원 수, 혼잡도, 현재 입장 인원 — 해당 컬럼 없음 |

---

## 4. 데이터 소스 매핑

```
엔드포인트              파라미터                          위젯
────────────────────── ──────────────────────────────── ─────────────
GET /api/complexes     (없음)                            단지 목록 조회
GET /api/applications  complexId + program_name='리프레시 PT'
                       + dateFrom/dateTo=today          W-1
GET /api/applications  complexId + dateFrom=weekStart
                       + dateTo=day7After               W-2 (PT 제외)
GET /api/applications  complexId + dateFrom=monthStart
                       + dateTo=today                   W-3, W-5 (공용)
GET /api/applications  complexId + expiryFrom=today
                       + expiryTo=day7After             W-4
GET /api/applications  complexId + program_name='리프레시 PT'
                       + dateFrom=today + dateTo=day7After W-6
```

> **API 클라이언트**: `admin/js/pages/hotel-dashboard.js`는 기존 `API.complexes.list()`, `API.applications.list()`를  
> 그대로 사용한다. 별도 호텔 전용 API 클라이언트를 추가하지 않는다.

---

## 5. venue_type='hotel' 격리 설계

```javascript
// hotel-dashboard.js _loadHotelComplexList() 내부
const all    = await API.complexes.list();
const hotels = all.filter(cx => cx.venue_type === 'hotel');
//                         ↑ 아파트·일반 단지 완전 배제
```

이후 모든 `API.applications.list()` 호출에 `complexId: this.selectedComplex.id`를 전달하여  
호텔 단지 ID로만 데이터를 조회한다. **다른 venue_type 데이터가 혼입되지 않는다.**

---

## 6. Feature Flag 가드 설계

서버의 `ENABLE_HOTEL_MODE` 환경변수를 클라이언트 JavaScript에서 직접 참조할 수 없다.  
대신 아래 두 경로로 처리한다.

| 시나리오 | 처리 방식 |
|---|---|
| `ENABLE_HOTEL_MODE=false` → 호텔 API가 404/403 반환 | `_flagOffHtml(errMsg)` 안내 화면 표시 |
| `venue_type='hotel'` 단지 0개 | `_noHotelHtml()` 안내 화면 표시 |
| API 정상 · 호텔 단지 1개 이상 | 단지 자동 선택 후 위젯 6개 로드 |

```javascript
// _loadHotelComplexList() — try/catch 패턴
try {
    const hotels = (await API.complexes.list()).data
        .filter(cx => cx.venue_type === 'hotel');
    if (!hotels.length) { wrap.innerHTML = this._noHotelHtml(); return; }
    // ... 위젯 로드
} catch (e) {
    wrap.innerHTML = this._flagOffHtml(e.message);  // Flag OFF 안내
}
```

---

## 7. 왜 실시간 인원 위젯을 만들지 않는가

### 7.1 고객 경험 원칙의 운영 데이터 적용

아세로짐 호텔 모드 설계 원칙 중 하나는 **"대기열·혼잡도·실시간 인원 표시 금지"** 다.  
이 원칙은 고객 향 화면(quick-class, refresh-pt, member)에만 적용되는 것이 아니라  
**운영자 향 대시보드에도 동일하게 적용**한다.

이유:

1. **데이터 미보유**: `complexes` 테이블, `applications` 테이블 모두 현재 입장 인원을 실시간으로 추적하는 컬럼이 없다.  
   출입 게이트 센서나 QR 체크인 시스템이 연동되지 않은 상태에서 표시하면 허수 데이터가 된다.

2. **오판 위험**: 부정확한 혼잡도 수치를 운영자가 신뢰하여 고객 안내에 활용할 경우 민원으로 이어진다.

3. **범위 과잉**: D-1 단계 목표는 **예약 집계 · 매출 추정 · 만료 임박 알림**이다.  
   실시간 인원은 별도 하드웨어 연동(D-n 이후 단계)이 필요한 기능으로, 현재 범위를 벗어난다.

4. **법적 리스크**: 호텔 투숙객 동선을 실시간으로 집계·표시하는 것은 개인정보처리방침 범위 검토가 필요하다.

### 7.2 대안: 집계 데이터만 표시

혼잡도 대신 **시간대별 예약 건수(W-6 테이블)**로 운영진이 피크 시간대를 판단하도록 설계했다.  
이는 정확한 확정 데이터 기반이며, 실시간 입장 인원 없이도 운영 계획 수립에 충분하다.

---

## 8. Promise.allSettled 병렬 로드 설계

```javascript
// _loadAllWidgets()
const [kpiResult, upcomingResult] = await Promise.allSettled([
    this._loadKpiWidgets(),   // W-1 ~ W-5
    this._loadUpcomingPt(),   // W-6
]);
```

`Promise.all` 대신 `Promise.allSettled`를 사용하는 이유:

- W-1~W-5 중 특정 API가 실패해도 W-6은 정상 표시된다.
- 위젯별 독립 실패 처리로, 전체 페이지 블랭크 대신 실패한 위젯만 오류 메시지를 표시한다.

---

## 9. CSS 격리 설계 (`hotel-dashboard.css`)

```
admin/css/
├── admin.css              ← 기존 (절대 수정 금지)
└── hotel-dashboard.css    ← D-1 신규 (완전 독립)
```

- 클래스 네임스페이스 `.hd-*` — admin.css 의 `.card`, `.btn`, `.table` 등과 충돌 없음
- CSS 변수 `--hd-*` — `--color-primary` 등 admin.css 변수 일절 참조하지 않음
- 혼잡도·실시간 인원 관련 스타일 **0개**

---

## 10. admin 화면에서 접근하는 방법

### 10.1 현재 (운영자 수동 연동 필요)

`admin/index.html` 사이드바에 항목 추가:

```html
<li data-page="hotel-dashboard" onclick="navigate('hotel-dashboard')">
    <i class="fas fa-hotel"></i> <span>호텔 대시보드</span>
</li>
```

`admin/index.html` `<head>` 또는 스크립트 로드 영역에 추가:

```html
<link rel="stylesheet" href="css/hotel-dashboard.css">
<script src="js/pages/hotel-dashboard.js"></script>
```

`admin/js/admin-app.js` 의 `navigate()` switch 문에 케이스 추가:

```javascript
case 'hotel-dashboard':
    hotelDashboard.render();
    break;
```

> **주의**: admin-app.js 수정은 admin 담당팀과 협의 후 진행한다.  
> 파일 수정이 배포 제약에 걸리는 경우, admin/index.html 내 인라인 스크립트로 navigate() 를 오버라이드해도 된다.

### 10.2 URL 직접 접근 (개발·테스트)

```
http://localhost:PORT/admin/index.html#hotel-dashboard
```

---

## 11. 스켈레톤 로딩 UX

데이터 도착 전 shimmer 애니메이션 카드 5개를 즉시 표시한다.

```
페이지 로드
  → render() → _skeletonHtml() 삽입 (shimmer 5장 즉시 표시)
  → _loadHotelComplexList() (async)
      → 단지 없음 → _noHotelHtml()
      → API 오류  → _flagOffHtml()
      → 정상      → _mainLayoutHtml() + _kpiSkeletonHtml()
                    → _loadAllWidgets() (Promise.allSettled)
                        → 실제 KPI 카드 교체
```

---

## 12. XSS 방어

모든 서버 응답 문자열은 `_esc()` (escapeHtml)를 통해 HTML 인코딩 후 삽입한다.

```javascript
_esc(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

템플릿 리터럴 내 모든 동적 값: `${this._esc(item.name)}` 형태로 적용.

---

## 13. 완료 체크리스트

| 항목 | 결과 |
|---|---|
| 기존 admin 파일 수정 0건 | ✅ |
| 혼잡도 위젯 0개 | ✅ |
| 실시간 인원 위젯 0개 | ✅ |
| `venue_type='hotel'` 클라이언트 필터 | ✅ (`filter(cx => cx.venue_type === 'hotel')`) |
| Feature Flag 가드 (API 실패 → 안내 화면) | ✅ (`_flagOffHtml()`) |
| Promise.allSettled 병렬 로드 | ✅ |
| 스켈레톤 shimmer | ✅ |
| XSS 방어 (`_esc()`) | ✅ |
| CSS 독립 격리 (`.hd-*`, `--hd-*`) | ✅ |
| admin.css CSS 변수 참조 없음 | ✅ |
