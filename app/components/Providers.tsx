"use client";
import { type ReactNode, useEffect } from "react";
import { MotionConfig } from "motion/react";
import { ToastProvider } from "./Toasts";
import { WalletProvider } from "./Wallet";
import { PrefsProvider } from "./Prefs";

export function Providers({ children }: { children: ReactNode }) {
  // Marks the moment React has attached its handlers (used by the UI tests).
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
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
