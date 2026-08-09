import { RBlock } from "../models/r-blocks";
import { buildExportBundle } from "./export-r";

function block(id: string, code: string, overrides: Partial<RBlock> = {}): RBlock {
  return {
    id, code, kind: "code", annotation: `Step ${id}.`, status: "validated",
    provenance: { eventType: "casesDeleted" },
    ...overrides
  };
}

describe("buildExportBundle", () => {
  it("exports a bare .R file when no dataset CSV is referenced (tribble path)", () => {
    const bundle = buildExportBundle(
      [block("b1", "pets <- tribble(~case_id, 1)")],
      [{ fileName: "pets.csv", csv: "case_id\n1\n" }]
    );
    expect(bundle.kind).toBe("file");
    expect(bundle.fileName).toBe("codap-session.R");
    expect(bundle.files).toHaveLength(1);
    expect(bundle.files[0].content).toContain("# Step b1.");
  });

  it("zips script + only the CSVs the script reads", () => {
    const bundle = buildExportBundle(
      [block("b1", 'pets <- read.csv("pets.csv")')],
      [
        { fileName: "pets.csv", csv: "case_id\n1\n" },
        { fileName: "unused.csv", csv: "case_id\n9\n" }
      ]
    );
    expect(bundle.kind).toBe("zip");
    expect(bundle.fileName).toBe("codap-session.zip");
    expect(bundle.files.map(f => f.name)).toEqual(["codap-session.R", "pets.csv"]);
  });

  it("comments out undone and failed blocks so the export always runs", () => {
    const bundle = buildExportBundle(
      [
        block("b1", "x <- 1"),
        block("b2", "x <- x + broken", { status: "failed" }),
        block("b3", "x <- x * 2", { status: "undone" }),
        block("b4", "x + 1")
      ],
      []
    );
    const script = bundle.files[0].content;
    expect(script).toContain("# x <- x + broken");
    expect(script).toContain("# (This step didn't run cleanly, so it is commented out.)");
    expect(script).toContain("# x <- x * 2");
    expect(script).toContain("# (This step was undone in CODAP, so it is commented out.)");
    // Active blocks stay live.
    expect(script).toMatch(/\nx <- 1\n/);
    expect(script).toMatch(/\nx \+ 1\n/);
  });
});
