import { DataContextStructure, GraphConfig } from "../models/move-events";
import { CodapApi } from "./codap-api";
import { parseDataContext, parseGraphConfig } from "./codap-structure";

// Full-document snapshot (plan Unit 2 / origin R9): everything the preamble
// generator needs to emit a complete, runnable setup — hierarchy, formulas,
// case data, and existing graph configurations. The case data captured here is
// also the export bundle's data vintage (initial-observation snapshot).

export interface ComponentSnapshot {
  id: number;
  type: string;
  name?: string;
  title?: string;
  graphConfig?: GraphConfig;
}

export interface ContextSnapshot {
  structure: DataContextStructure;
  // Item rows in array-of-objects form — CODAP's item shape, which is also
  // exactly what webR converts to a data.frame and what export writes as CSV.
  items: Record<string, unknown>[];
}

export interface DocumentSnapshot {
  contexts: ContextSnapshot[];
  components: ComponentSnapshot[];
}

const kGraphType = "graph";

export async function takeDocumentSnapshot(api: CodapApi): Promise<DocumentSnapshot> {
  const contexts: ContextSnapshot[] = [];
  const components: ComponentSnapshot[] = [];

  const listRes = await api
    .sendRequest({ action: "get", resource: "dataContextList" })
    .catch(() => undefined);
  for (const entry of listRes?.values ?? []) {
    const name = entry?.name;
    if (typeof name !== "string") continue;
    const ctxRes = await api
      .sendRequest({ action: "get", resource: `dataContext[${name}]` })
      .catch(() => undefined);
    if (!ctxRes?.values) continue;
    const structure = parseDataContext(ctxRes.values);

    const itemsRes = await api
      .sendRequest({ action: "get", resource: `dataContext[${name}].itemSearch[*]` })
      .catch(() => undefined);
    // case_id makes case-level moves (delete/filter) replayable against the
    // snapshot vintage. Item-id vs case-id parity in hierarchical contexts is
    // spike question #11.
    const items: Record<string, unknown>[] = (itemsRes?.values ?? []).map((item: any) => {
      const values = item?.values ?? item;
      return item?.id != null ? { case_id: item.id, ...values } : values;
    });
    contexts.push({ structure, items });
  }

  const compListRes = await api
    .sendRequest({ action: "get", resource: "componentList" })
    .catch(() => undefined);
  for (const entry of compListRes?.values ?? []) {
    const id = entry?.id;
    const type = entry?.type;
    if (id == null || typeof type !== "string") continue;
    let graphConfig: GraphConfig | undefined;
    if (type === kGraphType) {
      const compRes = await api
        .sendRequest({ action: "get", resource: `component[${id}]` })
        .catch(() => undefined);
      if (compRes?.values) graphConfig = parseGraphConfig(compRes.values);
    }
    components.push({ id, type, name: entry?.name, title: entry?.title, graphConfig });
  }

  return { contexts, components };
}
