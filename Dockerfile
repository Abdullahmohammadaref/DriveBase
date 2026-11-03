FROM python:3.12-slim

WORKDIR /app

# System dependencies for Pillow, ReportLab, Pandas
RUN apt-get update && apt-get install -y \
    gcc \
    libffi-dev \
    libssl-dev \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn whitenoise

# Copy entire backend
COPY backend/ /app/

EXPOSE 8000

CMD ["gunicorn", "drivebase.wsgi:application", \
    "--bind", "0.0.0.0:8000", \
    "--workers", "2", \
    "--timeout", "120", \
    "--access-logfile", "-"]
