import { Suspense } from "react";
import type { Metadata } from "next";
import { SignInClient } from "./SignInClient";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Tougather, or create an account. Neither is required — the tool works without one.",
};

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center px-5">
          <p className="text-[13px] text-fg-muted">One moment…</p>
        </main>
      }
    >
      <SignInClient />
    </Suspense>
  );
}
