# A-1 롤백 런북 (Rollback Runbook)
## 기존 아파트 단지 시스템 장애 시 즉시 복구 절차

> **목적**: 호텔 모드 개발 중 기존 아파트 단지 시스템에 장애가 발생했을 때
> 최단 시간 내에 안정적인 상태로 되돌리기 위한 즉시 실행 가능한 절차.
>
> **단계**: A-1 / **작성일**: 2026-06-07
> **원칙**: 판단은 빠르게, 실행은 신중하게. 영향 범위를 먼저 확인한다.

---

## 0. 장애 판단 기준

아래 중 하나라도 해당하면 즉시 롤백을 검토한다.

| 증상 | 심각도 | 즉시 조치 |
|---|---|---|
| 입주민 신청 페이지 접근 불가 (5xx) | 🔴 Critical | 즉시 롤백 |
| 신청 제출 시 서버 오류 | 🔴 Critical | 즉시 롤백 |
| 기존 단지 데이터 조회 안 됨 | 🔴 Critical | 즉시 롤백 |
| 관리자 페이지 로그인 불가 | 🟠 High | 30분 이내 롤백 |
| 특정 기능만 오작동 (일부 API 오류) | 🟡 Medium | 원인 파악 후 결정 |
| 성능 저하 (느림, 타임아웃 증가) | 🟡 Medium | 모니터링 후 결정 |
| UI 표시 이상 (레이아웃, 텍스트) | 🟢 Low | 핫픽스 우선 검토 |

---

## 1. 코드 롤백 절차 (Vercel 배포 롤백)

### 방법 A — Vercel 대시보드 (가장 빠름, 권장)

```
1. https://vercel.com 로그인
2. apartment-qr-system 프로젝트 선택
3. Deployments 탭 클릭
4. 문제 발생 이전의 정상 배포 항목 찾기
   - 커밋 해시 참조: A1-INVENTORY-CHECKLIST.md §1-2 기록 또는 git log
5. 해당 배포 행 오른쪽 ⋯ 메뉴 → "Promote to Production" 클릭
6. 약 30~60초 후 배포 완료
7. 프로덕션 URL 접속하여 정상 동작 확인
```

### 방법 B — Git revert + 강제 재배포

```bash
# 1) 문제를 일으킨 커밋 확인
git log --oneline -10

# 2) 직전 안정 커밋으로 되돌리기 (revert: 이력 보존)
git revert <문제커밋해시> --no-edit

# 3) main에 push → Vercel 자동 재배포
git push origin main

# ※ 되돌릴 커밋이 여러 개인 경우
git revert <최신커밋>..<오래된커밋> --no-edit
git push origin main
```

### 방법 C — Git tag로 특정 버전 복원 (최후 수단)

```bash
# 1) 사전 생성한 안전 태그 확인
git tag -l "pre-hotel-*"

# 2) 해당 태그 시점으로 강제 되돌리기
# ⚠️ 이 이후 커밋은 모두 사라짐. 반드시 현재 상태를 별도 브랜치로 보존 후 실행
git checkout -b backup/before-rollback-$(date +%Y%m%d)
git push origin backup/before-rollback-$(date +%Y%m%d)

# 3) main을 태그 시점으로 리셋
git checkout main
git reset --hard pre-hotel-A1-20260607
git push origin main --force-with-lease
```

---

## 2. 배포 롤백 완료 후 확인 절차

```bash
# 1) 프로덕션 URL 헬스체크
curl -s https://<your-domain>/api/applications?complex_id=test | head -c 200

# 2) 기존 단지 접근 확인 (브라우저)
open "https://<your-domain>/?complex=<기존단지코드>"

# 3) 관리자 페이지 확인 (브라우저)
open "https://<your-domain>/admin-main.html?complex=<기존단지코드>"

# 4) 최신 배포 커밋 확인
curl -s https://<your-domain>/api/version 2>/dev/null || \
  git log --oneline -3
```

---

## 3. DB 복구 판단 기준

> **원칙**: DB 데이터 복구는 코드 롤백과 달리 **취소 불가**이므로
> 반드시 원인을 확인하고 신중하게 결정한다.

### DB 복구가 필요한 경우
- [ ] 코드 버그로 인해 `applications` 테이블 데이터가 잘못 변경됨
- [ ] 잘못된 SQL 마이그레이션 실행으로 컬럼/데이터 손상
- [ ] 다수 레코드의 `status` 값이 의도치 않게 변경됨

### DB 복구가 필요하지 않은 경우 (코드 롤백만으로 충분)
- [ ] 단순 API 오류 (데이터는 정상, 응답 코드만 틀림)
- [ ] UI 표시 오류 (서버/DB와 무관)
- [ ] 신규 기능 미작동 (기존 데이터 손상 없음)

### DB 복구 절차 (필요하다고 판단된 경우에만)

```
Step 1. 피해 범위 특정
  - 언제부터 문제가 시작됐는지 확인 (git log, Vercel deployment log)
  - 영향받은 테이블과 레코드 수 확인 (inventory_row_counts.sql 실행)

Step 2. Supabase Point-in-time Recovery 확인 (유료 플랜)
  - Supabase 대시보드 → Settings → Database → Backups
  - 유료 플랜: 특정 시점으로 DB 복원 가능
  - 무료 플랜: 자동 일 1회 백업 (최근 7일)

Step 3. CSV 백업으로 수동 복구 (무료 플랜 또는 세밀한 복구 필요 시)
  - backup_applications_YYYYMMDD.csv 파일 확인
  - 손상된 레코드만 특정하여 수동 UPDATE/INSERT
  - 전체 복원이 필요한 경우:
      Supabase Table Editor → Import CSV

Step 4. 복구 후 검증
  - inventory_row_counts.sql 재실행하여 row count 확인
  - 영향받은 단지의 신청 목록 관리자 화면에서 직접 확인
```

---

## 4. 장애 대응 연락 체계

| 역할 | 이름 | 연락처 | 대응 범위 |
|---|---|---|---|
| 시스템 담당자 | | | 코드 롤백, Vercel 조작 |
| Supabase 관리자 | | | DB 접근, 백업 복구 |
| 비상 연락처 (단지 관리소) | | | 현장 상황 확인 |

---

## 5. 롤백 이력 기록

| 날짜 | 장애 원인 | 롤백 방법 | 복구 소요 시간 | 담당자 | DB 복구 필요 여부 |
|---|---|---|---|---|---|
| | | | | | |

---

## 6. 호텔 모드 개발 시 추가 주의사항

> 호텔 단지 개발 중 기존 단지 장애가 발생했을 때를 대비한 사전 체크.

- [ ] 호텔 모드 코드는 별도 파일/디렉토리에만 존재하는가?
- [ ] 공유 미들웨어, 공유 유틸 함수를 변경하지 않았는가?
- [ ] 기존 단지의 `complex_id`에 영향을 주는 DB 변경이 없는가?
- [ ] 기존 Cron 스케줄이 변경되지 않았는가?

모든 항목이 ✅ 이면 기존 단지 장애 원인은 호텔 모드 개발과 무관할 가능성이 높다.
→ Vercel 인프라 장애, Supabase 서비스 장애 여부를 먼저 확인한다.

```bash
# Supabase 서비스 상태 확인
open "https://status.supabase.com"

# Vercel 서비스 상태 확인
open "https://www.vercel-status.com"
```

---

*이 런북은 실제 장애 대응 후 §5 이력을 갱신하고, 새로운 장애 패턴 발견 시 §0 판단 기준을 보완한다.*
