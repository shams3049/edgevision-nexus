FROM stereolabs/zed:5.0-gl-devel-cuda12.8-ubuntu24.04

# Install Python dependencies
RUN apt-get update && apt-get install -y \
    python3-pip \
    python3-dev \
    usbutils \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages directly to system (ZED SDK is already installed)
RUN pip install --break-system-packages \
    flask \
    flask-cors \
    opencv-python \
    numpy

WORKDIR /app

COPY zed_app.py .

EXPOSE 5000

ENV PYTHONUNBUFFERED=1
ENV LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:/usr/local/cuda-12.8/compat:$LD_LIBRARY_PATH

CMD ["python3", "zed_app.py"]
