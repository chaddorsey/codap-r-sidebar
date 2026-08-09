import { RBlock } from "../models/r-blocks";
import { InstanceKind, ShelterLike, WebRInstanceLike, WebRService } from "./webr-service";

// Background validation pipeline (plan Unit 5, ratified validation contract):
// a serial queue over ONE cumulative session environment. The preamble runs
// first; each block executes against the accumulated state and commits it on
// success. Blocks are single-assignment granular, so a failed evaluation
// leaves the session state unchanged (the RHS fails before the assignment) —
// later blocks validate against last-good state. On timeout the instance is
// killed and the session replayed (preamble + previously validated blocks).

export interface ValidationOutcome {
  status: "validated" | "failed" | "timeout";
  errors?: string[];
}

export type StatusListener = (blockId: string, outcome: ValidationOutcome) => void;

interface ValidatorOptions {
  timeoutMs?: number;
  onStatus?: StatusListener;
  instanceKind?: InstanceKind;
}

const kSessionEnv = ".rsidebar_session";

export class Validator {
  private queue: Promise<unknown> = Promise.resolve();
  // Everything that must replay after a reboot, in order.
  private sessionBlocks: RBlock[] = [];
  private shelter?: ShelterLike;
  private instance?: WebRInstanceLike;
  private timeoutMs: number;
  private instanceKind: InstanceKind;

  constructor(private service: WebRService, private options: ValidatorOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.instanceKind = options.instanceKind ?? "validator";
  }

  // Serially validate one code block against the cumulative session.
  validate(block: RBlock): Promise<ValidationOutcome> {
    const run = this.queue.then(() => this.runBlock(block));
    // The queue always continues, whatever a block's outcome.
    this.queue = run.catch(() => undefined);
    return run;
  }

  // Full-session re-validation: schema-change re-queue and export-time gate
  // both use this (plan validation contract). Returns outcome per block id.
  revalidateAll(blocks: RBlock[]): Promise<Map<string, ValidationOutcome>> {
    const run = this.queue.then(async () => {
      await this.rebootSession();
      this.sessionBlocks = [];
      const outcomes = new Map<string, ValidationOutcome>();
      for (const block of blocks) {
        if (block.kind !== "code") continue;
        outcomes.set(block.id, await this.runBlock(block));
      }
      return outcomes;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async runBlock(block: RBlock): Promise<ValidationOutcome> {
    if (block.kind !== "code") return { status: "validated" };
    const outcome = await this.execute(block.code);
    if (outcome.status === "validated") {
      this.sessionBlocks.push(block);
    } else if (outcome.status === "timeout") {
      await this.recoverFromTimeout();
    }
    this.options.onStatus?.(block.id, outcome);
    return outcome;
  }

  private async execute(code: string): Promise<ValidationOutcome> {
    try {
      const shelter = await this.getShelter();
      const result = await this.withTimeout(
        shelter.captureR(code, {
          env: await this.sessionEnv(),
          captureGraphics: false
        })
      );
      if (result === "timeout") return { status: "timeout" };
      return { status: "validated" };
    } catch (error) {
      return { status: "failed", errors: [errorMessage(error)] };
    }
  }

  private async withTimeout<T>(work: Promise<T>): Promise<T | "timeout"> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">(resolve => {
      timer = setTimeout(() => resolve("timeout"), this.timeoutMs);
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async getShelter(): Promise<ShelterLike> {
    if (!this.shelter) {
      this.instance = await this.service.getValidator();
      this.shelter = await new this.instance.Shelter();
      await this.instance.evalR(`${kSessionEnv} <- new.env(parent = globalenv())`);
    }
    return this.shelter;
  }

  private async sessionEnv(): Promise<unknown> {
    return this.instance!.evalR(kSessionEnv);
  }

  // Timeout means the worker is wedged (no interrupt on PostMessage): kill,
  // reboot, replay preamble + validated blocks, resume.
  private async recoverFromTimeout() {
    this.shelter = undefined;
    this.instance = undefined;
    await this.service.restart(this.instanceKind);
    const shelter = await this.getShelter();
    for (const block of this.sessionBlocks) {
      try {
        await shelter.captureR(block.code, {
          env: await this.sessionEnv(),
          captureGraphics: false
        });
      } catch {
        // A replay failure means the environment shifted (e.g., data file
        // changed); the block keeps its recorded status — full re-validation
        // is the schema-change path's job.
      }
    }
  }

  private async rebootSession() {
    this.shelter = undefined;
    this.instance = undefined;
    await this.service.restart(this.instanceKind);
    await this.getShelter();
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
