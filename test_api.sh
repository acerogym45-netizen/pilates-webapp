#!/bin/bash

echo "=== Testing Pilates API ==="
echo ""

echo "1. Health Check:"
curl -s http://localhost:3000/api/health | jq
echo ""

echo "2. Get Programs:"
curl -s http://localhost:3000/api/programs | jq length
echo ""

echo "3. Create Program:"
curl -s -X POST http://localhost:3000/api/programs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "화&목 6:1 그룹수업",
    "description": "초급자를 위한 필라테스",
    "price": 150000,
    "max_capacity": 6,
    "available_times": "오전 9시,오전 10시,오전 11시,오후 7시,오후 8시,오후 9시"
  }' | jq
echo ""

echo "4. Get Programs Again:"
curl -s http://localhost:3000/api/programs | jq
echo ""

echo "5. Create Contract:"
curl -s -X POST http://localhost:3000/api/contracts \
  -H "Content-Type: application/json" \
  -d '{
    "dong": "101",
    "ho": "101호",
    "name": "홍길동",
    "phone": "010-1234-5678",
    "lesson_type": "화&목 6:1 그룹수업",
    "preferred_time": "오후 7시",
    "status": "approved"
  }' | jq
echo ""

echo "6. Get Contracts:"
curl -s http://localhost:3000/api/contracts | jq
echo ""

echo "7. Get Statistics:"
curl -s http://localhost:3000/api/statistics/dashboard | jq
echo ""

echo "=== All Tests Complete ==="
