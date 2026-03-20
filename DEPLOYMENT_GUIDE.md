# 🚀 최종 배포 가이드

프로젝트가 완전히 준비되었습니다!

## ✅ 현재 상태

- ✅ Express.js 서버 완성
- ✅ SQLite 데이터베이스 포함
- ✅ Vercel 설정 완료
- ✅ Git 리포지토리 연결: https://github.com/acerogym45-netizen/pilates-webapp

## 🎯 배포 방법 (2가지 옵션)

---

### 옵션 1: 간단한 방법 (권장) ⭐

#### 1단계: GitHub OAuth 토큰 설정

1. **GitHub 토큰 생성**: https://github.com/settings/tokens
   - "Generate new token (classic)" 클릭
   - Note: `Genspark Pilates`
   - 권한: `repo` 전체 체크
   - "Generate token" 클릭
   - **토큰 복사** (중요!)

2. **Genspark에 등록**
   - 화면 상단 **"GitHub"** 탭 클릭
   - OAuth 토큰 섹션에 붙여넣기
   - 저장

3. **푸시**
   ```bash
   cd /home/user/webapp
   ./push-to-github.sh
   ```

#### 2단계: Vercel 배포

1. **https://vercel.com** 접속
2. GitHub로 로그인
3. "New Project" 클릭
4. **pilates-webapp** 선택
5. **Deploy** 클릭 (설정 변경 불필요!)

✅ **완료! 약 3분 후 배포 완료**

---

### 옵션 2: 수동 방법

GitHub OAuth 설정 없이도 가능합니다.

#### 1단계: 로컬에서 GitHub로 푸시

```bash
cd /home/user/webapp

# GitHub 계정 정보 입력 (한 번만)
git config user.name "YOUR_NAME"
git config user.email "YOUR_EMAIL"

# 푸시
git push -u origin main
```

**비밀번호 대신 Personal Access Token 사용해야 함**
- GitHub Settings → Developer settings → Personal access tokens
- 토큰 생성 후 비밀번호 대신 입력

#### 2단계: Vercel 배포 (위와 동일)

---

## 🌐 배포 후 URL

배포 완료 후 받게 될 URL:
```
https://pilates-webapp-xxx.vercel.app
```

### 테스트:
- 주민 페이지: `/index.html`
- 관리자: `/admin-main.html`
- API: `/api/health`

---

## 📊 현재 테스트 서버

**샌드박스 URL**: https://3000-ih3eb58m0wu0t0q9r2ap8-2b54fc91.sandbox.novita.ai

지금 바로 테스트해보세요!

---

## ⚡ 빠른 배포 (한 줄 명령어)

OAuth 토큰 설정 완료 후:
```bash
cd /home/user/webapp && ./push-to-github.sh
```

---

## 🎁 보너스: 프로젝트 백업

전체 프로젝트 다운로드:
```bash
/home/user/webapp/pilates-webapp-github.tar.gz
```

---

## 💡 문제 해결

### GitHub 푸시 실패
1. OAuth 토큰 확인
2. 수동 푸시 시도
3. GitHub 계정 권한 확인

### Vercel 배포 실패
1. 로그 확인: https://vercel.com/dashboard
2. `vercel.json` 파일 확인
3. `server.js` 오류 확인

---

## 📞 도움이 필요하면

- Vercel 문서: https://vercel.com/docs
- GitHub: https://github.com/acerogym45-netizen/pilates-webapp
- 샌드박스: https://3000-ih3eb58m0wu0t0q9r2ap8-2b54fc91.sandbox.novita.ai

---

**예상 완료 시간**: 5-10분
**난이도**: ⭐⭐ (쉬움)

## 🎉 준비 완료!

이제 위의 단계를 따라하시면 됩니다!
