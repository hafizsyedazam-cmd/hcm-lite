"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconCamera, IconMapPin, IconMoodSmile } from "@tabler/icons-react";
import type { FaceDetector } from "@mediapipe/tasks-vision";
import { Modal } from "../ui";

export interface CameraResult {
  faces: number;
  location: { lat: number; lng: number; accuracy: number };
}

/**
 * Camera attendance (bonus): live face detection in the browser + GPS.
 * Only the face count and location are sent; no photo is stored.
 * The server checks distance to the office and decides.
 */
export function CameraCheckIn({ open, onClose, onSubmit, radiusM }: { open: boolean; onClose: () => void; onSubmit: (r: CameraResult) => Promise<void>; radiusM: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const detector = useRef<FaceDetector | null>(null);
  const frame = useRef<number>(0);
  const [faces, setFaces] = useState<number | null>(null);
  const [location, setLocation] = useState<CameraResult["location"] | null>(null);
  const [status, setStatus] = useState("Starting camera...");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
        if (cancelled) return stop();
        if (video.current) {
          video.current.srcObject = stream.current;
          await video.current.play();
        }
        setStatus("Loading face detection...");
        if (!detector.current) {
          const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
          const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
          detector.current = await FaceDetector.createFromOptions(files, {
            baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite" },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.6,
          });
        }
        setStatus("Look at the camera");
        const loop = () => {
          if (cancelled || !video.current || !detector.current) return;
          if (video.current.readyState >= 2) {
            const result = detector.current.detectForVideo(video.current, performance.now());
            setFaces(result.detections.length);
          }
          frame.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        setError((e as Error).name === "NotAllowedError" ? "Camera permission was denied. Allow camera access or use web check-in." : `Camera could not start: ${(e as Error).message}`);
      }
    })();
    navigator.geolocation?.getCurrentPosition(
      (p) => !cancelled && setLocation({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => !cancelled && setError("Location permission is needed for camera attendance."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop]);

  const close = () => {
    stop();
    setFaces(null);
    setLocation(null);
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (faces == null || !location) return;
    setBusy(true);
    try {
      await onSubmit({ faces, location });
      close();
    } finally {
      setBusy(false);
    }
  };

  const faceOk = faces === 1;
  return (
    <Modal
      open={open}
      onClose={close}
      title="Camera check-in"
      footer={
        <>
          <button className="btn btn-outline-light" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!faceOk || !location || busy} onClick={submit}>
            <IconCamera size={16} /> {busy ? "Checking..." : "Check in"}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-danger fs-13">{error}</div>}
      <div className="camera-box mb-3">
        <video ref={video} playsInline muted />
      </div>
      <div className="d-flex flex-column gap-2 fs-13">
        <div className="d-flex align-items-center gap-2">
          <IconMoodSmile size={18} className={faceOk ? "text-success" : "text-warning"} />
          {faces == null ? status : faces === 1 ? "Face detected" : faces === 0 ? "No face detected" : `${faces} faces detected: only you should be in the frame`}
        </div>
        <div className="d-flex align-items-center gap-2">
          <IconMapPin size={18} className={location && location.accuracy <= 100 ? "text-success" : "text-warning"} />
          {location ? `Location found (accuracy ${Math.round(location.accuracy)} m)` : "Getting your location..."}
        </div>
        <div className="text-muted fs-12">The server checks that you are within {radiusM} m of the office. Only the result is stored, not a photo.</div>
      </div>
    </Modal>
  );
}
