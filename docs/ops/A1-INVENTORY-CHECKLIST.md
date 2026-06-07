# A-1 인벤토리 체크리스트
## 아세로짐 라마다호텔점 QR 시스템 — 신규 개발 전 현황 기록

> **목적**: 호텔 모드 개발 착수 전, 기존 시스템의 정확한 상태를 기록하여
> 기존 단지(아파트) 기능이 변경되지 않았음을 언제든 교차 검증할 수 있게 한다.
>
> **작성 시점**: 2026-06-07
> **단계**: A-1 (기존 시스템 인벤토리 확보)
> **작성자**: __________________ / 확인자: __________________

---

## 1. 인프라 현황

### 1-1. Supabase
| 항목 | 값 | 확인일 |
|---|---|---|
| 프로젝트 URL | `https://____________.supabase.co` | |
| 프로젝트 ID | | |
| Region | | |
| DB 버전 (PostgreSQL) | | |
| 무료/유료 플랜 | | |
| 일일 API 요청 한도 | | |
| Storage 사용량 | | |

### 1-2. Vercel
| 항목 | 값 | 확인일 |
|---|---|---|
| 프로젝트명 | `apartment-qr-system` | |
| Team / Account | | |
| 배포 URL (Production) | `https://____________.vercel.app` | |
| 마지막 배포 커밋 | `3d5dc38` | 2026-06-07 |
| Edge Functions 사용 여부 | 없음 (Node.js Functions만 사용) | |
| Cron Jobs | `/api/cron` (매일 UTC 21:00) / `/api/renewal-cron` (매일 UTC 00:00) | |

### 1-3. GitHub
| 항목 | 값 | 확인일 |
|---|---|---|
| Repository | `acerogym45-netizen/pilates-webapp` | |
| 기본 브랜치 | `main` | |
| 현재 최신 커밋 | `3d5dc38` | 2026-06-07 |
| Branch Protection | 설정 여부 기록: | |

---

## 2. 라이브 단지 현황

> **중요**: 아래 단지들은 현재 실사용 중이므로 코드 변경 시 반드시 영향도 사전 분석 필요.

| # | 단지명 | complex code | is_active | share_timeslot_capacity | 비고 |
|---|---|---|---|---|---|
| 1 | 중흥S클래스 | | true | true | 8회/24회 등 복수 프로그램이 같은 요일·시간대 공유 |
| 2 | (단지명 기입) | | | | |
| 3 | (단지명 기입) | | | | |

---

## 3. DB 테이블 현황

> SQL 실행 도구: `scripts/sql/inventory_row_counts.sql`

| 테이블명 | 역할 | Row 수 (기록일: ________) | 기록자 |
|---|---|---|---|
| `complexes` | 단지 정보 | | |
| `programs` | 프로그램 정보 | | |
| `instructors` | 강사 정보 | | |
| `applications` | 신청(계약) 내역 | | |
| `cancellations` | 해지 신청 내역 | | |
| `notices` | 공지사항 | | |
| `inquiries` | 문의 내역 | | |
| `curricula` | 커리큘럼 | | |
| `complex_apply_settings` | 단지별 신청 타입 기간 설정 | | |

---

## 4. 환경변수 Key 목록

> **규칙**: Key 이름만 기록. 실제 값은 절대 이 문서에 기재하지 말 것.
> 값 확인은 Vercel 대시보드 → Settings → Environment Variables 에서만.

### Vercel Production 환경변수
| Key | 필수/선택 | 용도 | 설정 여부 확인 |
|---|---|---|---|
| `SUPABASE_URL` | 필수 | Supabase 프로젝트 URL | ☐ |
| `SUPABASE_KEY` | 필수 | Supabase anon key | ☐ |
| `SUPABASE_SERVICE_ROLE_KEY` | 필수 | 서버 사이드 full-access key | ☐ |
| `SUPABASE_DB_PASSWORD` | 선택 | 직접 DB 접속용 | ☐ |
| `MASTER_PASSWORD` | 필수 | 마스터 관리자 비밀번호 | ☐ |
| `CRON_SECRET` | 필수 | Cron 엔드포인트 인증 | ☐ |
| `APP_BASE_URL` | 필수 | 서버 Base URL (SMS 링크 생성용) | ☐ |
| `BASE_URL` | 선택 | APP_BASE_URL fallback | ☐ |
| `SMS_ENABLED` | 선택 | SMS 발송 on/off (`true`/`false`) | ☐ |
| `SOLAPI_API_KEY` | SMS 사용 시 필수 | Solapi API Key | ☐ |
| `SOLAPI_API_SECRET` | SMS 사용 시 필수 | Solapi API Secret | ☐ |
| `SOLAPI_SENDER` | SMS 사용 시 필수 | SMS 발신번호 | ☐ |
| `UPLOAD_DIR` | 선택 | 파일 업로드 디렉토리 | ☐ |
| `TIMETABLE_DIR` | 선택 | 시간표 파일 디렉토리 | ☐ |
| `REFUND_DOC_DIR` | 선택 | 환불 서류 디렉토리 | ☐ |
| `TZ` | 선택 | 타임존 (`Asia/Seoul`) | ☐ |
| `PORT` | 선택 | 로컬 서버 포트 (기본 3000) | ☐ |

---

## 5. 핵심 파일 체크섬 (변경 감지용)

> **용도**: 호텔 모드 개발 기간 중 기존 파일이 의도치 않게 바뀌었는지 감지.
> 작업 착수 전 `sha256sum` 으로 기록하고, 작업 완료 후 재확인.

```bash
# 실행 명령
sha256sum \
  server/routes/applications.js \
  server/routes/complexes.js \
  server/routes/programs.js \
  server/utils/waiting.js \
  server/index.js \
  js/main.js \
  admin/js/pages/applications.js
```

| 파일 | SHA-256 (착수 전) | SHA-256 (완료 후) | 일치 여부 |
|---|---|---|---|
| `server/routes/applications.js` | | | |
| `server/routes/complexes.js` | | | |
| `server/routes/programs.js` | | | |
| `server/utils/waiting.js` | | | |
| `server/index.js` | | | |
| `js/main.js` | | | |
| `admin/js/pages/applications.js` | | | |

---

## 6. 기능 동작 확인 (스모크 테스트)

> 호텔 모드 개발 전후로 아래 항목을 직접 확인하여 기존 단지가 정상 작동하는지 검증.

| 테스트 항목 | 확인 방법 | 착수 전 | 완료 후 |
|---|---|---|---|
| 입주민 신청 페이지 접근 | `/?complex=<code>` 접속 | ☐ | ☐ |
| 프로그램 목록 표시 | 신청 화면에서 프로그램 카드 노출 | ☐ | ☐ |
| 신청 제출 (테스트 단지) | 테스트 단지에서 신청 완료 | ☐ | ☐ |
| 관리자 로그인 | `/admin-main.html?complex=<code>` | ☐ | ☐ |
| 신청 내역 조회 | 관리자 → 신청 목록 표시 | ☐ | ☐ |
| 시간대 변경 기능 | 입주민 페이지 → 내 신청 → 시간 변경 | ☐ | ☐ |
| 취소·변경 기간 설정 | 관리자 → 신청기간 설정 → 취소·변경 탭 | ☐ | ☐ |

---

## 7. 금지 사항 재확인

이 체크리스트를 작성하는 시점에 아래 사항을 재확인한다.

- [ ] 호텔 모드 기능 코드가 기존 `server/`, `public/`, `admin/` 에 섞이지 않았음
- [ ] check-in / 혼잡도 / 인원카운트 관련 파일이 없음
- [ ] 기존 DB 스키마(테이블/컬럼 삭제, 타입 변경)가 없음
- [ ] 기존 Cron 스케줄이 변경되지 않았음

---

*이 문서는 A-1 단계에서 1회 작성 후, 각 개발 단계(A-2, A-3 …) 착수 시마다 §5(체크섬)·§6(스모크 테스트) 항목을 갱신한다.*
