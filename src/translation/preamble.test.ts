import * as fs from "fs";
import * as path from "path";
import { MoveEvent } from "../models/move-events";
import { RBlock } from "../models/r-blocks";
import { DocumentSnapshot } from "../services/codap-snapshot";
import { composeScript } from "./compose";
import { TranslationEngine } from "./engine";
import { generatePreamble, kInlineDataThreshold } from "./preamble";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

const smallSnapshot: DocumentSnapshot = {
  contexts: [
    {
      structure: {
        name: "Mammals",
        collections: [
          { name: "Diets", attrs: [{ id: 1, name: "diet", type: "categorical" }] },
          {
            name: "Cases",
            attrs: [
              { id: 2, name: "species", type: "categorical" },
              { id: 3, name: "mass", type: "numeric" },
              { id: 4, name: "logMass", formula: "ln(mass)", type: "numeric" },
              { id: 5, name: "weird", formula: "lookupByKey(x, y, z)", type: "numeric" }
            ]
          }
        ]
      },
      items: [
        { case_id: 10, diet: "meat", species: "lion", mass: 190, logMass: 5.25, weird: 4.2 },
        { case_id: 11, diet: "plants", species: "zebra", mass: 380, logMass: 5.94, weird: 3.1 }
      ]
    }
  ],
  components: []
};

describe("generatePreamble", () => {
  it("recreates a small hierarchical document as the golden fixture (tribble path)", () => {
    const engine = new TranslationEngine();
    const blocks = generatePreamble(smallSnapshot, engine);
    expect(blocks.every(b => b.isSetup)).toBe(true);
    expect(composeScript(blocks)).toBe(fixture("preamble-small.R"));
  });

  it("switches to read.csv above the inline threshold", () => {
    const items = Array.from({ length: kInlineDataThreshold + 1 }, (_, i) => ({
      case_id: i + 1,
      x: i
    }));
    const snapshot: DocumentSnapshot = {
      contexts: [
        {
          structure: { name: "Big Data", collections: [{ name: "Cases", attrs: [{ id: 1, name: "x" }] }] },
          items
        }
      ],
      components: []
    };
    const engine = new TranslationEngine();
    const blocks = generatePreamble(snapshot, engine);
    const dataBlock = blocks[1];
    expect(dataBlock.code).toBe('big_data <- read.csv("big_data.csv")');
    expect(dataBlock.annotation).toContain("101 cases");
  });

  it("empty-ish values render as NA in tribbles", () => {
    const snapshot: DocumentSnapshot = {
      contexts: [
        {
          structure: { name: "Tiny", collections: [{ name: "Cases", attrs: [{ id: 1, name: "x" }] }] },
          items: [{ case_id: 1, x: "" }, { case_id: 2, x: 5 }]
        }
      ],
      components: []
    };
    const blocks = generatePreamble(snapshot, new TranslationEngine());
    expect(blocks[1].code).toContain("1, NA,");
    expect(blocks[1].code).toContain("2, 5");
  });

  it("includes ggplot2 only when the document has graphs, delegating graph blocks to the injected builder", () => {
    const snapshotWithGraph: DocumentSnapshot = {
      ...smallSnapshot,
      components: [
        { id: 42, type: "graph", graphConfig: { dataContext: "Mammals", xAttributeName: "mass" } }
      ]
    };
    const engine = new TranslationEngine();
    const built: number[] = [];
    const blocks = generatePreamble(snapshotWithGraph, engine, {
      graphBlockBuilder: (config, componentId, eng): RBlock => {
        built.push(componentId);
        return {
          id: eng.nextBlockId(),
          kind: "code",
          code: "p1 <- ggplot(mammals)",
          annotation: "Setup: a graph.",
          status: "pending",
          provenance: { eventType: "componentCreated", componentId }
        };
      }
    });
    expect(blocks[0].code).toBe("library(dplyr)\nlibrary(ggplot2)");
    expect(built).toEqual([42]);
    expect(blocks[blocks.length - 1]).toMatchObject({ code: "p1 <- ggplot(mammals)", isSetup: true });
  });

  it("registered preamble contexts silence later datasetCreated events (observer startup echo)", () => {
    const engine = new TranslationEngine();
    generatePreamble(smallSnapshot, engine);
    const echo: MoveEvent = {
      type: "datasetCreated",
      context: smallSnapshot.contexts[0].structure
    };
    expect(engine.translate(echo)).toBeNull();
  });
});

describe("full session golden script", () => {
  it("matches the session-data-moves fixture end to end", () => {
    const engine = new TranslationEngine();
    const events: MoveEvent[] = [
      {
        type: "datasetCreated",
        context: {
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
        }
      },
      { type: "casesCreated", contextName: "Pets", count: 6, caseIds: [1, 2, 3, 4, 5, 6] },
      {
        type: "attributeCreated",
        contextName: "Pets",
        collectionName: "Cases",
        attribute: { id: 3, name: "double_count", formula: "count * 2" }
      },
      { type: "casesDeleted", contextName: "Pets", caseIds: [3] },
      {
        type: "attributeUpdated",
        contextName: "Pets",
        collectionName: "Cases",
        attribute: { id: 1, name: "species" },
        previousName: "animal"
      },
      {
        type: "collectionCreated",
        contextName: "Pets",
        collection: { name: "Groups", attrs: [{ name: "species" }] }
      },
      {
        type: "attributeMoved",
        contextName: "Pets",
        attributeName: "species",
        fromCollection: "Cases",
        toCollection: "Groups"
      },
      { type: "sliderChanged", globalName: "scale", value: 2.5 }
    ];
    const blocks = events
      .map(e => engine.translate(e))
      .filter((b): b is NonNullable<typeof b> => b != null);
    expect(composeScript(blocks)).toBe(fixture("session-data-moves.R"));
  });
});
