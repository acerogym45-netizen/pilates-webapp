#!/bin/bash

# GitHub 푸시 스크립트
# 사용법: ./push-to-github.sh

echo "🚀 GitHub에 코드 푸시 중..."
echo ""

cd /home/user/webapp

# Git 상태 확인
echo "📊 Git 상태:"
git status
echo ""

# 커밋되지 않은 변경사항 확인
if [[ -n $(git status -s) ]]; then
    echo "⚠️  커밋되지 않은 변경사항이 있습니다."
    echo "📝 자동으로 커밋합니다..."
    git add .
    git commit -m "Update: Ready for deployment"
    echo ""
fi

# GitHub에 푸시
echo "⬆️  GitHub에 푸시 중..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 성공! 코드가 GitHub에 업로드되었습니다!"
    echo ""
    echo "📍 리포지토리: https://github.com/acerogym45-netizen/pilates-webapp"
    echo ""
    echo "🎯 다음 단계:"
    echo "1. https://vercel.com 접속"
    echo "2. GitHub로 로그인"
    echo "3. 'New Project' 클릭"
    echo "4. 'pilates-webapp' 선택"
    echo "5. Deploy 클릭"
    echo ""
else
    echo ""
    echo "❌ 푸시 실패!"
    echo ""
    echo "💡 해결 방법:"
    echo "1. GitHub 탭에서 OAuth 토큰 설정"
    echo "2. 또는 수동으로 푸시:"
    echo "   git push -u origin main"
    echo ""
fi
