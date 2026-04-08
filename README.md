This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

The Go API for sync lives in [`../backend`](../backend); see [`../backend/README.md`](../backend/README.md) and [`../backend/internal/openapi/openapi.yaml`](../backend/internal/openapi/openapi.yaml) for `PATCH /sync`, `POST /cards/new/index`, and other routes.

### API URL and API key

- Set **`NEXT_PUBLIC_API_URL`** in **`.env.local`** (e.g. `http://localhost:8080`) so the client knows where to send **`PATCH /sync`** and **`POST /cards/new/index`**.
- **API key (default flow):** If **`NEXT_PUBLIC_API_KEY`** is **not** set, the first page load shows a setup form. The key you enter is saved in **`localStorage`** as **`ankiv2_api_key`**; **`ankiv2_setup_done`** is **`"1"`** after you continue. Requests use **`Authorization: Bearer`** plus the saved key. You can leave the field empty if your Go server has no **`API_KEY`** env. Use **Change API key…** on the home screen to clear storage and run setup again.
- **Build-time key (optional):** If **`NEXT_PUBLIC_API_KEY`** is set at build time, the setup screen is skipped and that value is used instead (it is exposed in the browser bundle). **`NEXT_PUBLIC_API_KEY`** takes precedence over **`localStorage`** when both exist.

Implementation: `src/lib/settings/apiCredentials.ts`, `src/lib/api/client.ts`, `src/components/ApiAppGate.tsx`, `src/components/ApiKeySetup.tsx`. IndexedDB + sync thunks live under `src/lib/` and `src/features/sync/`.

### Mock `POST /cards/new/index` (local JSON)

**Default:** pull uses the **Go API** when `NEXT_PUBLIC_API_URL` (and first-run API key flow or `NEXT_PUBLIC_API_KEY`) are set.

To work **without** the backend for pull only, enable the static fixture:

- **Fixture:** `src/lib/mock/cards-new-index.response.json` — sample cards with nested `deck_id` paths (`Parent::Child::Leaf`, e.g. `Science::Space::Deep Sky`, `Home::Kitchen::Basics`).
- **Enable mock:** set **`NEXT_PUBLIC_USE_SYNC_MOCK=true`** (or `1`) in **`.env.local`**, or run **`npm run dev:mock`** (sets that var for the dev server). `isSyncPullMockEnabled()` in `src/lib/api/client.ts` — explicit `false` / `0` keeps the real API.
- **Behavior:** mock path returns the **full** fixture each pull (convenient for editing the JSON without clearing IndexedDB). The real API returns only cards whose `id` is **not** in the request `ids` array.
- **Home page:** After the API-key gate, the app **hydrates IndexedDB** then **runs pull automatically** once when pull is available.

`PATCH /sync` is **not** mocked; it still uses `NEXT_PUBLIC_API_URL` when you push.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
