/**
 * The provider marks on the sign-in buttons.
 *
 * Drawn rather than fetched. A remote logo on a sign-in screen is a third
 * party watching people arrive, and a bundled PNG is four files that go soft
 * on a retina panel — these are the published brand geometries as paths, so
 * they stay crisp at any size and the page makes no request to sign in.
 *
 * Anything without a mark here falls through to `null`, and the button shows
 * its label alone rather than a placeholder box.
 */

export function BrandMark({ id, size = 15 }: { id: string; size?: number }) {
  const common = { width: size, height: size, "aria-hidden": true } as const;

  if (id === "google")
    return (
      <svg {...common} viewBox="0 0 48 48">
        <path
          fill="#4285F4"
          d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        />
        <path
          fill="#34A853"
          d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        />
        <path
          fill="#FBBC05"
          d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
        />
        <path
          fill="#EA4335"
          d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        />
      </svg>
    );

  if (id === "github")
    return (
      <svg {...common} viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
    );

  if (id === "azure")
    return (
      <svg {...common} viewBox="0 0 23 23">
        <path fill="#F25022" d="M1 1h10v10H1z" />
        <path fill="#7FBA00" d="M12 1h10v10H12z" />
        <path fill="#00A4EF" d="M1 12h10v10H1z" />
        <path fill="#FFB900" d="M12 12h10v10H12z" />
      </svg>
    );

  if (id === "apple")
    return (
      <svg {...common} viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.18 8.42c-.02-1.62 1.32-2.4 1.38-2.44-.75-1.1-1.92-1.25-2.34-1.27-1-.1-1.95.58-2.45.58s-1.29-.57-2.12-.55c-1.09.02-2.1.63-2.66 1.61-1.13 1.97-.29 4.89.81 6.49.54.78 1.19 1.66 2.03 1.63.81-.03 1.12-.53 2.1-.53s1.26.53 2.12.51c.88-.01 1.43-.8 1.97-1.58.62-.9.87-1.78.89-1.83-.02-.01-1.71-.66-1.73-2.62zM9.6 3.66c.44-.54.74-1.29.66-2.04-.64.03-1.41.43-1.87.96-.41.48-.77 1.24-.67 1.97.71.06 1.44-.36 1.88-.89z" />
      </svg>
    );

  return null;
}
