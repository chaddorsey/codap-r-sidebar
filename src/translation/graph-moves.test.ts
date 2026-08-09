import * as fs from "fs";
import * as path from "path";
import { DataContextStructure, GraphConfig, MoveEvent } from "../models/move-events";
import { composeScript } from "./compose";
import { TranslationEngine } from "./engine";
import { buildGraphSetupBlock } from "./rules/graph-moves";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

const petsStructure: DataContextStructure = {
  name: "Pets",
  collections: [
    {
      name: "Cases",
      attrs: [
        { id: 1, name: "animal", type: "categorical" },
        { id: 2, name: "count", type: "numeric" },
        { id: 3, name: "size", type: "numeric" }
      ]
    }
  ]
};

function engineWithPets() {
  const engine = new TranslationEngine();
  engine.registerContext(petsStructure);
  return engine;
}

const graphCreated = (config?: GraphConfig): MoveEvent => ({
  type: "componentCreated",
  componentId: 42,
  componentType: "graph",
  graphConfig: config
});

const attrChange = (config: GraphConfig, plotType?: string): MoveEvent => ({
  type: "graphAttributeChange",
  componentId: 42,
  attributeName: "irrelevant-for-diff",
  plotType,
  graphConfig: config
});

describe("graph move translation (delta-block model)", () => {
  it("creates an empty plot object when a graph is made", () => {
    const engine = engineWithPets();
    const block = engine.translate(graphCreated({ dataContext: "Pets" }));
    expect(block?.code).toBe("p1 <- ggplot(pets)\np1");
    expect(block?.annotation).toMatch(/new graph/i);
    expect(block?.provenance.componentId).toBe(42);
  });

  it("rebuilds with a geom when the first axis is assigned (dot plot)", () => {
    const engine = engineWithPets();
    engine.translate(graphCreated({ dataContext: "Pets" }));
    const block = engine.translate(attrChange({ dataContext: "Pets", xAttributeName: "count" }, "dotPlot"));
    expect(block?.code).toBe("p1 <- ggplot(pets) +\n  aes(x = count) +\n  geom_dotplot()\np1");
    expect(block?.annotation).toBe(
      'You put "count" on the x-axis. geom_dotplot() stacks a dot for each case along the axis.'
    );
  });

  it("rebuilds into a scatter plot when the second axis changes the geom", () => {
    const engine = engineWithPets();
    engine.translate(graphCreated({ dataContext: "Pets" }));
    engine.translate(attrChange({ dataContext: "Pets", xAttributeName: "count" }, "dotPlot"));
    const block = engine.translate(
      attrChange({ dataContext: "Pets", xAttributeName: "count", yAttributeName: "size" }, "scatterPlot")
    );
    expect(block?.code).toBe(
      "p1 <- ggplot(pets) +\n  aes(x = count, y = size) +\n  geom_point()\np1"
    );
    expect(block?.annotation).toMatch(/scatter plot/);
  });

  it("emits a pure aes delta when the geom is unchanged (legend)", () => {
    const engine = engineWithPets();
    engine.translate(graphCreated({ dataContext: "Pets" }));
    engine.translate(
      attrChange({ dataContext: "Pets", xAttributeName: "count", yAttributeName: "size" }, "scatterPlot")
    );
    const block = engine.translate({
      type: "graphLegendChange",
      componentId: 42,
      attributeName: "animal",
      graphConfig: {
        dataContext: "Pets",
        xAttributeName: "count",
        yAttributeName: "size",
        legendAttributeName: "animal"
      }
    });
    expect(block?.code).toBe("p1 <- p1 + aes(color = animal)\np1");
    expect(block?.provenance.attrNames).toEqual(["animal"]);
  });

  it("removes an axis with aes(NULL) and rebuilds when the geom reverts", () => {
    const engine = engineWithPets();
    engine.translate(graphCreated({ dataContext: "Pets" }));
    engine.translate(
      attrChange({ dataContext: "Pets", xAttributeName: "count", yAttributeName: "size" }, "scatterPlot")
    );
    const block = engine.translate(attrChange({ dataContext: "Pets", xAttributeName: "count" }, "dotPlot"));
    // Geom changes point->dotplot, so this is a rebuild without y.
    expect(block?.code).toBe("p1 <- ggplot(pets) +\n  aes(x = count) +\n  geom_dotplot()\np1");
    expect(block?.annotation).toMatch(/removed "size" from the y-axis/);
  });

  it("translates a top split into a facet delta", () => {
    const engine = engineWithPets();
    engine.translate(graphCreated({ dataContext: "Pets" }));
    engine.translate(
      attrChange({ dataContext: "Pets", xAttributeName: "count", yAttributeName: "size" }, "scatterPlot")
    );
    const block = engine.translate(
      attrChange(
        {
          dataContext: "Pets",
          xAttributeName: "count",
          yAttributeName: "size",
          topSplitAttributeName: "animal"
        },
        "scatterPlot"
      )
    );
    expect(block?.code).toBe("p1 <- p1 + facet_grid(cols = vars(animal))\np1");
    expect(block?.annotation).toMatch(/split the graph by "animal"/);
  });

  it("ignores duplicate config notifications (no spurious blocks)", () => {
    const engine = engineWithPets();
    engine.translate(graphCreated({ dataContext: "Pets" }));
    const config: GraphConfig = { dataContext: "Pets", xAttributeName: "count" };
    engine.translate(attrChange(config, "dotPlot"));
    expect(engine.translate(attrChange(config, "dotPlot"))).toBeNull();
  });

  describe("adornments", () => {
    function scatterEngine() {
      const engine = engineWithPets();
      engine.translate(graphCreated({ dataContext: "Pets" }));
      engine.translate(attrChange({ dataContext: "Pets", xAttributeName: "count" }, "dotPlot"));
      return engine;
    }

    it("mean -> geom_vline at mean(x)", () => {
      const engine = scatterEngine();
      const block = engine.translate({
        type: "adornmentAdded",
        componentId: 42,
        adornment: { type: "Mean" }
      });
      expect(block?.code).toBe("p1 <- p1 + geom_vline(aes(xintercept = mean(count)))\np1");
    });

    it("LSRL -> geom_smooth(method = lm)", () => {
      const engine = scatterEngine();
      const block = engine.translate({
        type: "adornmentAdded",
        componentId: 42,
        adornment: { type: "LSRL" }
      });
      expect(block?.code).toBe('p1 <- p1 + geom_smooth(method = "lm", se = FALSE)\np1');
    });

    it("unsupported adornments fall back to untranslated comment blocks", () => {
      const engine = scatterEngine();
      const block = engine.translate({
        type: "adornmentAdded",
        componentId: 42,
        adornment: { type: "Movable Value" }
      });
      expect(block).toMatchObject({ kind: "comment", status: "untranslated" });
      expect(block?.annotation).toMatch(/movable value/);
    });

    it("adornment removal is narrated, not erased", () => {
      const engine = scatterEngine();
      engine.translate({ type: "adornmentAdded", componentId: 42, adornment: { type: "Mean" } });
      const block = engine.translate({
        type: "adornmentRemoved",
        componentId: 42,
        adornment: { type: "Mean" }
      });
      expect(block).toMatchObject({ kind: "comment", status: "untranslated" });
      expect(block?.annotation).toMatch(/removed the mean/);
    });
  });

  it("deletes a graph with rm() and frees its state", () => {
    const engine = engineWithPets();
    engine.translate(graphCreated({ dataContext: "Pets" }));
    const block = engine.translate({ type: "componentDeleted", componentId: 42, componentType: "graph" });
    expect(block?.code).toBe("rm(p1)");
    expect(engine.getGraph(42)).toBeUndefined();
  });

  it("numbers plot objects sequentially across graphs", () => {
    const engine = engineWithPets();
    engine.translate(graphCreated({ dataContext: "Pets" }));
    const second = engine.translate({
      type: "componentCreated",
      componentId: 43,
      componentType: "graph",
      graphConfig: { dataContext: "Pets" }
    });
    expect(second?.code).toBe("p2 <- ggplot(pets)\np2");
  });

  it("falls back to an untranslated comment for graphs of unknown datasets", () => {
    const engine = new TranslationEngine();
    const block = engine.translate(attrChange({ dataContext: "Mystery", xAttributeName: "x" }));
    expect(block).toMatchObject({ kind: "comment", status: "untranslated" });
  });

  it("non-graph components produce no graph blocks", () => {
    const engine = engineWithPets();
    expect(
      engine.translate({ type: "componentCreated", componentId: 9, componentType: "caseTable" })
    ).toBeNull();
  });

  it("buildGraphSetupBlock reconstructs an existing graph in one block via the same rules", () => {
    const engine = engineWithPets();
    const block = buildGraphSetupBlock(
      {
        dataContext: "Pets",
        xAttributeName: "count",
        yAttributeName: "size",
        legendAttributeName: "animal",
        topSplitAttributeName: "animal",
        pointConfig: "points"
      },
      42,
      engine
    );
    expect(block?.code).toBe(
      "p1 <- ggplot(pets) +\n  aes(x = count, y = size, color = animal) +\n  geom_point() +\n  facet_grid(cols = vars(animal))\np1"
    );
    expect(block?.annotation).toBe(
      'Setup: recreate the graph you already had ("count" on x, "size" on y, colored by "animal").'
    );
    // Live moves continue from the reconstructed state: no spurious rebuild.
    expect(
      engine.translate(
        attrChange(
          {
            dataContext: "Pets",
            xAttributeName: "count",
            yAttributeName: "size",
            legendAttributeName: "animal",
            topSplitAttributeName: "animal"
          },
          "scatterPlot"
        )
      )
    ).toBeNull();
  });
});

describe("full graph session golden script", () => {
  it("matches the session-graph-moves fixture end to end", () => {
    const engine = new TranslationEngine();
    const events: MoveEvent[] = [
      { type: "datasetCreated", context: petsStructure },
      graphCreated({ dataContext: "Pets" }),
      attrChange({ dataContext: "Pets", xAttributeName: "count" }, "dotPlot"),
      attrChange({ dataContext: "Pets", xAttributeName: "count", yAttributeName: "size" }, "scatterPlot"),
      {
        type: "graphLegendChange",
        componentId: 42,
        attributeName: "animal",
        graphConfig: {
          dataContext: "Pets",
          xAttributeName: "count",
          yAttributeName: "size",
          legendAttributeName: "animal"
        }
      },
      { type: "adornmentAdded", componentId: 42, adornment: { type: "LSRL" } }
    ];
    const blocks = events
      .map(e => engine.translate(e))
      .filter((b): b is NonNullable<typeof b> => b != null);
    expect(composeScript(blocks)).toBe(fixture("session-graph-moves.R"));
  });
});
