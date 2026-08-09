import { MoveEvent } from "../models/move-events";
import { contextValues, FakeCodap } from "../test-support/fake-codap";
import { CodapObserver } from "./codap-observer";

// Handlers fan out through promises; settle the microtask queue between
// notify() and assertions.
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const kCtx = "Mammals";

function makeStarted(structure = defaultStructure()) {
  const fake = new FakeCodap();
  fake.respondTo("dataContextList", { success: true, values: [{ id: 1, name: kCtx }] });
  fake.respondTo(`dataContext[${kCtx}]`, { success: true, values: structure });
  fake.respondTo("globalList", { success: true, values: [{ name: "v1" }] });
  const observer = new CodapObserver(fake);
  const events: MoveEvent[] = [];
  observer.on(e => events.push(e));
  return { fake, observer, events };
}

function defaultStructure() {
  return contextValues(kCtx, [
    {
      name: "Cases",
      attrs: [
        { id: 11, name: "species", type: "categorical" },
        { id: 12, name: "mass", type: "numeric" }
      ]
    }
  ]);
}

describe("CodapObserver", () => {
  it("subscribes to core notices and emits datasetCreated per context on start", async () => {
    const { fake, observer, events } = makeStarted();
    await observer.start();
    expect(fake.subscribedResources()).toEqual(
      expect.arrayContaining([
        "documentChangeNotice",
        "component",
        "undoChangeNotice",
        `dataContextChangeNotice[${kCtx}]`,
        "global[v1]"
      ])
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "datasetCreated",
      context: { name: kCtx },
      enrichment: "ok"
    });
    const structure = observer.getContextStructure(kCtx);
    expect(structure?.collections[0].attrs.map(a => a.name)).toEqual(["species", "mass"]);
  });

  describe("case-level operations translate directly from payloads", () => {
    it.each([
      [
        "createCases",
        { operation: "createCases", result: { caseIDs: [1, 2, 3] } },
        { type: "casesCreated", contextName: kCtx, count: 3, caseIds: [1, 2, 3] }
      ],
      [
        "updateCases",
        { operation: "updateCases", result: { caseIDs: [7] } },
        { type: "casesUpdated", contextName: kCtx, caseIds: [7] }
      ],
      [
        "deleteCases",
        { operation: "deleteCases", result: { caseIDs: [4, 5] } },
        { type: "casesDeleted", contextName: kCtx, caseIds: [4, 5] }
      ],
      ["moveCases", { operation: "moveCases", result: {} }, { type: "casesMoved", contextName: kCtx }]
    ])("%s", async (_name, payload, expected) => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      events.length = 0;
      fake.notify(`dataContextChangeNotice[${kCtx}]`, payload);
      await flush();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject(expected);
    });

    it("handles coalesced bulk createCases as a single event with full count", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      events.length = 0;
      const caseIDs = Array.from({ length: 500 }, (_, i) => i + 1);
      fake.notify(`dataContextChangeNotice[${kCtx}]`, { operation: "createCases", result: { caseIDs } });
      await flush();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "casesCreated", count: 500 });
    });
  });

  describe("selection recording (R3 reserve)", () => {
    it("records learner selections with origin user, accepting both payload shapes", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      events.length = 0;
      fake.notify(`dataContextChangeNotice[${kCtx}]`, {
        operation: "selectCases",
        result: { cases: [{ id: 3 }, { id: 9 }], extend: true }
      });
      fake.notify(`dataContextChangeNotice[${kCtx}]`, {
        operation: "selectCases",
        result: { caseIDs: [5], extend: false }
      });
      await flush();
      expect(events).toEqual([
        expect.objectContaining({
          type: "selectionChanged",
          caseIds: [3, 9],
          extend: true,
          origin: "user"
        }),
        expect.objectContaining({ type: "selectionChanged", caseIds: [5], origin: "user" })
      ]);
    });

    it("tags plugin-originated selections so the recorded stream stays clean", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      events.length = 0;
      observer.expectPluginSelection(kCtx, [2, 1]);
      fake.notify(`dataContextChangeNotice[${kCtx}]`, {
        operation: "selectCases",
        result: { caseIDs: [1, 2], extend: false }
      });
      // A second, learner-made selection with the same ids is user again —
      // the fingerprint is consumed once.
      fake.notify(`dataContextChangeNotice[${kCtx}]`, {
        operation: "selectCases",
        result: { caseIDs: [1, 2], extend: false }
      });
      await flush();
      expect(events.map(e => (e.type === "selectionChanged" ? e.origin : "?"))).toEqual([
        "plugin",
        "user"
      ]);
    });
  });

  describe("structural operations re-get and diff (notifications as triggers)", () => {
    it("emits attributeCreated with the verified formula on createAttributes", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      events.length = 0;
      fake.respondTo(`dataContext[${kCtx}]`, {
        success: true,
        values: contextValues(kCtx, [
          {
            name: "Cases",
            attrs: [
              { id: 11, name: "species", type: "categorical" },
              { id: 12, name: "mass", type: "numeric" },
              { id: 13, name: "logMass", formula: "log(mass)", type: "numeric" }
            ]
          }
        ])
      });
      fake.notify(`dataContextChangeNotice[${kCtx}]`, {
        operation: "createAttributes",
        result: { attrIDs: [13] }
      });
      await flush();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "attributeCreated",
        contextName: kCtx,
        collectionName: "Cases",
        attribute: { name: "logMass", formula: "log(mass)" }
      });
    });

    it("detects renames via stable ids on updateAttributes", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      events.length = 0;
      fake.respondTo(`dataContext[${kCtx}]`, {
        success: true,
        values: contextValues(kCtx, [
          {
            name: "Cases",
            attrs: [
              { id: 11, name: "animal", type: "categorical" },
              { id: 12, name: "mass", type: "numeric" }
            ]
          }
        ])
      });
      fake.notify(`dataContextChangeNotice[${kCtx}]`, {
        operation: "updateAttributes",
        result: { attrIDs: [11] }
      });
      await flush();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "attributeUpdated",
        attribute: { name: "animal" },
        previousName: "species"
      });
    });

    it("emits collectionCreated + attributeMoved for a hierarchy drag", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      events.length = 0;
      fake.respondTo(`dataContext[${kCtx}]`, {
        success: true,
        values: contextValues(kCtx, [
          { name: "Groups", attrs: [{ id: 11, name: "species", type: "categorical" }] },
          { name: "Cases", attrs: [{ id: 12, name: "mass", type: "numeric" }] }
        ])
      });
      fake.notify(`dataContextChangeNotice[${kCtx}]`, {
        operation: "createCollection",
        result: { name: "Groups", attribute: "species" }
      });
      await flush();
      expect(events).toEqual([
        expect.objectContaining({ type: "collectionCreated", collection: expect.objectContaining({ name: "Groups" }) }),
        expect.objectContaining({
          type: "attributeMoved",
          attributeName: "species",
          fromCollection: "Cases",
          toCollection: "Groups"
        })
      ]);
    });

    it("emits attributeDeleted only when the collection survives", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      events.length = 0;
      fake.respondTo(`dataContext[${kCtx}]`, {
        success: true,
        values: contextValues(kCtx, [
          { name: "Cases", attrs: [{ id: 11, name: "species", type: "categorical" }] }
        ])
      });
      fake.notify(`dataContextChangeNotice[${kCtx}]`, {
        operation: "deleteAttributes",
        result: { attrIDs: [12] }
      });
      await flush();
      expect(events).toEqual([
        expect.objectContaining({ type: "attributeDeleted", attributeName: "mass" })
      ]);
    });

    it("degrades to dataContextChanged with enrichment unavailable when the re-get fails", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      events.length = 0;
      fake.failOn(`dataContext[${kCtx}]`);
      fake.notify(`dataContextChangeNotice[${kCtx}]`, {
        operation: "createAttributes",
        result: { attrIDs: [99] }
      });
      await flush();
      expect(events).toEqual([
        expect.objectContaining({
          type: "dataContextChanged",
          operation: "createAttributes",
          enrichment: "unavailable"
        })
      ]);
    });

    it("records unknown operations and still surfaces real structural change", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      events.length = 0;
      fake.respondTo(`dataContext[${kCtx}]`, {
        success: true,
        values: contextValues(kCtx, [
          {
            name: "Cases",
            attrs: [
              { id: 11, name: "species", type: "categorical" },
              { id: 12, name: "mass", type: "numeric" },
              { id: 14, name: "surprise", type: "numeric" }
            ]
          }
        ])
      });
      fake.notify(`dataContextChangeNotice[${kCtx}]`, {
        operation: "someFutureRenamedOperation",
        result: {}
      });
      await flush();
      expect(events[0]).toMatchObject({
        type: "dataContextChanged",
        operation: "someFutureRenamedOperation"
      });
      expect(events[1]).toMatchObject({ type: "attributeCreated", attribute: { name: "surprise" } });
    });
  });

  describe("component notices", () => {
    function withGraph(fake: FakeCodap, adornments: { id?: number; type: string }[] = []) {
      fake.respondTo("component[42]", {
        success: true,
        values: { id: 42, type: "graph", dataContext: kCtx, xAttributeName: "mass" }
      });
      fake.respondTo("component[42].adornmentList", { success: true, values: adornments });
    }

    it("emits componentCreated with graph config for a new graph", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      events.length = 0;
      withGraph(fake);
      fake.notify("component", { operation: "create", id: 42, type: "graph" });
      await flush();
      expect(events).toEqual([
        expect.objectContaining({
          type: "componentCreated",
          componentId: 42,
          componentType: "graph",
          graphConfig: expect.objectContaining({ xAttributeName: "mass" })
        })
      ]);
    });

    it("emits graphAttributeChange and diffs adornments on attributeChange", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      withGraph(fake);
      fake.notify("component", { operation: "create", id: 42, type: "graph" });
      await flush();
      events.length = 0;
      fake.respondTo("component[42].adornmentList", {
        success: true,
        values: [{ id: 1, type: "Mean" }]
      });
      fake.notify("component", {
        operation: "attributeChange",
        id: 42,
        attributeName: "mass",
        plotType: "dotPlot",
        primaryAxis: "x"
      });
      await flush();
      expect(events).toEqual([
        expect.objectContaining({ type: "adornmentAdded", adornment: expect.objectContaining({ type: "Mean" }) }),
        expect.objectContaining({
          type: "graphAttributeChange",
          componentId: 42,
          attributeName: "mass",
          plotType: "dotPlot"
        })
      ]);
    });

    it("re-diffs adornments on unknown component operations (the v3 gap fallback)", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      withGraph(fake, [{ id: 1, type: "Movable Line" }]);
      fake.notify("component", { operation: "create", id: 42, type: "graph" });
      fake.notify("component", { operation: "attributeChange", id: 42, attributeName: "mass" });
      await flush();
      events.length = 0;
      // The movable line disappears; only a generic/renamed notice arrives.
      fake.respondTo("component[42].adornmentList", { success: true, values: [] });
      fake.notify("component", { operation: "toggle between bars and dots", id: 42 });
      await flush();
      expect(events).toEqual([
        expect.objectContaining({ type: "componentUpdated", operation: "toggle between bars and dots" }),
        expect.objectContaining({
          type: "adornmentRemoved",
          adornment: expect.objectContaining({ type: "Movable Line" })
        })
      ]);
    });

    it("emits componentDeleted and drops cached graph state", async () => {
      const { fake, observer, events } = makeStarted();
      await observer.start();
      withGraph(fake);
      fake.notify("component", { operation: "create", id: 42, type: "graph" });
      await flush();
      events.length = 0;
      fake.notify("component", { operation: "delete", id: 42, type: "graph" });
      await flush();
      expect(events).toEqual([expect.objectContaining({ type: "componentDeleted", componentId: 42 })]);
    });
  });

  it("emits undo/redo events from undoChangeNotice", async () => {
    const { fake, observer, events } = makeStarted();
    await observer.start();
    events.length = 0;
    fake.notify("undoChangeNotice", { operation: "undoAction", canUndo: false, canRedo: true });
    fake.notify("undoChangeNotice", { operation: "redoAction", canUndo: true, canRedo: false });
    fake.notify("undoChangeNotice", { operation: "clearUndo" });
    await flush();
    expect(events.map(e => e.type)).toEqual(["undoAction", "redoAction"]);
  });

  it("emits sliderChanged from global value notices", async () => {
    const { fake, observer, events } = makeStarted();
    await observer.start();
    events.length = 0;
    fake.notify("global[v1]", { globalValue: 3.5 });
    await flush();
    expect(events).toEqual([
      expect.objectContaining({ type: "sliderChanged", globalName: "v1", value: 3.5 })
    ]);
  });

  it("subscribes to new contexts and emits datasetCreated on dataContextCountChanged", async () => {
    const { fake, observer, events } = makeStarted();
    await observer.start();
    events.length = 0;
    fake.respondTo("dataContextList", {
      success: true,
      values: [{ id: 1, name: kCtx }, { id: 2, name: "Imported" }]
    });
    fake.respondTo("dataContext[Imported]", {
      success: true,
      values: contextValues("Imported", [{ name: "Cases", attrs: [{ id: 21, name: "x" }] }], 2)
    });
    fake.notify("documentChangeNotice", { operation: "dataContextCountChanged" });
    await flush();
    expect(events).toEqual([
      expect.objectContaining({ type: "datasetCreated", context: expect.objectContaining({ name: "Imported" }) })
    ]);
    expect(fake.subscribedResources()).toContain("dataContextChangeNotice[Imported]");
  });

  it("emits datasetDeleted on dataContextDeleted", async () => {
    const { fake, observer, events } = makeStarted();
    await observer.start();
    events.length = 0;
    fake.notify("documentChangeNotice", { operation: "dataContextDeleted", deletedContext: kCtx });
    await flush();
    expect(events).toEqual([expect.objectContaining({ type: "datasetDeleted", contextName: kCtx })]);
  });
});
