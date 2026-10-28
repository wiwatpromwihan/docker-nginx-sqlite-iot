#!/usr/bin/env python3
"""
IoT Sensor Data Generator (Simulated IoT Devices)
- Generates random sensor data every 3 seconds.
- Stores data into SQLite database with Thailand Timezone (Asia/Bangkok, UTC+7).
- Uses parameterized queries to ensure database integrity and security.
"""

import os
import sys
import time
import signal
import random
import sqlite3
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Thailand Timezone (UTC+7)
THAI_TZ = timezone(timedelta(hours=7))

# Configurable Database Path
DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "sensor_data.db"
DB_PATH = Path(os.environ.get("DB_PATH", str(DEFAULT_DB))).resolve()

# Simulated IoT Devices
DEVICES = [
    {"id": "ESP32-001", "location": "ห้องทดลอง IoT 1 (Lab Room 1)"},
    {"id": "ESP32-002", "location": "ห้องแม่ข่าย (Server Room)"},
    {"id": "ESP32-003", "location": "เรือนเพาะชำอัจฉริยะ (Smart Greenhouse)"},
    {"id": "ESP32-004", "location": "สถานีตรวจวัดภายนอก (Outdoor Station)"},
]

running = True


def handle_shutdown(signum, frame):
    """Graceful shutdown handler for SIGINT and SIGTERM."""
    global running
    print("\n[Generator] Received shutdown signal. Stopping generator...", flush=True)
    running = False


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)


def get_thai_now():
    """Returns current datetime in Thailand timezone (UTC+7)."""
    return datetime.now(THAI_TZ)


def init_db():
    """Initializes SQLite database and tables with parameterized DDL."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(DB_PATH)) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS sensor_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                device_id TEXT NOT NULL,
                location TEXT NOT NULL,
                temperature REAL NOT NULL,
                humidity REAL NOT NULL,
                status TEXT NOT NULL,
                note TEXT
            );
            """
        )
        # Create index on timestamp for fast queries
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_sensor_timestamp ON sensor_logs(timestamp);"
        )
        conn.commit()
    print(f"[Generator] Database initialized at {DB_PATH}", flush=True)


def generate_reading():
    """Generates a realistic randomized sensor reading."""
    device = random.choice(DEVICES)
    
    # Generate realistic temp (24.0°C to 38.0°C) and humidity (45.0% to 85.0%)
    temp = round(random.uniform(24.0, 37.5), 1)
    humidity = round(random.uniform(45.0, 85.0), 1)
    
    # Determine status based on thresholds
    if temp > 35.0 or humidity > 80.0:
        status = "WARNING"
        note = "High temperature or humidity detected"
    elif temp > 38.0:
        status = "CRITICAL"
        note = "Extreme temperature alert"
    else:
        status = "NORMAL"
        note = "Normal operation"

    # Current Thailand timestamp
    thai_now = get_thai_now()
    timestamp_str = thai_now.strftime("%Y-%m-%d %H:%M:%S")

    return {
        "timestamp": timestamp_str,
        "device_id": device["id"],
        "location": device["location"],
        "temperature": temp,
        "humidity": humidity,
        "status": status,
        "note": note,
    }


def insert_reading(reading):
    """Inserts reading using secure parameterized SQL query."""
    with sqlite3.connect(str(DB_PATH), timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO sensor_logs (timestamp, device_id, location, temperature, humidity, status, note)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (
                reading["timestamp"],
                reading["device_id"],
                reading["location"],
                reading["temperature"],
                reading["humidity"],
                reading["status"],
                reading["note"],
            ),
        )
        conn.commit()


def main():
    print(f"[Generator] Starting IoT Sensor Generator (Interval: 3s)...", flush=True)
    init_db()

    iteration = 0
    while running:
        try:
            reading = generate_reading()
            insert_reading(reading)
            iteration += 1
            print(
                f"[Generator #{iteration}] [{reading['timestamp']} ICT] "
                f"Device: {reading['device_id']} | Temp: {reading['temperature']}°C | "
                f"Humidity: {reading['humidity']}% | Status: {reading['status']}",
                flush=True,
            )
        except Exception as e:
            print(f"[Generator] Error inserting reading: {e}", file=sys.stderr, flush=True)

        # Sleep in short increments to respond promptly to shutdown signals
        for _ in range(30):
            if not running:
                break
            time.sleep(0.1)

    print("[Generator] Generator stopped cleanly.", flush=True)


if __name__ == "__main__":
    main()
