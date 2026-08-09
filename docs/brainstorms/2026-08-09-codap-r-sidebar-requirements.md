---
date: 2026-08-09
topic: codap-r-sidebar
---

# CODAP ↔ R Translation Sidebar Plugin

## Problem Frame

Learners who know how to explore data in CODAP have no bridge from that fluency to R programming, and learners reading R code have no way to see what it *does*. This plugin is that bridge: a sidebar plugin for CODAP v3 that translates the learner's CODAP moves into annotated, runnable R code in real time, with an embedded R interpreter so learners can prove to themselves that the code does what CODAP did. The ultimate aim is bidirectional translation (R code driving CODAP); v1 establishes the CODAP → R direction and the architecture the reverse direction will build on.

Primary audience: students and teachers in data-science-adjacent courses who are CODAP-comfortable and R-curious.

## Requirements

**Translation core (CODAP → R)**
- R1. Capture CODAP document events via the plugin API and translate them into idiomatic **tidyverse** R (`dplyr` for data moves, `ggplot2` for graphs).
- R2. V1 move coverage: **data moves** (dataset import/creation, filtering, sorting, attribute creation with formulas, deletion), **graph moves** (graph creation, axis assignment, color/legend, movable lines/means), and **hierarchy/grouping moves** (nested-table drags → `group_by()`/`summarize()`).
- R3. Selection/highlighting moves are **not** translated in v1, but the event-capture layer must record them (or be extensible to) so a later pass can capture them ephemerally and reify them into code on demand.
- R4. Every generated snippet is validated by executing it in the embedded interpreter against the actual data; code shown to learners must be code that runs. *(Amended 2026-08-09, owner-approved during plan review: blocks may render in a visibly-marked pending state; only the "validated" badge asserts runnability; failed blocks are visibly quarantined and commented out on export so exports always run.)*

**The annotated script**
- R5. Moves append to a running, chronological R script; each block is paired with a plain-language explanation connecting the move to the code (e.g., "You filtered to mammals → `filter(diet == "meat")`").
- R6. The script pane is read-only; any block can be sent to the console to run or modify there (console edits never affect CODAP in v1).
- R7. The script is exportable as a `.R` file.
- R8. Undo in CODAP is **narrated, not erased**: the undone block is visibly struck/dimmed and a note is appended. The script is append-only, honest history — teaching that code workflows revise rather than undo.
- R9. When the plugin opens into a document with existing state, it generates a **setup preamble** (data loading + reconstruction of existing tables/graphs) so the script is a complete, runnable program from line one.

**Embedded R interpreter (webR)**
- R10. A learner-facing R console panel: run generated blocks or freely entered R, see real output including rendered `ggplot2` plots, alongside CODAP's own representations.
- R11. The same interpreter performs the R4 background validation. Runs fully in-browser (webR/WebAssembly); no server-side R.

**Code ↔ CODAP linking**
- R12. Hover (and keyboard-focus) cross-highlighting: pointing at a script block/token highlights the corresponding CODAP component or cases via the plugin API, and where feasible the reverse.
- R13. Text layout uses a **hybrid overlay** architecture: real DOM text is the accessible source of truth, with canvas/SVG overlay layers for dynamic effects. The architecture must preserve the future capability of an interactive sprite/overlay from another window **dynamically displacing sidebar text** (Pretext's reflow-free layout is what makes this possible). *(Amended 2026-08-09, owner-approved during plan review: Pretext is deferred from v1 — native DOM measurement (`Range.getClientRects()`) anchors v1 overlays exactly and for free, while research showed Pretext predicting DOM positions inverts its design. A construction contract — per-line DOM elements, named fonts, shared layout constants, `(line, charRange)` token addressing — keeps the flip to Pretext-owned layout cheap when the sprite-displacement feature is scheduled, which is the feature Pretext's own showcase demo implements.)*

**Plugin packaging & host integration**
- R14. Built on the CODAP plugin starter framework (React/TypeScript, `@concord-consortium/codap-plugin-api`) for ecosystem compatibility; ships as a standard plugin tile presented as a tall, collapsible sidebar-shaped panel. No CODAP core changes required.
- R15. Targets CODAP v3.

**Quality bars**
- R16. Fully accessible: WCAG 2.2 AA — screen-reader-usable script and console, full keyboard operation (including cross-highlight via focus), reflow zoom, visible focus, reduced-motion respect for overlay effects.
- R17. Fully tested, production quality: automated coverage of translation rules (including R4 executable validation in CI), UI, and accessibility.

## Success Criteria
- Classroom-pilot ready: deployed at a stable URL, solid enough for facilitated classroom/PD pilots with real learners; catalog/ecosystem release is the follow-on.
- A learner can complete a CODAP exploration (load data, filter, group, graph) and walk away with a complete, annotated, runnable `.R` script reproducing it — verified by running it in the console.
- Every script block shown has passed live validation; no code is ever presented *as runnable* without validation. *(Amended per R4 amendment: pending and failed states are visibly marked; exports always run.)*
- The plugin passes WCAG 2.2 AA evaluation for its core flows.

## Scope Boundaries
- **R → CODAP translation is out of scope for v1.** The annotated-script and event architecture should not preclude it, but no R parsing ships in v1.
- Selection/highlighting translation deferred (see R3).
- Animated token effects (code flying/morphing between sidebar and CODAP) deferred; v1 ships hover cross-highlight only. The Pretext overlay layer is the foundation they'll build on.
- Console edits do not drive CODAP; the console is a sandbox.
- No dialect toggle: tidyverse only in v1.
- No CODAP core changes; no native dock slot work.

## Key Decisions
- **CODAP → R first**: the tractable direction, teaching R through moves the learner already knows; the reverse direction is a separately-scoped future effort.
- **Tidyverse dialect**: modern teaching standard; maps naturally onto CODAP verbs (filter→`filter()`, grouping→`group_by()`, graphs→`ggplot()`).
- **webR for the interpreter**: mature (0.6.0, June 2026, R 4.6.0), fully in-browser, no server dependency — and doubles as the validation engine.
- **Hybrid overlay for Pretext**: DOM text keeps accessibility native; Pretext earns its keep where DOM can't perform (measurement, overlay effects, future text displacement).
- **Plugin tile, not native dock**: zero coupling to CODAP core timelines; docking is by convention.
- **Annotated append-only script**: preserves the story of the learner's exploration; undo narration and setup preamble keep it both honest and runnable.
- **Accessibility target WCAG 2.2 AA** (assumed as the appropriate bar; adjust if Concord policy specifies otherwise).

## Dependencies / Assumptions
- CODAP v3's notification stream exposes enough event detail to detect the R2 move families (validate early — this is the load-bearing assumption).
- webR can load `dplyr` + `ggplot2` in a classroom-network context with acceptable startup cost; webR's threading needs (SharedArrayBuffer/cross-origin isolation) are compatible with the deployment host.
- Pretext (`@chenglou/pretext`) is production-viable as a measurement/overlay engine (widely adopted, ~50k stars).

## Outstanding Questions

### Resolve Before Planning
- (none)

### Deferred to Planning
- [Affects R1, R2][Needs research] Audit the CODAP v3 plugin API notification stream: which of the R2 move families are observable today, at what granularity, and what's missing in the v3 beta?
- [Affects R2][Needs research] CODAP formula language → R expression translation: define the supported formula subset and the fallback behavior for untranslatable formulas.
- [Affects R10, R11][Technical] webR loading strategy: package caching, lazy loading of tidyverse, cross-origin isolation headers vs. channel fallback, and ggplot2 graphics-device output into the console panel.
- [Affects R12][Needs research] What the plugin API supports for programmatic highlighting of components/cases (and reverse notification of host-side hover/focus), and cross-iframe coordinate mapping for overlay anchoring.
- [Affects R9][Technical] Setup-preamble fidelity: which pre-existing component types can be faithfully reconstructed in R, and how the preamble degrades when one can't.
- [Affects R13][Technical] Concrete Pretext integration: where measurement runs, how overlay layers composite over DOM text, and how the future sprite-displacement capability constrains the text-rendering component's design.
- [Affects R17][Technical] Test stack selection: unit harness for translation rules, webR-in-CI execution validation, end-to-end against a hosted CODAP v3, and automated a11y checks.

## Next Steps
→ `/ce:plan` for structured implementation planning
