import type { ReactNode } from "react";

export function textOrPlaceholder(text: string, emptyLabel = "—"): ReactNode {
  if (text.length > 0) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }
  return <span className="text-zinc-600 italic">{emptyLabel}</span>;
}
