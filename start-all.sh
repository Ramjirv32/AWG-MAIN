#!/bin/bash

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Starting backend on port 3000..."
(cd "$PROJECT_ROOT/Back" && node server.js) &
BACKEND_PID=$!

echo "🚀 Starting frontend on port 3001..."
(cd "$PROJECT_ROOT/frontend" && PORT=3001 bun dev) &
FRONTEND_PID=$!

sleep 3

echo "🌐 Exposing backend to ngrok (port 3000)..."
ngrok http 3000 --log=stdout --log-format=json &
NGROK_BACKEND_PID=$!

echo "🌐 Exposing frontend to ngrok (port 3001)..."
ngrok http 3001 --log=stdout --log-format=json &
NGROK_FRONTEND_PID=$!

sleep 5

# Extract ngrok URLs
echo "📡 Fetching ngrok URLs..."
BACKEND_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)
FRONTEND_URL=$(curl -s http://localhost:4041/api/tunnels | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$BACKEND_URL" ]; then
  BACKEND_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | tail -1 | cut -d'"' -f4)
fi

if [ -z "$FRONTEND_URL" ]; then
  FRONTEND_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | tail -1 | cut -d'"' -f4)
fi

# Update .env.local with backend URL
if [ -n "$BACKEND_URL" ]; then
  sed -i "s~NEXT_PUBLIC_API_URL=.*~NEXT_PUBLIC_API_URL=$BACKEND_URL/api~" "$PROJECT_ROOT/frontend/.env.local"
  echo "✅ Updated .env.local with backend URL: $BACKEND_URL/api"
else
  echo "⚠️  Could not fetch backend URL from ngrok"
fi

# Update server.js CORS with both URLs
if [ -n "$BACKEND_URL" ] && [ -n "$FRONTEND_URL" ]; then
  FRONTEND_DOMAIN=${FRONTEND_URL#https://}
  BACKEND_DOMAIN=${BACKEND_URL#https://}
  
  sed -i "s~origin: \[~origin: [\n    'https://$FRONTEND_DOMAIN',\n    'https://$BACKEND_DOMAIN',~" "$PROJECT_ROOT/Back/server.js" 2>/dev/null || true
  echo "✅ Updated server.js CORS with ngrok URLs"
fi

sleep 2

echo ""
echo "✅ All services started!"
echo ""
echo "🔗 Backend ngrok URL: $BACKEND_URL"
echo "🔗 Frontend ngrok URL: $FRONTEND_URL"
echo ""
echo "📊 ngrok dashboard: http://localhost:4040"
echo "🌐 Frontend: http://localhost:3001"
echo "📡 Backend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services..."
echo ""

# Trap Ctrl+C to kill all background processes
trap "kill $BACKEND_PID $FRONTEND_PID $NGROK_BACKEND_PID $NGROK_FRONTEND_PID 2>/dev/null; exit" INT

# Keep the script running
wait
