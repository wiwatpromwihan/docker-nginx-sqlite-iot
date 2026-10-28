#!/bin/bash
# ==============================================================================
# Script สำหรับติดตั้งและรันบน Container rpi-lab (Debian Trixie) ตามคู่มือ LAB 11-12
# รองรับทั้งรันด้วย root และ piuser
# ==============================================================================

set -e

# ตรวจสอบการใช้ sudo
if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
else
    SUDO="sudo"
fi

echo "=== [LAB Setup] เริ่มต้นติดตั้งและตั้งค่าระบบใน rpi-lab ==="

# 1. ติดตั้ง Packages
echo "[1/6] ติดตั้ง Packages ที่จำเป็น..."
$SUDO apt-get update
$SUDO apt-get install -y sqlite3 python3 curl nginx procps tzdata

# 2. ตั้งค่า Timezone
echo "[2/6] ตั้งค่า Timezone Asia/Bangkok..."
$SUDO ln -snf /usr/share/zoneinfo/Asia/Bangkok /etc/localtime
echo "Asia/Bangkok" | $SUDO tee /etc/timezone

# 3. สร้างไดเรกทอรี
echo "[3/6] สร้างโฟลเดอร์สำหรับ Data และ Web Service..."
mkdir -p "$HOME/iot-data"
mkdir -p "$HOME/iot-web"

# 4. คัดลอกไฟล์โปรแกรม
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "[4/6] คัดลอกไฟล์แอปพลิเคชัน..."
cp "$PROJECT_ROOT/backend/app.py" "$HOME/iot-web/app.py"
cp "$PROJECT_ROOT/backend/generator.py" "$HOME/iot-web/generator.py"
chmod +x "$HOME/iot-web/"*.py

# 5. คัดลอกหน้าเว็บ Frontend
echo "[5/6] ติดตั้งหน้าเว็บ Dashboard ไปที่ /var/www/html/..."
$SUDO mkdir -p /var/www/html
$SUDO cp -r "$PROJECT_ROOT/nginx/html/"* /var/www/html/
$SUDO cp "$PROJECT_ROOT/nginx/default.conf" /etc/nginx/sites-available/default
$SUDO ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# 6. เริ่มต้น Nginx
echo "[6/6] เริ่มการทำงานของ Nginx..."
$SUDO nginx -t
$SUDO nginx -s reload 2>/dev/null || (pgrep nginx >/dev/null || $SUDO nginx)

# รัน Background Services
echo "=== เริ่มการทำงานของ Background Services ==="

if [ -f "$HOME/iot-web/api.pid" ]; then
    kill "$(cat "$HOME/iot-web/api.pid")" 2>/dev/null || true
fi
if [ -f "$HOME/iot-web/generator.pid" ]; then
    kill "$(cat "$HOME/iot-web/generator.pid")" 2>/dev/null || true
fi

# รัน API
export DB_PATH="$HOME/iot-data/sensor_data.db"
nohup python3 -u "$HOME/iot-web/app.py" >> "$HOME/iot-web/api.log" 2>&1 < /dev/null &
API_PID=$!
echo "$API_PID" > "$HOME/iot-web/api.pid"
echo "-> Python API รันแล้ว (PID: $API_PID) บันทึก log ที่: $HOME/iot-web/api.log"

# รัน Generator
nohup python3 -u "$HOME/iot-web/generator.py" >> "$HOME/iot-web/generator.log" 2>&1 < /dev/null &
GEN_PID=$!
echo "$GEN_PID" > "$HOME/iot-web/generator.pid"
echo "-> Generator รันแล้ว (PID: $GEN_PID) สุ่มข้อมูลลง SQLite ทุก 3 วินาที"

echo ""
echo "=========================================================================="
echo "✅ ติดตั้งและเริ่มการทำงานสำเร็จ!"
echo "ตรวจสอบการทำงาน:"
echo "  - ตรวจ log API: tail -f ~/iot-web/api.log"
echo "  - ตรวจ log Generator: tail -f ~/iot-web/generator.log"
echo "  - ตรวจข้อมูลใน SQLite: sqlite3 ~/iot-data/sensor_data.db 'SELECT * FROM sensor_logs ORDER BY id DESC LIMIT 5;'"
echo "  - ทดสอบผ่าน curl: curl http://127.0.0.1/api/logs"
echo "  - เปิดหน้าเว็บจากโฮสต์: http://localhost:8080 หรือ http://localhost:8080/status.html"
echo "=========================================================================="
