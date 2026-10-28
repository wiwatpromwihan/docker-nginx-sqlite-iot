#!/usr/bin/env python3
"""
Lightweight REST API Server for IoT Sensor Platform
- Implements HTTP API using standard Python library (http.server + sqlite3) as in LAB 12.
- Provides endpoints:
    GET  /api/logs?limit=30
    GET  /api/stats
    GET  /api/health
    POST /api/logs
- Incorporates input validation, parameterization, and secure HTTP headers.
"""

import os
import sys
import json
import sqlite3
from urllib.parse import urlparse, parse_qs
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone, timedelta

# Thailand Timezone (UTC+7)
THAI_TZ = timezone(timedelta(hours=7))

# Configurable Database Path
DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "sensor_data.db"
DB_PATH = Path(os.environ.get("DB_PATH", str(DEFAULT_DB))).resolve()
API_PORT = int(os.environ.get("API_PORT", "5000"))
API_HOST = os.environ.get("API_HOST", "0.0.0.0")

MAX_PAYLOAD_SIZE = 16 * 1024  # 16 KB max POST request body


def get_thai_now():
    """Returns formatted datetime string for Thailand."""
    return datetime.now(THAI_TZ).strftime("%Y-%m-%d %H:%M:%S")


def get_db_connection():
    """Returns SQLite connection with row factory and WAL mode enabled."""
    conn = sqlite3.connect(str(DB_PATH), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db():
    """Initializes schema if not already present."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db_connection() as conn:
        conn.execute(
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
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sensor_timestamp ON sensor_logs(timestamp);"
        )
        conn.commit()


class SensorAPIHandler(BaseHTTPRequestHandler):
    server_version = "SensorAPI/1.0"

    def _set_headers(self, status_code=200, content_type="application/json; charset=utf-8"):
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.end_headers()

    def do_OPTIONS(self):
        """Handle CORS pre-flight requests."""
        self._set_headers(204)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query_params = parse_qs(parsed.query)

        if path == "/api/health":
            self._handle_health()
        elif path == "/api/logs":
            self._handle_get_logs(query_params)
        elif path == "/api/stats":
            self._handle_get_stats()
        else:
            self._send_error_response(404, "Endpoint not found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/logs":
            self._handle_post_log()
        else:
            self._send_error_response(404, "Endpoint not found")

    def _send_error_response(self, code, message):
        self._set_headers(code)
        response = {"status": "error", "code": code, "message": message}
        self.wfile.write(json.dumps(response, ensure_ascii=False).encode("utf-8"))

    def _send_json_response(self, data, status_code=200):
        self._set_headers(status_code)
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _handle_health(self):
        self._send_json_response({
            "status": "healthy",
            "server_time_th": get_thai_now(),
            "timezone": "Asia/Bangkok (UTC+7)",
            "database_exists": DB_PATH.exists(),
        })

    def _handle_get_logs(self, query_params):
        try:
            limit = 30
            if "limit" in query_params:
                raw_limit = query_params["limit"][0]
                if raw_limit.isdigit():
                    limit = max(1, min(100, int(raw_limit)))

            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT id, timestamp, device_id, location, temperature, humidity, status, note
                    FROM sensor_logs
                    ORDER BY id DESC
                    LIMIT ?;
                    """,
                    (limit,),
                )
                rows = cursor.fetchall()
                logs = [dict(row) for row in rows]

            self._send_json_response({
                "status": "success",
                "count": len(logs),
                "limit": limit,
                "server_time_th": get_thai_now(),
                "data": logs,
            })
        except Exception as e:
            self._send_error_response(500, f"Database error: {str(e)}")

    def _handle_get_stats(self):
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                # Aggregate stats
                cursor.execute(
                    """
                    SELECT 
                        COUNT(*) as total_count,
                        ROUND(AVG(temperature), 2) as avg_temp,
                        ROUND(MAX(temperature), 2) as max_temp,
                        ROUND(MIN(temperature), 2) as min_temp,
                        ROUND(AVG(humidity), 2) as avg_humidity,
                        ROUND(MAX(humidity), 2) as max_humidity,
                        ROUND(MIN(humidity), 2) as min_humidity,
                        SUM(CASE WHEN status = 'WARNING' THEN 1 ELSE 0 END) as warning_count,
                        SUM(CASE WHEN status = 'CRITICAL' THEN 1 ELSE 0 END) as critical_count
                    FROM sensor_logs;
                    """
                )
                agg = dict(cursor.fetchone())

                # Latest reading
                cursor.execute(
                    """
                    SELECT id, timestamp, device_id, location, temperature, humidity, status, note
                    FROM sensor_logs
                    ORDER BY id DESC
                    LIMIT 1;
                    """
                )
                latest_row = cursor.fetchone()
                latest = dict(latest_row) if latest_row else None

            self._send_json_response({
                "status": "success",
                "server_time_th": get_thai_now(),
                "latest": latest,
                "statistics": agg,
            })
        except Exception as e:
            self._send_error_response(500, f"Database error: {str(e)}")

    def _handle_post_log(self):
        content_length_header = self.headers.get("Content-Length")
        if not content_length_header:
            self._send_error_response(411, "Length Required")
            return

        try:
            content_length = int(content_length_header)
        except ValueError:
            self._send_error_response(400, "Invalid Content-Length header")
            return

        if content_length > MAX_PAYLOAD_SIZE:
            self._send_error_response(413, f"Payload too large. Max size is {MAX_PAYLOAD_SIZE} bytes.")
            return

        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            self._send_error_response(400, "Invalid JSON body")
            return

        # Input Validation & Sanitization
        device_id = str(payload.get("device_id", "")).strip()[:50]
        location = str(payload.get("location", "Default Location")).strip()[:100]
        note = str(payload.get("note", "")).strip()[:200]
        status = str(payload.get("status", "NORMAL")).strip().upper()[:20]

        if not device_id:
            self._send_error_response(400, "Missing required field: device_id")
            return

        try:
            temperature = round(float(payload.get("temperature", 0.0)), 2)
            humidity = round(float(payload.get("humidity", 0.0)), 2)
        except (ValueError, TypeError):
            self._send_error_response(400, "temperature and humidity must be numeric values")
            return

        timestamp = payload.get("timestamp")
        if not timestamp or not isinstance(timestamp, str):
            timestamp = get_thai_now()
        else:
            timestamp = timestamp.strip()[:30]

        # Allowed statuses
        if status not in ("NORMAL", "WARNING", "CRITICAL", "OFFLINE"):
            status = "NORMAL"

        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO sensor_logs (timestamp, device_id, location, temperature, humidity, status, note)
                    VALUES (?, ?, ?, ?, ?, ?, ?);
                    """,
                    (timestamp, device_id, location, temperature, humidity, status, note),
                )
                conn.commit()
                new_id = cursor.lastrowid

            self._send_json_response({
                "status": "success",
                "message": "Record created successfully",
                "id": new_id,
                "timestamp": timestamp,
            }, status_code=201)
        except Exception as e:
            self._send_error_response(500, f"Failed to insert record: {str(e)}")


def run_server():
    init_db()
    server_address = (API_HOST, API_PORT)
    httpd = HTTPServer(server_address, SensorAPIHandler)
    print(f"[API Server] Listening on http://{API_HOST}:{API_PORT} (DB: {DB_PATH})", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[API Server] Shutting down...", flush=True)
    finally:
        httpd.server_close()


if __name__ == "__main__":
    run_server()
