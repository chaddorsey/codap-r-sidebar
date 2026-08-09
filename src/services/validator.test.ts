import { RBlock } from "../models/r-blocks";
import { Validator } from "./validator";
import { ShelterLike, WebRInstanceLike, WebRService } from "./webr-service";

// Fake webR instance whose captureR behavior is scripted per code snippet:
// resolve, reject (R error), or hang (PostMessage timeout scenario).
type Behavior = "ok" | { error: string } | "hang";

class FakeInstance implements WebRInstanceLike {
  static created = 0;
  readonly captured: string[] = [];
  readonly files = new Map<string, string>();
  closed = false;

  constructor(private behaviorFor: (code: string) => Behavior) {
    FakeInstance.created += 1;
    const shelter: ShelterLike = {
      captureR: async (code: string) => {
        this.captured.push(code);
        const behavior = this.behaviorFor(code);
        if (behavior === "hang") return new Promise<never>(() => undefined);
        if (behavior !== "ok") throw new Error(behavior.error);
        return { output: [] };
      },
      purge: async () => undefined
    };
    this.Shelter = function Shelter(this: unknown) {
      return Promise.resolve(shelter);
    } as unknown as new () => Promise<ShelterLike>;
  }

  Shelter: new () => Promise<ShelterLike>;
  async init() { return this; }
  async close() { this.closed = true; }
  async installPackages() { return undefined; }
  async evalR(code: string) { return { env: code }; }
  FS = {
    writeFile: async (path: string, data: Uint8Array) => {
      this.files.set(path, new TextDecoder().decode(data));
    }
  };
}

function codeBlock(id: string, code: string): RBlock {
  return {
    id, code, kind: "code", annotation: "", status: "pending",
    provenance: { eventType: "casesDeleted" }
  };
}

function makeHarness(behaviorFor: (code: string) => Behavior, timeoutMs = 50) {
  FakeInstance.created = 0;
  const instances: FakeInstance[] = [];
  const service = new WebRService(() => {
    const instance = new FakeInstance(behaviorFor);
    instances.push(instance);
    return instance;
  });
  const statuses: [string, string][] = [];
  const validator = new Validator(service, {
    timeoutMs,
    onStatus: (blockId, outcome) => statuses.push([blockId, outcome.status])
  });
  return { service, validator, instances, statuses };
}

describe("Validator", () => {
  it("validates clean blocks and accumulates them into the session", async () => {
    const { validator, statuses } = makeHarness(() => "ok");
    const first = await validator.validate(codeBlock("b1", "x <- 1"));
    const second = await validator.validate(codeBlock("b2", "y <- x + 1"));
    expect(first).toEqual({ status: "validated" });
    expect(second).toEqual({ status: "validated" });
    expect(statuses).toEqual([["b1", "validated"], ["b2", "validated"]]);
  });

  it("marks failing blocks failed with the R error and keeps the queue alive", async () => {
    const { validator } = makeHarness(code => (code.includes("boom") ? { error: "object 'boom' not found" } : "ok"));
    await validator.validate(codeBlock("b1", "x <- 1"));
    const failed = await validator.validate(codeBlock("b2", "boom"));
    const after = await validator.validate(codeBlock("b3", "x + 1"));
    expect(failed.status).toBe("failed");
    expect(failed.errors?.[0]).toMatch(/boom/);
    expect(after.status).toBe("validated");
  });

  it("recovers from a hang: kill, reboot, replay validated blocks, resume (the critical resilience test)", async () => {
    let hangArmed = true;
    const { validator, instances } = makeHarness(code => {
      if (code.includes("while(TRUE)") && hangArmed) {
        hangArmed = false;
        return "hang";
      }
      return "ok";
    });
    await validator.validate(codeBlock("b1", "x <- 1"));
    const instancesBeforeHang = instances.length;
    const hung = await validator.validate(codeBlock("b2", "while(TRUE){}"));
    expect(hung.status).toBe("timeout");
    // A fresh instance was booted...
    expect(instances.length).toBeGreaterThan(instancesBeforeHang);
    // ...and the next block validates against replayed session state.
    const after = await validator.validate(codeBlock("b3", "x + 1"));
    expect(after.status).toBe("validated");
    const newest = instances[instances.length - 1];
    // Replay re-ran b1 on the new instance before b3.
    expect(newest.captured).toEqual(["x <- 1", "x + 1"]);
  });

  it("skips comment blocks without touching R", async () => {
    const { validator, instances } = makeHarness(() => "ok");
    const outcome = await validator.validate({
      id: "c1", code: "# note", kind: "comment", annotation: "", status: "untranslated",
      provenance: { eventType: "casesMoved" }
    });
    expect(outcome.status).toBe("validated");
    expect(instances).toHaveLength(0);
  });

  it("revalidateAll reboots the session and reports per-block outcomes", async () => {
    const { validator } = makeHarness(code => (code.includes("bad") ? { error: "bad" } : "ok"));
    await validator.validate(codeBlock("b1", "x <- 1"));
    const outcomes = await validator.revalidateAll([
      codeBlock("b1", "x <- 1"),
      codeBlock("b2", "bad"),
      codeBlock("b3", "x + 1")
    ]);
    expect(outcomes.get("b1")?.status).toBe("validated");
    expect(outcomes.get("b2")?.status).toBe("failed");
    expect(outcomes.get("b3")?.status).toBe("validated");
  });
});

describe("WebRService", () => {
  it("provisions data files to booted instances and re-provisions on restart", async () => {
    const instances: FakeInstance[] = [];
    const service = new WebRService(() => {
      const instance = new FakeInstance(() => "ok");
      instances.push(instance);
      return instance;
    });
    await service.provisionData("pets.csv", "case_id\n1\n");
    await service.getConsole();
    expect(instances[0].files.get("/home/web_user/pets.csv")).toBe("case_id\n1\n");

    await service.provisionData("more.csv", "case_id\n2\n");
    expect(instances[0].files.get("/home/web_user/more.csv")).toBe("case_id\n2\n");

    const restarted = await service.restart("console");
    expect(instances[0].closed).toBe(true);
    expect((restarted as FakeInstance).files.get("/home/web_user/pets.csv")).toBe("case_id\n1\n");
    expect((restarted as FakeInstance).files.get("/home/web_user/more.csv")).toBe("case_id\n2\n");
  });

  it("boots the console before the validator (IDBFS single-writer order)", async () => {
    const instances: FakeInstance[] = [];
    const service = new WebRService(() => {
      const instance = new FakeInstance(() => "ok");
      instances.push(instance);
      return instance;
    });
    await service.getValidator();
    expect(instances).toHaveLength(2);
  });
});
