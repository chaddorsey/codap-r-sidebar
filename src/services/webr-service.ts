// webR instance lifecycle (plan Unit 5): two instances — learner console and
// background validator — so a runaway console loop can't starve validation and
// either can be killed/rebooted (no interrupt on the PostMessage channel).
// Boot is serialized console-first (IDBFS single-writer discipline), and a
// single-instance degraded mode remains a designed fallback if pilot-hardware
// memory measurements come back tight.

export interface CaptureResult {
  output: { type: string; data: unknown }[];
  result?: unknown;
}

export interface ShelterLike {
  captureR(code: string, options?: Record<string, unknown>): Promise<CaptureResult>;
  purge(): Promise<void>;
}

// The slice of the webR API this app depends on — mocks implement this.
export interface WebRInstanceLike {
  init(): Promise<unknown>;
  close(): Promise<unknown>;
  installPackages(packages: string[], options?: Record<string, unknown>): Promise<unknown>;
  evalR(code: string, options?: Record<string, unknown>): Promise<unknown>;
  evalRVoid?(code: string, options?: Record<string, unknown>): Promise<unknown>;
  FS: { writeFile(path: string, data: Uint8Array): Promise<unknown> };
  Shelter: new () => Promise<ShelterLike>;
}

export type WebRFactory = () => WebRInstanceLike;

// Version pinning lives in one place: the webR npm version (package.json) and
// this package list must move together (binary repo is ABI-locked to webR).
export const kRPackages = ["dplyr", "ggplot2", "tidyr"];
export const kDataDir = "/home/web_user";

// Loaded lazily so tests never pull the real webR module.
function defaultFactory(): WebRInstanceLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WebR, ChannelType } = require("webr");
  // PostMessage is the shipped configuration: cross-origin isolation is
  // unobtainable inside CODAP's iframe (plan Key Technical Decisions).
  return new WebR({ channelType: ChannelType.PostMessage });
}

export type InstanceKind = "console" | "validator";

export class WebRService {
  private instances = new Map<InstanceKind, Promise<WebRInstanceLike>>();
  private dataFiles = new Map<string, string>();
  private encoder = new TextEncoder();

  constructor(private makeInstance: WebRFactory = defaultFactory) {}

  getConsole(): Promise<WebRInstanceLike> {
    return this.getInstance("console");
  }

  async getValidator(): Promise<WebRInstanceLike> {
    // Console boots first (single IDBFS writer populates the package cache).
    await this.getInstance("console");
    return this.getInstance("validator");
  }

  private getInstance(kind: InstanceKind): Promise<WebRInstanceLike> {
    let pending = this.instances.get(kind);
    if (!pending) {
      pending = this.boot();
      this.instances.set(kind, pending);
    }
    return pending;
  }

  private async boot(): Promise<WebRInstanceLike> {
    const instance = this.makeInstance();
    await instance.init();
    await instance.installPackages(kRPackages, { quiet: true });
    for (const [fileName, csv] of this.dataFiles) {
      await this.writeDataFile(instance, fileName, csv);
    }
    return instance;
  }

  // Data provisioning contract: every dataset CSV is written to every
  // instance at the exact path the preamble references, on boot and on every
  // restart, and immediately when a new dataset is observed.
  async provisionData(fileName: string, csv: string): Promise<void> {
    this.dataFiles.set(fileName, csv);
    for (const pending of this.instances.values()) {
      const instance = await pending;
      await this.writeDataFile(instance, fileName, csv);
    }
  }

  private async writeDataFile(instance: WebRInstanceLike, fileName: string, csv: string) {
    await instance.FS.writeFile(`${kDataDir}/${fileName}`, this.encoder.encode(csv));
  }

  // Kill-and-reboot: the PostMessage channel cannot interrupt R, so a hung
  // evaluation is abandoned with its whole instance (plan Unit 5/7).
  async restart(kind: InstanceKind): Promise<WebRInstanceLike> {
    const pending = this.instances.get(kind);
    if (pending) {
      this.instances.delete(kind);
      try {
        const old = await pending;
        await old.close();
      } catch {
        // The old instance may be wedged; abandoning it is the point.
      }
    }
    return this.getInstance(kind);
  }
}
