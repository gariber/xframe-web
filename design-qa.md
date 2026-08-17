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
- The footer now follows the ThreadsFrame hierarchy: absolute time, subtle divider, single-line interaction metrics, then `XFrame · Gariber Studio` on a separate right-aligned row.
- The brand remains deliberately quiet: smaller type, weight `300`, low opacity, no badge, underline, or enclosing decoration.
- The divider belongs to footer structure, not to the brand treatment. It uses the current text color at `0.14` opacity so it does not compete with content.
- The statistics row alone may scale on a narrow card. The brand no longer competes with statistics for the same horizontal line.
- No new imagery or visual assets were introduced. The existing official X path from Simple Icons remains in use.

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
- P2 before fix: metrics and `XFrame · Gariber Studio` competed for one narrow footer line, creating an uneven lower-right cluster.
- Fixed: introduced a centered platform row and separated the footer into divider, metrics, and right-aligned brand layers.

final result: passed
