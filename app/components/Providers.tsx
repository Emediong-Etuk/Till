"use client";
import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { ToastProvider } from "./Toasts";
import { WalletProvider } from "./Wallet";
import { PrefsProvider } from "./Prefs";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <PrefsProvider>
          <WalletProvider>{children}</WalletProvider>
        </PrefsProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
