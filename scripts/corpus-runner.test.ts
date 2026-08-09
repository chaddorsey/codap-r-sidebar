import * as fs from "fs";
import * as path from "path";
import { RBlock } from "../src/models/r-blocks";
import { Validator } from "../src/services/validator";
import { WebRService } from "../src/services/webr-service";

// The corpus runner (plan Unit 5): every golden fixture executes under REAL
// webR with dplyr + ggplot2 — proving the translation engine's output is
// runnable R, not plausible R. One shared instance; serial; ~1 min after boot.
//
// Node notes: SharedArrayBuffer channel is available here (unlike the shipped
// browser PostMessage config, exercised by Playwright); no OffscreenCanvas, so
// plots render into a pdf(NULL) device — full draw code, no file output.

jest.setTimeout(600000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WebR } = require("webr");

const kFixturesDir = path.join(__dirname, "..", "src", "translation", "__fixtures__");
const kNotesDir = path.join(__dirname, "..", "docs", "notes");

const kCorpus = [
  path.join(kFixturesDir, "preamble-small.R"),
  path.join(kFixturesDir, "session-data-moves.R"),
  path.join(kFixturesDir, "session-graph-moves.R"),
  path.join(kNotesDir, "pedagogy-session-demo.R")
];

let webR: any;

beforeAll(async () => {
  webR = new WebR();
  await webR.init();
  await webR.installPackages(["dplyr", "ggplot2"], { quiet: true });
  const pets = fs.readFileSync(path.join(kFixturesDir, "pets.csv"));
  await webR.FS.writeFile("/home/web_user/pets.csv", new Uint8Array(pets));
});

afterAll(async () => {
  await webR?.close();
});

describe("golden corpus executes under webR", () => {
  it.each(kCorpus.map(f => [path.basename(f), f]))("%s runs clean", async (_name, filePath) => {
    const script = fs.readFileSync(filePath as string, "utf8");
    await webR.FS.writeFile(
      "/home/web_user/current-fixture.R",
      new TextEncoder().encode(script)
    );
    const result = await webR.evalRString(`
      local({
        pdf(NULL)
        on.exit(dev.off(), add = TRUE)
        tryCatch({
          source("current-fixture.R", local = TRUE, print.eval = TRUE)
          "OK"
        }, error = function(e) paste0("RSIDEBAR_ERROR: ", conditionMessage(e)))
      })
    `);
    expect(result).toBe("OK");
  });
});

describe("validator cumulative-session semantics against real R", () => {
  function codeBlock(id: string, code: string): RBlock {
    return {
      id, code, kind: "code", annotation: "", status: "pending",
      provenance: { eventType: "casesDeleted" }
    };
  }

  it("state accumulates across blocks and survives a failed block", async () => {
    // Console-kind service so only one real instance boots in CI.
    const service = new WebRService(() => new WebR());
    const validator = new Validator(service, { timeoutMs: 120000, instanceKind: "console" });
    try {
      const b1 = await validator.validate(codeBlock("b1", "x_val <- 41"));
      expect(b1.status).toBe("validated");

      const b2 = await validator.validate(codeBlock("b2", 'stop("boom")'));
      expect(b2.status).toBe("failed");
      expect(b2.errors?.[0]).toMatch(/boom/);

      // Cumulative state from b1 is still there after b2 failed.
      const b3 = await validator.validate(codeBlock("b3", "stopifnot(x_val + 1 == 42)"));
      expect(b3.status).toBe("validated");

      // A block referencing something undefined fails with R's own message.
      const b4 = await validator.validate(codeBlock("b4", "nonexistent_thing"));
      expect(b4.status).toBe("failed");
      expect(b4.errors?.[0]).toMatch(/nonexistent_thing/);
    } finally {
      await (await service.getConsole()).close();
    }
  });
});
