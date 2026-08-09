import { MoveEvent } from "./move-events";
import { RBlock } from "./r-blocks";

// Append-only script store (plan Unit 6): the single source of the learner's
// annotated script. Owns undo narration under the review-hardened correlation
// rule: an undoAction opens a short window; the next event is only treated as
// the undo's *inverse notification* if it provenance-matches the most recent
// active block — then that block is struck and the inverse is suppressed
// (no spurious new block). Unmatched undos (component drags, resizes) narrate
// nothing and swallow nothing.

export interface ScriptListener {
  onAppend?(block: RBlock): void;
  onStatusChange?(block: RBlock): void;
}

// How many post-undo events may pass unmatched before the window closes.
const kUndoWindowEvents = 3;

export class ScriptStore {
  private allBlocks: RBlock[] = [];
  private listeners: ScriptListener[] = [];
  private undoWindow = 0;
  // Blocks struck by undo, restorable by redo (LIFO), with prior status.
  private undoneStack: { blockId: string; priorStatus: RBlock["status"] }[] = [];

  get blocks(): readonly RBlock[] {
    return this.allBlocks;
  }

  listen(listener: ScriptListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  append(block: RBlock) {
    this.allBlocks.push(block);
    for (const l of this.listeners) l.onAppend?.(block);
  }

  appendAll(blocks: RBlock[]) {
    for (const block of blocks) this.append(block);
  }

  setStatus(blockId: string, status: RBlock["status"], errors?: string[]) {
    const block = this.allBlocks.find(b => b.id === blockId);
    if (!block || (block.status === status && !errors)) return;
    block.status = status;
    if (errors) block.validationErrors = errors;
    for (const l of this.listeners) l.onStatusChange?.(block);
  }

  // Gate for incoming MoveEvents: returns false when the event was consumed
  // as an undo inverse (the caller must NOT translate it into a block).
  handleEvent(event: MoveEvent): boolean {
    if (event.type === "undoAction") {
      this.undoWindow = kUndoWindowEvents;
      return false;
    }
    if (event.type === "redoAction") {
      this.redo();
      return false;
    }
    if (this.undoWindow > 0) {
      this.undoWindow -= 1;
      const target = this.lastActiveBlock();
      if (target && matchesInverse(target, event)) {
        this.undoWindow = 0;
        this.strike(target);
        return false;
      }
    }
    return true;
  }

  private lastActiveBlock(): RBlock | undefined {
    for (let i = this.allBlocks.length - 1; i >= 0; i--) {
      const block = this.allBlocks[i];
      if (block.isSetup || block.status === "undone" || block.kind !== "code") continue;
      return block;
    }
    return undefined;
  }

  private strike(block: RBlock) {
    this.undoneStack.push({ blockId: block.id, priorStatus: block.status });
    this.setStatus(block.id, "undone");
    this.append({
      id: `${block.id}-undo-note`,
      kind: "comment",
      code: `# (You undid this step in CODAP. R scripts don't have undo — you revise the code instead.)`,
      annotation: `You undid: ${block.annotation}`,
      status: "note",
      provenance: { eventType: "undoAction", contextName: block.provenance.contextName }
    });
  }

  private redo() {
    const entry = this.undoneStack.pop();
    if (!entry) return;
    this.setStatus(entry.blockId, entry.priorStatus);
    const note = this.allBlocks.find(b => b.id === `${entry.blockId}-undo-note`);
    if (note) this.setStatus(note.id, "undone");
  }

  // --- persistence (plan savedState decision, jettison guardrail applies) ---

  serialize(): SerializedScript {
    return { version: 1, blocks: this.allBlocks };
  }

  static restore(state: SerializedScript): ScriptStore {
    const store = new ScriptStore();
    store.allBlocks = state.blocks ?? [];
    return store;
  }
}

export interface SerializedScript {
  version: 1;
  blocks: RBlock[];
}

// Provenance-matched inverse detection: tight by design so undoing an
// untracked action (graph reposition) can never strike an unrelated block.
function matchesInverse(block: RBlock, event: MoveEvent): boolean {
  const p = block.provenance;
  switch (event.type) {
    case "casesCreated":
      return p.eventType === "casesDeleted" && sameIds(p.caseIds, event.caseIds);
    case "casesDeleted":
      return p.eventType === "casesCreated" && sameIds(p.caseIds, event.caseIds);
    case "attributeDeleted":
      return (
        p.eventType === "attributeCreated" &&
        p.contextName === event.contextName &&
        (p.attrNames ?? []).includes(event.attributeName)
      );
    case "attributeCreated":
      return (
        p.eventType === "attributeDeleted" &&
        p.contextName === event.contextName &&
        (p.attrNames ?? []).includes(event.attribute.name)
      );
    case "attributeUpdated":
      // Undone rename or formula change arrives as another update on an
      // attribute this block touched.
      return (
        p.eventType === "attributeUpdated" &&
        p.contextName === event.contextName &&
        (p.attrNames ?? []).some(
          n => n === event.attribute.name || n === event.previousName
        )
      );
    case "collectionDeleted":
      return (
        p.eventType === "collectionCreated" &&
        p.contextName === event.contextName
      );
    case "collectionCreated":
      return (
        p.eventType === "collectionDeleted" &&
        p.contextName === event.contextName
      );
    case "attributeMoved":
      return (
        (p.eventType === "attributeMoved" || p.eventType === "collectionCreated") &&
        p.contextName === event.contextName
      );
    case "graphAttributeChange":
    case "graphLegendChange":
      return (
        (p.eventType === "graphAttributeChange" ||
          p.eventType === "graphLegendChange" ||
          p.eventType === "componentCreated") &&
        p.componentId === event.componentId
      );
    case "adornmentRemoved":
      return p.eventType === "adornmentAdded" && p.componentId === event.componentId;
    case "adornmentAdded":
      return p.eventType === "adornmentRemoved" && p.componentId === event.componentId;
    case "componentDeleted":
      return p.eventType === "componentCreated" && p.componentId === event.componentId;
    case "sliderChanged":
      return p.eventType === "sliderChanged";
    case "datasetDeleted":
      return p.eventType === "datasetCreated" && p.contextName === event.contextName;
    default:
      return false;
  }
}

function sameIds(a?: number[], b?: number[]): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}
