"use client";

/**
 * One thing on the shelf, whether it came from this browser or from the
 * account.
 *
 * The preview is the point. A list of filenames is a directory listing; a
 * library is something you recognise by looking. So every card shows the
 * small copy if there is one, the mime family's mark if there is not, and
 * the font itself for a typeface — which is the only preview a font has.
 *
 * The name field commits on blur and on Enter rather than on every
 * keystroke. It used to write through the persisted store per character,
 * which is a queued localStorage write for every letter of a rename.
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { iconFor, labelFor } from "@/lib/kit/mime";
import { formatBytes, type KitAsset, type KitFile, type KitFont } from "@/lib/kit";
import { cn } from "@/lib/cn";

export function NameField({
  value,
  onCommit,
  label,
  className,
}: {
  value: string;
  onCommit: (next: string) => void;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  // Whether this field is the one being typed in. State rather than a ref
  // because the check below happens *during* render, and a ref read there
  // is a value React does not promise is current.
  const [editing, setEditing] = useState(false);
  // Notice the stored name changed underneath — another tab, a sync — and
  // adopt it, unless somebody is mid-word in this very box.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!editing) setDraft(value);
  }

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };

  return (
    <input
      value={draft}
      aria-label={label}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "min-w-0 rounded-xs bg-transparent px-1 py-0.5 text-[12.5px] text-fg outline-none transition-colors hover:bg-surface-2 focus:bg-surface-2",
        className,
      )}
    />
  );
}

/**
 * The square above the name.
 *
 * `preview` arrives asynchronously — the bytes are in IndexedDB or, for an
 * account file, one round trip away — so this takes a loader rather than a
 * value and shows the mark meanwhile.
 */
export function Preview({
  load,
  alt,
  mime,
  filename,
  font,
}: {
  load: () => Promise<string | null>;
  alt: string;
  mime: string;
  filename: string;
  /** A registered family name, for the one asset whose preview is type. */
  font?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setSrc(data),
      () => {},
    );
    return () => {
      live = false;
    };
    // `load` is rebuilt per render by the caller; depending on it would
    // re-fetch forever. The identity that matters is the asset, which the
    // caller keys this component by.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (font)
    return (
      <span
        className="grid aspect-[5/3] w-full place-items-center overflow-hidden bg-canvas px-2 text-[26px] leading-none text-fg"
        style={{ fontFamily: `"${font}"` }}
      >
        <span className="truncate">Ag</span>
      </span>
    );

  return (
    <span className="grid aspect-[5/3] w-full place-items-center overflow-hidden bg-canvas">
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element -- a data URL
           out of the browser's own store; there is nothing to fetch. */
        <img src={src} alt={alt} className="size-full object-contain" />
      ) : (
        <Icon name={iconFor(mime, filename)} size={22} className="text-fg-subtle" />
      )}
    </span>
  );
}

/** The line under the name: what it is, and what it costs. */
export function Meta({
  asset,
  extra,
}: {
  asset: KitAsset;
  extra?: string;
}) {
  const kind =
    asset.kind === "file"
      ? labelFor((asset as KitFile).mime, (asset as KitFile).filename)
      : asset.kind === "font"
        ? `Font · ${(asset as KitFont).format}`
        : asset.kind === "image"
          ? "Picture"
          : "Piece";
  return (
    <span className="truncate font-mono text-[10px] text-fg-subtle">
      {kind} · {formatBytes(asset.bytes)}
      {extra ? ` · ${extra}` : ""}
    </span>
  );
}

/** The shell every card shares, so the grid stays one grid. */
export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border border-line bg-surface transition-colors duration-150 hover:border-line-strong",
        className,
      )}
    >
      {children}
    </li>
  );
}

export function CardAction({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "shrink-0 rounded-xs p-1 text-fg-subtle transition-colors duration-150",
        danger ? "hover:text-danger" : "hover:text-fg",
      )}
    >
      <Icon name={icon} size={12} />
    </button>
  );
}
