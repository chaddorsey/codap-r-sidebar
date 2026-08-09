import { MoveEvent } from "../../models/move-events";
import { RBlock } from "../../models/r-blocks";
import { EngineApi } from "../engine-types";
import { translateFormula, UntranslatableFormulaError } from "../formula-translator";
import { attrRef, rebindStep, rNumericVector, rString } from "../r-syntax";

// Data + hierarchy move rules (plan Unit 3). Graph rules arrive in Unit 4 and
// return null here so the engine stays total over the MoveEvent union.

export function translateDataMove(engine: EngineApi, event: MoveEvent): RBlock | null {
  switch (event.type) {
    case "datasetCreated": {
      // Contexts registered by the preamble produce no import block.
      if (engine.hasContext(event.context.name)) return null;
      const state = engine.registerContext(event.context, { fromImport: true });
      const fileName = `${state.varName}.csv`;
      return codeBlock(engine, event, {
        code: `${state.varName} <- read.csv(${rString(fileName)})`,
        annotation:
          `You brought the dataset "${event.context.name}" into CODAP. ` +
          `In R, read.csv() loads the same data (the case_id column identifies each case).`,
        contextName: event.context.name
      });
    }

    case "datasetDeleted": {
      const state = engine.getContext(event.contextName);
      engine.forgetContext(event.contextName);
      if (!state) return null;
      return codeBlock(engine, event, {
        code: `rm(${state.varName})`,
        annotation: `You deleted the dataset "${event.contextName}". rm() removes it in R too.`,
        contextName: event.contextName
      });
    }

    case "casesCreated": {
      const state = engine.getContext(event.contextName);
      if (!state) return null;
      if (state.awaitingImportCases) {
        // The import block's read.csv already covers these rows.
        state.awaitingImportCases = false;
        return null;
      }
      return commentBlock(engine, event, {
        lines: [
          `You added ${plural(event.count, "case")} by hand in CODAP.`,
          `Typed-in data doesn't translate to a runnable R step; the exported data file includes these cases.`
        ],
        annotation:
          `You added ${plural(event.count, "case")} by typing into the table — R scripts usually ` +
          `load data rather than typing it in, so this step stays as a note.`,
        contextName: event.contextName,
        caseIds: event.caseIds
      });
    }

    case "casesDeleted": {
      const state = engine.getContext(event.contextName);
      if (!state) return null;
      const ids = rNumericVector(event.caseIds);
      return codeBlock(engine, event, {
        code: rebindStep(state.varName, `filter(!(case_id %in% ${ids}))`),
        annotation:
          `You deleted ${plural(event.caseIds.length, "case")}. filter() keeps every case that is ` +
          `NOT one of the deleted ones.`,
        contextName: event.contextName,
        caseIds: event.caseIds
      });
    }

    case "casesMoved": {
      const state = engine.getContext(event.contextName);
      if (!state) return null;
      return commentBlock(engine, event, {
        lines: [
          `You sorted the table.`,
          `In R that's arrange() — we couldn't tell which attribute you sorted by, so this step stays as a note.`
        ],
        annotation: `You sorted the table. R's arrange() does this, but we couldn't tell which attribute you sorted by.`,
        contextName: event.contextName
      });
    }

    case "attributeCreated": {
      const state = engine.getContext(event.contextName);
      if (!state) return null;
      const attr = event.attribute;
      if (!attr.formula) {
        return codeBlock(engine, event, {
          code: rebindStep(state.varName, `mutate(${attrRef(attr.name)} = NA)`),
          annotation:
            `You added a new empty attribute "${attr.name}". mutate() creates it as a column with no values yet.`,
          contextName: event.contextName,
          attrNames: [attr.name]
        });
      }
      return formulaMutate(engine, event, state.varName, attr.name, attr.formula, event.contextName, "created");
    }

    case "attributeUpdated": {
      const state = engine.getContext(event.contextName);
      if (!state) return null;
      const attr = event.attribute;
      if (event.previousName) {
        return codeBlock(engine, event, {
          code: rebindStep(
            state.varName,
            `rename(${attrRef(attr.name)} = ${attrRef(event.previousName)})`
          ),
          annotation: `You renamed "${event.previousName}" to "${attr.name}". rename() takes new_name = old_name.`,
          contextName: event.contextName,
          attrNames: [attr.name, event.previousName]
        });
      }
      if (attr.formula != null) {
        return formulaMutate(engine, event, state.varName, attr.name, attr.formula, event.contextName, "changed");
      }
      return null;
    }

    case "attributeDeleted": {
      const state = engine.getContext(event.contextName);
      if (!state) return null;
      return codeBlock(engine, event, {
        code: rebindStep(state.varName, `select(-${attrRef(event.attributeName)})`),
        annotation: `You deleted the attribute "${event.attributeName}". select(-name) drops a column.`,
        contextName: event.contextName,
        attrNames: [event.attributeName]
      });
    }

    case "collectionCreated": {
      const state = engine.getContext(event.contextName);
      if (!state) return null;
      state.groupingCollections.set(event.collection.name, event.collection.attrs.map(a => a.name));
      return groupingBlock(engine, event, state, {
        annotation:
          `You grouped "${event.contextName}" by ${listNames(event.collection.attrs.map(a => a.name))} — ` +
          `that's what your nested table shows. group_by() is R's version of the same idea.`
      });
    }

    case "collectionDeleted": {
      const state = engine.getContext(event.contextName);
      if (!state) return null;
      if (!state.groupingCollections.has(event.collectionName)) return null;
      state.groupingCollections.delete(event.collectionName);
      return groupingBlock(engine, event, state, {
        annotation: `You ungrouped the table. ungroup() undoes group_by().`
      });
    }

    case "attributeMoved": {
      const state = engine.getContext(event.contextName);
      if (!state) return null;
      let changed = false;
      const fromAttrs = state.groupingCollections.get(event.fromCollection);
      if (fromAttrs?.includes(event.attributeName)) {
        state.groupingCollections.set(
          event.fromCollection,
          fromAttrs.filter(a => a !== event.attributeName)
        );
        changed = true;
      }
      const toAttrs = state.groupingCollections.get(event.toCollection);
      if (toAttrs && !toAttrs.includes(event.attributeName)) {
        state.groupingCollections.set(event.toCollection, [...toAttrs, event.attributeName]);
        changed = true;
      }
      if (!changed) return null;
      return groupingBlock(engine, event, state, {
        annotation:
          `You moved "${event.attributeName}" between levels of the nested table, so the grouping changed.`
      });
    }

    case "sliderChanged": {
      const varName = engine.sliderVarName(event.globalName);
      return codeBlock(engine, event, {
        code: `${varName} <- ${event.value}`,
        annotation: `You moved the slider "${event.globalName}" to ${event.value}. In R that's just assigning a value.`
      });
    }

    // Record-only in v1 (origin R3 and plan decisions).
    case "selectionChanged":
    case "casesUpdated":
    case "componentUpdated":
    case "undoAction":
    case "redoAction":
      return null;

    case "dataContextChanged": {
      if (event.enrichment !== "unavailable") return null;
      return commentBlock(engine, event, {
        lines: [
          `Something changed in "${event.contextName}" that we couldn't read from CODAP (${event.operation}).`
        ],
        annotation: `Something changed in "${event.contextName}" that we couldn't read, so there's no R step for it.`,
        contextName: event.contextName
      });
    }

    // Graph-family events are translated by Unit 4's rules.
    case "componentCreated":
    case "componentDeleted":
    case "graphAttributeChange":
    case "graphLegendChange":
    case "adornmentAdded":
    case "adornmentRemoved":
      return null;

    default:
      return null;
  }
}

// --- helpers ---------------------------------------------------------------

interface CodeBlockSpec {
  code: string;
  annotation: string;
  contextName?: string;
  attrNames?: string[];
  caseIds?: number[];
}

function codeBlock(engine: EngineApi, event: MoveEvent, spec: CodeBlockSpec): RBlock {
  return {
    id: engine.nextBlockId(),
    kind: "code",
    code: spec.code,
    annotation: spec.annotation,
    status: "pending",
    provenance: {
      eventType: event.type,
      contextName: spec.contextName,
      attrNames: spec.attrNames,
      caseIds: spec.caseIds
    }
  };
}

interface CommentBlockSpec {
  lines: string[];
  annotation: string;
  contextName?: string;
  attrNames?: string[];
  caseIds?: number[];
}

function commentBlock(engine: EngineApi, event: MoveEvent, spec: CommentBlockSpec): RBlock {
  return {
    id: engine.nextBlockId(),
    kind: "comment",
    code: spec.lines.map(line => `# ${line}`).join("\n"),
    annotation: spec.annotation,
    status: "untranslated",
    provenance: {
      eventType: event.type,
      contextName: spec.contextName,
      attrNames: spec.attrNames,
      caseIds: spec.caseIds
    }
  };
}

function formulaMutate(
  engine: EngineApi,
  event: MoveEvent,
  varName: string,
  attrName: string,
  formula: string,
  contextName: string,
  verb: "created" | "changed"
): RBlock {
  try {
    const rExpr = translateFormula(formula);
    const created = verb === "created";
    return codeBlock(engine, event, {
      code: rebindStep(varName, `mutate(${attrRef(attrName)} = ${rExpr})`),
      annotation: created
        ? `You created "${attrName}" with the formula ${formula}. mutate() computes a new column the same way.`
        : `You changed the formula for "${attrName}" to ${formula}. mutate() recomputes the column.`,
      contextName,
      attrNames: [attrName]
    });
  } catch (error) {
    const reason = error instanceof UntranslatableFormulaError ? error.reason : "unsupported formula";
    return commentBlock(engine, event, {
      lines: [
        `You gave "${attrName}" the CODAP formula: ${formula}`,
        `We couldn't translate it to R yet (${reason}), so this step stays as a note.`
      ],
      annotation: `You gave "${attrName}" a formula R can't express yet (${reason}).`,
      contextName,
      attrNames: [attrName]
    });
  }
}

function groupingBlock(
  engine: EngineApi,
  event: MoveEvent,
  state: { varName: string; groupingCollections: Map<string, string[]> },
  spec: { annotation: string }
): RBlock {
  const groupAttrs = [...state.groupingCollections.values()].flat();
  const verbCall =
    groupAttrs.length === 0
      ? "ungroup()"
      : `ungroup() |>\n  group_by(${groupAttrs.map(attrRef).join(", ")})`;
  return codeBlock(engine, event, {
    code: rebindStep(state.varName, verbCall),
    annotation: spec.annotation,
    contextName: (event as any).contextName,
    attrNames: groupAttrs.length > 0 ? groupAttrs : undefined
  });
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function listNames(names: string[]): string {
  return names.map(n => `"${n}"`).join(", ");
}
