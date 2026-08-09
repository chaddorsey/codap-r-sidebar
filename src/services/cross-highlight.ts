import { RBlock } from "../models/r-blocks";
import { SelectionChangedEvent } from "../models/move-events";
import { CodapApi } from "./codap-api";

// Cross-highlight controller (plan Unit 8): hover/focus on a script block
// highlights the corresponding CODAP cases/component, and CODAP selections
// highlight matching blocks. Discipline:
//  - capture-and-restore: the prior selection is captured before we override
//    it and restored on leave — but ABANDONED if the learner changed the
//    selection mid-hover (their action wins).
//  - recording hygiene: every selection we write is pre-registered with the
//    observer so it records as plugin-originated, never as a learner move.
//  - 1.4.13: dismissible (Esc), persistent (until leave/dismiss), and the
//    highlight target is the document itself so it is inherently hoverable.

export interface SelectionTagger {
  expectPluginSelection(contextName: string, caseIds: number[]): void;
}

export interface CrossHighlightOptions {
  api: CodapApi;
  tagger: SelectionTagger;
  // Blocks highlighted in the pane when CODAP-side selection changes.
  onHighlightBlocks?: (blockIds: string[]) => void;
  debounceMs?: number;
}

interface HoverSession {
  contextName: string;
  writtenCaseIds: number[];
  priorCaseIds: number[];
}

export class CrossHighlightController {
  private pendingTimer?: ReturnType<typeof setTimeout>;
  private session?: HoverSession;
  private debounceMs: number;

  constructor(private options: CrossHighlightOptions) {
    this.debounceMs = options.debounceMs ?? 150;
  }

  // Script -> CODAP, debounced so rapid hover sweeps make one write.
  enter(block: RBlock) {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      void this.activate(block);
    }, this.debounceMs);
  }

  private async activate(block: RBlock) {
    const { api } = this.options;
    const { contextName, caseIds, componentId } = block.provenance;

    if (contextName && caseIds && caseIds.length > 0) {
      if (!this.session) {
        const prior = await api
          .sendRequest({ action: "get", resource: `dataContext[${contextName}].selectionList` })
          .catch(() => undefined);
        const priorCaseIds: number[] = (prior?.values ?? [])
          .map((entry: any) => entry?.caseID ?? entry?.id)
          .filter((id: any) => id != null);
        this.session = { contextName, writtenCaseIds: [], priorCaseIds };
      }
      this.session.writtenCaseIds = caseIds;
      this.options.tagger.expectPluginSelection(contextName, caseIds);
      await api
        .sendRequest({
          action: "create",
          resource: `dataContext[${contextName}].selectionList`,
          values: caseIds
        })
        .catch(() => undefined); // CODAP-side highlight is best-effort
      return;
    }

    if (componentId != null) {
      await api
        .sendRequest({
          action: "notify",
          resource: `component[${componentId}]`,
          values: { request: "select" }
        })
        .catch(() => undefined);
    }
  }

  // Leave restores the captured selection — unless the learner changed it.
  async leave() {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = undefined;
    }
    const session = this.session;
    this.session = undefined;
    if (!session) return;

    const { api } = this.options;
    const current = await api
      .sendRequest({ action: "get", resource: `dataContext[${session.contextName}].selectionList` })
      .catch(() => undefined);
    const currentIds: number[] = (current?.values ?? [])
      .map((entry: any) => entry?.caseID ?? entry?.id)
      .filter((id: any) => id != null);
    if (!sameIds(currentIds, session.writtenCaseIds)) {
      // The learner selected something mid-hover: abandon our restore.
      return;
    }
    this.options.tagger.expectPluginSelection(session.contextName, session.priorCaseIds);
    await api
      .sendRequest({
        action: "create",
        resource: `dataContext[${session.contextName}].selectionList`,
        values: session.priorCaseIds
      })
      .catch(() => undefined);
  }

  // Esc (1.4.13 dismissible): same as leave; the pane clears local styling.
  dismiss() {
    void this.leave();
  }

  // CODAP -> script: learner selections highlight blocks whose provenance
  // intersects the selected cases.
  handleSelection(event: SelectionChangedEvent, blocks: readonly RBlock[]) {
    if (event.origin !== "user") return;
    const selected = new Set(event.caseIds);
    const matches = blocks
      .filter(block => {
        if (block.provenance.contextName !== event.contextName) return false;
        return (block.provenance.caseIds ?? []).some(id => selected.has(id));
      })
      .map(block => block.id);
    this.options.onHighlightBlocks?.(matches);
  }
}

function sameIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...b].sort((x, y) => x - y);
  return [...a].sort((x, y) => x - y).every((v, i) => v === sorted[i]);
}
