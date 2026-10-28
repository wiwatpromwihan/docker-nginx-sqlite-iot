# Base Image matching LAB 01: debian:trixie-slim
FROM debian:trixie-slim

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install prerequisites: Nginx, SQLite3, Python3, Curl, procps
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    sqlite3 \
    python3 \
    curl \
    procps \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Set Container Timezone to Asia/Bangkok
ENV TZ=Asia/Bangkok
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Create Application Directories
WORKDIR /app
RUN mkdir -p /app/backend /app/data /app/scripts /var/www/html /var/log

# Copy Nginx Configuration
COPY nginx/default.conf /etc/nginx/sites-available/default
RUN ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Copy Frontend Web Assets
COPY nginx/html/ /var/www/html/

# Copy Backend Python Applications
COPY backend/ /app/backend/

# Copy Startup Script
COPY scripts/entrypoint.sh /app/scripts/entrypoint.sh
RUN chmod +x /app/scripts/entrypoint.sh /app/backend/*.py

# Volume for persistent SQLite database
VOLUME ["/app/data"]

# Expose HTTP port
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD curl -f http://127.0.0.1/api/health || exit 1

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
