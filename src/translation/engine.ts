import { DataContextStructure, MoveEvent } from "../models/move-events";
import { RBlock } from "../models/r-blocks";
import { ContextState, EngineApi, GraphState } from "./engine-types";
import { translateDataMove } from "./rules/data-moves";
import { translateGraphMove } from "./rules/graph-moves";
import { sanitizeVariableName } from "./r-syntax";

// Pure translation engine (plan Unit 3): MoveEvent -> RBlock under the
// ratified script state model — one variable per dataset, data moves rebind it.
// The engine holds only translation state (names, grouping); no I/O, no UI.

export type { ContextState } from "./engine-types";

export class TranslationEngine implements EngineApi {
  private blockCounter = 0;
  private contexts = new Map<string, ContextState>();
  private usedVarNames = new Set<string>();
  private sliderVars = new Map<string, string>();
  private graphs = new Map<number, GraphState>();
  private graphCounter = 0;

  nextBlockId(): string {
    this.blockCounter += 1;
    return `b${this.blockCounter}`;
  }

  // Establish (or fetch) the state for a context. The preamble registers all
  // contexts present at startup; translate() registers mid-session arrivals.
  registerContext(structure: DataContextStructure, options?: { fromImport?: boolean }): ContextState {
    const existing = this.contexts.get(structure.name);
    if (existing) return existing;

    let varName = sanitizeVariableName(structure.name);
    let suffix = 2;
    while (this.usedVarNames.has(varName)) {
      varName = `${sanitizeVariableName(structure.name)}_${suffix++}`;
    }
    this.usedVarNames.add(varName);

    const groupingCollections = new Map<string, string[]>();
    // All but the childmost collection are grouping levels.
    for (const coll of structure.collections.slice(0, -1)) {
      groupingCollections.set(coll.name, coll.attrs.map(a => a.name));
    }

    const state: ContextState = {
      contextName: structure.name,
      varName,
      groupingCollections,
      awaitingImportCases: !!options?.fromImport
    };
    this.contexts.set(structure.name, state);
    return state;
  }

  getContext(contextName: string): ContextState | undefined {
    return this.contexts.get(contextName);
  }

  hasContext(contextName: string): boolean {
    return this.contexts.has(contextName);
  }

  forgetContext(contextName: string) {
    this.contexts.delete(contextName);
  }

  currentGroupAttrs(state: ContextState): string[] {
    return [...state.groupingCollections.values()].flat();
  }

  sliderVarName(globalName: string): string {
    const existing = this.sliderVars.get(globalName);
    if (existing) return existing;
    let varName = sanitizeVariableName(globalName);
    let suffix = 2;
    while (this.usedVarNames.has(varName)) varName = `${sanitizeVariableName(globalName)}_${suffix++}`;
    this.usedVarNames.add(varName);
    this.sliderVars.set(globalName, varName);
    return varName;
  }

  registerGraph(componentId: number, contextName?: string): GraphState {
    const existing = this.graphs.get(componentId);
    if (existing) return existing;
    this.graphCounter += 1;
    const state: GraphState = {
      componentId,
      varName: `p${this.graphCounter}`,
      contextName,
      initialized: false
    };
    this.graphs.set(componentId, state);
    return state;
  }

  getGraph(componentId: number): GraphState | undefined {
    return this.graphs.get(componentId);
  }

  forgetGraph(componentId: number) {
    this.graphs.delete(componentId);
  }

  // Translate one observed move. Returns null for record-only events and for
  // events that produce no block (e.g., datasetCreated for a context the
  // preamble already covers). Never throws: untranslatable moves become
  // comment blocks (ratified fallback).
  translate(event: MoveEvent): RBlock | null {
    return translateGraphMove(this, event) ?? translateDataMove(this, event);
  }
}
