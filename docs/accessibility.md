# Accessibility — conformance notes and manual test scripts

Target: **WCAG 2.2 AA** (origin R16). This file records what is automated,
what is designed-in, and the manual screen-reader passes still to run.

## Designed-in (by construction)

| Concern | Mechanism |
|---|---|
| Live narration | Pre-created `role="status"` announcer; speaks the *annotation*, never code; debounced/coalesced bursts; suppressed while collapsed with one summary on expand |
| Script pane semantics | Plain semantic HTML (`<pre><code>`, per-line spans); `aria-describedby` block→annotation; roving tabindex with arrow keys; statuses as icon + text, never color alone |
| Console | `role="log"` output (polite, non-atomic — REPL semantics); focus stays in input after eval; ↑/↓ history; Esc leaves the input; Stop R ≥24px |
| Cross-highlight | One code path for hover and keyboard focus; Esc dismisses (1.4.13); static outline (reduced-motion safe); learner selection always wins over restore |
| Boot experience | Staged plain-language `role="status"` copy; disabled-but-visible input; pre-validator block status distinct from "checking" |
| Reflow (1.4.10) | Pane is vertical-flex; code blocks scroll in their own `overflow-x` container; console entries wrap |
| Targets (2.5.8) | All controls ≥24px (asserted in `playwright/a11y.spec.ts`) |
| Focus (2.4.7/2.4.11) | 2px offset outlines (2.4.13-grade as house style); append auto-scroll never moves focus; log-follow stops when scrolled up |

## Automated coverage

- `jest-axe` on component states: empty shell, populated pane, console (structural checks; jsdom can't judge contrast/geometry).
- `@axe-core/playwright` in real CODAP (`playwright/a11y.spec.ts`), tags `wcag2a wcag2aa wcag21aa wcag22aa`: empty, collapsed/expanded, reflow, target-size sweep.
- Functional a11y as plain Playwright tests: keyboard collapse/expand, Esc dismiss (in `in-codap.spec.ts` / controller unit tests).

Automated scans catch roughly 30–50% of WCAG issues; the rest needs humans.

## Manual screen-reader passes (REQUIRED before pilot — not yet run)

Record results per pass below. NVDA + Chrome (Windows) and VoiceOver + Safari
(macOS), three scripted journeys each:

### Journey 1 — "Hear the script grow"
1. Open CODAP with the plugin and a small dataset.
2. Filter cases, add a formula attribute, group by an attribute, make a graph, set both axes.
3. **Expect:** one polite announcement per gesture (annotation text, not code); no announcement spam on bursts; block statuses readable when navigating blocks; code readable as plain text line by line.

### Journey 2 — "Run code in the console"
1. Wait through the boot staging (each stage should be announced once).
2. Run `1 + 1`, then a `ggplot` of the dataset, then a deliberate error.
3. **Expect:** results announced from the log without focus moving; the plot exposed with its text alternative; the error read once, not repeatedly; Stop R reachable and understandable.

### Journey 3 — "Keyboard-only cross-highlight"
1. Tab into the script pane; arrow between blocks.
2. **Expect:** focusing a data block announces its annotation; the matching CODAP cases visibly highlight; Esc dismisses; leaving restores the prior selection; no selection events pollute the undo stack (verify with Ctrl/Cmd+Z afterwards — spike question #8).

| Date | AT | Journey | Result | Issues filed |
|---|---|---|---|---|
| — | NVDA + Chrome | 1–3 | pending | |
| — | VoiceOver + Safari | 1–3 | pending | |

## Known gaps / decisions

- 400% zoom pass: covered indirectly by the 320px reflow test; a manual zoom
  pass belongs in the pilot-readiness checklist.
- Text-spacing override (1.4.12): code panes use relative line-height; manual
  bookmarklet check pending.
- Console plot canvases have text alternatives but no data-table equivalent —
  the data itself is in the adjacent script/table (accepted for pilot).
