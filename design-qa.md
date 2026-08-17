# XFrame design QA — 2026-08-17

## Surfaces compared

- Current XFrame reference: `/Users/gariberzyo/Downloads/截圖 2026-08-17 13.54.47.png` (`1320 × 2868` image pixels).
- ThreadsFrame layout reference: `/Users/gariberzyo/Downloads/threadframe-fish___sh.png` (`1080 × 1935` image pixels).
- Post-fix XFrame capture: `/tmp/xframe-design-qa-2026-08-17-media-viewport.jpg` (`390 × 844` CSS viewport and image pixels; device scale factor `1`).

All three images were inspected in the same comparison pass. Because their content, aspect, and pixel density differ, the comparison was normalized to the explicitly selected layout surfaces rather than raw pixel values: platform-mark hierarchy, author-row relationship, absolute-time placement, divider, metrics row, and brand alignment. Those regions are legible in the full viewport capture, so a separate crop was not required.

## State under test

- Local web preview at `390 × 844`.
- Dark UI and `9:16` card aspect.
- Absolute time enabled.
- Public X post by Tibo with the body `Benefits all`.
- Existing XFrame palette, typography, rounded glass panel, and brand copy preserved.

## Visual comparison

- The official X mark now occupies its own centered row above the author information, matching the hierarchy demonstrated by the ThreadsFrame reference. It is no longer absolutely positioned inside the author row.
- The absolute time remains below the post content, consistent with the established XFrame layout.
- The footer now follows the ThreadsFrame hierarchy: absolute time, subtle divider, single-line interaction metrics, then the brand on a separate right-aligned row.
- The statistics row alone may scale on a narrow card. The brand no longer competes with statistics for the same horizontal line.
- No new imagery or visual assets were introduced. The existing official X path from Simple Icons remains in use.

## Second pass — matching the ThreadsFrame spec, not only its ordering

The first pass aligned the *hierarchy* (own centered logo row, footer order) but
deliberately preserved XFrame's existing typography, opacities, and brand copy.
That left the structure correct and the proportions still XFrame's own, which is
why the header and the lower-right corner continued to read as wrong. This pass
takes the numbers themselves from ThreadsFrame's `src/render.ts`.

- Every size is now derived from the user's text-size setting via `cardScale()`
  in `src/render/card.css.ts`. The platform mark was a fixed `28px` and the
  avatar a fixed `52px`, so neither grew when the user raised the text size and
  the header's weight relationship drifted apart at both extremes.
- Platform mark: `1.1 × size`, kept at opacity `0.9`. ThreadsFrame dims its logo
  to `0.5`, but the X mark is already a high-contrast solid glyph and dimming it
  reads as dirty rather than quiet. This is a deliberate divergence.
- The mark is deliberately smaller than ThreadsFrame's `1.5 × size`, because the
  multiplier is not a comparable quantity across the two products. ThreadsFrame
  draws onto a fixed 1080px canvas: at its defaults the content column is
  `856px` against a `34px` text size, so the card is about **25em** wide. XFrame
  lays out in the DOM and its content column is roughly **15em** wide at the
  defaults. The same `1.5em` mark therefore covers far more of an XFrame card —
  measured at 5.96% of the content width on ThreadsFrame versus 9.6–14% on
  XFrame depending on viewport. `1.1em` was chosen by rendering XFrame at
  1.5/1.25/1.1/0.95em beside an actual ThreadsFrame render and comparing; note
  that no single fixed percentage is reachable, since XFrame's ratio moves with
  the viewport while ThreadsFrame's does not.
- The gap below the mark is `2.0 × size` (40px at the default) against 27px of
  panel padding above it. With near-equal space on both sides — it was 26 above
  and 16 below — the mark reads as pushed down onto the author row rather than
  sitting at the top of the card. There is no single derived value here: against
  a reference card, normalising by logo height suggests ~72px and normalising by
  panel width suggests ~33px, because that reference panel is far wider. 40px
  sits between the two and held up best when the candidates were rendered and
  compared directly.
- Author row: kept on two lines, display name above `@handle`. ThreadsFrame
  collapsed to the handle alone because Threads shows only the handle by
  default; X shows both, and a card should look like the platform it came from.
  Avatar stays at `2.6 × size` (52px at the default) so it can anchor two lines.
- Absolute and relative time: `0.8 × size` at opacity `0.45`.
- Divider: opacity `0.13`. Metrics: `0.8 × size` at opacity `0.45`, with icons
  at `0.85/0.8 em` so they scale with the row including the narrow-card path.
- Metrics no longer overrun the divider above them. `statsFitScale()` used to
  divide the available width by an estimated natural width of
  `baseFontSize × 14`; that coefficient was tuned against the old metric type
  size, so once the row grew the estimate under-read the real width, the
  down-scale never engaged, and the row overflowed its container to the right —
  visibly wider than the rule above it. It now takes a **measured** natural
  width (the row is laid out at `max-content`, and `offsetWidth` ignores the
  transform, so the measurement cannot chase its own result). Measured in
  Chromium at text sizes 20/28/34/40: the previous build overflowed by
  15–65px, the current one by at most 0.2px.
- Brand: `0.62 × size`, weight `400`, opacity `0.3`, letter-spacing removed, and
  the copy is now `XFrame · gariber.studio`. Weight `300` at opacity `0.36` sent
  two conflicting signals — thin but bright — so the corner floated out; it is
  now the lightest layer on the card. The domain-suffixed form matches
  ThreadsFrame so cards from both products read as one brand. Its gap above is
  `0.9 × size` rather than the `0.5 × size` rule gap: as the card's sign-off it
  was sitting close enough to the metrics row to read as part of it.
- The opacity relationships are pinned in `CARD_ALPHA` and asserted as
  relationships, not just values: time equals metrics, brand is below metrics,
  divider is below brand.

## Geometry and responsive checks

- Platform mark center matched the card center at `195px` in the mobile viewport.
- Platform mark was above the author row.
- DOM order was verified as time → divider → stats → brand.
- All statistics remained on one line.
- The brand's right edge matched the footer's right edge.
- No horizontal overflow: page `scrollWidth = 390`, viewport width `390`.
- The same ordering and no-overflow checks also passed with a longer text post.

## Interaction and runtime checks

- Verified URL input, card generation, `9:16` aspect, and absolute-time selection in the local preview.
- The requested header and footer surfaces were verified in the real browser, not only in component tests.
- The selected public media post could not be fetched through the public post endpoint during this pass, so the browser capture uses a text post. Existing media rendering code was not changed; component tests cover the shared constrained-card structure.
- No actionable P0, P1, or P2 visual issue remains on the selected surfaces.

## Issue history

- P2 before fix: the X mark occupied the upper-right of the author row instead of forming a clear platform header.
- P2 before fix: metrics and the brand competed for one narrow footer line, creating an uneven lower-right cluster.
- Fixed: introduced a centered platform row and separated the footer into divider, metrics, and right-aligned brand layers.
- P2 after the first pass: ordering matched ThreadsFrame but the proportions did
  not, because the first pass preserved XFrame's own typography and opacities by
  design. The logo read too large and too bright, the two-line author block made
  the header top-heavy, and the brand floated in the lower-right corner.
- Fixed: derived every size from the text-size setting and took the ratios,
  weights, and opacities from ThreadsFrame's renderer. See the second-pass
  section above.

## Safari translation: why the dedicated tab still exists

Safari's page translation translates the **whole page**, and it only offers the
"Translate to Traditional Chinese" action when it detects the page as being in
another language. The XFrame UI is in Chinese, so the app's own page is detected
as Chinese and the action is never offered — which is why the foreign post text
is isolated on a dedicated page whose language is set to the post's language.
Doing it inside the app page is not a layout problem that can be tidied away; it
is what Safari's translation is scoped to.

What was removed is the manual return trip: the bridge tab now calls
`window.close()` after a successful send. It was opened by `window.open`, so it
can close itself, and the browser drops the user back on the XFrame tab with the
translation already delivered (the main tab listens for the `storage` event). If
the call is ignored — a tab the user opened themselves rather than one XFrame
opened — the existing on-screen instruction stays and nothing breaks.

## Verification

- `npm test` — 387 passed / 387. Assertions that encoded superseded header and
  brand values were rewritten to the current spec rather than deleted; new tests
  cover `cardScale()`, the `CARD_ALPHA` ordering, the rule that the logo and
  brand track the text size, the guarantee that a fitted metrics row never
  exceeds its available width, and the bridge tab closing itself.
- `npm run build` and `npm run build:web` both clean, including `tsc --noEmit`.
- Geometry measured in headless Chromium against a **static build** of the
  preview harness. The dev server's HMR served stale modules during this pass
  and produced two misleading readings before that was caught; measurements
  taken against a running dev server should not be trusted here.
- Not verified visually: the constrained-media path needs images from
  `pbs.twimg.com`, which the sandbox cannot reach, so the media fixture degrades
  to its text-only layout. Covered by component tests and the `compact` branch
  of `cardScale()`, but not re-checked in a real browser with images present.
- Not verified: the Safari behaviour itself. There is no Safari in the build
  environment, so the `window.close()` return path is covered only by a unit
  test asserting the call.

final result: passed
