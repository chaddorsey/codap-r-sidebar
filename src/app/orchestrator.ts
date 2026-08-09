import { Announcer } from "../components/script-pane/announcer";
import { MoveEvent } from "../models/move-events";
import { RBlock } from "../models/r-blocks";
import { ScriptStore, SerializedScript } from "../models/script-store";
import { CodapApi } from "../services/codap-api";
import { CodapObserver } from "../services/codap-observer";
import { DocumentSnapshot, takeDocumentSnapshot } from "../services/codap-snapshot";
import { itemsToCsv } from "../services/dataset-bridge";
import { TranslationEngine } from "../translation/engine";
import { generatePreamble, libraryBlock } from "../translation/preamble";
import { ExportDataset, buildExportBundle, ExportBundle } from "../lib/export-r";

// Wires the pipeline (plan High-Level Design): Observer -> Engine -> Store,
// with savedState restore-or-preamble on startup and per-append persistence.
// The validator attaches via the `validate` hook (Unit 7 wires webR + boot UX).

export interface SavedState {
  version: 1;
  script: SerializedScript;
  digest: string;
}

export interface OrchestratorOptions {
  api: CodapApi;
  announcer: Announcer;
  persist?: (state: SavedState) => void;
  // Unit 5 validator hook; absent until webR wiring lands (statuses stay pending).
  validate?: (block: RBlock) => void;
}

export class Orchestrator {
  readonly engine = new TranslationEngine();
  store = new ScriptStore();
  private observer?: CodapObserver;
  private snapshot?: DocumentSnapshot;
  private digest = "";

  constructor(private options: OrchestratorOptions) {}

  async start(savedState?: unknown): Promise<"restored" | "fresh"> {
    const { api, announcer } = this.options;
    this.snapshot = await takeDocumentSnapshot(api);
    this.digest = snapshotDigest(this.snapshot);

    let mode: "restored" | "fresh" = "fresh";
    const saved = asSavedState(savedState);
    if (saved && saved.digest === this.digest) {
      // Digest match -> restore the narrated history (ratified persistence
      // decision). Engine re-primes deterministically: same snapshot order
      // produces the same variable names the history used.
      this.store = ScriptStore.restore(saved.script);
      this.primeEngineFromSnapshot();
      announcer.announceNow("Restored your R script from this document.");
      mode = "restored";
    } else {
      const preamble = generatePreamble(this.snapshot, this.engine);
      this.store.appendAll(preamble);
      for (const block of preamble) this.options.validate?.(block);
      if (preamble.length > 0) {
        announcer.announceNow(
          saved
            ? "This document changed since your last session, so the script starts fresh from a new setup."
            : "Setup added: your document's data as R code."
        );
      }
    }

    this.store.listen({
      onAppend: () => this.persist(),
      onStatusChange: () => this.persist()
    });
    this.persist();

    this.observer = new CodapObserver(api);
    this.observer.on(event => this.handleEvent(event));
    await this.observer.start();
    return mode;
  }

  private handleEvent(event: MoveEvent) {
    if (!this.store.handleEvent(event)) return; // undo machinery consumed it
    const block = this.engine.translate(event);
    if (!block) return;
    // Sessions that started on an empty document get the library block lazily,
    // right before their first real step, so the script stays runnable.
    if (this.store.blocks.length === 0) {
      const libraries = libraryBlock(this.engine);
      this.store.append(libraries);
      this.options.validate?.(libraries);
    }
    this.store.append(block);
    this.options.announcer.announce(block.annotation);
    if (block.kind === "code") this.options.validate?.(block);
  }

  private primeEngineFromSnapshot() {
    if (!this.snapshot) return;
    for (const context of this.snapshot.contexts) {
      this.engine.registerContext(context.structure);
    }
    // Known limitation (documented in plan Open Questions): plot-object
    // numbering after restore follows snapshot component order, which can
    // differ from original creation order if graphs were made and deleted.
    for (const component of this.snapshot.components) {
      if (component.graphConfig) {
        this.engine.registerGraph(component.id, component.graphConfig.dataContext);
      }
    }
  }

  private persist() {
    this.options.persist?.({ version: 1, script: this.store.serialize(), digest: this.digest });
  }

  exportDatasets(): ExportDataset[] {
    if (!this.snapshot) return [];
    return this.snapshot.contexts.map(context => {
      const state = this.engine.getContext(context.structure.name);
      const varName = state?.varName ?? context.structure.name;
      return { fileName: `${varName}.csv`, csv: itemsToCsv(context.items) };
    });
  }

  buildExport(): ExportBundle {
    return buildExportBundle([...this.store.blocks], this.exportDatasets());
  }
}

function asSavedState(value: unknown): SavedState | undefined {
  const candidate = value as SavedState | undefined;
  if (candidate && candidate.version === 1 && candidate.script && typeof candidate.digest === "string") {
    return candidate;
  }
  return undefined;
}

// Structural digest for staleness detection (ratified snapshot-digest
// decision): hierarchy + formulas + case counts + graph configs. Case *value*
// edits while closed are not detected — accepted v1 boundary.
export function snapshotDigest(snapshot: DocumentSnapshot): string {
  const normalized = JSON.stringify({
    contexts: snapshot.contexts.map(c => ({
      name: c.structure.name,
      n: c.items.length,
      collections: c.structure.collections.map(coll => ({
        name: coll.name,
        attrs: coll.attrs.map(a => ({ n: a.name, f: a.formula ?? null }))
      }))
    })),
    components: snapshot.components.map(comp => ({
      id: comp.id,
      type: comp.type,
      graph: comp.graphConfig ?? null
    }))
  });
  // djb2 — tiny, deterministic, adequate for change detection.
  /* eslint-disable no-bitwise */
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) | 0;
  }
  return `v1:${(hash >>> 0).toString(36)}:${normalized.length}`;
  /* eslint-enable no-bitwise */
}
