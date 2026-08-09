# Unit 2 live-spike checklist (pending)

The Observer is built on the "notifications as triggers, request-backed diffs
as truth" model, so it is deliberately tolerant of payload-shape drift. These
empirical questions from the plan still need answers against a real CODAP v3
instance; record findings here and convert them into fake-codap fixtures.

Status: **not yet run** — requires an interactive session against
https://codap3.concord.org with the plugin loaded and the observer logging.

| # | Question | Why it matters | Finding |
|---|----------|----------------|---------|
| 1 | Exact `selectCases` payload shape in v3 (`cases` objects vs `caseIDs`; nested `result`; `removedCases` shape) | Observer accepts both today; confirm and prune | — |
| 2 | Do our own `selectionList` create/update requests echo back as `selectCases` notices? | Unit 8 loop-guard + recording hygiene; fingerprint queue sized for it | — |
| 3 | Does `get dataContext[name].selectionList` work in v3? | Unit 8 capture-and-restore | — |
| 4 | What notifications accompany `undoAction`? (Does the inverse data operation fire as a normal `dataContextChangeNotice`? Before or after `undoChangeNotice`?) | Unit 6 undo correlation + suppression window | — |
| 5 | What (if anything) fires on adornment toggle/drag — `component` update, `logMessageNotice`, or nothing? | Decides whether the componentUpdated-triggered re-diff suffices, needs a log-monitor trigger, or a low-frequency poll; if nothing works, descope movable-value dragging (origin amendment) | — |
| 6 | Does sort emit `moveCases`? What payload? | Data-move translation (arrange()) | — |
| 7 | `logMessageMonitor` registration shape and payload stability in v3 | Supplementary channel for moves v3 only logs | — |
| 8 | Are selection changes part of the v3 undo stack? | Unit 8: hover highlights must not pollute learner undo history | — |
| 9 | Mid-session dataset import: does it arrive as `dataContextCountChanged` + `createCases`, or other? | Unit 3 import rule trigger | — |
| 10 | `get component[id]` reliably returns `position`/`dimensions`? | Only needed if overlay effects extend beyond the iframe (post-v1) | — |
