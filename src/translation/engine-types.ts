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

// The surface rule modules may use — implemented by TranslationEngine.
export interface EngineApi {
  nextBlockId(): string;
  registerContext(structure: DataContextStructure, options?: { fromImport?: boolean }): ContextState;
  getContext(contextName: string): ContextState | undefined;
  hasContext(contextName: string): boolean;
  forgetContext(contextName: string): void;
  currentGroupAttrs(state: ContextState): string[];
  sliderVarName(globalName: string): string;
}
