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
- Platform mark: `1.5 × size`, opacity `0.5`. It was fixed-size at opacity
  `0.9`, which made a platform annotation compete with the post body.
- Author row: collapsed to a single line carrying the handle only, matching
  ThreadsFrame's `作者列改標帳號，不再顯示暱稱`. Avatar is now `1.75 × size`
  (≈35px at the default) rather than `52px`. The two-line author block plus the
  logo row above it had made the header heavier than the content it introduced.
- Absolute and relative time: `0.8 × size` at opacity `0.45`.
- Divider: opacity `0.13`. Metrics: `0.8 × size` at opacity `0.45`, with icons
  at `0.85/0.8 em` so they scale with the row including the narrow-card path.
- Brand: `0.62 × size`, weight `400`, opacity `0.3`, letter-spacing removed, and
  the copy is now `XFrame · gariber.studio`. Weight `300` at opacity `0.36` sent
  two conflicting signals — thin but bright — so the corner floated out; it is
  now the lightest layer on the card. The domain-suffixed form matches
  ThreadsFrame so cards from both products read as one brand.
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

## Verification for the second pass

- `npm test` — 382 passed / 382. The three assertions that encoded the old
  header and brand were updated to the new spec rather than deleted, and new
  tests cover `cardScale()`, the `CARD_ALPHA` ordering, and the rule that the
  logo and brand track the text size.
- `npm run build` and `npm run build:web` both clean, including `tsc --noEmit`.
- Rendered in headless Chromium against the `plain` and `media` fixtures at
  absolute-time settings, and compared before/after side by side.
- Not verified visually this pass: the constrained-media path needs images from
  `pbs.twimg.com`, which the build sandbox cannot reach, so the media fixture
  degraded to its text-only layout. That path is covered by component tests and
  by the `compact` branch of `cardScale()`, but it has not been re-checked in a
  real browser with images present.

final result: passed
