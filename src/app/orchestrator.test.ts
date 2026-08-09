import { Announcer } from "../components/script-pane/announcer";
import { contextValues, FakeCodap } from "../test-support/fake-codap";
import { Orchestrator, SavedState, snapshotDigest } from "./orchestrator";

// Full-pipeline integration at the seams: FakeCodap -> observer -> engine ->
// store, with savedState restore/staleness and export bundling.

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function fakeAnnouncerNode() {
  return { textContent: "" } as unknown as HTMLElement;
}

function populatedFake() {
  const fake = new FakeCodap();
  fake.respondTo("dataContextList", { success: true, values: [{ id: 1, name: "Pets" }] });
  fake.respondTo("dataContext[Pets]", {
    success: true,
    values: contextValues("Pets", [
      {
        name: "Cases",
        attrs: [
          { id: 1, name: "animal", type: "categorical" },
          { id: 2, name: "count", type: "numeric" }
        ]
      }
    ])
  });
  fake.respondTo("dataContext[Pets].itemSearch[*]", {
    success: true,
    values: [
      { id: 1, values: { animal: "dog", count: 5 } },
      { id: 2, values: { animal: "cat", count: 4 } }
    ]
  });
  fake.respondTo("componentList", { success: true, values: [] });
  fake.respondTo("globalList", { success: true, values: [] });
  return fake;
}

function makeOrchestrator(fake: FakeCodap) {
  const node = fakeAnnouncerNode();
  const announcer = new Announcer(() => node as HTMLElement, 1);
  const persisted: SavedState[] = [];
  const validated: string[] = [];
  const orchestrator = new Orchestrator({
    api: fake,
    announcer,
    persist: state => persisted.push(state),
    validate: block => validated.push(block.id)
  });
  return { orchestrator, node, persisted, validated };
}

describe("Orchestrator", () => {
  it("generates a preamble on fresh start and translates live moves end to end", async () => {
    const fake = populatedFake();
    const { orchestrator, node, validated } = makeOrchestrator(fake);
    const mode = await orchestrator.start(undefined);
    expect(mode).toBe("fresh");
    // Preamble: libraries + tribble (2 cases, under threshold).
    expect(orchestrator.store.blocks.map(b => b.isSetup)).toEqual([true, true]);
    expect(validated).toEqual(orchestrator.store.blocks.map(b => b.id));

    // A live move flows observer -> engine -> store -> announcer.
    fake.notify("dataContextChangeNotice[Pets]", {
      operation: "deleteCases",
      result: { caseIDs: [2] }
    });
    await flush();
    const last = orchestrator.store.blocks[orchestrator.store.blocks.length - 1];
    expect(last.code).toBe("pets <- pets |>\n  filter(!(case_id %in% 2))");
    await new Promise(resolve => setTimeout(resolve, 5));
    expect((node as any).textContent).toMatch(/deleted 1 case/);
  });

  it("suppresses undo inverses through the store gate", async () => {
    const fake = populatedFake();
    const { orchestrator } = makeOrchestrator(fake);
    await orchestrator.start(undefined);
    fake.notify("dataContextChangeNotice[Pets]", {
      operation: "deleteCases",
      result: { caseIDs: [2] }
    });
    await flush();
    const countBefore = orchestrator.store.blocks.length;
    fake.notify("undoChangeNotice", { operation: "undoAction" });
    fake.notify("dataContextChangeNotice[Pets]", {
      operation: "createCases",
      result: { caseIDs: [2] }
    });
    await flush();
    // Struck block + note, but no new translated block for the inverse.
    const blocks = orchestrator.store.blocks;
    expect(blocks[countBefore - 1].status).toBe("undone");
    expect(blocks[blocks.length - 1].status).toBe("note");
    expect(blocks.filter(b => b.provenance.eventType === "casesCreated")).toHaveLength(0);
  });

  it("restores from savedState when the digest matches", async () => {
    const fake = populatedFake();
    const first = makeOrchestrator(fake);
    await first.orchestrator.start(undefined);
    const saved = first.persisted[first.persisted.length - 1];

    const second = makeOrchestrator(populatedFake());
    const mode = await second.orchestrator.start(saved);
    expect(mode).toBe("restored");
    expect(second.orchestrator.store.blocks).toEqual(first.orchestrator.store.blocks);
    // Engine re-primed: a live move continues with the same variable name.
    expect(second.orchestrator.engine.getContext("Pets")?.varName).toBe("pets");
  });

  it("falls back to a fresh preamble when the document changed while closed", async () => {
    const fake = populatedFake();
    const first = makeOrchestrator(fake);
    await first.orchestrator.start(undefined);
    const saved = first.persisted[first.persisted.length - 1];

    // Same document but one case was deleted while the plugin was closed.
    const changed = populatedFake();
    changed.respondTo("dataContext[Pets].itemSearch[*]", {
      success: true,
      values: [{ id: 1, values: { animal: "dog", count: 5 } }]
    });
    const second = makeOrchestrator(changed);
    const mode = await second.orchestrator.start(saved);
    expect(mode).toBe("fresh");
    expect((second.node as any).textContent).toMatch(/changed since your last session/);
  });

  it("starts empty documents with no preamble; libraries arrive with the first move", async () => {
    const fake = new FakeCodap();
    fake.respondTo("dataContextList", { success: true, values: [] });
    fake.respondTo("componentList", { success: true, values: [] });
    fake.respondTo("globalList", { success: true, values: [] });
    const { orchestrator } = makeOrchestrator(fake);
    await orchestrator.start(undefined);
    expect(orchestrator.store.blocks).toHaveLength(0);

    // First move: a dataset import.
    fake.respondTo("dataContextList", { success: true, values: [{ id: 1, name: "Pets" }] });
    fake.respondTo("dataContext[Pets]", {
      success: true,
      values: contextValues("Pets", [{ name: "Cases", attrs: [{ id: 1, name: "animal" }] }])
    });
    fake.notify("documentChangeNotice", { operation: "dataContextCountChanged" });
    await flush();
    const blocks = orchestrator.store.blocks;
    expect(blocks[0].code).toBe("library(dplyr)\nlibrary(ggplot2)");
    expect(blocks[1].code).toBe('pets <- read.csv("pets.csv")');
  });

  it("builds an export bundle with the initial-snapshot CSVs it needs", async () => {
    const fake = populatedFake();
    const { orchestrator } = makeOrchestrator(fake);
    await orchestrator.start(undefined);
    // Tribble path: no read.csv in script -> bare .R file.
    expect(orchestrator.buildExport().kind).toBe("file");
    const datasets = orchestrator.exportDatasets();
    expect(datasets[0].fileName).toBe("pets.csv");
    expect(datasets[0].csv).toBe("case_id,animal,count\n1,dog,5\n2,cat,4\n");
  });
});

describe("snapshotDigest", () => {
  it("is stable for identical snapshots and changes on structural change", () => {
    const snapshot = {
      contexts: [
        {
          structure: { name: "Pets", collections: [{ name: "Cases", attrs: [{ name: "a" }] }] },
          items: [{ case_id: 1, a: 1 }]
        }
      ],
      components: []
    };
    const a = snapshotDigest(snapshot as any);
    const b = snapshotDigest(JSON.parse(JSON.stringify(snapshot)));
    expect(a).toBe(b);
    const mutated = JSON.parse(JSON.stringify(snapshot));
    mutated.contexts[0].items.push({ case_id: 2, a: 2 });
    expect(snapshotDigest(mutated)).not.toBe(a);
  });
});
