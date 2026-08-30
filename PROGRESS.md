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
- [x] **Phase 3 — PDF upload + viewing**: `charts` table + private Storage bucket,
      host/editor upload UI in `Charts.jsx`, inline PDF.js viewer (`PdfViewer.jsx`)
- [x] **Phase 4 — Annotations (shared/personal layers)**: drawing overlay
      canvas per PDF page in `PdfViewer.jsx`; pen strokes and text notes,
      each with a chosen color and size (line width / font size); shared
      (host/editor only) vs. personal visibility; erase (whole-annotation,
      own-only, matching RLS); realtime sync via `postgres_changes` so
      finished edits appear for everyone without a reload
- [x] **Two-page swipeable viewer** (not phase-numbered — a viewer UX
      request): `PdfViewer.jsx` renders pages into a horizontal swipeable
      track instead of a vertical stack — 2 pages side by side above 640px
      width, 1 page below it, sliding one page per swipe (1-2, 2-3, 3-4...);
      Prev/Next buttons and a page counter; plus a fullscreen toggle (Expand
      / "Back to regular size", bottom-right) for small phone screens
- [ ] Phase 5 — Real-time pings ← START HERE NEXT (see design notes below —
      scope is bigger than a plain coordinate ping)
- [ ] Phase 6 — Roles + host handoff refinements
- [ ] Phase 7 — PWA (installable)

## Viewer UX build notes (two-page pager + fullscreen)

- Page layout math lives in `layoutPages()` in `PdfViewer.jsx`: slot width is
  `min(viewport width / pagesPerView, maxHeight / pageAspect)`, so pages
  always fit both the available width and height — pageAspect is taken from
  the first rendered page only (assumes uniform page size across a chart).
- Swipe/drag is only active in the 'view' tool — drawing tools capture the
  pointer on their own per-page overlay instead, so there's no conflict
  between turning pages and drawing on one.
- Fullscreen is a CSS-only fixed-position overlay (`position: fixed; inset:
  0`), not the browser's native Fullscreen API — iOS Safari doesn't support
  `requestFullscreen()` on arbitrary elements, so this approach works
  consistently across phones.

## Phase 4 build notes

- Annotations use one `annotations` row per finished stroke or text note.
  `type` ('stroke'/'text') decides how `points`/`text`/`size` are
  interpreted: for a stroke, `points` is the full path and `size` is line
  width in px; for a text note, `points` holds a single anchor point,
  `text` is the note content, and `size` is font size in px.
- Text input currently uses a plain `window.prompt()` — functional but
  worth revisiting for a nicer inline editor if it feels clunky in practice.
- Erasing only removes your own annotations (RLS: `created_by = auth.uid()`)
  — a host/editor cannot erase another host/editor's shared stroke. This
  was a deliberate simplification, not a bug; revisit if it becomes
  annoying in real use.

## Phase 3 build notes

- `sessions` and `session_charts` tables exist in the schema (for setlist
  ordering) but have no UI yet — only single-chart upload/view is wired up so
  far. Building the setlist/session UI is still open, either as part of
  Phase 4 or as a quick follow-up before it.
- Supabase Storage object keys must be plain ASCII — non-ASCII filenames
  (e.g. Korean) fail with "Invalid key". `Charts.jsx` works around this by
  naming the stored file `${crypto.randomUUID()}${extension}` and keeping the
  human-readable name only in the `title` column, never in the storage path.
- pdfjs-dist v6's `getDocument()` requires an options object (`{ url }`), not
  a bare URL string — passing a string silently reads `.url` off it and
  fails with "expected either `data`, `range`, or `url` parameter".

## Design notes (Phase 5 — pings)

Scope is bigger than a free-form "ping anywhere" feature. As specified by the
user (2026-08-29):

- **Sessions are the real unit, not single charts.** A session bundles
  multiple charts (the `sessions`/`session_charts` tables from Phase 3,
  still unused — see above). Pinging happens in the context of a session
  that people are actively viewing together.
- **A ping targets a specific chart + page + line/section**, not a raw x/y
  point — pings are constrained to a fixed set of "pingable" locations
  rather than being freely placed anywhere on the page.
- **This requires a PDF layout analyzer** that divides each page into lines
  or sections up front, so those become the addressable ping targets. This
  hasn't been designed yet — open technical question: sheet music notation
  (noteheads, staff lines) is normally vector graphics in a PDF, not
  extractable text, so a generic "detect the music staff lines" analyzer is
  likely infeasible. A more realistic approach is clustering pdf.js
  `getTextContent()` items by vertical (Y) position into rows — this only
  works well because chord names, lyrics, and section labels (e.g. "Verse",
  "Chorus") are typically real text objects in these PDFs, as seen in the
  test chart. Needs validation against a few real charts before committing
  to this approach.
- When a host/editor pings a location, everyone else's view should jump to
  that same chart/page/line — likely reusing the same Supabase Realtime
  plumbing being built for annotations (a broadcast/insert on a `pings`
  table or channel, scoped to the session).
- Not started — comes after the two-page swipeable viewer (see above).

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
