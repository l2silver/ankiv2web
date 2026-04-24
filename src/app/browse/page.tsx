"use client";

import { Suspense } from "react";

import { ApiAppGate } from "@/components/ApiAppGate";
import { CardBrowserPage } from "@/components/CardBrowserPage";

export default function BrowsePage() {
  return (
    <ApiAppGate>
      <Suspense
        fallback={
          <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-950 text-sm text-zinc-500">
            Loading…
          </div>
        }
      >
        <CardBrowserPage />
      </Suspense>
    </ApiAppGate>
  );
}
