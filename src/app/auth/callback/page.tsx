import { Suspense } from "react";
import type { Metadata } from "next";
import { CallbackClient } from "./CallbackClient";

export const metadata: Metadata = {
  title: "Confirming",
  // A link out of somebody's inbox has no business in a search index.
  robots: { index: false, follow: false },
};

export default function AuthCallbackPage() {
  return (
    // `useSearchParams` needs a boundary, and the fallback is what somebody
    // sees for the moment between the click and the token being read.
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center px-5">
          <p className="text-[13px] text-fg-muted">Finishing that off…</p>
        </main>
      }
    >
      <CallbackClient />
    </Suspense>
  );
}
