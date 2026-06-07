# C3-HOTEL-MEMBER-UI

아세로짐 라마다 대전점 — 회원 마이페이지 & 임직원 로그인 UI 설계 문서  
단계: **Phase C-3** / 작성일: 2026-06-07

---

## 1. 개요

C-3은 두 개의 서비스 페이지와 PWA 매니페스트를 구현합니다.

| 파일 | 역할 |
|---|---|
| `public/hotel/member.html` | 회원 마이페이지 (5개 카드, 토큰 기반 단일 화면) |
| `public/hotel/js/member.js` | 마이페이지 스크립트 (4개 API 연동) |
| `public/hotel/staff-login.html` | 라마다 임직원 전용 인증 + 할인 안내 |
| `public/hotel/js/staff-login.js` | 임직원 인증 스크립트 |
| `public/hotel/manifest.json` | PWA 웹 앱 매니페스트 |

---

## 2. 마이페이지 화면 구조

```
member.html
│
├─ [헤더]
│   ├─ ← 뒤로 버튼
│   ├─ "내 멤버십" 제목
│   └─ "{이름}님" 배지 (API 응답 후 갱신)
│
├─ [토큰 없음 안내 화면]  #noTokenScreen  (토큰 없을 때만 표시)
│   "카카오톡으로 받은 링크를 사용해 주세요"
│   → 자동 리다이렉트 없음, 처음 화면 링크만 제공
│
└─ [회원 정보 콘텐츠]  #memberContent  (토큰 있을 때만 표시)
    │
    ├─ [토큰 만료 임박 배너]  (D-7 이하일 때 표시)
    │   "N일 후 만료됩니다" + [갱신] 버튼
    │
    ├─ [카드 1] 다음 PT 예약
    │   ├─ 예약 있음: 날짜·시각 + [일정 변경] [예약 취소] 버튼
    │   └─ 없음: "예약이 없습니다" + [PT 예약하기] 링크
    │
    ├─ [카드 2] PT 잔여 횟수 + 게이지
    │   ├─ 잔여 횟수 숫자 (대형 폰트)
    │   ├─ 막대 게이지 (비율 0~100%, 색상: 20%↓=red, 50%↓=yellow, 이상=gold)
    │   └─ 만료일 YYYY.MM.DD + D-N 배지
    │
    ├─ [카드 3] 라마다 객실 10% 할인 코드
    │   ├─ 미발급: [할인 코드 발급받기] 버튼
    │   └─ 발급됨: ACRGYM-XXXXXX 코드 + 유효 기간 표시
    │
    ├─ [카드 4] 운동 리포트
    │   └─ 리포트 목록 (단계·날짜·PDF 다운로드 링크)
    │
    ├─ [카드 5] 다가오는 예약 목록
    │   └─ 예약 목록 (프로그램·일시·트레이너)
    │
    └─ [로그아웃] 버튼 (confirm 다이얼로그 후 localStorage 삭제)
```

---

## 3. 사용자 흐름 다이어그램

```
QR 스캔 or 카카오 링크 (?t=TOKEN)
  │
  ▼ landing.js: URL ?t= → localStorage['hotel_member_token'] 저장
  │
  ▼ [내 마이페이지] CTA 탭
member.html 진입
  │
  ├─ localStorage 토큰 없음
  │   → #noTokenScreen 표시
  │   → 안내: "카카오톡으로 받은 링크를 사용해 주세요"
  │   → 자동 리다이렉트 없음
  │
  └─ 토큰 있음
      │
      ▼ #memberContent 표시 (스켈레톤 상태)
      │
      ▼ GET /api/hotel/members/me?token=TOKEN
      │
      ├─ 401/만료 → #noTokenScreen 표시 (강제 리다이렉트 없음)
      │
      └─ 200 OK → { member: { name, membership, pt_status, benefits } }
          │
          ├─ 이름 배지 갱신
          ├─ 카드 1 (다음 PT) 렌더링
          ├─ 카드 2 (게이지) 렌더링
          ├─ 카드 3 (할인 코드) 버튼 상태 결정
          ├─ D-day ≤ 7 → 갱신 배너 표시
          │
          └─ 병렬 로드 (Promise.allSettled)
              ├─ GET /api/hotel/members/workout-reports → 카드 4
              └─ GET /api/hotel/members/next-reservations → 카드 5

[할인 코드 발급] 탭
  │
  ▼ POST /api/hotel/members/issue-room-discount { token }
  ├─ 200 → 코드 박스 표시 (ACRGYM-XXXXXX + 만료일)
  └─ 에러 → 에러 메시지 표시, 버튼 재활성화

[갱신] 탭 (만료 7일 이내 배너)
  │
  ▼ POST /api/hotel/members/refresh-token { token }
  ├─ 200 → new_token 저장, 배너 숨김, 성공 안내
  └─ 에러 → 에러 메시지, 버튼 재활성화

[로그아웃] 탭
  │
  ▼ confirm 다이얼로그
  ├─ 확인 → localStorage 삭제 → 안내 화면 표시
  └─ 취소 → 아무것도 안 함
```

---

## 4. 임직원 로그인 흐름

```
index.html 하단 텍스트 링크 → staff-login.html

staff-login.html 진입
  │
  ▼ 사번 + 전화 뒤 4자리 입력
  │   (두 필드 모두 입력 시 버튼 활성화)
  │
  ▼ [임직원 확인] 탭
  POST /api/hotel/auth/verify-staff
  {
    complex_code: 'ht-lamada',
    staff_no:     사번 입력값,
    phone_last4:  4자리 숫자
  }
  │
  ├─ 200 OK → { discount_rate:30, is_vip, complex_id }
  │   → #loginArea 숨김
  │   → #staffDoneScreen 표시
  │     (환영 카드 + 30% 할인 요금표 + 이용 안내 + PT 예약 바로가기)
  │   → 자동 리다이렉트 없음
  │
  ├─ 401 (정보 불일치) → 에러 메시지, 폼 유지
  ├─ 403 (비활성) → 에러 메시지
  └─ 기타 → 에러 메시지

[다른 사번으로 다시 확인] 탭 → 폼 초기화 후 로그인 영역 재표시
```

---

## 5. 토큰 라이프사이클

```
발급 (POST /api/hotel/auth/issue-member-token)
  │
  ▼ member_tokens 테이블 INSERT
  │   token: 32자리 hex
  │   expires_at: 발급 시각 + 30일
  │   discount_rate: 회원 등급 할인율
  │
  ▼ 카카오 메시지 or QR URL에 포함
  │   예) https://domain.com/hotel/index.html?t=TOKEN
  │       or https://domain.com/hotel/member.html?t=TOKEN
  │
  ▼ landing.js: ?t= 파라미터 → localStorage['hotel_member_token'] 저장
  │             URL에서 파라미터 제거 (history.replaceState)
  │
  ▼ 사용 중 (30일간)
  │   /me, /workout-reports, /next-reservations, /issue-room-discount 호출 시
  │   서버에서 last_accessed_at 업데이트 (fire-and-forget)
  │
  ├─ 만료 7일 전 → 갱신 배너 표시
  │     사용자가 [갱신] 탭 → POST /refresh-token
  │     → 기존 토큰 즉시 무효화 (expires_at=now)
  │     → 신규 토큰 30일 발급 → localStorage 갱신
  │
  └─ 만료 후
      → /me 호출 시 401 반환
      → 안내 화면 표시 (강제 리다이렉트 없음)
      → 재발급은 피트니스 센터 문의
```

---

## 6. "왜 토큰 1개로 전부 접근하는가" — 고객 경험 원칙

### 6-1. 설계 배경

호텔 투숙객은 **여행 중 처음 이용하는 서비스**입니다. 

- 별도 회원가입 폼 → 이탈 유발
- ID/비밀번호 인증 → 투숙 기간 내 기억 불가
- SMS 인증 → 해외 투숙객 수신 불가

**토큰 링크 1개로 모든 접근**을 허용함으로써:

1. **QR → 즉시 서비스 이용**: 피트니스 센터 입장, 클래스 신청, PT 예약 모두 토큰 1개로 처리
2. **카카오 메시지**: 프런트 직원이 회원권 등록 후 카카오 메시지로 개인 링크 전송 (1분 내)
3. **보안 수준**: 32자리 hex (128bit entropy) — URL 추측 불가능

### 6-2. 추가 인증을 강제하지 않는 이유

| 시나리오 | 강제 인증 방식의 문제 | 토큰 방식의 해결 |
|---|---|---|
| 첫 서비스 이용 | 가입 장벽 → 포기 | 링크 클릭만으로 즉시 이용 |
| 비밀번호 재설정 | "비밀번호가 뭐였지?" → 프런트 문의 | 프런트가 새 토큰 발급 (30초) |
| 공유 링크 위험 | 동일 | 만료 7일 이내 갱신 → 구 링크 즉시 무효화 |
| 해외 투숙객 | SMS 수신 불가 | 카카오 or QR로 전달 |

---

## 7. 임직원 페이지를 일반 회원과 격리한 이유

### 7-1. 경로 분리

| 구분 | 진입점 | 인증 방식 |
|---|---|---|
| 일반 투숙객 | `/hotel/index.html` → CTA 탭 | 토큰 링크 (카카오) |
| 회원 | `/hotel/member.html?t=TOKEN` | 토큰 |
| 임직원 | `/hotel/staff-login.html` | 사번 + 전화 뒤 4자리 |

### 7-2. 격리 이유

1. **할인 적용 방식 차이**: 임직원 30% vs. 회원 토큰 기반 혜택은 완전히 다른 흐름
2. **데이터 혼입 방지**: 임직원 인증 성공 시 회원 마이페이지 데이터에 접근하지 않음
3. **`noindex` 메타태그**: 임직원 페이지는 검색 엔진에 노출되지 않도록 처리
4. **Feature Flag**: `ENABLE_HOTEL_STAFF_AUTH=false` 유지 시 서버에서 403 반환

---

## 8. PWA 설정 명세

| 항목 | 값 |
|---|---|
| `name` | 아세로짐 라마다 대전점 |
| `short_name` | 아세로짐 |
| `start_url` | /hotel/ |
| `scope` | /hotel/ |
| `display` | standalone |
| `orientation` | portrait-primary |
| `theme_color` | `#1a2744` (라마다 네이비) |
| `background_color` | `#1a2744` |
| icons 192px | `/hotel/icons/icon-192.png` (placeholder — 추후 제작) |
| icons 512px | `/hotel/icons/icon-512.png` (placeholder — 추후 제작) |
| shortcuts 3개 | 무료 클래스 / PT 예약 / 내 멤버십 |

> **아이콘 제작 일정**: icons/ 폴더 및 실제 이미지 파일은 Phase C-4 이전에 별도 작업 필요.  
> 현재는 매니페스트만 생성하고 icons 경로는 placeholder로 지정.

---

## 9. 입력 필드 명세

### 9-1. 회원 마이페이지 (member.html)
입력 필드 없음. 모든 데이터는 토큰 → API 응답으로 표시.

### 9-2. 임직원 로그인 (staff-login.html)

| 필드 | ID | type | 검증 |
|---|---|---|---|
| 사번 | `inputStaffNo` | `text` | 1자 이상 |
| 휴대폰 뒤 4자리 | `inputPhoneLast4` | `tel` | `/^\d{4}$/` |

**POST body:**
```
complex_code: URL ?complex 파라미터 or 'ht-lamada'
staff_no:     inputStaffNo.value.trim()
phone_last4:  inputPhoneLast4.value.trim()
```

---

## 10. 절대 금지 항목 확인

| 항목 | 상태 |
|---|---|
| 다른 회원 정보 표시 | ❌ 없음 (본인 token → application_id 기반 조회) |
| 혼잡도/실시간 인원 표시 | ❌ 없음 |
| 추가 인증 강제 (토큰 외 재인증) | ❌ 없음 |
| 자동 리다이렉트 | ❌ 없음 (토큰 없어도 안내 화면만 표시) |
| 회원 가입 폼 | ❌ 없음 |
| 기존 public/index.html 수정 | ❌ 수정 없음 |
| 기존 public/css/ 수정 | ❌ 수정 없음 |
| C-1·C-2 결과물 수정 | ❌ 수정 없음 |
| server/ 수정 | ❌ 수정 없음 |
| admin/ 수정 | ❌ 수정 없음 |

---

*다음 단계: C-4 (icons 제작, 서버 라우팅 검증, 배포 준비)*
