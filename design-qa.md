# XFrame design QA — 2026-08-16

## Surfaces compared

- Direction reference: `/tmp/codex-remote-attachments/01a00673-5341-7f83-9a55-66b56fad37a0/079B888D-B7B2-459E-9FD8-62B1EF0CDA8D/1-貼上的圖片-1.jpg`
- Current-layout reference: `/tmp/codex-remote-attachments/01a00673-5341-7f83-9a55-66b56fad37a0/DE8D5F80-1794-4D12-ACCA-AE5207ABA99E/1-照片-1.jpg`
- Latest desktop capture: `/tmp/xframe-design-qa-latest-full.jpg`
- Latest card crop: `/tmp/xframe-design-qa-latest-card.jpg`

The current-layout reference and latest card crop were inspected together in one comparison pass. Dynamic post content differs, so the comparison was limited to the explicitly selected surfaces: header alignment, timestamp position, footer alignment, panel treatment, and brand hierarchy.

## Result

- No macOS window controls are present.
- The avatar is circular.
- The official X mark is at the upper right. Measured centers match exactly: avatar center `256.2175px`, X mark center `256.2175px` in the desktop capture.
- Absolute time remains below the post body/media/quote and above the footer metadata row.
- Interaction metrics stay on the lower left. `XFrame · Gariber Studio` is low-contrast, light-weight text on the lower right and shares the metrics baseline; it has no border, rule, pill, or background.
- The panel keeps the selected translucent dark-glass direction while omitting the reference's macOS chrome.

## Responsive and interaction checks

- Desktop production preview: `1280 × 720`; no horizontal overflow (`scrollWidth = 1280`).
- Mobile viewport: `390 × 844`; no horizontal overflow (`scrollWidth = 390`). Card bounds were `61.59–328.41px`; translation panel bounds were `16–374px`.
- Tested absolute-time selection, editable translation draft, explicit Apply, original restore, and PNG generation flow.
- Browser console contained no application errors; only Vite development connection/update debug messages.
- Safari bridge handoff logic is covered by browser-independent tests. A new live Safari menu smoke test could not be completed in this pass because the Mac was locked; no unlock credential was requested or accepted.

## Issue history

- P1: Preact reflected a string `translate="no"` prop as `translate="yes"` in a real browser. Fixed by setting the enumerated HTML attribute directly.
- P1: Safari treated the mixed-language main application as Chinese, leaving Traditional Chinese translation unavailable. Replaced the same-page mechanism with a dedicated English translation source page and explicit send-back step.
- P2: The sticky preview could cover translation controls while scrolling. Fixed with translation-panel stacking and scroll margins.
- Final comparison found no remaining P0, P1, or P2 visual issues on the selected surfaces.

final result: passed
