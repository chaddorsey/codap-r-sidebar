import { contextValues, FakeCodap } from "../test-support/fake-codap";
import { takeDocumentSnapshot } from "./codap-snapshot";

describe("takeDocumentSnapshot", () => {
  it("captures hierarchy, formulas, items, and graph configs for a populated document", async () => {
    const fake = new FakeCodap();
    fake.respondTo("dataContextList", {
      success: true,
      values: [{ id: 1, name: "Mammals" }, { id: 2, name: "Sleep" }]
    });
    fake.respondTo("dataContext[Mammals]", {
      success: true,
      values: contextValues("Mammals", [
        { name: "Diets", attrs: [{ id: 1, name: "diet", type: "categorical" }] },
        {
          name: "Cases",
          attrs: [
            { id: 2, name: "species", type: "categorical" },
            { id: 3, name: "mass", type: "numeric" },
            { id: 4, name: "logMass", formula: "log(mass)", type: "numeric" }
          ]
        }
      ])
    });
    fake.respondTo("dataContext[Mammals].itemSearch[*]", {
      success: true,
      values: [
        { id: 10, values: { diet: "meat", species: "lion", mass: 190, logMass: 5.25 } },
        { id: 11, values: { diet: "plants", species: "zebra", mass: 380, logMass: 5.94 } }
      ]
    });
    fake.respondTo("dataContext[Sleep]", {
      success: true,
      values: contextValues("Sleep", [{ name: "Cases", attrs: [{ id: 5, name: "hours", type: "numeric" }] }], 2)
    });
    fake.respondTo("dataContext[Sleep].itemSearch[*]", {
      success: true,
      values: [{ id: 20, values: { hours: 8 } }]
    });
    fake.respondTo("componentList", {
      success: true,
      values: [
        { id: 42, type: "graph", title: "Mass by diet" },
        { id: 43, type: "caseTable", title: "Mammals" }
      ]
    });
    fake.respondTo("component[42]", {
      success: true,
      values: {
        id: 42,
        type: "graph",
        dataContext: "Mammals",
        xAttributeName: "diet",
        yAttributeName: "mass",
        pointConfig: "points"
      }
    });

    const snapshot = await takeDocumentSnapshot(fake);

    expect(snapshot.contexts).toHaveLength(2);
    const mammals = snapshot.contexts[0];
    expect(mammals.structure.collections.map(c => c.name)).toEqual(["Diets", "Cases"]);
    expect(mammals.structure.collections[1].attrs.find(a => a.name === "logMass")?.formula).toBe(
      "log(mass)"
    );
    expect(mammals.items).toEqual([
      { case_id: 10, diet: "meat", species: "lion", mass: 190, logMass: 5.25 },
      { case_id: 11, diet: "plants", species: "zebra", mass: 380, logMass: 5.94 }
    ]);

    expect(snapshot.components).toEqual([
      expect.objectContaining({
        id: 42,
        type: "graph",
        graphConfig: expect.objectContaining({
          dataContext: "Mammals",
          xAttributeName: "diet",
          yAttributeName: "mass",
          pointConfig: "points"
        })
      }),
      expect.objectContaining({ id: 43, type: "caseTable" })
    ]);
  });

  it("returns an empty snapshot without throwing when every request fails", async () => {
    const fake = new FakeCodap();
    fake.failOn("dataContextList");
    fake.failOn("componentList");
    const snapshot = await takeDocumentSnapshot(fake);
    expect(snapshot).toEqual({ contexts: [], components: [] });
  });
});
