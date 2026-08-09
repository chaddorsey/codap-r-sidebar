import { MoveEvent } from "./move-events";
import { RBlock } from "./r-blocks";
import { ScriptStore } from "./script-store";

function codeBlock(id: string, overrides: Partial<RBlock> = {}): RBlock {
  return {
    id,
    kind: "code",
    code: `x_${id} <- 1`,
    annotation: `Step ${id}.`,
    status: "pending",
    provenance: { eventType: "casesDeleted", contextName: "Pets", caseIds: [4, 5] },
    ...overrides
  };
}

describe("ScriptStore", () => {
  it("appends blocks and notifies listeners", () => {
    const store = new ScriptStore();
    const appended: string[] = [];
    store.listen({ onAppend: b => appended.push(b.id) });
    store.append(codeBlock("b1"));
    store.append(codeBlock("b2"));
    expect(store.blocks.map(b => b.id)).toEqual(["b1", "b2"]);
    expect(appended).toEqual(["b1", "b2"]);
  });

  it("updates status with errors and notifies", () => {
    const store = new ScriptStore();
    const changed: [string, string][] = [];
    store.listen({ onStatusChange: b => changed.push([b.id, b.status]) });
    store.append(codeBlock("b1"));
    store.setStatus("b1", "failed", ["object not found"]);
    expect(store.blocks[0].status).toBe("failed");
    expect(store.blocks[0].validationErrors).toEqual(["object not found"]);
    expect(changed).toEqual([["b1", "failed"]]);
  });

  describe("undo narration (provenance-correlated)", () => {
    const inverseOfDelete: MoveEvent = {
      type: "casesCreated",
      contextName: "Pets",
      count: 2,
      caseIds: [5, 4]
    };

    it("strikes the matching block, appends a note, and suppresses the inverse", () => {
      const store = new ScriptStore();
      store.append(codeBlock("b1"));
      expect(store.handleEvent({ type: "undoAction" })).toBe(false);
      // The inverse notification (ids match, order-insensitive) is consumed.
      expect(store.handleEvent(inverseOfDelete)).toBe(false);
      expect(store.blocks[0].status).toBe("undone");
      const note = store.blocks[1];
      expect(note.kind).toBe("comment");
      expect(note.status).toBe("note");
      expect(note.annotation).toMatch(/You undid: Step b1\./);
    });

    it("does not strike anything for undos of untracked actions", () => {
      const store = new ScriptStore();
      store.append(codeBlock("b1"));
      store.handleEvent({ type: "undoAction" });
      // A non-matching event (different case ids) passes through untouched.
      const unrelated: MoveEvent = {
        type: "casesCreated", contextName: "Pets", count: 1, caseIds: [99]
      };
      expect(store.handleEvent(unrelated)).toBe(true);
      expect(store.blocks[0].status).toBe("pending");
      expect(store.blocks).toHaveLength(1);
    });

    it("closes the undo window after a few unmatched events", () => {
      const store = new ScriptStore();
      store.append(codeBlock("b1"));
      store.handleEvent({ type: "undoAction" });
      const unrelated: MoveEvent = { type: "casesMoved", contextName: "Other" };
      store.handleEvent(unrelated);
      store.handleEvent(unrelated);
      store.handleEvent(unrelated);
      // Window expired: even a would-be inverse now passes through.
      expect(store.handleEvent(inverseOfDelete)).toBe(true);
      expect(store.blocks[0].status).toBe("pending");
    });

    it("redo restores the struck block and retires its note", () => {
      const store = new ScriptStore();
      store.append(codeBlock("b1", { status: "validated" }));
      store.handleEvent({ type: "undoAction" });
      store.handleEvent(inverseOfDelete);
      expect(store.blocks[0].status).toBe("undone");
      expect(store.handleEvent({ type: "redoAction" })).toBe(false);
      expect(store.blocks[0].status).toBe("validated");
      expect(store.blocks[1].status).toBe("undone");
    });

    it("matches attribute inverses by name and context", () => {
      const store = new ScriptStore();
      store.append(
        codeBlock("b1", {
          provenance: { eventType: "attributeCreated", contextName: "Pets", attrNames: ["logMass"] }
        })
      );
      store.handleEvent({ type: "undoAction" });
      const inverse: MoveEvent = {
        type: "attributeDeleted",
        contextName: "Pets",
        collectionName: "Cases",
        attributeName: "logMass"
      };
      expect(store.handleEvent(inverse)).toBe(false);
      expect(store.blocks[0].status).toBe("undone");
    });

    it("never strikes setup blocks", () => {
      const store = new ScriptStore();
      store.append(codeBlock("setup1", { isSetup: true }));
      store.handleEvent({ type: "undoAction" });
      expect(store.handleEvent(inverseOfDelete)).toBe(true);
      expect(store.blocks[0].status).toBe("pending");
    });
  });

  it("serializes and restores the full block list", () => {
    const store = new ScriptStore();
    store.append(codeBlock("b1", { status: "validated" }));
    store.append(codeBlock("b2", { kind: "comment", status: "untranslated" }));
    const restored = ScriptStore.restore(store.serialize());
    expect(restored.blocks).toEqual(store.blocks);
  });
});
