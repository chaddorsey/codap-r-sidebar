---
title: "feat: CODAP ↔ R Translation Sidebar Plugin (v1: CODAP → R)"
type: feat
status: active
date: 2026-08-09
origin: docs/brainstorms/2026-08-09-codap-r-sidebar-requirements.md
deepened: 2026-08-09  # 5-persona document review; 2 auto-fixes, 8 batch fixes, 6 owner-ratified decisions folded in
---

# feat: CODAP ↔ R Translation Sidebar Plugin (v1: CODAP → R)

## Overview

Build a production-quality, fully accessible CODAP v3 plugin (React/TypeScript, from the Concord starter project) that observes a learner's CODAP moves and translates them into an annotated, runnable tidyverse R script, validated and runnable in an embedded webR console. V1 ships the CODAP → R direction, hover/focus cross-highlighting, and a classroom-pilot deployment. The architecture reserves two future capabilities: R → CODAP translation, and Pretext-driven dynamic text displacement.

## Problem Frame

Learners fluent in CODAP have no bridge to R; learners reading R can't see what it does. The plugin narrates CODAP moves as accumulating R code, proves the code works via an embedded interpreter, and links code to the CODAP components it describes. See origin: `docs/brainstorms/2026-08-09-codap-r-sidebar-requirements.md`.

## Requirements Trace

Traced to origin doc requirement IDs:

- R1–R2: Translation of data, graph, and hierarchy moves to tidyverse R → Units 2, 3, 4
- R3: Selection events recorded but untranslated (reserve reify-on-demand) → Unit 2
- R4: Every displayed snippet validated by execution → Unit 5
- R5: Annotated append-only script → Units 3, 6
- R6: Send-to-console → Units 6, 7
- R7–R8: `.R` export, undo narration → Unit 6
- R9: Setup preamble → Units 2 (snapshot), 3 (generation), 6 (presentation)
- R10: Learner console → Unit 7
- R11: Background validation, in-browser webR → Unit 5
- R12: Hover/keyboard cross-highlight → Unit 8
- R13: Hybrid overlay; Pretext future-capability preserved → Units 6, 8 (see Key Technical Decisions)
- R14–R15: Starter-framework plugin tile, CODAP v3 → Unit 1
- R16: WCAG 2.2 AA → Units 6, 7, 8, 9
- R17: Fully tested, production quality → every unit + Unit 9

## Scope Boundaries

Carried from origin doc:
- No R → CODAP parsing in v1 (architecture must not preclude it).
- No selection/highlighting *translation*; events are recorded only.
- No animated token effects; v1 linking is hover/focus cross-highlight.
- Console is a sandbox — console edits never drive CODAP.
- Tidyverse only; no dialect toggle. No CODAP core changes.

## Context & Research

### Relevant Code and Patterns (external — greenfield repo)

- **Starter project** (`concord-consortium/codap-plugin-starter-project`): webpack 5, React 19, TS 5.8, Jest 29 + ts-jest + Testing Library (jsdom), Playwright ~1.51 E2E driving the plugin inside hosted CODAP (`https://codap3.concord.org/?di=<local-url>` via `frameLocator(".codap-web-view-iframe")` + role-based locators), local HTTPS certs, GitHub Actions CI → Codecov + S3 deploy (`concord-consortium/s3-deploy-action@v1`). Copy these conventions verbatim.
- **Plugin API** (`@concord-consortium/codap-plugin-api` ^0.1.7 + `iframe-phone`): `initializePlugin` handshake (`update interactiveFrame` w/ dimensions → `get interactiveFrame` returns `savedState`), `codapInterface.on(action, resource, op, handler)`, auto-registered `get interactiveState` responder for document-save persistence.
- **CODAP v3 host**: itself React/TS; uses CodeMirror 6 (`@uiw/react-codemirror`) for its formula editor — precedent for our console input.

### Key Research Findings (full details in agent reports; load-bearing facts below)

**CODAP v3 notification coverage** (source: v3 repo `data-set-notifications.ts`, `graph-notification-utils.ts`, and `v3/doc/v2-v3-compatibility-audit.md`, 2026-05-08):
- Solid in v3: `documentChangeNotice` (`dataContextCountChanged`, `dataContextDeleted`), `dataContextChangeNotice[<name>]` (`createCases`, `updateCases`, `deleteCases`, `selectCases`, `moveCases`, `createCollection`, `deleteCollection`, `createAttributes`, `updateAttributes`, `deleteAttributes`, `moveAttribute`, hide/show attrs…), `component` notices (`create`, `delete`, `update`, `attributeChange` w/ `{attributeId, plotType, primaryAxis}`, `legendAttributeChange`), `global[<name>]` (sliders), `undoChangeNotice` (`undoAction`/`redoAction`), `logMessageNotice` (log monitor), drag-drop notices.
- **Gaps in v3**: no adornment toggle/drag notifications (movable line/point/value, LSRL, plotted mean/median), no `edit formula`, no `displayOnlySelected`/filter-formula notices, no table expand/collapse. Mitigations: re-`get` `attribute[<name>]` (returns `formula`) on `updateAttributes`; on graph `component` notices, re-`get` and **diff `adornmentList`/`component[<id>]`** (v3-only adornment request API exists: `kMovableValueType`, `kMeanType`, `kMedianType`, `kLSRLType`, …); use `logMessageNotice` as supplementary channel.
- Snapshot for setup preamble fully supported: `dataContextList` → `dataContext[<name>]` (whole hierarchy + attributes incl. formulas) → `componentList` → `component[<id>]` (graphs return `xAttributeName`, `yAttributeNames`, `legendAttributeName`, split attrs, `pointConfig`: `points|bars|bins|histogram`, axis bounds, `filterFormula`).
- Programmatic control for cross-highlight: `create/update dataContext[<name>].selectionList` (replace/add selection; highlights across all CODAP components); `notify component[<id>] {request: "select"}` (also `autoScale`). Self-originated requests don't echo back as notifications (verify in v3).
- v3 coalesces bulk case creation → fewer, larger `createCases` notifications.

**webR 0.6.0** (R 4.6.0; source: official docs + repo.r-wasm.org verified 2026-08-09):
- Inside a cross-origin iframe of a host we don't control, cross-origin isolation is unobtainable → **PostMessage channel, planned-for, not fallback**. Consequences: no `interrupt()` (runaway code requires `webR.close()` + re-init), no nested `readline()`/`browser()`; top-level REPL stdin works. ServiceWorker channel was removed in v0.5.5 — do not design around it. Bonus: IDBFS (IndexedDB persistence) is PostMessage-only.
- Sizes (compressed, verified): base runtime ≈ 12.2 MB; dplyr closure ≈ 6.6 MB; ggplot2 closure ≈ 14.4 MB; **combined 25 pkgs ≈ 19 MB**. Install `dplyr`/`ggplot2`/`tidyr` directly — never the `tidyverse` meta-package. Binaries at `repo.r-wasm.org` are ABI-locked to the webR version (Emscripten 4.0.8 break in 0.6.0) — pin versions together.
- Classroom strategy: self-hosted `rwasm::make_vfs_library()` image (`library.data` + metadata, HTTP-cacheable, CORS required) mounted via `webr::mount()`; IDBFS for client-side persistence after first load.
- Validation primitive: `Shelter.captureR(code, {env})` → `{result, output: [{type, data}], images: ImageBitmap[]}`; sandbox per-run envs; `shelter.purge()` prevents leaks. Errors surface via `captureConditions`.
- Graphics: `webr::canvas()` on OffscreenCanvas; `Console` class exposes `canvasImage(ImageBitmap)`/`canvasNewPage` callbacks; captured evals return `images` arrays. Node has no OffscreenCanvas → CI plot assertions use Cairo `png()` device or `ggplot_build()`.
- Data in: array-of-objects (CODAP items shape) converts directly to data.frame via `RDataFrame`; large data via `FS.writeFile` + `read.csv`. Sanitize mixed-type columns first.
- Node ≥ 17 officially supported; runtime loads from `node_modules` (no CDN, no headers); SAB channel available in Node; `NODEFS` mounts for a vendored package library in CI.

**Pretext 0.0.8** (source: cloned repo, npm tarball):
- Two-phase `prepare`/`layout`; per-line variable width via cursor iterator (`layoutNextLineRange`) is the sanctioned obstacle-flow mechanism — the repo's `dynamic-layout` demo *is* our future sprite-displacement feature (real-time reflow around moving hulls; layout ~0.1 ms class).
- Line-break/height accuracy: 7680/7680 vs Chrome/Safari/Firefox; but token-level x-positions are "for line breaking, not exact glyph-position data"; `system-ui` banned on macOS; pre-wrap supported in core but **not** in rich-inline.
- **Verdict for v1**: `Range.getClientRects()` on DOM text is exact and free for hover-anchoring; Pretext earns its keep only when it *owns* layout (the sprite feature). v0.0.8, ~3.5 months old — too young to own the accessible text path today.
- Future-proofing contract (cheap, do in v1): per-line DOM elements; named/loaded fonts only (never `system-ui`); line-height/letter-spacing/tab-size as shared constants; address tokens by `(line, charRange)` so they map onto Pretext `LayoutCursor`s later.

**Testing & accessibility** (source: Concord repos' CI + W3C/MDN + webR docs):
- Concord has no automated-a11y convention in public repos — we set the precedent: `jest-axe` (structural, jsdom) + `@axe-core/playwright` (real-browser: contrast, target size) tagged `wcag2a, wcag2aa, wcag21aa, wcag22aa`; automated scans catch ~30–50% → scripted manual NVDA + VoiceOver passes per milestone.
- Script pane is **not** `aria-live`; a visually-hidden `role="status"` region announces the human annotation ("Added: filter cases where height > 150"), debounced/coalesced. Console output is `role="log"` (polite, non-atomic — correct REPL semantics). Live regions must exist in DOM before first injection.
- WCAG 2.2 AA specifics to design against: 2.5.8 target size 24×24, 2.4.11 focus not obscured (beware auto-scroll-on-append), 1.4.13 hover content (dismissible/hoverable/persistent), 1.4.10 reflow at 320px (code blocks may scroll in own `overflow-x: auto` container), 1.4.3 token-color contrast ≥ 4.5:1, `prefers-reduced-motion` gating for overlay effects.
- Script pane: plain semantic `<pre><code>` + token spans (no editor runtime; full ARIA control). Console input: CodeMirror 6 (matches CODAP v3; real DOM text, tab-trap escape; keep autocomplete off until SR-verified) — or plain `<textarea>` as legitimate first step.
- Test pyramid: pure-engine unit + file-based golden `.R` snapshots → webR corpus execution in Node (one shared instance, `testEnvironment: node`, serial; corpus < 1 min after boot) → jsdom component tests with a fake-CODAP harness (mock at the `codap-plugin-api` seam, not postMessage) → few Playwright E2E in hosted CODAP. Optional fast lane: `r-lib/actions/setup-r` + `Rscript` parse-only gate (native R is *advisory*; webR is truth).

## Key Technical Decisions

- **Script state model (review-ratified):** each dataset is one R variable named for it; data moves **rebind** it (`mammals <- mammals |> filter(...)`), mirroring CODAP's mutate-in-place mental model, so the script is one linear runnable program. Each graph gets a named plot object built by **delta blocks** (`p1 <- ggplot(mammals, aes(height))`, then `p1 <- p1 + aes(y = mass)`), so code isolates exactly what each move did. This one model governs the displayed script, the live validator, the CI corpus runner, and export identically — they all certify the same composed-program property.
- **Validation contract (review-ratified, amends origin R4 wording):** blocks append immediately in a visibly-marked *pending* state; only the "validated" badge asserts runnability; failed blocks are visibly quarantined and — like untranslated ones — commented out on export, so exports always run. The validator maintains a cumulative session environment (execute preamble, then each block; commit its state on success; blocks after a failed block validate against last-good state). On kill/reboot it replays preamble + previously-validated blocks before resuming the queue (bounded: sessions are tens of blocks). Schema-changing MoveEvents (attribute rename/delete/type change, dataset delete) **re-queue affected blocks** via their provenance `attrRefs`; export runs a final whole-script validation whose failure is surfaced, never silent.
- **Export data vintage (review-ratified):** each dataset is snapshotted at first observation (the same snapshot the preamble generator uses); export ships *that* as `data.csv`, so destructive moves remain script content and replaying the script on exported data reproduces the final CODAP state.
- **Three-layer core: Observer → Translation → Script model, all pure below the UI.** Observer normalizes CODAP notifications into a typed `MoveEvent` vocabulary (enriching via re-`get` where notifications are thin); the translation engine is a pure function `MoveEvent → RBlock {code, annotation, provenance}`; the script model is an append-only block store. Rationale: testability (golden fixtures), and R → CODAP later becomes "a second producer of MoveEvents / consumer of RBlocks" without touching the UI.
- **Adornment gap handled by snapshot-diffing, isolated in the Observer.** v3 emits no adornment notifications; on any graph `component` notice we re-fetch and diff adornment state. When v3 adds notifications, only the Observer changes. (see origin R2)
- **webR on the PostMessage channel by explicit design, two instances.** One instance for the learner console, one for background validation — a learner's runaway loop can't starve validation, and either can be killed/re-created (no interrupt on PostMessage). Validation uses `Shelter.captureR` in fresh envs.
- **Package loading: `repo.r-wasm.org` + IDBFS cache for development; self-hosted `rwasm` library image co-deployed on S3 for the pilot.** ~31 MB first-load budget is real for classrooms; the static library image + HTTP caching + IDBFS makes second load near-instant. webR and binary-repo versions pinned together (ABI lock).
- **V1 anchoring via `Range.getClientRects()`/CSS Custom Highlight API, not Pretext; Pretext future preserved by construction contract.** Research shows Pretext *predicting* DOM positions inverts its design and adds a fragile font-sync contract, while native DOM measurement is exact and cheap at our scale. The pane's per-line DOM structure, named fonts, shared layout constants, and `(line, charRange)` token addressing make the later flip to Pretext-owned layout (sprite displacement) a bounded change. (see origin R13 — this refines "Pretext supplies measurement" to "Pretext deferred to the feature that needs it"; the hybrid-overlay accessibility architecture is unchanged.)
- **Script pane is semantic HTML, not an editor; console input starts as a plain `<textarea>` with CodeMirror 6 as the upgrade path.** CM6 matches CODAP v3's own usage when the upgrade lands (see Open Questions); the read-only pane stays fully ARIA-controllable with zero editor runtime.
- **Untranslatable constructs degrade to annotated comment blocks.** When a formula/move can't be translated, emit an R comment block carrying the original CODAP expression + explanation, flagged visually and excluded from the validation corpus. The exported script stays runnable end-to-end (R4 preserved: all displayed *code* runs; comments aren't code). Same mechanism comments out undo-narrated blocks on export so the exported program matches final CODAP state.
- **Script persists via `interactiveFrame` `savedState`, with a jettison guardrail.** CODAP saves plugin state with the document; reopening restores the script history (including undo narration and the initial data snapshots that anchor export vintage). Staleness detection is a **snapshot digest**, not a notification watermark (notifications are ephemeral — nothing exists to compare after reopening): persist a normalized `DocumentSnapshot` digest; on init, re-snapshot and diff — match → restore, divergent → fresh preamble with a narrated note. *Owner-ratified guardrail: if this machinery proves complex or distracting during implementation, cut it — preamble-only reopen is the acceptable fallback (keep the empty savedState seam).*
- **Jest 29 + ts-jest, three Jest projects** (jsdom components / node pure-engine / node webR-corpus), Playwright for E2E and real-browser a11y. Follows starter conventions exactly; webR corpus runs as a single serial suite against one booted instance.

## Open Questions

### Resolved During Planning

- CODAP v3 event coverage (origin: deferred) → Mapped above; data/hierarchy/core-graph solid, adornments via diffing, filter/sort via `moveCases` + log monitor.
- webR loading strategy (origin: deferred) → PostMessage channel, two instances, library-image self-hosting, IDBFS.
- Pretext integration (origin: deferred) → Deferred to sprite feature with an explicit v1 construction contract; native DOM measurement in v1.
- Test stack (origin: deferred) → Jest 3-project layout + webR-in-Node corpus + Playwright(+axe) + manual SR passes.
- Cross-highlight API support (origin: deferred) → `selectionList` create/update + `component` select; both implemented in v3 handlers.
- Untranslatable-formula fallback (origin: deferred) → annotated comment blocks, excluded from validation (see Key Technical Decisions).

### Deferred to Implementation

- Exact CODAP formula-function → R translation table and its supported subset boundary — grows empirically against real formulas; the *fallback behavior* is decided, so the boundary can move safely.
- v3 `selectCases` notification payload shape (audit flags nested-shape uncertainty) and whether self-originated selection requests echo back — verify empirically in Unit 2; feedback-loop guard added only if needed.
- Whether `get component[<id>]` reliably returns `position`/`dimensions` in v3 (needed only if overlay effects extend beyond the iframe boundary; v1 cross-highlight doesn't require it).
- CM6-vs-textarea final call for console input — start textarea, upgrade when history/bracket-matching lands (both AA-compliant).
- Playwright-vs-hosted-CODAP flakiness budget — if `codap3.concord.org` E2E proves flaky in CI, pin a static CODAP build; decide after first E2E lands.
- Precise aria-live announcement wording/coalescing windows — tune during manual screen-reader passes.
- `updateCases` (cell edits): translate, record-only, or ignore — decide when the Unit 2 spike shows payload shape (review flag: currently subscribed with no stated rule).
- savedState size budget: per-block caseId provenance over large datasets could bloat the CODAP document — set a cap/truncation policy when implementing Unit 6.
- In-browser graph-block validation bar: is `ggplot_build()` sufficient or is a render required? (CI uses Cairo; the live validator's bar is an implementation call.)
- Plot canvases in a narrow sidebar may need an enlarge affordance — assess during Unit 7.
- Preamble graph reconstruction shares mapping logic with Unit 4 rules — implement one snapshot→MoveEvent replay path rather than two generators, to prevent drift.
- CODAP disconnect mid-session: read-only banner is specified; reconnect story (auto-retry vs manual) decided during Unit 1.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart LR
  subgraph CODAP host (iframe parent)
    CODAP[CODAP v3 document]
  end
  subgraph Plugin (this repo)
    OBS[Observer<br/>notifications + enrichment re-gets<br/>+ adornment diffing + snapshot]
    ENG[Translation Engine<br/>pure: MoveEvent → RBlock]
    SCRIPT[Script Model<br/>append-only blocks,<br/>undo narration, savedState]
    PANE[Script Pane UI<br/>semantic HTML + overlay layer]
    XHL[Cross-highlight Controller]
    WEBR[webR Service<br/>console instance + validator instance]
    CONSOLE[Console UI<br/>role=log + CM6 input + plot canvas]
  end
  CODAP -- notify --> OBS
  OBS -- MoveEvent --> ENG
  ENG -- RBlock --> SCRIPT
  SCRIPT --> PANE
  SCRIPT -- validate --> WEBR
  WEBR -- pass/fail --> SCRIPT
  PANE -- hover/focus --> XHL
  XHL -- selectionList / component select --> CODAP
  CODAP -- selectCases notice --> XHL
  PANE -- send block --> CONSOLE
  CONSOLE <--> WEBR
```

Data flow contracts worth locking early: `MoveEvent` (typed union per move family, carrying enough context to translate without further API calls) and `RBlock` (`{id, code | comment, annotation, provenance: {moveEvent, codapRefs: componentId/caseIds/attrRefs}, tokens: [(line, charRange, codapRef?)], status: pending|validated|failed|untranslated|undone}`). `codapRefs` powers cross-highlight; `tokens` addressing is the Pretext-compatible contract.

## Implementation Units

Phased; units within a phase are sequential unless noted.

### Phase 1 — Foundation

- [ ] **Unit 1: Scaffold, CODAP handshake, sidebar shell, CI skeleton**

**Goal:** Running plugin tile in CODAP v3 with collapsible sidebar layout, accessible landmarks, and full CI wiring.

**Requirements:** R14, R15, R16 (structure), R17

**Dependencies:** None

**Files:**
- Create: project scaffold from starter (`src/`, `webpack.config.js`, `playwright/`, `.github/workflows/ci.yml`, `.github/workflows/playwright.yml`)
- Create: `src/components/app.tsx`, `src/components/sidebar-shell.tsx`
- Create: `src/lib/codap-connection.ts` (init handshake, savedState read/write seam)
- Test: `src/components/app.test.tsx`, `playwright/in-codap.spec.ts`

**Approach:**
- Clone starter conventions wholesale (webpack 5, React 19, Jest 29 jsdom project, Playwright vs `codap3.concord.org/?di=<local>` with `frameLocator`, HTTPS certs, Codecov flags).
- Shell: tall panel with expand/collapse, landmark regions (`region` script pane, console section, toolbar), pre-created visually-hidden `role="status"` announcer node (live regions must precede content injection).
- **Layout hierarchy**: script pane dominant; console starts minimized to its input row and expands on first use or first send-to-console; keyboard-operable resizer between them; toolbar enumerates export, expand/collapse, and (once Unit 7 lands) Stop R — all ≥ 24px targets.
- **Collapsed-while-active policy**: collapsed strip shows an unread-block count badge; announcements suppressed while collapsed and coalesced to one summary on expand ("4 new steps added"); expand scrolls to newest block without moving focus.
- Set `interactiveFrame` dimensions/`isResizable`; register savedState responder from day one (empty state).
- Add the two extra Jest projects (node engine, node webR-corpus) as empty-passing configs so CI shape is final from the first PR.

**Patterns to follow:** starter `package.json` scripts, `playwright/in-codap.spec.ts` role-locator style, Concord S3 deploy action.

**Test scenarios:**
- Happy path: component renders with mocked `initializePlugin`; landmarks and status region present and labeled.
- Integration (E2E): plugin loads inside hosted CODAP v3; expand/collapse works via keyboard; axe scan of empty state passes.
- Error path: `initializePlugin` rejection renders a non-blocking "not connected to CODAP" state (plugin opened standalone).

**Verification:** CI green on Jest + Playwright + axe empty-state scan; plugin visibly docks as sidebar-shaped tile in CODAP v3.

- [ ] **Unit 2: Observer — MoveEvent vocabulary, subscriptions, enrichment, snapshot**

**Goal:** All R2 move families (plus recorded-only selection) emerge as typed `MoveEvent`s; document snapshot supports the preamble.

**Requirements:** R1, R2, R3, R9 (snapshot half)

**Dependencies:** Unit 1

**Files:**
- Create: `src/models/move-events.ts` (typed union), `src/services/codap-observer.ts`, `src/services/codap-snapshot.ts`
- Create: `src/test-support/fake-codap.ts` (harness: canned responses, notification injection)
- Test: `src/services/codap-observer.test.ts`, `src/services/codap-snapshot.test.ts`

**Approach:**
- Subscribe: `documentChangeNotice`, `dataContextChangeNotice[<name>]` per context (re-subscribe on context count change), `component`, `global`, `undoChangeNotice`, log monitor.
- Enrichment re-gets: attribute formula on `createAttributes`/`updateAttributes`; graph config + adornment diff on graph `component` notices (keep last-known adornment state per graph).
- Emit `SelectionEvent`s into the same stream, marked non-translating (R3 reserve).
- Snapshot: `dataContextList` → contexts (hierarchy + formulas) → `componentList` → graph configs; returns a typed `DocumentSnapshot`.
- Mock at the plugin-api seam (jest.mock), never at postMessage.

**Execution note:** Verify empirically early (throwaway spike in real CODAP, results recorded as harness fixtures): `selectCases` payload shape, self-echo behavior of own selection requests (for both loop-guarding *and* recording exclusion), `moveCases` emission on sort, `get selectionList` support, what notifications accompany `undoAction`, and — critically — what (if anything) fires on adornment toggle/drag (`component` update, `logMessageNotice`, or nothing). If adornment actions emit nothing, the specified fallback is a log-pattern-triggered re-diff or a low-frequency poll of open graphs; if that also proves unworkable, descoping movable-value *dragging* from R2 becomes an origin-doc amendment to raise with the owner.

**Test scenarios:**
- Happy path: one canned notification per move family → exactly the expected MoveEvent (table-driven across all v3 operation names).
- Edge: coalesced bulk `createCases` (arrays) → single MoveEvent with correct case count; renamed v3 operation strings accepted loosely.
- Edge: adornment diff — same graph notice with unchanged adornments emits nothing; added mean emits `AdornmentAdded`.
- Error path: enrichment re-`get` fails/times out → MoveEvent emitted with `enrichment: unavailable`, no crash, warning logged.
- Integration: snapshot of a two-context, hierarchical, two-graph canned document matches fixture `DocumentSnapshot`.

**Verification:** Fake-harness suite covers every v3 operation string from the research table; live spike checklist recorded in `docs/notes/`.

### Phase 2 — Translation

- [ ] **Unit 3: Translation engine — data + hierarchy moves, formulas, preamble**

**Goal:** Pure engine turning data/hierarchy MoveEvents and DocumentSnapshots into annotated dplyr blocks.

**Requirements:** R1, R2 (data+hierarchy), R5, R9

**Dependencies:** Unit 2 (types only — can start once `move-events.ts` lands)

**Files:**
- Create: `src/translation/engine.ts`, `src/translation/rules/data-moves.ts`, `src/translation/rules/hierarchy-moves.ts`, `src/translation/formula-translator.ts`, `src/translation/preamble.ts`, `src/translation/r-syntax.ts` (escaping, name sanitization, pipe assembly)
- Create: `src/translation/__fixtures__/*.R` (golden corpus)
- Test: `src/translation/engine.test.ts`, `src/translation/formula-translator.test.ts`, `src/translation/preamble.test.ts`

**Approach:**
- `RBlock` contract per High-Level Design (code, annotation, provenance, token addressing, status).
- Mid-session dataset import/creation rule: `dataContextCountChanged` (new context) → data-loading block reusing the preamble's `read.csv`/`tribble()` machinery — the natural first classroom move gets a first-class translation, not just preamble coverage.
- Formula translator: explicit function-mapping table (arithmetic, comparison, `mean/median/count`, string basics, `if`); anything outside → untranslated comment-block fallback (decided behavior).
- Preamble: data via `read.csv` of a co-exported CSV plus inline `tribble()` for small data (threshold ~100 cases) — annotation explains both; reconstructs collections (`group_by` framing) and existing graphs (ggplot blocks).
- Attribute/context names sanitized to valid R names with a deterministic mapping table emitted in the preamble comment.

**Execution note:** Test-first with golden `.R` files; fixtures are the same corpus Unit 5 executes — one corpus, two uses.

**Test scenarios:**
- Happy path per rule: dataset-import/filter/sort/new-attribute/delete/createCollection/moveAttribute → exact golden `.R` (one scenario per file, reviewed as code).
- Edge: attribute names with spaces/unicode/R-reserved words; empty dataset; formula referencing another computed attribute (dependency order in preamble).
- Edge: hierarchy with 3 levels → nested `group_by` narration; ungroup on `deleteCollection`.
- Error path: unknown MoveEvent type → untranslated comment block, never a throw.
- Property: every non-comment fixture parses as R (checked in Unit 5's corpus run); translation is deterministic (same event sequence → identical script).

**Verification:** Golden corpus reviewed; engine has no imports from UI or services (enforced via lint boundary or ts-project references).

- [ ] **Unit 4: Translation engine — graph moves (ggplot2)**

**Goal:** Graph MoveEvents → ggplot2 blocks covering creation, axes, legend/color, splits, pointConfig variants, adornments.

**Requirements:** R2 (graph)

**Dependencies:** Unit 3 (shares engine + fixture infrastructure)

**Files:**
- Create: `src/translation/rules/graph-moves.ts`, fixtures in `src/translation/__fixtures__/`
- Test: `src/translation/graph-moves.test.ts`

**Approach:**
- Mapping: empty graph → `p1 <- ggplot(mammals)`; axis assignment → delta block updating aes (`p1 <- p1 + aes(x = height)`; blocks narrate the *change*: "You put height on the x-axis"); legend → color/fill aes delta; top/right split → `facet_grid` delta; `pointConfig` bars/bins/histogram → `geom_bar`/`geom_histogram(bins=)`; adornments: mean/median → `stat_summary`/`geom_vline(aes(xintercept=mean(...)))` idioms, LSRL → `geom_smooth(method="lm", se=FALSE)`, movable value → annotated `geom_vline` with the dragged value.
- **Delta-block model (review-ratified):** each graph is a named plot object (`p1`, `p2`, … titled from the component); every move appends a small delta block whose code isolates exactly what the move did, matching its annotation — per the script state model in Key Technical Decisions. A bare `p1` display line follows deltas so running sequentially shows the evolving plot.
- **Pedagogy checkpoint (exit criterion for this unit):** render one realistic ~15-move session's golden script (code + annotations) as a static document and review it with a target teacher/facilitator before Phase 4 locks the UI around it; findings feed annotation wording and block granularity.

**Test scenarios:**
- Happy path: each mapping above → golden `.R`.
- Edge: numeric vs categorical axis (dot plot vs scatter → `geom_point` vs `geom_dotplot`/`geom_jitter` decision table); multiple y attributes; axis removal; legend removal.
- Edge: adornment added then removed → add block + narrated removal block.
- Error path: graph on context the observer hasn't seen (race) → untranslated block with provenance, no throw.

**Verification:** ggplot corpus renders without error under Unit 5's Cairo device run; visual spot-check of 5 representative plots vs CODAP screenshots recorded in `docs/notes/`.

### Phase 3 — R runtime

- [ ] **Unit 5: webR service + validation pipeline + CI corpus runner**

**Goal:** Managed webR instances; every RBlock validated before display claims it runs; golden corpus executes in CI.

**Requirements:** R4, R11, R17

**Dependencies:** Unit 3 (corpus), parallelizable with Unit 4

**Files:**
- Create: `src/services/webr-service.ts` (instance lifecycle: forced PostMessage channel, boot, package mount, kill/restart), `src/services/validator.ts` (queue + `Shelter.captureR` sandboxed runs), `src/services/dataset-bridge.ts` (CODAP items → data.frame; CSV path for large data)
- Create: `scripts/corpus-runner.test.ts` (node webR Jest project), `scripts/build-library-image/` (rwasm library image build, used by Unit 9 deploy)
- Test: `src/services/validator.test.ts` (mocked webR), `scripts/corpus-runner.test.ts` (real webR)

**Approach:**
- Two instances (console/validator); shared package-mount logic; version pinning webR ↔ binary repo documented in one constants file.
- Validator: serial queue over a **cumulative session environment** per the ratified validation contract in Key Technical Decisions (preamble first; `Shelter.captureR` each block in a child env, commit its state on success; blocks after a failure validate against last-good state); timeout → mark block `validation: timeout`, kill/reboot validator, **replay preamble + previously-validated blocks**, resume queue; results update RBlock status (never block UI append — blocks show "checking…" then verified). Schema-changing MoveEvents re-queue affected blocks via provenance `attrRefs`; export triggers a final whole-script validation.
- **Data provisioning contract:** on every instance boot (and after any kill/restart), write each dataset's initial-snapshot CSV into the VFS at the exact path the preamble references; console auto-runs the preamble on ready (announced once) so sent blocks always have their prerequisites; newly observed datasets get their CSV written to both instances.
- Boot strategy: init on plugin load in background; console UI gates on ready; `installPackages(['dplyr','ggplot2','tidyr'])` from pinned repo, IDBFS-cache library dir. **IDBFS has a single writer**: the first-booted instance populates and syncs the cache; the second boots after sync completes (or mounts read-only). Cache-integrity check on mount with fallback to network + cache purge — a corrupted cache must never require a facilitator to know what IndexedDB is.
- CI corpus runner: single shared instance, `testEnvironment: node`, serial; executes every executable fixture (preamble + blocks composed per scenario), asserts no error conditions; ggplot fixtures via Cairo `png()` + non-empty file assertion (no OffscreenCanvas in Node).

**Test scenarios:**
- Happy path: valid dplyr block → status `validated`; corpus runner passes entire golden corpus.
- Error path: syntactically invalid block → `failed` with captured stderr; infinite-loop block → timeout → validator restarts, replays session state, and the next queued block validates against correct cumulative state (the critical resilience test).
- Edge: attribute rename after five validated blocks → affected blocks re-queued and re-validated (pass or fail against the new schema); unaffected blocks keep their status.
- Edge: dataset with NA/empty-string/mixed-type column sanitized before bind; 10k-case dataset routed via CSV file path.
- Integration: validation of a block referencing the bound dataset actually sees the data (bind + eval round-trip).

**Verification:** CI job "webr-corpus" green in < ~3 min including boot; local kill/restart demonstrably recovers from `while(TRUE){}`; measured resident memory of one and two booted instances (packages loaded) recorded in `docs/notes/` against a 4 GB-device budget — if two instances don't fit, the single-instance degraded mode becomes the pilot default.

### Phase 4 — Learner-facing UI

- [ ] **Unit 6: Script pane — annotated blocks, narration, export, persistence**

**Goal:** The accessible annotated script experience: append, undo narration, send-to-console, `.R` export, savedState persistence.

**Requirements:** R5, R6, R7, R8, R9, R13 (contract), R16

**Dependencies:** Units 3, 1 (Unit 5 provides status; degrade gracefully without it)

**Files:**
- Create: `src/components/script-pane/script-pane.tsx`, `block.tsx`, `announcer.ts` (debounced status region), `src/models/script-store.ts`, `src/lib/export-r.ts` (zip via `fflate` when bundling >1 file), `src/lib/highlight-r.ts` (token spans; Lezer R grammar if available, else lightweight tokenizer)
- Test: `src/components/script-pane/script-pane.test.tsx`, `src/models/script-store.test.ts`, `src/lib/export-r.test.ts`

**Approach:**
- Per-line DOM elements inside `<pre><code>` per block (Pretext contract); named font stack; layout constants module shared with future overlay.
- Roving tabindex across blocks (arrow keys), `aria-describedby` block → annotation; block statuses (pending/validated/failed/untranslated/undone) conveyed by icon + text, never color alone; token colors ≥ 4.5:1 both themes.
- Announcer: coalesce appends within a gesture window; announce annotation text, not code.
- Undo narration with **provenance correlation** (review-hardened): CODAP undoes cover many untracked actions (drags, resizes), and undoing a tracked move also emits its inverse data notification. On `undoAction`: only strike a block if the accompanying inverse notification matches that block's provenance; suppress translation of inverse notifications within the undo window (no spurious new blocks); `undoAction` with no matching block is ignored. Exact notification choreography confirmed by the Unit 2 spike. Redo restores. Export comments out undone blocks so the exported script runs and matches final state.
- Export is a bundle, not a bare file: `.R` script + co-exported `data.csv` per dataset (zip via fflate when >1 file). **Data vintage: initial-observation snapshot** (per Key Technical Decisions) — replaying the script on the bundled data reproduces final CODAP state; the export must run in plain RStudio with no edits. Small datasets (≤ ~100 cases) inline as `tribble()` and need no CSV. Datasets deleted mid-session keep their snapshot so their blocks stay replayable.
- savedState: serialize script store + initial data snapshots + `DocumentSnapshot` digest into `interactiveState`; on init, re-snapshot and diff the digest — match → restore history, divergent → fresh preamble with narrated note. (Jettison guardrail per Key Technical Decisions.)
- **Empty-document first open is the onboarding**: instructional copy in the script pane ("Make a change in CODAP — drag an attribute, make a graph — and watch it become R code"), with a small example of what will appear; replaced (and announced once) when the first real block arrives.
- **Preamble presentation**: a visually distinct, collapsed-by-default "Setup — recreates what was already in your document" section with a single summary annotation, expandable to its blocks; the announcer treats it as one event, not N.
- Auto-scroll on append never moves keyboard focus (2.4.11), and uses **log-follow semantics**: auto-scroll only when the pane is already at/near the bottom; when the learner has scrolled up to reread, show a dismissible "N new steps ↓" jump affordance instead of yanking the view.
- Untranslated blocks have a defined spec: comment styling + icon + "Not translated" text label (never color alone), a learner-readable annotation explaining why R can't express the move, and send-to-console disabled with a stated reason.

**Test scenarios:**
- Happy path: MoveEvent stream → blocks render in order with annotations; export produces runnable-shaped `.R` (fixture compare).
- Edge: rapid burst of 10 moves → one coalesced announcement; script restored from savedState equals pre-save render; undo→redo round-trip restores block.
- Edge: 200-block script — pane remains scrollable/navigable; roving tabindex still O(1) stops.
- Error path: block with `failed` status shows failure affordance with captured stderr accessible via disclosure.
- a11y: jest-axe on populated pane; focus-visible on blocks; reflow at 320px width (code scrolls in own container, page doesn't scroll horizontally).

**Verification:** Exported `.R` from an E2E-recorded session runs green through the corpus runner; manual NVDA pass of "hear the script grow" journey.

- [ ] **Unit 7: R console — REPL, plots, kill/restart**

**Goal:** Learner console: run blocks or free R, see output and ggplot renders, recover from runaway code.

**Requirements:** R6 (send-to-console), R10, R16

**Dependencies:** Units 5, 6

**Files:**
- Create: `src/components/console/console.tsx`, `console-output.tsx` (role="log"), `console-input.tsx` (textarea first; CM6 upgrade path), `plot-display.tsx` (canvas + ImageBitmap draw)
- Test: `src/components/console/console.test.tsx`

**Approach:**
- webR `Console` class wiring (stdout/stderr/prompt/canvasImage callbacks); output DOM is `role="log"` `aria-label="R console output"`; long results truncated in announcement, full in log.
- **Designed boot experience** (the classroom first impression): package-download progress with plain-language staging ("Getting R ready — the first time takes a few minutes; it's fast after that"), a disabled-but-visible input during boot, and a distinct pre-validator block status in the script pane ("will check when R is ready" — different from "checking…"). Boot failure → friendly retry, script accumulation unaffected.
- Focus stays in input after eval; ↑/↓ history; Esc returns to page tab order; "Stop R" button (kill/reinit console instance, preserving package mounts) — the PostMessage no-interrupt mitigation, prominent and keyboard-reachable, 24px target.
- Plots: each `canvasNewPage`/`canvasImage` → new labeled canvas in output flow with text alternative ("Plot: <block annotation or code first line>").
- Send-to-console from script pane inserts code into input (learner presses run — keeps agency, avoids surprise announcements).

**Test scenarios:**
- Happy path: eval `1+1` → "2" appended to log (mocked webR); sent block appears in input.
- Error path: R error → stderr styled + announced once; Stop R during pending eval → instance restarts, console usable, history preserved.
- Edge: multi-page plot output → multiple canvases, each labeled; reduced-motion disables any output animation.
- Integration (Playwright, real webR): boot → run `library(dplyr)` + one ggplot → canvas becomes non-blank; axe scan of console with output.

**Verification:** Browser E2E smoke green under the PostMessage channel (the shipped configuration); manual VoiceOver pass of console journey.

### Phase 5 — Linking & hardening

- [ ] **Unit 8: Cross-highlight controller**

**Goal:** Hover/focus on script ↔ CODAP highlighting, WCAG 1.4.13-conformant.

**Requirements:** R12, R13, R16

**Dependencies:** Units 2, 6

**Files:**
- Create: `src/services/cross-highlight.ts`, `src/components/script-pane/highlight-overlay.tsx` (aria-hidden, pointer-events:none), `src/lib/anchor.ts` (Range.getClientRects + ResizeObserver cache; the Pretext-swappable seam)
- Test: `src/services/cross-highlight.test.ts`, `src/components/script-pane/highlight-overlay.test.tsx`

**Approach:**
- Script → CODAP: hover/focus on block/token with `codapRefs` → `create dataContext[..].selectionList` (cases) or `notify component[id] select`; leave → restore prior selection (captured via `get selectionList` before override — support verified in Unit 2 spike) or clear; debounce hovers. **Abandon restore if the selection changed mid-hover** (learner action wins over our restore).
- **Recording hygiene**: plugin-originated selection writes are fingerprinted and excluded from the Observer's *recorded* SelectionEvent stream (not just loop-guarded) — hover highlights must never pollute the R3 reserve. Unit 2 spike also answers whether selections enter the v3 undo stack; if so, prefer a highlight mechanism that avoids undo pollution (or document the limitation for the pilot).
- CODAP → script: `selectCases` notices highlight blocks whose provenance intersects selected cases (subtle outline + count badge).
- 1.4.13: Esc dismisses; highlight persists while pointer moves onto annotation; reduced-motion swaps any pulse for static outline.
- Guard against notification echo per Unit 2 findings (suppress or fingerprint own requests if the spike showed echo).

**Test scenarios:**
- Happy path: focus filter-block → selectionList create with exactly its caseIDs; blur → prior selection restored.
- Keyboard parity: identical behavior via focus as via hover (single code path asserted).
- Edge: block whose cases were since deleted → no-op with console-free grace; two rapid hovers → single (debounced) request; Esc dismisses and returns state.
- Error path: selectionList request fails → visual local highlight still shown, CODAP-side silently skipped, retry on next hover.
- Integration (E2E): hover in real CODAP visibly selects cases in the table (asserted via CODAP DOM through frameLocator).

**Verification:** 1.4.13 behaviors pass as plain Playwright functional tests; overlay invisible to axe/AT (aria-hidden verified).

- [ ] **Unit 9: Accessibility hardening, a11y CI, pilot deployment**

**Goal:** WCAG 2.2 AA verified; stable pilot URL; docs.

**Requirements:** R16, R17, success criteria (pilot-ready)

**Dependencies:** All prior units

**Files:**
- Create: `playwright/a11y.spec.ts` (axe scans: empty, populated, console-active, highlight-active, 320×256 @400% states), `docs/accessibility.md` (conformance notes + manual test scripts), `docs/pilot-guide.md`
- Modify: `.github/workflows/ci.yml` (a11y job, library-image build + S3 deploy)
- Test: the a11y spec itself

**Approach:**
- `@axe-core/playwright` tagged wcag2a/aa/21aa/22aa, fail-on-new-violation baseline; target-size audit of every control (2.5.8); text-spacing override test (1.4.12).
- Manual passes: scripted NVDA+Chrome and VoiceOver+Safari journeys (script growth, console, keyboard cross-highlight) — recorded results in `docs/accessibility.md`, issues triaged to closure.
- Deploy: Concord S3 action; co-deploy `library.data` image (CORS headers) + pinned webR assets; stable pilot URL documented with `?di=` embedding instructions.
- CI prerequisite for the library-image build: `r-lib/actions/setup-r` + `rwasm` pinned to the same webR ABI constants file; built image cached as a CI artifact and rebuilt only when the pin changes.
- Pilot telemetry decision deliberately omitted (not in requirements; raise before adding).

**Test scenarios:**
- axe: zero AA violations across the five scripted states.
- Functional a11y: focus never obscured after auto-append while navigating; all targets ≥ 24px; reflow at 320px.
- Deploy smoke: deployed URL loads in CODAP v3, boots webR from co-deployed assets on the PostMessage channel, validates a block end-to-end.

**Verification:** Full CI matrix green (jest ×3, corpus, playwright, a11y); manual SR checklists complete; a facilitated dry-run (load data → filter → group → graph → export → run export in console) succeeds at the pilot URL.

## System-Wide Impact

- **Interaction graph:** Plugin ↔ CODAP notification loops are the main hazard: our selectionList writes may re-enter as `selectCases` notices (self-echo verified in Unit 2 spike; fingerprint-suppress if needed), and cross-highlight must not fight the learner's own selections (capture-and-restore discipline). Observer re-gets on notification bursts must be debounced to avoid request storms under coalesced bulk creates.
- **Error propagation:** Every boundary degrades independently: CODAP disconnect → pane keeps prior script (read-only banner); webR boot failure → script still accumulates with statuses `pending`, console shows retry; translation failure → untranslated block, never a crash. No error path may lose recorded MoveEvents (append-only store is the invariant).
- **State lifecycle risks:** Three stores must not drift: CODAP document, script store, savedState snapshot — reconciled via the snapshot-digest diff on init (Key Technical Decisions). Two webR workers cost real memory: ~12–19 MB is only the *compressed download*; a booted R session with dplyr/ggplot2 loaded plausibly occupies 100+ MB of heap per instance, and two instances + CODAP v3 + the plugin must fit low-RAM classroom Chromebooks. Instances are lazily booted and the validator is restartable; a **single-instance degraded mode** (one webR, validation queued behind console use with kill/restart priority) is a designed fallback, not an afterthought.
- **API surface parity:** `.R` export, console send, and validator all consume the same RBlock corpus — one representation, three consumers, exercised by one fixture set. Future R → CODAP direction plugs in at the MoveEvent/RBlock seams; nothing in v1 hard-codes "CODAP is the only producer."
- **Integration coverage:** Cross-layer proofs that unit tests can't give: corpus-runner (translation × real R), console E2E (webR × PostMessage channel × canvas), cross-highlight E2E (plugin × real CODAP selection), savedState round-trip (plugin × CODAP document save).

## Risks & Dependencies

- **CODAP v3 notification churn (medium, external):** v3 is pre-release; operation names/payloads may shift (9 renames already cataloged). Mitigation: all CODAP coupling isolated in Observer; loose operation-string matching; the compatibility audit doc watched at each CODAP release; fake-harness fixtures double as a contract test to re-verify against new builds.
- **Adornment diffing fragility (medium):** Poll/diff can miss rapid toggles between notices. Accepted for v1 (adornments are low-frequency moves); revisit when v3 adds adornment notifications.
- **webR payload on school networks (medium):** ~31 MB first load. Mitigated by self-hosted library image + HTTP caching + IDBFS; pilot guide includes a pre-caching step for facilitators. Residual risk accepted for pilot.
- **PostMessage no-interrupt (low, designed-for):** Kill/restart is a first-class, tested path (Units 5, 7).
- **Pretext youth (low, deferred):** v0.0.8 — not on the v1 critical path by design; construction contract keeps the door open. Re-evaluate maturity when the sprite feature is scheduled.
- **Hosted-CODAP E2E dependency (low):** CI depends on `codap3.concord.org` availability; fallback plan (pinned static CODAP build) pre-identified.
- **Formula translation breadth (low):** Unbounded formula language vs. finite mapping table; fallback behavior makes the boundary safe to grow incrementally.

## Documentation / Operational Notes

- `docs/accessibility.md`: conformance statement, manual SR scripts + results per milestone.
- `docs/pilot-guide.md`: stable URL, embedding instructions, classroom pre-caching, known limitations (untranslatable formulas list, adornment coverage).
- `docs/notes/`: live-spike findings (Unit 2), plot spot-checks (Unit 4) — institutional memory for the v3-parity moving target.
- Versions pinned together in one place: webR ↔ repo.r-wasm.org path ↔ library image build.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-08-09-codap-r-sidebar-requirements.md](../brainstorms/2026-08-09-codap-r-sidebar-requirements.md)
- CODAP plugin API wiki: https://github.com/concord-consortium/codap/wiki/CODAP-Data-Interactive-Plugin-API
- v2↔v3 parity audit: https://github.com/concord-consortium/codap/blob/main/v3/doc/v2-v3-compatibility-audit.md
- Starter project: https://github.com/concord-consortium/codap-plugin-starter-project
- Plugin API library: https://github.com/concord-consortium/codap-plugin-api
- webR docs: https://docs.r-wasm.org/webr/latest/ (serving, communication, packages, mounting, evaluating, plotting, convert-js-to-r, downloading)
- wasm package repo: https://repo.r-wasm.org ; rwasm images: https://r-wasm.github.io/rwasm/articles/mount-fs-image.html
- Pretext: https://github.com/chenglou/pretext (README, RESEARCH.md, PLATFORM_BUGS.md, `pages/demos/dynamic-layout.ts`)
- Playwright a11y: https://playwright.dev/docs/accessibility-testing ; WCAG 2.2 Understanding: target-size-minimum, focus-not-obscured-minimum, content-on-hover-or-focus (w3.org/WAI/WCAG22)
- CodeMirror 6: https://codemirror.net/docs/guide/
