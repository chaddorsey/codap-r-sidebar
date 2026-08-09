import { DataContextStructure, MoveEvent } from "../models/move-events";
import { TranslationEngine } from "./engine";

const petsStructure: DataContextStructure = {
  name: "Pets",
  collections: [
    {
      name: "Cases",
      attrs: [
        { id: 1, name: "animal", type: "categorical" },
        { id: 2, name: "count", type: "numeric" }
      ]
    }
  ]
};

const datasetCreated: MoveEvent = { type: "datasetCreated", context: petsStructure };

describe("TranslationEngine data/hierarchy rules", () => {
  it("translates a mid-session dataset arrival into a read.csv block", () => {
    const engine = new TranslationEngine();
    const block = engine.translate(datasetCreated);
    expect(block).toMatchObject({
      kind: "code",
      code: 'pets <- read.csv("pets.csv")',
      status: "pending",
      provenance: { eventType: "datasetCreated", contextName: "Pets" }
    });
  });

  it("produces no import block for contexts the preamble already registered", () => {
    const engine = new TranslationEngine();
    engine.registerContext(petsStructure);
    expect(engine.translate(datasetCreated)).toBeNull();
  });

  it("absorbs the import's first casesCreated, then narrates hand-typed cases", () => {
    const engine = new TranslationEngine();
    engine.translate(datasetCreated);
    const first = engine.translate({
      type: "casesCreated", contextName: "Pets", count: 6, caseIds: [1, 2, 3, 4, 5, 6]
    });
    expect(first).toBeNull();
    const second = engine.translate({
      type: "casesCreated", contextName: "Pets", count: 1, caseIds: [7]
    });
    expect(second).toMatchObject({ kind: "comment", status: "untranslated" });
    expect(second?.annotation).toMatch(/added 1 case/);
  });

  it("translates case deletion into a case_id filter", () => {
    const engine = new TranslationEngine();
    engine.translate(datasetCreated);
    const block = engine.translate({
      type: "casesDeleted", contextName: "Pets", caseIds: [4, 5]
    });
    expect(block?.code).toBe("pets <- pets |>\n  filter(!(case_id %in% c(4, 5)))");
    expect(block?.provenance.caseIds).toEqual([4, 5]);
    const single = engine.translate({
      type: "casesDeleted", contextName: "Pets", caseIds: [9]
    });
    expect(single?.code).toBe("pets <- pets |>\n  filter(!(case_id %in% 9))");
  });

  it("translates a formula attribute into mutate, mapping CODAP function names", () => {
    const engine = new TranslationEngine();
    engine.translate(datasetCreated);
    const block = engine.translate({
      type: "attributeCreated",
      contextName: "Pets",
      collectionName: "Cases",
      attribute: { name: "logCount", formula: "ln(count)" }
    });
    expect(block?.code).toBe("pets <- pets |>\n  mutate(logCount = log(count))");
    expect(block?.provenance.attrNames).toEqual(["logCount"]);
  });

  it("falls back to an untranslated comment block for unsupported formulas", () => {
    const engine = new TranslationEngine();
    engine.translate(datasetCreated);
    const block = engine.translate({
      type: "attributeCreated",
      contextName: "Pets",
      collectionName: "Cases",
      attribute: { name: "lookup", formula: "lookupByKey(a, b, c)" }
    });
    expect(block).toMatchObject({ kind: "comment", status: "untranslated" });
    expect(block?.code).toContain("lookupByKey(a, b, c)");
    expect(block?.code.split("\n").every(line => line.startsWith("#"))).toBe(true);
  });

  it("translates renames via id-stable detection into rename()", () => {
    const engine = new TranslationEngine();
    engine.translate(datasetCreated);
    const block = engine.translate({
      type: "attributeUpdated",
      contextName: "Pets",
      collectionName: "Cases",
      attribute: { id: 1, name: "species" },
      previousName: "animal"
    });
    expect(block?.code).toBe("pets <- pets |>\n  rename(species = animal)");
  });

  it("translates attribute deletion into select(-name), backticking when needed", () => {
    const engine = new TranslationEngine();
    engine.translate(datasetCreated);
    const block = engine.translate({
      type: "attributeDeleted", contextName: "Pets", collectionName: "Cases", attributeName: "Heart Rate"
    });
    expect(block?.code).toBe("pets <- pets |>\n  select(-`Heart Rate`)");
  });

  it("translates a hierarchy drag into group_by and dedupes the paired attributeMoved", () => {
    const engine = new TranslationEngine();
    engine.translate(datasetCreated);
    const grouped = engine.translate({
      type: "collectionCreated",
      contextName: "Pets",
      collection: { name: "Groups", attrs: [{ name: "animal" }] }
    });
    expect(grouped?.code).toBe("pets <- pets |>\n  ungroup() |>\n  group_by(animal)");
    // The same drag's attributeMoved adds nothing new — no duplicate block.
    const moved = engine.translate({
      type: "attributeMoved",
      contextName: "Pets",
      attributeName: "animal",
      fromCollection: "Cases",
      toCollection: "Groups"
    });
    expect(moved).toBeNull();
  });

  it("translates ungrouping into ungroup()", () => {
    const engine = new TranslationEngine();
    engine.translate(datasetCreated);
    engine.translate({
      type: "collectionCreated",
      contextName: "Pets",
      collection: { name: "Groups", attrs: [{ name: "animal" }] }
    });
    const block = engine.translate({
      type: "collectionDeleted", contextName: "Pets", collectionName: "Groups"
    });
    expect(block?.code).toBe("pets <- pets |>\n  ungroup()");
  });

  it("translates slider moves into plain assignment", () => {
    const engine = new TranslationEngine();
    const block = engine.translate({ type: "sliderChanged", globalName: "scale", value: 2.5 });
    expect(block?.code).toBe("scale <- 2.5");
  });

  it("returns null for record-only events", () => {
    const engine = new TranslationEngine();
    engine.translate(datasetCreated);
    const recordOnly: MoveEvent[] = [
      { type: "selectionChanged", contextName: "Pets", caseIds: [1], extend: false, origin: "user" },
      { type: "casesUpdated", contextName: "Pets", caseIds: [1] },
      { type: "componentUpdated", componentId: 1, operation: "titleChange" },
      { type: "undoAction" }
    ];
    for (const event of recordOnly) expect(engine.translate(event)).toBeNull();
  });

  it("narrates unreadable structural changes instead of guessing", () => {
    const engine = new TranslationEngine();
    engine.translate(datasetCreated);
    const block = engine.translate({
      type: "dataContextChanged",
      contextName: "Pets",
      operation: "createAttributes",
      enrichment: "unavailable"
    });
    expect(block).toMatchObject({ kind: "comment", status: "untranslated" });
  });

  it("keeps dataset variable names unique and events for unknown contexts silent", () => {
    const engine = new TranslationEngine();
    engine.registerContext({ name: "My Data!", collections: [{ name: "Cases", attrs: [] }] });
    const second = engine.registerContext({ name: "My data", collections: [{ name: "Cases", attrs: [] }] });
    expect(second.varName).toBe("my_data_2");
    expect(
      engine.translate({ type: "casesDeleted", contextName: "Unknown", caseIds: [1] })
    ).toBeNull();
  });

  it("is deterministic: identical event sequences produce identical blocks", () => {
    const run = () => {
      const engine = new TranslationEngine();
      const events: MoveEvent[] = [
        datasetCreated,
        { type: "casesDeleted", contextName: "Pets", caseIds: [2] },
        {
          type: "attributeCreated",
          contextName: "Pets",
          collectionName: "Cases",
          attribute: { name: "double", formula: "count * 2" }
        }
      ];
      return events.map(e => engine.translate(e));
    };
    expect(run()).toEqual(run());
  });
});
