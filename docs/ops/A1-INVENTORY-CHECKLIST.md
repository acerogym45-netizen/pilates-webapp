# A-1 인벤토리 체크리스트
## 아세로짐 라마다호텔점 QR 시스템 — 신규 개발 전 현황 기록

> **목적**: 호텔 모드 개발 착수 전, 기존 시스템의 정확한 상태를 기록하여
> 기존 단지(아파트) 기능이 변경되지 않았음을 언제든 교차 검증할 수 있게 한다.
>
> **작성 시점**: 2026-06-07
> **단계**: A-1 (기존 시스템 인벤토리 확보)
> **작성자**: __________________ / 확인자: __________________
> **인벤토리 수집 완료**: 2026-06-07 (Supabase SQL Editor 직접 실행)

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

| # | 단지명 | complex code | is_active | share_timeslot_capacity | 신청 건수 | 비고 |
|---|---|---|---|---|---|---|
| 1 | 청주SK뷰자이 | `apt-cjxi` | true | — | 212건 | 실사용 중 |
| 2 | 소사벌 중흥 S클래스 | `apt-sclass` | true | true | 82건 | 실사용 중. 8회/24회 등 복수 프로그램이 같은 요일·시간대 공유 |
| 3 | 아세로짐 라마다점 | `ht-lamada` | true | — | 0건 | **⚠️ 이미 DB에 존재** — A-2 시드는 INSERT가 아니라 UPDATE로 진행 |
| 4 | 테스트 | `test-sk` | **false** | — | 2건 | 테스트 전용, 비활성 |

---

## 3. DB 테이블 현황

> SQL 실행 도구: `scripts/sql/inventory_row_counts.sql`

| 테이블명 | 역할 | Row 수 (기록일: 2026-06-07) | 비고 |
|---|---|---|---|
| `complexes` | 단지 정보 | **4** | |
| `programs` | 프로그램 정보 | **22** | |
| `instructors` | 강사 정보 | **4** | |
| `applications` | 신청(계약) 내역 | **296** | 상태별 내역은 아래 §3-1 참조 |
| `cancellations` | 해지 신청 내역 | **85** | |
| `notices` | 공지사항 | **8** | |
| `inquiries` | 문의 내역 | **58** | |
| `curricula` | 커리큘럼 | **1** | |
| `complex_apply_settings` | 단지별 신청 타입 기간 설정 | **11** | |

### §3-1. applications 상태별 집계 (2026-06-07 기준)

| status | 건수 |
|---|---|
| `approved` | 183 |
| `cancelled` | 66 |
| `rejected` | 29 |
| `waiting` | 17 |
| `transferred` | 1 |
| **합계** | **296** |

### §3-2. program_id NULL 레코드 현황

| 구분 | 건수 | 비고 |
|---|---|---|
| `program_id = NULL` | **158** | 구형 데이터. `nameToId` 역매핑으로 처리 중 |
| `program_id = 유효값` | **138** | 정상 레코드 |
| 합계 | 296 | |

> ⚠️ NULL 비율이 53%로 높음. 향후 신규 단지(호텔) 데이터는 반드시 `program_id` 를 설정하여 입력할 것.

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

## 4-1. README 미문서화 자산 (신규 발견 테이블)

> **발견 경위**: `schema_snapshot.sql` [1] 전체 테이블 목록 실행 결과
> `supabase-setup.sql` 및 기존 문서에 기재되지 않은 테이블 3개 확인.
> 기존 단지 운영에 영향을 주는지 반드시 파악 후 호텔 모드 개발 진행 필요.

| 테이블명 | table_type | 추정 역할 | 확인 필요 사항 |
|---|---|---|---|
| `application_backups` | BASE TABLE | 신청 데이터 백업 스냅샷 | Row 수 / 마지막 갱신 시점 / 백업 주체(Cron?) 확인 |
| `db_backups` | BASE TABLE | DB 전체 백업 메타 기록 | Row 수 / 스키마 확인 |
| `renewal_payments` | BASE TABLE | 수강 갱신 결제 내역 | `renewal-cron.js` 와 연동 여부 / Row 수 확인 |

> **조치**: 위 3개 테이블은 A-2 착수 전에 `SELECT COUNT(*), MAX(created_at) FROM <table>` 을 실행하여
> 현재 사용 현황을 파악하고 이 표를 업데이트한다.

---

## 5. 주요 스키마 메모

> 인벤토리 수집 과정에서 확인된 스키마 특이사항. 호텔 모드 개발 시 충돌 가능성 사전 인지용.

### `complexes` 테이블 — 기능 플래그 컬럼

| 컬럼명 | 용도 | 호텔 모드 관련성 |
|---|---|---|
| `payment_mode` | 결제 방식 | 확인 필요 |
| `share_timeslot_capacity` | 같은 요일 프로그램 정원 합산 | 중흥S클래스 전용, 호텔은 별도 설정 |
| `show_inquiry` | 문의 탭 표시 여부 | 호텔용으로 재활용 가능 |
| `show_cancel_tab` | 해지 탭 표시 여부 | 호텔 모드에서는 비활성 예정 |
| `schedule_mode` | 스케줄 표시 방식 | 확인 필요 |
| `sms_enabled` | 단지별 SMS 발송 on/off | 호텔 모드에서 별도 설정 |

### `applications` 테이블 — 컬럼 수 및 주요 컬럼 그룹

- **총 컬럼 수**: 41개
- `renewal_*` 그룹: 수강 갱신 관련
- `lesson_*` 그룹: 레슨 횟수 관련
- `instructor_*` 그룹: 담당 강사 관련
- `transfer_*` 그룹: 양도/양수 관련

> 호텔 모드 신청 레코드 생성 시, 불필요한 컬럼은 NULL/기본값으로 두고 진행.

### `programs` 테이블 — type CHECK 제약

```sql
CHECK (type IN ('group', 'duet', 'personal'))
```

> 호텔 모드에서 새로운 프로그램 타입이 필요한 경우, ALTER TABLE로 CHECK 제약 수정 필요.
> 단, 이는 기존 단지 스키마 공유이므로 기존 데이터에 영향 없는지 반드시 검토.

---

## 6. 핵심 파일 체크섬 (변경 감지용)

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

| 파일 | SHA-256 (A-1 기준, 2026-06-07) | SHA-256 (다음 단계 완료 후) | 일치 여부 |
|---|---|---|---|
| `server/routes/applications.js` | | | |
| `server/routes/complexes.js` | | | |
| `server/routes/programs.js` | | | |
| `server/utils/waiting.js` | | | |
| `server/index.js` | | | |
| `js/main.js` | | | |
| `admin/js/pages/applications.js` | | | |

---

## 7. 기능 동작 확인 (스모크 테스트)

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

## 8. 금지 사항 재확인

이 체크리스트를 작성하는 시점에 아래 사항을 재확인한다.

- [ ] 호텔 모드 기능 코드가 기존 `server/`, `public/`, `admin/` 에 섞이지 않았음
- [ ] check-in / 혼잡도 / 인원카운트 관련 파일이 없음
- [ ] 기존 DB 스키마(테이블/컬럼 삭제, 타입 변경)가 없음
- [ ] 기존 Cron 스케줄이 변경되지 않았음

---

*이 문서는 A-1 단계에서 1회 작성 후, 각 개발 단계(A-2, A-3 …) 착수 시마다 §6(체크섬)·§7(스모크 테스트) 항목을 갱신한다.*
*§4-1(미문서화 자산) 표의 Row 수·마지막 갱신 시점은 A-2 착수 전에 채운다.*
