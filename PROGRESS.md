# Praise Sheets — Progress

A setlist/chart-sharing app for a church praise team. Full context and phase
plan lives in project memory / prior conversation history with Claude — this
file is the quick-resume summary.

**Live site:** https://praise-sheets.vercel.app
**Repo:** https://github.com/jryu0519/praise-sheets
**Supabase project:** https://supabase.com/dashboard/project/jheeqpdxelhbgbxklpvj

## Stack
React + Vite (JavaScript) · Supabase (auth, Postgres, storage, realtime) · PDF.js · vite-plugin-pwa · Vercel

## Design system (UI/UX polish — now underway, started 2026-08-30)

Originally deferred to "later," but the user started this early by sharing
a reference image of a dark "Set List" app screen and asking to match it.
That's the design direction actually in use now — a different, more
concrete style than the very first (lavender/black/lime) reference shared
2026-08-29, which is superseded by this one.

- Palette and button/input styles live in `src/theme.js`; inline SVG icons
  (refresh, document, checkmark, pencil, chevrons, play) live in
  `src/icons.jsx` — import from there rather than re-declaring per-component.
- Dark background (`colors.bg` #0d0d0f), card surfaces (`colors.card`
  #1c1c1f) for grouped content, a single blue accent (`colors.accent`
  #3b82f6) for key badges/primary actions, green (`colors.ready`) reserved
  for the "ready for this week" checkmark specifically.
- Applied across the whole app: `App.jsx` (nav menu, account footer,
  sign-in screen), `Charts.jsx`, `Team.jsx`, `Sessions.jsx`, and
  `PdfViewer.jsx`'s toolbar chrome (not the PDF canvas itself, which
  renders the document as-is).
- Removed leftover Vite scaffold cruft that was fighting the theme:
  `App.css` was entirely unused (never imported) and deleted; `index.css`
  had rules capping width at 1126px with side borders, forcing centered
  text, and switching palette by OS `prefers-color-scheme` — all removed
  in favor of the app's own explicit theme.
- App title (in `Charts.jsx`) is "Pri Music Sheet List" (with the space —
  user corrected this from "Sheetlist" on 2026-08-30).
- `Sessions.jsx` got the same treatment as the song list: centered "Sessions"
  title, session-count pill + refresh, card rows with a chevron. The detail
  view leads with a full-width "View All (Combined)" button and numbered
  song rows (no drag-reorder yet, per the earlier note — numbers are just
  the check-order from creation, not draggable).
- Fixed a layout bug: the fixed-position "☰ Menu" button was overlapping
  page titles on narrow screens. `App.jsx`'s content wrapper now has
  `paddingTop: '4.5rem'` to clear it, and each page's `<h1>` is centered
  with `margin: '0 auto'` on a `maxWidth` wrapper (not just centered text
  inside a left-aligned column).

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
- [x] **Navigation shell + Sessions UI** (not phase-numbered — a UI revamp
      request, 2026-08-29): top-left "☰ Menu" (fixed position) switches
      between Home / Sessions / Team member organization (`App.jsx`); Home
      shows a "Pri Music Sheetlist" title over the song list, sortable by
      title/key/date (`Charts.jsx`); new `Sessions.jsx` lets hosts/editors
      create a session (title + ordered charts) and lets anyone open a
      session's charts individually or all combined into one continuous
      swipeable pager — `PdfViewer.jsx` now takes a `charts: [{id, url}]`
      list instead of a single chart, with pages keyed by `chartId:pageNumber`
      so annotations and realtime sync work correctly across chart boundaries
- [ ] **Phase 5 — Real-time pings** ← IN PROGRESS, NOT YET CONFIRMED WORKING.
      Current design (2026-08-30): host/editor drag-selects rectangular
      sections on a chart page (`chart_sections` table), like a screenshot
      tool; double-clicking/double-tapping a marked section in View mode
      broadcasts a ping (Supabase Realtime `broadcast`, not a stored row)
      that jumps everyone currently viewing that chart to the same section
      and flashes it briefly. Two earlier approaches were tried and
      abandoned first — see build notes below.
- [x] **Host-only chart archive/delete**: hosts can archive (reversible,
      hidden from the default list, `charts.archived`) or permanently
      delete a chart; both are host-only at the RLS level (not just a
      hidden button) — editors can still upload but not remove
- [ ] Phase 6 — Roles + host handoff refinements
- [ ] Phase 7 — PWA (installable)

## Phase 5 build notes (pings)

- **Attempt 1 — automatic text-based detection: abandoned.** pdf.js's
  `getTextContent()` only returns genuine text objects; on the test chart
  ("순전한 예배", exported from Korean notation software), only a plain
  instructional header line was real text — every chord, lyric, and
  measure number is rendered as vector shapes/custom-font glyphs with no
  extractable text. Clustering by Y-position, and later anchoring on
  left-margin measure-number labels, both failed for the same underlying
  reason: there was no text data there to detect in the first place.
- **Attempt 2 — manual tap-to-mark line-starts (`chart_lines` table):
  built, but the user reported it "isn't working" on the deployed site**
  (unclear whether that was the marking UI itself, the double-click
  trigger, or the cross-user broadcast — never root-caused, since the user
  moved straight to requesting a different marking UX). `chart_lines` was
  dropped in migration `009_chart_sections.sql` rather than kept around.
- **Attempt 3 — drag-selected rectangular sections (current)**:
  `chart_sections` (chart_id, page_number, x0/y0/x1/y1 normalized 0..1,
  created_by) stores one row per section, managed by host/editor via a
  "Mark Sections" tool in `PdfViewer.jsx` — drag to select a region (like
  a screenshot tool), tap an existing section to remove it. New sections
  are rejected client-side if they overlap an existing one on that page
  (`rectsOverlap`). No realtime sync on this table — it's rare, low-urgency
  setup, not live editing. **Not yet confirmed working end-to-end** —
  next session should verify marking, then the double-click ping itself,
  then the actual cross-user broadcast (needs two separate signed-in
  sessions/devices to test, since Claude can't sign in to verify this).
- **Pinging is a realtime `broadcast` event, not a database row** — there's
  no ping history, just a transient `{pageKey, sectionIndex}` message on
  the same channel already used for annotation `postgres_changes`. On
  receipt, every viewer (including the sender) jumps to that page/section
  and shows a 2.5s highlight flash, independent of whatever tool is active.
- Ping-sending is gated to `canDrawShared` (host/editor) client-side only —
  there's no RLS equivalent for ephemeral broadcast messages, so a
  determined member could technically bypass it. Judged acceptable for a
  small trusted team; revisit (Realtime Authorization / private channels)
  if that turns out to matter.

## Navigation/Sessions build notes

- `Sessions.jsx` creates a session by inserting into `sessions`, then
  `session_charts` rows with `position` = the order charts were checked in
  the create form (no drag-reorder UI yet — check order is the only way to
  set order today).
- The "View all (combined)" button fetches a signed URL per chart in the
  session (`Promise.all`) and hands the whole list to `PdfViewer`, which
  loads each chart's PDF in turn and appends its pages to one continuous
  track — so page-turning crosses from one song's last page straight into
  the next song's first page.
- `PdfViewer`'s annotation storage/realtime logic is unchanged in substance
  (still one row per chart_id + page_number) — the only change was
  generalizing every lookup key from a bare `page_number` to
  `` `${chartId}:${pageNumber}` `` so the same page number in two different
  charts doesn't collide when both are open in one combined view.

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
