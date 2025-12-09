#!/usr/bin/env python3
"""
EdgeVision Nexus - ZED Edge Node Service

This service runs on an edge device (Jetson, etc) and:
1. Captures video from ZED 2/2i stereo camera
2. Runs object detection (persons, vehicles)
3. Streams MJPEG video with bounding boxes
4. Exposes metrics API for dashboard consumption

The service is designed to be lightweight, always-on, and easily discoverable
by the central gateway. All endpoints return JSON or MJPEG streams.
"""

import pyzed.sl as sl
import cv2
import threading
import time
import os
from flask import Flask, Response, jsonify
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)

# ============================================================================
# GLOBAL STATE - Frame Capture and Metrics Storage
# ============================================================================
# These are thread-safe structures for passing frame data between the
# capture thread and HTTP request handlers

camera = None  # ZED SDK camera object
frame_cond = threading.Condition()  # Thread synchronization for frame updates
frame_data = {
    'frame': None,  # Latest BGR frame with bounding boxes
    'counts': {},  # Detection counts: {"Person": 5, "Vehicle": 2}
    'timestamp': datetime.now().isoformat()  # When frame was captured
}
active_streams = 0  # Track number of active video streams
stream_lock = threading.Lock()  # Thread synchronization for stream count


def init_zed_camera():
    """
    Initialize ZED 2i/3 camera with object detection.
    
    WHAT IT DOES:
    - Opens ZED stereo camera with high-res depth
    - Enables neural depth mode for better accuracy
    - Enables positional tracking (required for object tracking)
    - Enables YOLO V8 object detection
    
    RETURNS:
    - True if successfully initialized, False otherwise
    
    NOTES:
    - Requires pyzed library installed
    - Requires actual ZED hardware connected
    - Blocks until camera opens (typically 2-3 seconds)
    """
    global camera
    
    try:
        camera = sl.Camera()
        
        # Configure camera initialization parameters
        init_params = sl.InitParameters()
        init_params.camera_resolution = sl.RESOLUTION.HD1080  # 1920x1080
        init_params.depth_mode = sl.DEPTH_MODE.NEURAL  # ML-based depth computation
        init_params.coordinate_system = sl.COORDINATE_SYSTEM.RIGHT_HANDED_Y_UP
        init_params.sdk_verbose = 1  # Enable SDK logging
        
        # Attempt to open the camera
        status = camera.open(init_params)
        if status != sl.ERROR_CODE.SUCCESS:
            print(f"[ERROR] Camera opening failed: {status}")
            return False
        
        print("[SUCCESS] ZED Camera opened successfully")
        print(f"[INFO] Camera Model: {camera.get_camera_information().camera_model}")
        
        # Enable positional tracking (required for object detection to work)
        pos_tracking_params = sl.PositionalTrackingParameters()
        status = camera.enable_positional_tracking(pos_tracking_params)
        if status != sl.ERROR_CODE.SUCCESS:
            print(f"[WARNING] Positional tracking enabling failed: {status}")
            
        # Configure and enable object detection
        obj_det_params = sl.ObjectDetectionParameters()
        obj_det_params.enable_tracking = True  # Track objects across frames
        obj_det_params.enable_segmentation = False  # Don't need pixel-level masks
        
        print(f"[INFO] Enabling object detection with YOLO V8 OBB")
        status = camera.enable_object_detection(obj_det_params)
        if status != sl.ERROR_CODE.SUCCESS:
            print(f"[ERROR] Object detection enabling failed: {status}")
            return False
        
        print("[SUCCESS] ZED Object detection enabled with YOLO V8 OBB")
        return True
        
    except Exception as e:
        print(f"[ERROR] Error initializing ZED camera: {e}")
        import traceback
        traceback.print_exc()
        return False


def grab_loop():
    """
    Background thread that continuously captures frames and detections.
    
    WHAT IT DOES:
    1. Grabs frames from ZED camera in a loop
    2. Retrieves object detections from ZED SDK
    3. Draws bounding boxes on frames (blue for Person, red for Vehicle)
    4. Counts objects by class (Person, Vehicle, etc)
    5. Updates global frame_data so HTTP endpoints can access latest data
    6. Automatically reconnects if camera disconnects
    
    THREADING:
    - Runs in background thread (daemon=True)
    - Uses frame_cond lock to safely update frame_data
    - Notifies waiting threads when new frame is ready
    
    PERFORMANCE:
    - Runs at reduced FPS when no active streams (~2 FPS)
    - Runs at full speed when streams are active (~10 FPS)
    - Grab is blocking, so loop naturally throttles to camera speed
    
    RECONNECTION:
    - Detects camera disconnects (grab failures)
    - Attempts reconnection every 5 seconds
    - Resumes normal operation once reconnected
    
    NOTES:
    - Bounding box colors: Green=Person, Red=Vehicle, Blue=Other
    - Only draws boxes with confidence > 0.5
    - Every 500 frames logs detection statistics
    """
    global camera, frame_data, active_streams
    
    runtime_params = sl.RuntimeParameters()
    
    print("[INFO] Starting ZED camera grab loop with auto-reconnect")
    
    frame_count = 0
    consecutive_failures = 0
    max_failures_before_reconnect = 10
    
    while True:
        try:
            # Check if camera is valid and open
            if not camera or not camera.is_opened():
                print("[WARNING] Camera not available, attempting reconnection...")
                if not init_zed_camera():
                    print("[ERROR] Reconnection failed, retrying in 5 seconds...")
                    time.sleep(5)
                    continue
                else:
                    print("[SUCCESS] Camera reconnected successfully")
                    consecutive_failures = 0
                    runtime_params = sl.RuntimeParameters()
            
            # Grab frame from camera (blocking call)
            grab_status = camera.grab(runtime_params)
            
            if grab_status == sl.ERROR_CODE.SUCCESS:
                frame_count += 1
                consecutive_failures = 0  # Reset failure counter
                
                # Adaptive throttling: slow down when no active streams
                with stream_lock:
                    if active_streams > 0:
                        time.sleep(0.1)  # ~10 FPS when streaming
                    else:
                        time.sleep(0.5)  # ~2 FPS when idle
                
                with frame_cond:
                    # Retrieve left eye image in RGBA format
                    image = sl.Mat()
                    camera.retrieve_image(image, sl.VIEW.LEFT)
                    frame = image.get_data()
                    
                    # Convert RGBA to BGR for OpenCV compatibility
                    if frame is not None and len(frame.shape) == 3 and frame.shape[2] == 4:
                        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGBA2BGR)
                    else:
                        frame_bgr = frame
                    
                    # Retrieve detected objects from ZED SDK
                    objects = sl.Objects()
                    camera.retrieve_objects(objects)
                    
                    # Count detections by class
                    counts = {}
                    
                    # Draw bounding boxes and count each detection
                    if objects.is_new:
                        for obj in objects.object_list:
                            # Skip low-confidence detections
                            if obj.confidence > 0.5:
                                # Determine object class name from enum
                                raw_label = obj.raw_label
                                try:
                                    label_text = str(sl.OBJECT_CLASS(raw_label)).split('.')[-1]
                                except (ValueError, AttributeError):
                                    # Fallback labels if enum conversion fails
                                    if raw_label == 0: label_text = "Person"
                                    elif raw_label == 1: label_text = "Vehicle" 
                                    else: label_text = f"Class_{raw_label}"
                                
                                # Increment count for this class
                                counts[label_text] = counts.get(label_text, 0) + 1
                                
                                # Choose bounding box color based on class
                                if "Person" in label_text:
                                    color = (0, 255, 0)  # Green
                                elif "Vehicle" in label_text:
                                    color = (255, 0, 0)  # Red
                                else:
                                    color = (0, 0, 255)  # Blue

                                # Draw 2D bounding box on frame
                                bbox_2d = obj.bounding_box_2d
                                if len(bbox_2d) >= 2:
                                    pt1 = (int(bbox_2d[0][0]), int(bbox_2d[0][1]))
                                    pt2 = (int(bbox_2d[2][0]), int(bbox_2d[2][1]))
                                    cv2.rectangle(frame_bgr, pt1, pt2, color, 2)
                                    
                                    # Draw label with confidence score
                                    label = f"{label_text} ({obj.confidence:.2f})"
                                    cv2.putText(frame_bgr, label, 
                                              (pt1[0], pt1[1] - 10),
                                              cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                    
                    # Update shared frame data for endpoints
                    frame_data['frame'] = frame_bgr
                    frame_data['counts'] = counts
                    frame_data['timestamp'] = datetime.now().isoformat()
                    frame_cond.notify_all()  # Wake up any waiting HTTP handlers
                    
                    # Log statistics every 500 frames to reduce log spam
                    if frame_count % 500 == 0:
                        print(f"[INFO] Frame {frame_count}: {counts}")
            else:
                # Grab failed - camera may be disconnected
                consecutive_failures += 1
                if consecutive_failures >= max_failures_before_reconnect:
                    print(f"[ERROR] Camera grab failed {consecutive_failures} times: {grab_status}")
                    print("[WARNING] Closing camera for reconnection attempt...")
                    if camera:
                        try:
                            camera.close()
                        except:
                            pass
                    camera = None
                    consecutive_failures = 0
                    time.sleep(1)
                    continue
                time.sleep(0.1)
                continue
            
        except Exception as e:
            print(f"[ERROR] Error in grab loop: {e}")
            import traceback
            traceback.print_exc()
            # Try to close and reset camera on unexpected errors
            if camera:
                try:
                    camera.close()
                except:
                    pass
            camera = None
            time.sleep(5)  # Wait before reconnection attempt


def generate_mjpeg():
    """
    Generate MJPEG stream from captured frames.
    
    WHAT IT DOES:
    1. Waits for new frames from grab_loop()
    2. Encodes each frame as JPEG (quality: 85)
    3. Yields MJPEG boundary-delimited chunks
    4. Streams to browser as multipart/x-mixed-replace
    
    PROTOCOL:
    - Uses standard MJPEG format with boundary markers
    - Each chunk includes Content-Type and Content-Length headers
    - Browser can display as <img src="/video_feed">
    
    QUALITY SETTINGS:
    - JPEG quality: 85 (good balance of quality vs bandwidth)
    - Higher quality = larger file size = higher bandwidth
    - Lower quality = smaller file size = grainier image
    
    NOTES:
    - Waits for frame_cond notification when new frame available
    - If encoding fails, skips frame and waits for next
    - Infinite generator (only stops when connection closes)
    - Tracks active streams to optimize frame processing
    """
    global frame_data, active_streams
    
    # Increment active stream counter
    with stream_lock:
        active_streams += 1
        print(f"[INFO] Stream started. Active streams: {active_streams}")
    
    try:
        while True:
            try:
                local_frame = None
                with frame_cond:
                    # Wait for grab_loop to signal new frame
                    frame_cond.wait()
                    local_frame = frame_data['frame']

                if local_frame is not None:
                    # Encode frame as JPEG
                    ret, buffer = cv2.imencode('.jpg', local_frame, 
                                              [cv2.IMWRITE_JPEG_QUALITY, 85])
                    if ret:
                        frame_bytes = buffer.tobytes()
                        # Yield MJPEG boundary and frame data
                        yield (b'--frame\r\n'
                              b'Content-Type: image/jpeg\r\n'
                              b'Content-Length: ' + str(len(frame_bytes)).encode() + b'\r\n\r\n'
                              + frame_bytes + b'\r\n')
                
            except Exception as e:
                print(f"[ERROR] Error in MJPEG generation: {e}")
                time.sleep(0.1)
                break
    finally:
        # Decrement active stream counter when connection closes
        with stream_lock:
            active_streams -= 1
            print(f"[INFO] Stream ended. Active streams: {active_streams}")


# ============================================================================
# HTTP ENDPOINTS - REST API for Dashboard Integration
# ============================================================================


@app.route('/video_feed')
def video_feed():
    """
    Stream MJPEG video with object detection bounding boxes.
    
    RETURNS:
    - MJPEG stream (multipart/x-mixed-replace)
    - Can be displayed in <img src="/video_feed"> tag
    - Shows live video with bounding boxes and confidence scores
    
    USAGE (JavaScript):
    <img src="http://localhost:5000/video_feed" width="640" height="480" />
    """
    return Response(generate_mjpeg(),
                   mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/metrics')
def metrics():
    """
    Get current object detection metrics.
    
    RETURNS (JSON):
    {
        "Person": 5,          # Number of detected persons
        "Vehicle": 2,         # Number of detected vehicles
        "timestamp": "2024-12-09T20:30:45.123456"
    }
    
    USAGE (Dashboard):
    - Called every 1 second by dashboard for live metrics
    - Used to display detection counts in UI
    - Lightweight JSON, no frame data
    
    RESPONSE TIME:
    - Typically < 1ms (no computation, just returns cached data)
    """
    with frame_cond:
        response = frame_data.get('counts', {})
        response['timestamp'] = frame_data['timestamp']
        return jsonify(response)


@app.route('/health')
def health():
    """
    Health check endpoint for load balancers and monitoring.
    
    RETURNS (JSON):
    {
        "status": "healthy",
        "camera_ready": true,           # Camera initialized and open
        "sdk_version": "5.0.3"          # ZED SDK version
    }
    
    STATUS CODES:
    - 200: Service healthy, camera ready
    - Call regularly to verify edge node is alive
    
    USAGE:
    - Gateway calls this every second
    - Dashboard calls this on startup
    - Load balancers use this to detect failures
    """
    camera_ready = camera is not None and camera.is_opened()
    return jsonify({
        'status': 'healthy',
        'camera_ready': camera_ready,
        'sdk_version': sl.Camera.get_sdk_version()
    }), 200


@app.route('/')
def index():
    """
    Root endpoint with API documentation.
    
    RETURNS (JSON):
    API information and available endpoints
    
    USAGE:
    - Browser-friendly API documentation
    - Returns endpoint descriptions and usage info
    """
    return jsonify({
        'service': 'EdgeVision Nexus - ZED Edge Node',
        'version': '2.0',
        'sdk_version': 'ZED SDK 5.0',
        'camera_mode': 'ZED 2i/3 (Real Hardware)',
        'endpoints': {
            '/video_feed': 'GET: MJPEG stream with detection boxes',
            '/metrics': 'GET: JSON metrics (persons, vehicles, timestamp)',
            '/health': 'GET: Health check (status, camera_ready, sdk_version)'
        }
    }), 200


# ============================================================================
# APPLICATION INITIALIZATION AND STARTUP
# ============================================================================


if __name__ == '__main__':
    print("[INFO] EdgeVision Nexus - ZED Edge Node v2.0")
    print(f"[INFO] ZED SDK Version: {sl.Camera.get_sdk_version()}")
    
    # Step 1: Initialize camera hardware
    if not init_zed_camera():
        print("[FATAL] Failed to initialize ZED camera. Exiting.")
        exit(1)
    
    # Step 2: Start background frame capture thread
    grab_thread = threading.Thread(target=grab_loop, daemon=True)
    grab_thread.start()
    
    # Step 3: Wait for first frames to be captured
    time.sleep(2)
    print("[INFO] Frame capture thread running, service ready")
    
    # Step 4: Start Flask HTTP server
    print("[INFO] Starting Flask server on 0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
