import { GraphConfig } from "../models/move-events";
import { RBlock } from "../models/r-blocks";
import { ContextSnapshot, DocumentSnapshot } from "../services/codap-snapshot";
import { TranslationEngine } from "./engine";
import { ContextState } from "./engine-types";
import { buildGraphSetupBlock } from "./rules/graph-moves";
import { translateFormula, UntranslatableFormulaError } from "./formula-translator";
import { attrRef, rebindStep, rString, rValue } from "./r-syntax";

// Setup-preamble generation (plan Unit 3 / origin R9): a complete, runnable
// reconstruction of the document state present when the plugin opened. Data
// vintage is this snapshot (ratified decision) — the same rows become the
// export bundle's CSVs and the webR VFS provisioning.

// Datasets at or under this many cases inline as tribble(); larger ones load
// from a co-provisioned CSV.
export const kInlineDataThreshold = 100;

// Unit 4 supplies this to reconstruct existing graphs through the SAME rules
// used for live graph moves (single generator — no drift between paths).
export type GraphBlockBuilder = (
  graphConfig: GraphConfig,
  componentId: number,
  engine: TranslationEngine
) => RBlock | null;

// Both libraries load unconditionally: the session may create its first graph
// live, after the preamble has already run. Also appended lazily by the
// orchestrator when a session starts from an empty document.
export function libraryBlock(engine: TranslationEngine): RBlock {
  return setup(engine, {
    eventType: "datasetCreated",
    code: "library(dplyr)\nlibrary(ggplot2)",
    annotation:
      "Setup: load the tidyverse packages this script uses. This section recreates what was already in your CODAP document."
  });
}

export function generatePreamble(
  snapshot: DocumentSnapshot,
  engine: TranslationEngine,
  options?: { graphBlockBuilder?: GraphBlockBuilder }
): RBlock[] {
  // An empty document gets no preamble at all: the empty-state onboarding is
  // the first thing the learner sees, and the library block arrives with
  // their first real move.
  if (snapshot.contexts.length === 0 && snapshot.components.every(c => !c.graphConfig)) {
    return [];
  }

  const blocks: RBlock[] = [];
  blocks.push(libraryBlock(engine));

  for (const context of snapshot.contexts) {
    const state = engine.registerContext(context.structure);
    blocks.push(...contextBlocks(context, state, engine));
  }

  const buildGraphBlock = options?.graphBlockBuilder ?? buildGraphSetupBlock;
  for (const component of snapshot.components) {
    if (component.graphConfig) {
      const block = buildGraphBlock(component.graphConfig, component.id, engine);
      if (block) blocks.push({ ...block, isSetup: true });
    }
  }

  return blocks;
}

function contextBlocks(context: ContextSnapshot, state: ContextState, engine: TranslationEngine): RBlock[] {
  const blocks: RBlock[] = [];
  const { structure, items } = context;
  const contextName = structure.name;
  const allAttrs = structure.collections.flatMap(c => c.attrs);
  const formulaAttrs = allAttrs.filter(a => a.formula);
  const plainAttrs = allAttrs.filter(a => !a.formula);

  // 1. Data: tribble for small datasets, read.csv for larger ones. Columns are
  // case_id plus the non-formula attributes; translatable formulas re-derive
  // below (teaching the formula), untranslatable ones keep snapshot values.
  const untranslatable = formulaAttrs.filter(a => !safeTranslates(a.formula!));
  const dataAttrs = [...plainAttrs, ...untranslatable];

  if (items.length <= kInlineDataThreshold) {
    const header = ["case_id", ...dataAttrs.map(a => a.name)];
    const lines = [`${state.varName} <- tribble(`];
    lines.push(`  ${header.map(h => `~${attrRef(h)}`).join(", ")},`);
    items.forEach((item, index) => {
      const row = header.map(h => rValue(item[h]));
      lines.push(`  ${row.join(", ")}${index < items.length - 1 ? "," : ""}`);
    });
    lines.push(")");
    blocks.push(setup(engine, {
      eventType: "datasetCreated",
      code: lines.join("\n"),
      annotation:
        `Setup: the dataset "${contextName}" (${items.length} cases) written out as a tribble — ` +
        `a small table typed directly in R. case_id identifies each CODAP case.`,
      contextName
    }));
  } else {
    blocks.push(setup(engine, {
      eventType: "datasetCreated",
      code: `${state.varName} <- read.csv(${rString(`${state.varName}.csv`)})`,
      annotation:
        `Setup: load the dataset "${contextName}" (${items.length} cases) from its data file. ` +
        `case_id identifies each CODAP case.`,
      contextName
    }));
  }

  // 2. Computed attributes with translatable formulas, in creation order.
  for (const attr of formulaAttrs) {
    if (untranslatable.includes(attr)) {
      blocks.push(setup(engine, {
        eventType: "attributeCreated",
        kind: "comment",
        code: [
          `# "${attr.name}" is computed in CODAP with the formula: ${attr.formula}`,
          `# We couldn't translate that formula to R yet, so its values come from the data file.`
        ].join("\n"),
        annotation:
          `Setup: "${attr.name}" has a CODAP formula R can't express yet; ` +
          `its values are loaded as data.`,
        contextName,
        attrNames: [attr.name],
        status: "untranslated"
      }));
      continue;
    }
    blocks.push(setup(engine, {
      eventType: "attributeCreated",
      code: rebindStep(state.varName, `mutate(${attrRef(attr.name)} = ${translateFormula(attr.formula!)})`),
      annotation: `Setup: "${attr.name}" is computed from the formula ${attr.formula}, recreated with mutate().`,
      contextName,
      attrNames: [attr.name]
    }));
  }

  // 3. Grouping from the existing hierarchy.
  const groupAttrs = engine.currentGroupAttrs(state);
  if (groupAttrs.length > 0) {
    blocks.push(setup(engine, {
      eventType: "collectionCreated",
      code: rebindStep(state.varName, `group_by(${groupAttrs.map(attrRef).join(", ")})`),
      annotation:
        `Setup: your table is grouped by ${groupAttrs.map(a => `"${a}"`).join(", ")} — ` +
        `group_by() recreates the nested table structure.`,
      contextName,
      attrNames: groupAttrs
    }));
  }

  return blocks;
}

function safeTranslates(formula: string): boolean {
  try {
    translateFormula(formula);
    return true;
  } catch (error) {
    if (error instanceof UntranslatableFormulaError) return false;
    throw error;
  }
}

interface SetupSpec {
  eventType: RBlock["provenance"]["eventType"];
  code: string;
  annotation: string;
  contextName?: string;
  attrNames?: string[];
  kind?: RBlock["kind"];
  status?: RBlock["status"];
}

function setup(engine: TranslationEngine, spec: SetupSpec): RBlock {
  return {
    id: engine.nextBlockId(),
    kind: spec.kind ?? "code",
    code: spec.code,
    annotation: spec.annotation,
    status: spec.status ?? "pending",
    isSetup: true,
    provenance: {
      eventType: spec.eventType,
      contextName: spec.contextName,
      attrNames: spec.attrNames
    }
  };
}
