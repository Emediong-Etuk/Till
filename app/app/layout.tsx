import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Till — every wei counted once",
  description: "One-tap ticket and merch checkout on Ethereum, built on Till: payable batching for Fe where every wei is counted exactly once.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1210" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen overflow-x-hidden font-sans">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-5xl px-4 pb-32 pt-4 sm:px-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
