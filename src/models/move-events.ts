// The normalized vocabulary of learner moves observed in CODAP (plan Unit 2).
// Everything downstream (translation engine, script model, cross-highlight)
// consumes these; nothing else touches raw CODAP notifications. The future
// R -> CODAP direction becomes "a second producer of MoveEvents".

export interface AttributeInfo {
  id?: number;
  name: string;
  formula?: string;
  type?: string;
  precision?: number;
  description?: string;
}

export interface CollectionInfo {
  id?: number;
  name: string;
  attrs: AttributeInfo[];
}

// Structure of one data context: collection order reflects the hierarchy
// (parent first). Used both for diffing and for the setup preamble.
export interface DataContextStructure {
  id?: number;
  name: string;
  title?: string;
  collections: CollectionInfo[];
}

export interface GraphConfig {
  dataContext?: string;
  xAttributeName?: string | null;
  yAttributeName?: string | null;
  yAttributeNames?: string[];
  y2AttributeName?: string | null;
  legendAttributeName?: string | null;
  captionAttributeName?: string | null;
  topSplitAttributeName?: string | null;
  rightSplitAttributeName?: string | null;
  pointConfig?: "points" | "bars" | "bins" | "histogram";
  filterFormula?: string | null;
}

export interface AdornmentInfo {
  id?: number | string;
  type: string;
  value?: unknown;
  isVisible?: boolean;
}

interface MoveEventBase {
  // Original notification (or diff basis) kept for provenance/debugging.
  raw?: unknown;
  // "unavailable" marks events whose enrichment re-get failed; translation
  // degrades to an untranslated block rather than guessing.
  enrichment?: "ok" | "unavailable";
}

// --- dataset lifecycle ---
export interface DatasetCreatedEvent extends MoveEventBase {
  type: "datasetCreated";
  context: DataContextStructure;
}
export interface DatasetDeletedEvent extends MoveEventBase {
  type: "datasetDeleted";
  contextName: string;
}

// --- case-level data moves (translated directly from payloads) ---
export interface CasesCreatedEvent extends MoveEventBase {
  type: "casesCreated";
  contextName: string;
  count: number;
  caseIds: number[];
}
export interface CasesUpdatedEvent extends MoveEventBase {
  type: "casesUpdated";
  contextName: string;
  caseIds: number[];
}
export interface CasesDeletedEvent extends MoveEventBase {
  type: "casesDeleted";
  contextName: string;
  caseIds: number[];
}
// Emitted on moveCases — CODAP's sort surfaces this way.
export interface CasesMovedEvent extends MoveEventBase {
  type: "casesMoved";
  contextName: string;
}

// --- attribute & hierarchy moves (derived from structural diff, so they
//     always carry verified formulas and collection placement) ---
export interface AttributeCreatedEvent extends MoveEventBase {
  type: "attributeCreated";
  contextName: string;
  collectionName: string;
  attribute: AttributeInfo;
}
export interface AttributeUpdatedEvent extends MoveEventBase {
  type: "attributeUpdated";
  contextName: string;
  collectionName: string;
  attribute: AttributeInfo;
  previousName?: string;
  previousFormula?: string;
}
export interface AttributeDeletedEvent extends MoveEventBase {
  type: "attributeDeleted";
  contextName: string;
  collectionName: string;
  attributeName: string;
}
export interface AttributeMovedEvent extends MoveEventBase {
  type: "attributeMoved";
  contextName: string;
  attributeName: string;
  fromCollection: string;
  toCollection: string;
}
export interface CollectionCreatedEvent extends MoveEventBase {
  type: "collectionCreated";
  contextName: string;
  collection: CollectionInfo;
  parentCollection?: string;
}
export interface CollectionDeletedEvent extends MoveEventBase {
  type: "collectionDeleted";
  contextName: string;
  collectionName: string;
}
// Structural trigger fired but the re-get failed or found nothing precise.
export interface DataContextChangedEvent extends MoveEventBase {
  type: "dataContextChanged";
  contextName: string;
  operation: string;
}

// --- component / graph moves ---
export interface ComponentCreatedEvent extends MoveEventBase {
  type: "componentCreated";
  componentId: number;
  componentType: string;
  graphConfig?: GraphConfig;
}
export interface ComponentDeletedEvent extends MoveEventBase {
  type: "componentDeleted";
  componentId: number;
  componentType?: string;
}
export interface GraphAttributeChangeEvent extends MoveEventBase {
  type: "graphAttributeChange";
  componentId: number;
  attributeName: string;
  attributeId?: number;
  plotType?: string;
  primaryAxis?: string;
  axisOrientation?: string;
  graphConfig?: GraphConfig;
}
export interface GraphLegendChangeEvent extends MoveEventBase {
  type: "graphLegendChange";
  componentId: number;
  attributeName: string;
  graphConfig?: GraphConfig;
}
export interface AdornmentAddedEvent extends MoveEventBase {
  type: "adornmentAdded";
  componentId: number;
  adornment: AdornmentInfo;
}
export interface AdornmentRemovedEvent extends MoveEventBase {
  type: "adornmentRemoved";
  componentId: number;
  adornment: AdornmentInfo;
}
// Catch-all for renamed/unknown component operations on a pre-release host:
// recorded (never dropped) so churn is visible, translated only if a specific
// event also fired.
export interface ComponentUpdatedEvent extends MoveEventBase {
  type: "componentUpdated";
  componentId: number;
  operation: string;
}

// --- sliders ---
export interface SliderChangedEvent extends MoveEventBase {
  type: "sliderChanged";
  globalName: string;
  value: number;
}

// --- selection (recorded, never translated in v1 — origin R3 reserve) ---
export interface SelectionChangedEvent extends MoveEventBase {
  type: "selectionChanged";
  contextName: string;
  caseIds: number[];
  extend: boolean;
  removedCaseIds?: number[];
  // "plugin" marks selections our own cross-highlight wrote; they are recorded
  // with this tag so the R3 reserve stream stays clean (plan Unit 8 hygiene).
  origin: "user" | "plugin";
}

// --- undo/redo (Unit 6 correlates these with blocks via provenance) ---
export interface UndoActionEvent extends MoveEventBase {
  type: "undoAction";
  canUndo?: boolean;
  canRedo?: boolean;
}
export interface RedoActionEvent extends MoveEventBase {
  type: "redoAction";
  canUndo?: boolean;
  canRedo?: boolean;
}

export type MoveEvent =
  | DatasetCreatedEvent
  | DatasetDeletedEvent
  | CasesCreatedEvent
  | CasesUpdatedEvent
  | CasesDeletedEvent
  | CasesMovedEvent
  | AttributeCreatedEvent
  | AttributeUpdatedEvent
  | AttributeDeletedEvent
  | AttributeMovedEvent
  | CollectionCreatedEvent
  | CollectionDeletedEvent
  | DataContextChangedEvent
  | ComponentCreatedEvent
  | ComponentDeletedEvent
  | GraphAttributeChangeEvent
  | GraphLegendChangeEvent
  | AdornmentAddedEvent
  | AdornmentRemovedEvent
  | ComponentUpdatedEvent
  | SliderChangedEvent
  | SelectionChangedEvent
  | UndoActionEvent
  | RedoActionEvent;

export type MoveEventType = MoveEvent["type"];

// Events the v1 translation engine consumes; everything else is record-only.
const kRecordOnlyTypes: ReadonlySet<MoveEventType> = new Set([
  "selectionChanged",
  "componentUpdated",
  "dataContextChanged",
  "casesUpdated"
]);

export function isTranslatable(event: MoveEvent): boolean {
  return !kRecordOnlyTypes.has(event.type);
}
