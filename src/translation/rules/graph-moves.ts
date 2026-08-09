import { GraphConfig, MoveEvent } from "../../models/move-events";
import { RBlock } from "../../models/r-blocks";
import { EngineApi, GraphState } from "../engine-types";
import { attrRef } from "../r-syntax";

// Graph move rules (plan Unit 4) under the ratified delta-block model: each
// graph is a named plot object (p1, p2, ...); every move appends a small delta
// (`p1 <- p1 + aes(...)`), and when the geom must change (adding a y-axis
// turns a dot plot into a scatter plot) we rebuild the plot object with an
// annotation that teaches exactly that. Desired state always comes from the
// observer's request-verified GraphConfig — never from payload heuristics.

export function translateGraphMove(engine: EngineApi, event: MoveEvent): RBlock | null {
  switch (event.type) {
    case "componentCreated": {
      if (event.componentType !== "graph") return null;
      return applyConfig(engine, event, event.componentId, event.graphConfig, "created");
    }

    case "graphAttributeChange":
    case "graphLegendChange":
      return applyConfig(engine, event, event.componentId, event.graphConfig, "changed");

    case "componentDeleted": {
      const state = engine.getGraph(event.componentId);
      if (!state) return null;
      engine.forgetGraph(event.componentId);
      if (!state.initialized) return null;
      return block(engine, event, {
        code: `rm(${state.varName})`,
        annotation: `You deleted the graph. rm() removes its plot object in R.`,
        componentId: event.componentId
      });
    }

    case "adornmentAdded":
      return translateAdornment(engine, event);

    case "adornmentRemoved": {
      const state = engine.getGraph(event.componentId);
      if (!state) return null;
      const label = adornmentLabel(event.adornment.type);
      return commentBlock(engine, event, {
        lines: [
          `You removed the ${label} from the graph.`,
          `In R you'd delete the line of code that added it.`
        ],
        annotation: `You removed the ${label} from the graph — in R you'd delete the line that added it.`,
        componentId: event.componentId
      });
    }

    default:
      return null;
  }
}

// The preamble's graph builder (origin R9): reconstructs an existing graph
// through this same module, so live moves and setup blocks can never drift.
export function buildGraphSetupBlock(
  config: GraphConfig,
  componentId: number,
  engine: EngineApi
): RBlock | null {
  const built = applyConfig(engine, { type: "componentCreated", componentId, componentType: "graph" },
    componentId, config, "setup");
  return built;
}

// --- core: sync a graph's translation state to a verified config ------------

type ChangeKind = "created" | "changed" | "setup";

function applyConfig(
  engine: EngineApi,
  event: MoveEvent,
  componentId: number,
  config: GraphConfig | undefined,
  kind: ChangeKind
): RBlock | null {
  const state = engine.getGraph(componentId) ?? engine.registerGraph(componentId, config?.dataContext);

  if (!config) {
    if (kind === "created") return null; // init deferred to the first change
    return commentBlock(engine, event, {
      lines: [`You changed a graph, but we couldn't read its setup from CODAP.`],
      annotation: `You changed a graph, but we couldn't read its setup from CODAP, so there's no R step for it.`,
      componentId
    });
  }

  state.contextName = state.contextName ?? config.dataContext;
  const context = state.contextName ? engine.getContext(state.contextName) : undefined;
  if (!context) {
    if (kind === "created") return null;
    return commentBlock(engine, event, {
      lines: [`You changed a graph of a dataset we haven't seen, so we couldn't translate it.`],
      annotation: `You changed a graph of a dataset we haven't seen, so we couldn't translate it.`,
      componentId
    });
  }

  const desired = desiredAes(config);
  const changes = diffAes(state, desired);
  const desiredGeom = geomFor(event, config, desired);
  const geomChanged = (state.geom ?? "") !== (desiredGeom ?? "");
  const facetChanged = changes.some(c => c.slot === "topSplit" || c.slot === "rightSplit");

  if (!state.initialized) {
    Object.assign(state, desired, { geom: desiredGeom, initialized: true });
    return block(engine, event, {
      code: buildFull(state, context.varName),
      annotation:
        kind === "setup"
          ? setupAnnotation(state)
          : buildAnnotation(state, changes, desiredGeom, true, true),
      componentId,
      contextName: state.contextName,
      attrNames: aesAttrNames(state)
    });
  }

  if (changes.length === 0 && !geomChanged) return null;

  Object.assign(state, desired, { geom: desiredGeom });

  if (geomChanged) {
    // ggplot2 can't remove or swap layers with `+`, so a plot-type change
    // rebuilds the object — and the annotation teaches that geoms define the
    // plot type.
    return block(engine, event, {
      code: buildFull(state, context.varName),
      annotation: buildAnnotation(state, changes, desiredGeom, true),
      componentId,
      contextName: state.contextName,
      attrNames: aesAttrNames(state)
    });
  }

  const parts: string[] = [];
  const aesParts = changes.filter(c => c.slot === "x" || c.slot === "y" || c.slot === "legend");
  if (aesParts.length > 0) {
    parts.push(`aes(${aesParts.map(c => `${aesArg(c.slot)} = ${c.next ? attrRef(c.next) : "NULL"}`).join(", ")})`);
  }
  if (facetChanged) parts.push(facetCall(state));
  if (parts.length === 0) return null;

  return block(engine, event, {
    code: `${state.varName} <- ${state.varName} + ${parts.join(" + ")}\n${state.varName}`,
    annotation: buildAnnotation(state, changes, undefined, false),
    componentId,
    contextName: state.contextName,
    attrNames: changes.map(c => c.next ?? c.prev).filter((n): n is string => n != null)
  });
}

// --- adornments -------------------------------------------------------------

function translateAdornment(engine: EngineApi, event: MoveEvent & { type: "adornmentAdded" }): RBlock | null {
  const state = engine.getGraph(event.componentId);
  if (!state) return null;
  const type = event.adornment.type.toLowerCase();
  const label = adornmentLabel(event.adornment.type);

  if (!state.initialized) return null;

  if (type.includes("mean") || type.includes("median")) {
    const fn = type.includes("mean") ? "mean" : "median";
    const axis = state.x ?? state.y;
    if (!axis) return null;
    const orient = state.x ? "xintercept" : "yintercept";
    const geom = state.x ? "geom_vline" : "geom_hline";
    return block(engine, event, {
      code: `${state.varName} <- ${state.varName} + ${geom}(aes(${orient} = ${fn}(${attrRef(axis)})))\n${state.varName}`,
      annotation:
        `You added the ${fn} of "${axis}" to the graph. ` +
        `${geom}() draws it as a line at ${fn}(${axis}).`,
      componentId: event.componentId,
      contextName: state.contextName,
      attrNames: [axis]
    });
  }

  if (type.includes("lsrl") || type.includes("least squares")) {
    return block(engine, event, {
      code: `${state.varName} <- ${state.varName} + geom_smooth(method = "lm", se = FALSE)\n${state.varName}`,
      annotation:
        `You added a least-squares line. geom_smooth(method = "lm") fits and draws the same regression line.`,
      componentId: event.componentId,
      contextName: state.contextName
    });
  }

  return commentBlock(engine, event, {
    lines: [
      `You added a ${label} to the graph.`,
      `We can't translate this graph element to R yet.`
    ],
    annotation: `You added a ${label} to the graph — R can't express this one yet.`,
    componentId: event.componentId
  });
}

function adornmentLabel(type: string): string {
  return type.replace(/^k/, "").replace(/Type$/, "").toLowerCase() || "graph element";
}

// --- desired-state helpers --------------------------------------------------

type AesSlot = "x" | "y" | "legend" | "topSplit" | "rightSplit";

interface AesChange {
  slot: AesSlot;
  prev?: string;
  next?: string;
}

function desiredAes(config: GraphConfig): Pick<GraphState, AesSlot> {
  return {
    x: config.xAttributeName ?? undefined,
    y: config.yAttributeName ?? config.yAttributeNames?.[0] ?? undefined,
    legend: config.legendAttributeName ?? undefined,
    topSplit: config.topSplitAttributeName ?? undefined,
    rightSplit: config.rightSplitAttributeName ?? undefined
  };
}

function diffAes(state: GraphState, desired: Pick<GraphState, AesSlot>): AesChange[] {
  const slots: AesSlot[] = ["x", "y", "legend", "topSplit", "rightSplit"];
  const changes: AesChange[] = [];
  for (const slot of slots) {
    if ((state[slot] ?? "") !== (desired[slot] ?? "")) {
      changes.push({ slot, prev: state[slot], next: desired[slot] });
    }
  }
  return changes;
}

function aesArg(slot: AesSlot): string {
  return slot === "legend" ? "color" : slot;
}

// Best-effort plotType/pointConfig -> geom mapping (spike question #5 refines
// the exact v3 plotType strings; the axis-based fallback keeps this safe).
function geomFor(event: MoveEvent, config: GraphConfig, desired: Pick<GraphState, AesSlot>): string | undefined {
  const plotType = ((event as any).plotType as string | undefined)?.toLowerCase() ?? "";
  if (plotType.includes("scatter")) return "geom_point()";
  if (plotType.includes("histogram") || plotType.includes("binned")) return "geom_histogram()";
  if (plotType.includes("bar")) return "geom_bar()";
  if (plotType.includes("dotplot") || plotType === "dot plot") return "geom_dotplot()";
  if (plotType.includes("line")) return "geom_line()";
  if (plotType.includes("case")) return undefined;

  if (config.pointConfig === "bars") return "geom_bar()";
  if (config.pointConfig === "bins" || config.pointConfig === "histogram") return "geom_histogram()";

  if (desired.x && desired.y) return "geom_point()";
  if (desired.x || desired.y) return "geom_dotplot()";
  return undefined;
}

// --- code + annotation building --------------------------------------------

function buildFull(state: GraphState, dataVar: string): string {
  const parts: string[] = [`ggplot(${dataVar})`];
  const aesArgs: string[] = [];
  if (state.x) aesArgs.push(`x = ${attrRef(state.x)}`);
  if (state.y) aesArgs.push(`y = ${attrRef(state.y)}`);
  if (state.legend) aesArgs.push(`color = ${attrRef(state.legend)}`);
  if (aesArgs.length > 0) parts.push(`aes(${aesArgs.join(", ")})`);
  if (state.geom) parts.push(state.geom);
  if (state.topSplit || state.rightSplit) parts.push(facetCall(state));
  const expr = parts.length === 1 ? parts[0] : parts.join(" +\n  ");
  return `${state.varName} <- ${expr}\n${state.varName}`;
}

function facetCall(state: GraphState): string {
  if (!state.topSplit && !state.rightSplit) return "facet_null()";
  const args: string[] = [];
  if (state.rightSplit) args.push(`rows = vars(${attrRef(state.rightSplit)})`);
  if (state.topSplit) args.push(`cols = vars(${attrRef(state.topSplit)})`);
  return `facet_grid(${args.join(", ")})`;
}

function aesAttrNames(state: GraphState): string[] | undefined {
  const names = [state.x, state.y, state.legend, state.topSplit, state.rightSplit]
    .filter((n): n is string => n != null);
  return names.length > 0 ? names : undefined;
}

const kGeomExplanations = new Map<string, string>([
  ["geom_point()", "geom_point() draws a point for each case — a scatter plot."],
  ["geom_dotplot()", "geom_dotplot() stacks a dot for each case along the axis."],
  ["geom_bar()", "geom_bar() draws a bar for each category."],
  ["geom_histogram()", "geom_histogram() bins the values into bars."],
  ["geom_line()", "geom_line() connects the values with a line."]
]);

function changeDescription(change: AesChange): string {
  switch (change.slot) {
    case "x":
    case "y":
      return change.next
        ? `You put "${change.next}" on the ${change.slot}-axis.`
        : `You removed "${change.prev}" from the ${change.slot}-axis.`;
    case "legend":
      return change.next
        ? `You colored the graph by "${change.next}".`
        : `You removed the color legend.`;
    case "topSplit":
    case "rightSplit":
      return change.next
        ? `You split the graph by "${change.next}". facet_grid() makes a panel per group.`
        : `You removed the "${change.prev}" split.`;
    default:
      return "";
  }
}

function buildAnnotation(
  state: GraphState,
  changes: AesChange[],
  newGeom: string | undefined,
  rebuilt: boolean,
  isNew = false
): string {
  const parts = changes.map(changeDescription).filter(Boolean);
  if (parts.length === 0) {
    parts.push(
      isNew
        ? `You made a new graph. ggplot() starts an empty plot connected to the data.`
        : `You changed the graph.`
    );
  }
  if (rebuilt && newGeom) {
    const explanation = kGeomExplanations.get(newGeom);
    if (explanation) parts.push(explanation);
  } else if (!rebuilt && changes.some(c => c.slot === "x" || c.slot === "y" || c.slot === "legend")) {
    parts.push(`aes() maps attributes to parts of the plot.`);
  }
  return parts.join(" ");
}

function setupAnnotation(state: GraphState): string {
  const slots: string[] = [];
  if (state.x) slots.push(`"${state.x}" on x`);
  if (state.y) slots.push(`"${state.y}" on y`);
  if (state.legend) slots.push(`colored by "${state.legend}"`);
  const what = slots.length > 0 ? ` (${slots.join(", ")})` : "";
  return `Setup: recreate the graph you already had${what}.`;
}

// --- block constructors -----------------------------------------------------

interface BlockSpec {
  code: string;
  annotation: string;
  componentId: number;
  contextName?: string;
  attrNames?: string[];
}

function block(engine: EngineApi, event: MoveEvent, spec: BlockSpec): RBlock {
  return {
    id: engine.nextBlockId(),
    kind: "code",
    code: spec.code,
    annotation: spec.annotation,
    status: "pending",
    provenance: {
      eventType: event.type,
      componentId: spec.componentId,
      contextName: spec.contextName,
      attrNames: spec.attrNames
    }
  };
}

interface CommentSpec {
  lines: string[];
  annotation: string;
  componentId: number;
}

function commentBlock(engine: EngineApi, event: MoveEvent, spec: CommentSpec): RBlock {
  return {
    id: engine.nextBlockId(),
    kind: "comment",
    code: spec.lines.map(line => `# ${line}`).join("\n"),
    annotation: spec.annotation,
    status: "untranslated",
    provenance: { eventType: event.type, componentId: spec.componentId }
  };
}
