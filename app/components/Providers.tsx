"use client";
import type { ReactNode } from "react";
import { ToastProvider } from "./Toasts";
import { WalletProvider } from "./Wallet";
import { PrefsProvider } from "./Prefs";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <PrefsProvider>
        <WalletProvider>{children}</WalletProvider>
      </PrefsProvider>
    </ToastProvider>
  );
}
