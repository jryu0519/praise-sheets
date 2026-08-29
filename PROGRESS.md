# Praise Sheets — Progress

A setlist/chart-sharing app for a church praise team. Full context and phase
plan lives in project memory / prior conversation history with Claude — this
file is the quick-resume summary.

**Live site:** https://praise-sheets.vercel.app
**Repo:** https://github.com/jryu0519/praise-sheets
**Supabase project:** https://supabase.com/dashboard/project/jheeqpdxelhbgbxklpvj

## Stack
React + Vite (JavaScript) · Supabase (auth, Postgres, storage, realtime) · PDF.js · vite-plugin-pwa · Vercel

## Phase status

- [x] **Phase 1 — Foundation**: Vite+React app, Supabase project, deployed to Vercel
- [x] **Phase 2 — Auth + invites**: Google sign-in, `memberships` table with roles
      (host/editor/member), host-invite flow (pre-assign role by email + mailto draft)
- [ ] **Phase 3 — PDF upload + viewing** ← START HERE NEXT
- [ ] Phase 4 — Annotations (shared/personal layers)
- [ ] Phase 5 — Real-time pings
- [ ] Phase 6 — Roles + host handoff refinements
- [ ] Phase 7 — PWA (installable)

## Next concrete step (Phase 3)

Not yet started. Will need:
- A Supabase Storage bucket for PDFs
- A `charts` table (title, musical key, storage path, uploaded_by)
- A `sessions` table (setlist) + a join table for chart ordering within a session
- Upload UI + a setlist list view
- PDF.js integration to render charts in the browser

## Known gotchas / decisions worth remembering

- **Vercel env vars must be pasted carefully.** A corrupted `VITE_SUPABASE_ANON_KEY`
  (invisible character from a manual paste into the Vercel dashboard) caused a
  very confusing "non ISO-8859-1 code point" fetch error that only showed up on
  the live site, never locally. If auth/API calls break only on Vercel, check
  the env vars first — re-paste and redeploy.
- **RLS policies can't safely query their own table directly** (causes infinite
  recursion). Use a `security definer` helper function instead — see `is_host()`
  in `supabase/schema.sql`.
- **`memberships.email` is denormalized** (copied from `auth.users.email` at
  signup) because the client API can't read the `auth.users` table directly.
- Single-team app — no `teams` table, `memberships` just has one row per user.
- The invite flow has never been tested with a real second Gmail account yet —
  worth verifying the role-on-first-sign-in logic actually works end to end.
- `supabase/schema.sql` = full schema for a fresh setup. `supabase/migrations/`
  = incremental patches actually run against the live database, in order.

## Local dev

```bash
cd C:\Users\aryu0\Projects\praise-sheets
npm run dev
```
Then open http://localhost:5173. Requires `.env` (gitignored, not in repo) with
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — ask Claude to recreate it
from the Supabase dashboard values if it's missing on a new machine.
