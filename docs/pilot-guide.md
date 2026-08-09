# Classroom pilot guide — CODAP R Sidebar

## What this is

A CODAP v3 plugin that narrates a learner's CODAP moves as an annotated,
runnable R script, with a real R console (webR) in the sidebar. Learners see
their data moves become `dplyr`, their graphs become `ggplot2`, run any step,
and export the whole session as a script that runs in RStudio.

## Opening the plugin

1. Go to https://codap3.concord.org
2. Insert the plugin via URL (deployed URL to be added at first S3 deploy;
   during development: run `npm run start:secure` locally and open
   `https://codap3.concord.org/?di=https://localhost:8080`).
3. The sidebar appears as a tall tile — drag it to the workspace edge and
   resize as you like. It can collapse to a strip; a badge counts steps made
   while collapsed.

## First-load expectations (tell facilitators!)

- R itself downloads on first use: **roughly 30 MB**. On school networks this
  can take a few minutes; the console shows staged progress copy the whole
  time, and translation works immediately regardless.
- After the first load, files are cached — later sessions start fast.
- **Pre-caching tip:** have each student open the pilot URL and wait for the
  console prompt once, the day before the lesson.
- Low-RAM devices (4 GB Chromebooks): keep other tabs closed; the plugin runs
  two R workers. If a device struggles, the fallback is translation-only
  (the script still accumulates; validation badges stay "will check when R is
  ready").

## What translates (v1)

- Data moves: import, delete/filter cases, new attributes with formulas
  (common functions; unsupported formulas become narrated notes), rename,
  delete attributes, hierarchy drags (group_by), sliders.
- Graph moves: create, axes, color legend, splits, mean/median lines, LSRL.
- Not translated (narrated honestly instead): typed-in cases, sorts (for
  now), movable values/lines, most exotic formulas. Undo strikes the step
  and explains that R scripts revise rather than undo.

## Known limitations for the pilot

- Reopening a *changed* document starts the script fresh from a new setup
  section (the old narration doesn't apply anymore); reopening an unchanged
  document restores the full script.
- The console can't interrupt runaway code — the **Stop R** button restarts R
  and re-runs the script setup (history is kept).
- Adornment changes may be narrated with a short delay after the next graph
  interaction (a CODAP v3 notification gap).

## Facilitated dry-run checklist (pilot readiness)

- [ ] Load data → filter → group → graph → export at the pilot URL
- [ ] Run the exported script in the sidebar console — matches CODAP
- [ ] Run the exported bundle in desktop RStudio — matches CODAP
- [ ] Boot experience acceptable on a school-network Chromebook
- [ ] Manual screen-reader passes recorded in docs/accessibility.md
