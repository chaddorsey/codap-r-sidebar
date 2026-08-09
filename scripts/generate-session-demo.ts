// Generates the pedagogy-checkpoint artifact (plan Unit 4 exit criterion):
// a realistic ~15-move session rendered as the annotated script a learner
// would see, for review with a teacher/facilitator before the UI locks.
//
//   npx ts-node -O '{"module":"commonjs"}' scripts/generate-session-demo.ts

import * as fs from "fs";
import * as path from "path";
import { MoveEvent } from "../src/models/move-events";
import { composeScript } from "../src/translation/compose";
import { TranslationEngine } from "../src/translation/engine";
import { generatePreamble } from "../src/translation/preamble";
import { DocumentSnapshot } from "../src/services/codap-snapshot";

const snapshot: DocumentSnapshot = {
  contexts: [
    {
      structure: {
        name: "Mammals",
        collections: [
          {
            name: "Cases",
            attrs: [
              { id: 1, name: "species", type: "categorical" },
              { id: 2, name: "diet", type: "categorical" },
              { id: 3, name: "mass", type: "numeric" },
              { id: 4, name: "sleep_hours", type: "numeric" }
            ]
          }
        ]
      },
      items: [
        { case_id: 1, species: "lion", diet: "meat", mass: 190, sleep_hours: 13.5 },
        { case_id: 2, species: "zebra", diet: "plants", mass: 380, sleep_hours: 4.4 },
        { case_id: 3, species: "house cat", diet: "meat", mass: 4.5, sleep_hours: 12.5 },
        { case_id: 4, species: "elephant", diet: "plants", mass: 5400, sleep_hours: 3.5 },
        { case_id: 5, species: "bat", diet: "insects", mass: 0.02, sleep_hours: 19.9 },
        { case_id: 6, species: "human", diet: "both", mass: 62, sleep_hours: 8 },
        { case_id: 7, species: "dolphin", diet: "fish", mass: 150, sleep_hours: 10.4 },
        { case_id: 8, species: "giraffe", diet: "plants", mass: 900, sleep_hours: 1.9 }
      ]
    }
  ],
  components: []
};

const moves: MoveEvent[] = [
  // 1-2: create a computed attribute, tweak its formula
  {
    type: "attributeCreated", contextName: "Mammals", collectionName: "Cases",
    attribute: { id: 5, name: "log_mass", formula: "log(mass)" }
  },
  {
    type: "attributeUpdated", contextName: "Mammals", collectionName: "Cases",
    attribute: { id: 5, name: "log_mass", formula: "ln(mass)" }
  },
  // 3: delete an outlier
  { type: "casesDeleted", contextName: "Mammals", caseIds: [4] },
  // 4: group by diet (hierarchy drag)
  {
    type: "collectionCreated", contextName: "Mammals",
    collection: { name: "Diets", attrs: [{ name: "diet" }] }
  },
  {
    type: "attributeMoved", contextName: "Mammals", attributeName: "diet",
    fromCollection: "Cases", toCollection: "Diets"
  },
  // 5-9: build a graph move by move
  { type: "componentCreated", componentId: 1, componentType: "graph", graphConfig: { dataContext: "Mammals" } },
  {
    type: "graphAttributeChange", componentId: 1, attributeName: "sleep_hours", plotType: "dotPlot",
    graphConfig: { dataContext: "Mammals", xAttributeName: "sleep_hours" }
  },
  {
    type: "graphAttributeChange", componentId: 1, attributeName: "log_mass", plotType: "scatterPlot",
    graphConfig: { dataContext: "Mammals", xAttributeName: "sleep_hours", yAttributeName: "log_mass" }
  },
  {
    type: "graphLegendChange", componentId: 1, attributeName: "diet",
    graphConfig: {
      dataContext: "Mammals", xAttributeName: "sleep_hours", yAttributeName: "log_mass",
      legendAttributeName: "diet"
    }
  },
  { type: "adornmentAdded", componentId: 1, adornment: { type: "LSRL" } },
  // 10: an unsupported adornment (honest fallback visible in review)
  { type: "adornmentAdded", componentId: 1, adornment: { type: "Movable Value" } },
  // 11: rename an attribute
  {
    type: "attributeUpdated", contextName: "Mammals", collectionName: "Cases",
    attribute: { id: 4, name: "sleep" }, previousName: "sleep_hours"
  },
  // 12: a second, univariate graph + mean
  { type: "componentCreated", componentId: 2, componentType: "graph", graphConfig: { dataContext: "Mammals" } },
  {
    type: "graphAttributeChange", componentId: 2, attributeName: "sleep", plotType: "dotPlot",
    graphConfig: { dataContext: "Mammals", xAttributeName: "sleep" }
  },
  { type: "adornmentAdded", componentId: 2, adornment: { type: "Mean" } }
];

const engine = new TranslationEngine();
const blocks = [
  ...generatePreamble(snapshot, engine),
  ...moves.map(e => engine.translate(e)).filter((b): b is NonNullable<typeof b> => b != null)
];

const script = composeScript(blocks);
const outPath = path.join(__dirname, "..", "docs", "notes", "pedagogy-session-demo.R");
fs.writeFileSync(outPath, script);
// eslint-disable-next-line no-console
console.log(`Wrote ${outPath} (${blocks.length} blocks)`);
