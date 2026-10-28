#!/bin/bash
set -e

echo "=== [IoT Stack] Starting System ==="

# Ensure directories exist
mkdir -p /app/data /var/log /var/www/html
chmod -R 755 /var/www/html

# Environment variables
export DB_PATH="${DB_PATH:-/app/data/sensor_data.db}"
export API_PORT="${API_PORT:-5000}"
export API_HOST="127.0.0.1"

# Function for clean shutdown
cleanup() {
    echo "=== [IoT Stack] Stopping Services ==="
    if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
        echo "Stopping API Server (PID: $API_PID)..."
        kill -TERM "$API_PID"
    fi
    if [ -n "$GEN_PID" ] && kill -0 "$GEN_PID" 2>/dev/null; then
        echo "Stopping Generator (PID: $GEN_PID)..."
        kill -TERM "$GEN_PID"
    fi
    nginx -s quit 2>/dev/null || true
    wait
    echo "=== [IoT Stack] All services stopped ==="
    exit 0
}

trap cleanup SIGINT SIGTERM

# 1. Start Python Web API (LAB 12 pattern)
echo "[1/3] Starting Python API Server on 127.0.0.1:$API_PORT..."
python3 -u /app/backend/app.py >> /var/log/api.log 2>&1 &
API_PID=$!
echo "$API_PID" > /tmp/api.pid

# Wait briefly for API to initialize DB
sleep 1

# 2. Start Python Generator (every 3 seconds)
echo "[2/3] Starting Sensor Data Generator..."
python3 -u /app/backend/generator.py >> /var/log/generator.log 2>&1 &
GEN_PID=$!
echo "$GEN_PID" > /tmp/generator.pid

# 3. Test Nginx Configuration
echo "[3/3] Checking Nginx configuration..."
nginx -t

echo "=== [IoT Stack] Ready! Starting Nginx on port 80 ==="
echo "Access Dashboard at: http://localhost:8080 or http://localhost:8080/status.html"

# Run Nginx in foreground
nginx -g "daemon off;" &
NGINX_PID=$!

wait $NGINX_PID
