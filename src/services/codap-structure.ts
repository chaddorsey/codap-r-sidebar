import {
  AttributeInfo,
  CollectionInfo,
  DataContextStructure,
  GraphConfig,
  MoveEvent
} from "../models/move-events";

// Parsing and diffing of CODAP structures. Notifications are treated as
// *triggers*; these request-backed diffs are the *truth* (plan Unit 2) — this
// keeps the observer robust against notification payload churn in the
// pre-release v3 host and guarantees formulas come from a verified get.

export function parseDataContext(values: any): DataContextStructure {
  const collections: CollectionInfo[] = (values?.collections ?? []).map((c: any): CollectionInfo => ({
    id: c.id,
    name: c.name,
    attrs: (c.attrs ?? []).map((a: any): AttributeInfo => ({
      id: a.id,
      name: a.name,
      formula: a.formula ?? undefined,
      type: a.type ?? undefined,
      precision: a.precision ?? undefined,
      description: a.description ?? undefined
    }))
  }));
  return { id: values?.id, name: values?.name, title: values?.title, collections };
}

export function parseGraphConfig(values: any): GraphConfig {
  return {
    dataContext: values?.dataContext ?? undefined,
    xAttributeName: values?.xAttributeName ?? null,
    yAttributeName: values?.yAttributeName ?? null,
    yAttributeNames: values?.yAttributeNames ?? undefined,
    y2AttributeName: values?.y2AttributeName ?? null,
    legendAttributeName: values?.legendAttributeName ?? null,
    captionAttributeName: values?.captionAttributeName ?? null,
    topSplitAttributeName: values?.topSplitAttributeName ?? null,
    rightSplitAttributeName: values?.rightSplitAttributeName ?? null,
    pointConfig: values?.pointConfig ?? undefined,
    filterFormula: values?.filterFormula ?? null
  };
}

interface LocatedAttr {
  attr: AttributeInfo;
  collectionName: string;
}

function attrsByKey(context: DataContextStructure): Map<string, LocatedAttr> {
  const map = new Map<string, LocatedAttr>();
  for (const coll of context.collections) {
    for (const attr of coll.attrs) {
      // Prefer stable ids for rename detection; fall back to names.
      const key = attr.id != null ? `id:${attr.id}` : `name:${attr.name}`;
      map.set(key, { attr, collectionName: coll.name });
    }
  }
  return map;
}

// Diff two verified context structures into precise MoveEvents. Emission order:
// collections first (hierarchy context), then attribute-level changes.
export function diffContextStructure(
  prev: DataContextStructure,
  next: DataContextStructure
): MoveEvent[] {
  const events: MoveEvent[] = [];
  const contextName = next.name;

  const prevCollNames = new Set(prev.collections.map(c => c.name));
  const nextCollNames = new Set(next.collections.map(c => c.name));
  const prevAttrs = attrsByKey(prev);
  const nextAttrs = attrsByKey(next);

  for (const [i, coll] of next.collections.entries()) {
    if (!prevCollNames.has(coll.name)) {
      events.push({
        type: "collectionCreated",
        contextName,
        collection: coll,
        parentCollection: i > 0 ? next.collections[i - 1].name : undefined,
        enrichment: "ok"
      });
    }
  }
  for (const coll of prev.collections) {
    if (!nextCollNames.has(coll.name)) {
      events.push({
        type: "collectionDeleted",
        contextName,
        collectionName: coll.name,
        enrichment: "ok"
      });
    }
  }

  const newCollNames = new Set(
    next.collections.filter(c => !prevCollNames.has(c.name)).map(c => c.name)
  );

  for (const [key, located] of nextAttrs) {
    const before = prevAttrs.get(key);
    if (!before) {
      // Attributes that arrived inside a brand-new collection are part of that
      // collectionCreated event, not separate attributeCreated moves — unless
      // they moved there from an existing collection (caught below by id).
      const movedHere =
        located.attr.id != null &&
        [...prevAttrs.values()].some(p => p.attr.id === located.attr.id);
      if (!movedHere && !newCollNames.has(located.collectionName)) {
        events.push({
          type: "attributeCreated",
          contextName,
          collectionName: located.collectionName,
          attribute: located.attr,
          enrichment: "ok"
        });
      }
      continue;
    }
    if (before.collectionName !== located.collectionName) {
      events.push({
        type: "attributeMoved",
        contextName,
        attributeName: located.attr.name,
        fromCollection: before.collectionName,
        toCollection: located.collectionName,
        enrichment: "ok"
      });
    }
    const renamed = before.attr.name !== located.attr.name;
    const formulaChanged = (before.attr.formula ?? "") !== (located.attr.formula ?? "");
    if (renamed || formulaChanged) {
      events.push({
        type: "attributeUpdated",
        contextName,
        collectionName: located.collectionName,
        attribute: located.attr,
        previousName: renamed ? before.attr.name : undefined,
        previousFormula: formulaChanged ? before.attr.formula : undefined,
        enrichment: "ok"
      });
    }
  }

  for (const [key, located] of prevAttrs) {
    if (!nextAttrs.has(key)) {
      // Skip attrs that disappeared because their whole collection was deleted.
      if (nextCollNames.has(located.collectionName)) {
        events.push({
          type: "attributeDeleted",
          contextName,
          collectionName: located.collectionName,
          attributeName: located.attr.name,
          enrichment: "ok"
        });
      }
    }
  }

  return events;
}
