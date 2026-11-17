"use client";
import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function Qr({ text, size = 240, label }: { text: string; size?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) void QRCode.toCanvas(ref.current, text, { width: size, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f1a14", light: "#ffffff" } });
  }, [text, size]);
  return <canvas ref={ref} role="img" aria-label={label} width={size} height={size} className="rounded-xl bg-white" />;
}

/** A printable poster: shop name, QR to the storefront, the tagline. */
export async function posterPng(name: string, url: string): Promise<string> {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 1700;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f7f5ef";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#0a7746";
  g.fillRect(0, 0, c.width, 220);
  g.fillStyle = "#ffffff";
  g.font = "bold 72px system-ui, sans-serif";
  g.fillText("Till", 80, 140);
  g.fillStyle = "#0f1a14";
  g.font = "bold 88px system-ui, sans-serif";
  wrap(g, name, 80, 360, 1040, 100);
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, url, { width: 800, margin: 1 });
  g.drawImage(qr, 200, 560, 800, 800);
  g.font = "48px system-ui, sans-serif";
  g.fillText("Scan to buy · one tap, one payment", 80, 1470);
  g.fillStyle = "#0f1a14aa";
  g.font = "32px ui-monospace, monospace";
  g.fillText(url.length > 60 ? url.slice(0, 60) + "…" : url, 80, 1560);
  g.font = "28px system-ui, sans-serif";
  g.fillText("Every wei counted once. Testnet demo.", 80, 1630);
  return c.toDataURL("image/png");
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > max && line) {
      g.fillText(line, x, y);
      line = word;
      y += lh;
    } else line = test;
  }
  g.fillText(line, x, y);
}
