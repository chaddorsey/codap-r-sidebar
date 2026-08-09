import { RBlock } from "../models/r-blocks";
import { CrossHighlightController } from "./cross-highlight";
import { FakeCodap } from "../test-support/fake-codap";

function caseBlock(id: string, caseIds: number[]): RBlock {
  return {
    id, kind: "code", code: "x", annotation: "", status: "validated",
    provenance: { eventType: "casesDeleted", contextName: "Pets", caseIds }
  };
}

function graphBlock(id: string, componentId: number): RBlock {
  return {
    id, kind: "code", code: "p1", annotation: "", status: "validated",
    provenance: { eventType: "graphAttributeChange", componentId }
  };
}

const kSelectionList = "dataContext[Pets].selectionList";

function makeHarness(priorSelection: number[] = [7]) {
  const fake = new FakeCodap();
  let currentSelection = priorSelection;
  fake.respondTo(kSelectionList, request => {
    if (request.action === "get") {
      return { success: true, values: currentSelection.map(id => ({ caseID: id })) };
    }
    if (request.action === "create") {
      currentSelection = request.values as number[];
      return { success: true };
    }
    return { success: false };
  });
  const tagged: [string, number[]][] = [];
  const highlighted: string[][] = [];
  const controller = new CrossHighlightController({
    api: fake,
    tagger: { expectPluginSelection: (ctx, ids) => tagged.push([ctx, ids]) },
    onHighlightBlocks: ids => highlighted.push(ids),
    debounceMs: 5
  });
  return {
    fake, controller, tagged, highlighted,
    setSelection: (ids: number[]) => { currentSelection = ids; },
    getSelection: () => currentSelection
  };
}

const settle = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));

describe("CrossHighlightController", () => {
  it("hover writes a tagged selection after capturing the prior one", async () => {
    const { fake, controller, tagged, getSelection } = makeHarness([7]);
    controller.enter(caseBlock("b1", [1, 2]));
    await settle();
    // Captured prior (get) then wrote ours (create), tagged for recording hygiene.
    expect(fake.requestsFor(kSelectionList).map(r => r.action)).toEqual(["get", "create"]);
    expect(tagged).toEqual([["Pets", [1, 2]]]);
    expect(getSelection()).toEqual([1, 2]);
  });

  it("leave restores the captured selection when unchanged", async () => {
    const { controller, tagged, getSelection } = makeHarness([7]);
    controller.enter(caseBlock("b1", [1, 2]));
    await settle();
    await controller.leave();
    expect(getSelection()).toEqual([7]);
    expect(tagged).toEqual([["Pets", [1, 2]], ["Pets", [7]]]);
  });

  it("abandons restore when the learner changed the selection mid-hover", async () => {
    const { controller, setSelection, getSelection } = makeHarness([7]);
    controller.enter(caseBlock("b1", [1, 2]));
    await settle();
    setSelection([42]); // learner clicked something while we were hovering
    await controller.leave();
    expect(getSelection()).toEqual([42]);
  });

  it("debounces rapid hover sweeps into one CODAP write", async () => {
    const { fake, controller } = makeHarness();
    controller.enter(caseBlock("b1", [1]));
    controller.enter(caseBlock("b2", [2]));
    controller.enter(caseBlock("b3", [3]));
    await settle();
    const creates = fake.requestsFor(kSelectionList).filter(r => r.action === "create");
    expect(creates).toHaveLength(1);
    expect(creates[0].values).toEqual([3]);
  });

  it("selects the component for graph blocks", async () => {
    const { fake, controller } = makeHarness();
    fake.respondTo("component[42]", { success: true });
    controller.enter(graphBlock("g1", 42));
    await settle();
    expect(fake.requestsFor("component[42]")).toEqual([
      { action: "notify", resource: "component[42]", values: { request: "select" } }
    ]);
  });

  it("highlights blocks whose provenance intersects a learner selection", () => {
    const { controller, highlighted } = makeHarness();
    const blocks = [caseBlock("b1", [1, 2]), caseBlock("b2", [3]), graphBlock("g1", 42)];
    controller.handleSelection(
      { type: "selectionChanged", contextName: "Pets", caseIds: [2, 9], extend: false, origin: "user" },
      blocks
    );
    expect(highlighted).toEqual([["b1"]]);
  });

  it("ignores plugin-originated selections (no feedback loop)", () => {
    const { controller, highlighted } = makeHarness();
    controller.handleSelection(
      { type: "selectionChanged", contextName: "Pets", caseIds: [1], extend: false, origin: "plugin" },
      [caseBlock("b1", [1])]
    );
    expect(highlighted).toEqual([]);
  });

  it("dismiss behaves like leave (1.4.13 dismissible)", async () => {
    const { controller, getSelection } = makeHarness([7]);
    controller.enter(caseBlock("b1", [1]));
    await settle();
    controller.dismiss();
    await settle();
    expect(getSelection()).toEqual([7]);
  });
});
