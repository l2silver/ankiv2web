import type { ReactNode } from "react";

export function isFlashcardImageUrl(text: string): boolean {
  const t = text.trim();
  if (!/^https?:\/\//i.test(t)) return false;
  try {
    const u = new URL(t);
    if (u.hostname === "images.unsplash.com") return true;
    return /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function textOrPlaceholder(text: string, emptyLabel = "—"): ReactNode {
  if (text.length > 0) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }
  return <span className="text-zinc-600 italic">{emptyLabel}</span>;
}

/** Renders a remote image when `text` is a single image URL; otherwise plain text. */
export function flashcardFaceContent(text: string, emptyLabel = "—"): ReactNode {
  const t = text.trim();
  if (t.length > 0 && isFlashcardImageUrl(t)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user/curated remote URLs (Unsplash CDN)
      <img
        src={t}
        alt=""
        className="mx-auto max-h-[min(52vh,28rem)] w-full max-w-full rounded-lg object-contain"
        loading="lazy"
        decoding="async"
      />
    );
  }
  return textOrPlaceholder(t, emptyLabel);
}
