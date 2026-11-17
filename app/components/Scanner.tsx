"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/** Camera QR scanner (BarcodeDetector when available, jsQR otherwise). */
export function Scanner({ onCode }: { onCode: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const Detector = (window as unknown as { BarcodeDetector?: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stopped) return;
          if (v.readyState >= 2) {
            let text: string | null = null;
            if (detector) {
              const r = await detector.detect(v).catch(() => []);
              text = r[0]?.rawValue ?? null;
            } else {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              ctx.drawImage(v, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              text = jsQR(img.data, img.width, img.height)?.data ?? null;
            }
            if (text) {
              onCode(text);
              setOn(false);
              return;
            }
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setErr("Camera unavailable. Paste the code below instead.");
        setOn(false);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, onCode]);
  return (
    <div className="space-y-2">
      {on ? (
        <video ref={video} className="aspect-square w-full rounded-2xl bg-ink object-cover ring-4 ring-till-400/40" muted playsInline aria-label="Camera preview" />
      ) : (
        <button className="btn-primary w-full text-lg" onClick={() => { setErr(null); setOn(true); }}>Scan a pass with the camera</button>
      )}
      {on && <button className="btn-ghost w-full" onClick={() => setOn(false)}>Stop camera</button>}
      {err && <p className="text-sm text-alarm-600">{err}</p>}
    </div>
  );
}
