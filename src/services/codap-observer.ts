import {
  AdornmentInfo,
  DataContextStructure,
  GraphConfig,
  MoveEvent
} from "../models/move-events";
import { CodapApi } from "./codap-api";
import { diffContextStructure, parseDataContext, parseGraphConfig } from "./codap-structure";

type MoveListener = (event: MoveEvent) => void;

const kGraphType = "graph";

// Operations handled directly from notification payloads (case-level moves).
// Everything structural re-gets and diffs instead — see codap-structure.ts.
const kStructuralOps = new Set([
  "createCollection",
  "deleteCollection",
  "createAttributes",
  "updateAttributes",
  "deleteAttributes",
  "moveAttribute",
  "hideAttributes",
  "unhideAttributes",
  "showAttributes"
]);

export class CodapObserver {
  private listeners: MoveListener[] = [];
  // Append-only record of every observed event, including record-only ones
  // (the R3 selection reserve lives here).
  readonly recorded: MoveEvent[] = [];

  private contextStructures = new Map<string, DataContextStructure>();
  private graphConfigs = new Map<number, GraphConfig>();
  private graphAdornments = new Map<number, AdornmentInfo[]>();
  private subscribedContexts = new Set<string>();
  private subscribedGlobals = new Set<string>();
  // Fingerprints of selections our own cross-highlight wrote (Unit 8 hygiene):
  // matching selectCases notifications are recorded with origin "plugin".
  private pluginSelectionFingerprints: string[] = [];

  constructor(private api: CodapApi) {}

  on(listener: MoveListener) {
    this.listeners.push(listener);
  }

  private emit(event: MoveEvent) {
    this.recorded.push(event);
    for (const listener of this.listeners) listener(event);
  }

  async start() {
    this.api.on("documentChangeNotice", n => {
      void this.handleDocumentChange(n.values);
    });
    this.api.on("component", n => {
      void this.handleComponentNotice(n.values);
    });
    this.api.on("undoChangeNotice", n => {
      const op = n.values?.operation;
      if (op === "undoAction" || op === "redoAction") {
        this.emit({
          type: op,
          canUndo: n.values?.canUndo,
          canRedo: n.values?.canRedo,
          raw: n.values
        });
      }
    });
    await this.syncContexts();
    await this.syncGlobals();
  }

  // Cross-highlight (Unit 8) calls this just before writing a selection so the
  // resulting notification is recorded as plugin-originated, not a learner move.
  expectPluginSelection(contextName: string, caseIds: number[]) {
    this.pluginSelectionFingerprints.push(fingerprintSelection(contextName, caseIds));
  }

  getContextStructure(name: string): DataContextStructure | undefined {
    return this.contextStructures.get(name);
  }

  // --- context lifecycle -------------------------------------------------

  private async handleDocumentChange(values: any) {
    const operation = values?.operation;
    if (operation === "dataContextCountChanged") {
      await this.syncContexts();
      await this.syncGlobals();
    } else if (operation === "dataContextDeleted") {
      const name = values?.deletedContext ?? values?.name;
      if (typeof name === "string") this.removeContext(name, values);
    }
  }

  private async syncContexts() {
    const res = await this.api
      .sendRequest({ action: "get", resource: "dataContextList" })
      .catch(() => undefined);
    if (!res?.values) return;
    const names: string[] = res.values.map((c: any) => c.name);

    for (const name of names) {
      if (!this.subscribedContexts.has(name)) {
        this.subscribedContexts.add(name);
        this.api.on(`dataContextChangeNotice[${name}]`, n => {
          void this.handleDataContextNotice(name, n.values);
        });
        const structure = await this.fetchContextStructure(name);
        if (structure) {
          this.contextStructures.set(name, structure);
          this.emit({ type: "datasetCreated", context: structure, enrichment: "ok" });
        } else {
          this.emit({
            type: "datasetCreated",
            context: { name, collections: [] },
            enrichment: "unavailable"
          });
        }
      }
    }
    for (const name of [...this.contextStructures.keys()]) {
      if (!names.includes(name)) this.removeContext(name);
    }
  }

  private removeContext(name: string, raw?: unknown) {
    if (this.contextStructures.has(name) || this.subscribedContexts.has(name)) {
      this.contextStructures.delete(name);
      this.emit({ type: "datasetDeleted", contextName: name, raw });
    }
  }

  private async fetchContextStructure(name: string): Promise<DataContextStructure | undefined> {
    const res = await this.api
      .sendRequest({ action: "get", resource: `dataContext[${name}]` })
      .catch(() => undefined);
    return res?.values ? parseDataContext(res.values) : undefined;
  }

  // --- data context notices ---------------------------------------------

  private async handleDataContextNotice(contextName: string, values: any) {
    const operation: string = values?.operation ?? "";
    const result = values?.result ?? values ?? {};

    if (kStructuralOps.has(operation)) {
      await this.rediffContext(contextName, operation, values);
      return;
    }

    switch (operation) {
      case "createCases": {
        // v3 coalesces bulk creates: one notification carries arrays of ids.
        const caseIds: number[] = result.caseIDs ?? result.itemIDs ?? [];
        this.emit({
          type: "casesCreated",
          contextName,
          caseIds,
          count: caseIds.length,
          raw: values
        });
        break;
      }
      case "updateCases":
        this.emit({
          type: "casesUpdated",
          contextName,
          caseIds: result.caseIDs ?? [],
          raw: values
        });
        break;
      case "deleteCases":
        this.emit({
          type: "casesDeleted",
          contextName,
          caseIds: result.caseIDs ?? [],
          raw: values
        });
        break;
      case "moveCases":
        this.emit({ type: "casesMoved", contextName, raw: values });
        break;
      case "selectCases": {
        // Payload parity between v2/v3 is flagged uncertain in the audit —
        // accept both `cases` (objects) and `caseIDs` shapes.
        const caseIds: number[] =
          result.cases?.map((c: any) => c?.id ?? c?.caseID).filter((id: any) => id != null) ??
          result.caseIDs ??
          [];
        const fp = fingerprintSelection(contextName, caseIds);
        const fpIndex = this.pluginSelectionFingerprints.indexOf(fp);
        const fromPlugin = fpIndex >= 0;
        if (fromPlugin) this.pluginSelectionFingerprints.splice(fpIndex, 1);
        this.emit({
          type: "selectionChanged",
          contextName,
          caseIds,
          extend: !!result.extend,
          removedCaseIds: result.removedCases?.map((c: any) => c?.id ?? c) ?? undefined,
          origin: fromPlugin ? "plugin" : "user",
          raw: values
        });
        break;
      }
      default:
        // Unknown / renamed operation strings on the pre-release host: record,
        // then re-diff so a real structural change still surfaces precisely.
        this.emit({ type: "dataContextChanged", contextName, operation, raw: values });
        await this.rediffContext(contextName, operation, values, { emitTrigger: false });
    }
  }

  private async rediffContext(
    contextName: string,
    operation: string,
    raw: unknown,
    options?: { emitTrigger?: boolean }
  ) {
    const next = await this.fetchContextStructure(contextName);
    if (!next) {
      if (options?.emitTrigger !== false) {
        this.emit({
          type: "dataContextChanged",
          contextName,
          operation,
          enrichment: "unavailable",
          raw
        });
      }
      return;
    }
    const prev = this.contextStructures.get(contextName) ?? { name: contextName, collections: [] };
    this.contextStructures.set(contextName, next);
    for (const event of diffContextStructure(prev, next)) {
      this.emit({ ...event, raw });
    }
  }

  // --- component notices --------------------------------------------------

  private async handleComponentNotice(values: any) {
    const operation: string = values?.operation ?? "";
    const id: number = values?.id;
    const type: string | undefined = values?.type;

    switch (operation) {
      case "create": {
        let graphConfig: GraphConfig | undefined;
        if (type === kGraphType && id != null) {
          graphConfig = await this.refreshGraph(id);
        }
        this.emit({
          type: "componentCreated",
          componentId: id,
          componentType: type ?? "unknown",
          graphConfig,
          raw: values
        });
        break;
      }
      case "delete":
        this.graphConfigs.delete(id);
        this.graphAdornments.delete(id);
        this.emit({ type: "componentDeleted", componentId: id, componentType: type, raw: values });
        break;
      case "attributeChange": {
        const graphConfig = await this.refreshGraph(id, { diffAdornments: true });
        this.emit({
          type: "graphAttributeChange",
          componentId: id,
          attributeName: values?.attributeName,
          attributeId: values?.attributeId,
          plotType: values?.plotType,
          primaryAxis: values?.primaryAxis,
          axisOrientation: values?.axisOrientation,
          graphConfig,
          raw: values
        });
        break;
      }
      case "legendAttributeChange": {
        const graphConfig = await this.refreshGraph(id, { diffAdornments: true });
        this.emit({
          type: "graphLegendChange",
          componentId: id,
          attributeName: values?.attributeName,
          graphConfig,
          raw: values
        });
        break;
      }
      default: {
        // Renamed v3 display-config toggles, titleChange, and anything new all
        // land here: record generically, and if we know this graph, re-diff its
        // adornments — the documented v3 gap means adornment toggles may only
        // ever surface via *some* other component notice.
        this.emit({ type: "componentUpdated", componentId: id, operation, raw: values });
        if (this.graphConfigs.has(id)) {
          await this.refreshGraph(id, { diffAdornments: true });
        }
      }
    }
  }

  private async refreshGraph(
    id: number,
    options?: { diffAdornments?: boolean }
  ): Promise<GraphConfig | undefined> {
    const res = await this.api
      .sendRequest({ action: "get", resource: `component[${id}]` })
      .catch(() => undefined);
    if (!res?.values) return this.graphConfigs.get(id);
    const config = parseGraphConfig(res.values);
    this.graphConfigs.set(id, config);

    if (options?.diffAdornments) {
      const adornRes = await this.api
        .sendRequest({ action: "get", resource: `component[${id}].adornmentList` })
        .catch(() => undefined);
      if (adornRes?.values) {
        const next: AdornmentInfo[] = (adornRes.values ?? []).map((a: any) => ({
          id: a.id,
          type: a.type,
          isVisible: a.isVisible
        }));
        const prev = this.graphAdornments.get(id) ?? [];
        this.graphAdornments.set(id, next);
        const prevKeys = new Set(prev.map(adornmentKey));
        const nextKeys = new Set(next.map(adornmentKey));
        for (const adornment of next) {
          if (!prevKeys.has(adornmentKey(adornment))) {
            this.emit({ type: "adornmentAdded", componentId: id, adornment });
          }
        }
        for (const adornment of prev) {
          if (!nextKeys.has(adornmentKey(adornment))) {
            this.emit({ type: "adornmentRemoved", componentId: id, adornment });
          }
        }
      }
    }
    return config;
  }

  // --- globals (sliders) --------------------------------------------------

  private async syncGlobals() {
    const res = await this.api
      .sendRequest({ action: "get", resource: "globalList" })
      .catch(() => undefined);
    if (!res?.values) return;
    for (const g of res.values) {
      const name = g?.name;
      if (typeof name === "string" && !this.subscribedGlobals.has(name)) {
        this.subscribedGlobals.add(name);
        this.api.on(`global[${name}]`, n => {
          const value = n.values?.globalValue ?? n.values?.value;
          if (typeof value === "number") {
            this.emit({ type: "sliderChanged", globalName: name, value, raw: n.values });
          }
        });
      }
    }
  }
}

function fingerprintSelection(contextName: string, caseIds: number[]): string {
  return `${contextName}:${[...caseIds].sort((a, b) => a - b).join(",")}`;
}

function adornmentKey(a: AdornmentInfo): string {
  return `${a.type}:${a.id ?? ""}:${a.isVisible === false ? "hidden" : "visible"}`;
}
