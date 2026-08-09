import { DataContextStructure } from "../models/move-events";

// Shared engine-state contracts, split out so rule modules and the engine
// avoid an import cycle.

export interface ContextState {
  contextName: string;
  varName: string;
  // Parent-collection attribute sets in hierarchy order; the flattened list is
  // the current group_by() set.
  groupingCollections: Map<string, string[]>;
  // True right after a mid-session dataset arrival: the first casesCreated is
  // covered by the import block and produces no block of its own.
  awaitingImportCases: boolean;
}

// Accumulated per-graph translation state under the delta-block model: each
// graph is a named plot object; axis/legend/split state mirrors the last
// request-verified GraphConfig.
export interface GraphState {
  componentId: number;
  varName: string;
  contextName?: string;
  x?: string;
  y?: string;
  legend?: string;
  topSplit?: string;
  rightSplit?: string;
  // The current geom call (e.g., "geom_point()"), or undefined while the
  // graph is an empty panel.
  geom?: string;
  initialized: boolean;
}

// The surface rule modules may use — implemented by TranslationEngine.
export interface EngineApi {
  nextBlockId(): string;
  registerContext(structure: DataContextStructure, options?: { fromImport?: boolean }): ContextState;
  getContext(contextName: string): ContextState | undefined;
  hasContext(contextName: string): boolean;
  forgetContext(contextName: string): void;
  currentGroupAttrs(state: ContextState): string[];
  sliderVarName(globalName: string): string;
  registerGraph(componentId: number, contextName?: string): GraphState;
  getGraph(componentId: number): GraphState | undefined;
  forgetGraph(componentId: number): void;
}
