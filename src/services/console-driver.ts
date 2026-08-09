import { WebRInstanceLike, WebROutputMessage } from "./webr-service";

// REPL driver over webR's raw output stream (plan Unit 7). We drive OUR
// provisioned console instance (packages + data files) rather than webR's
// Console helper, which would create its own blank instance. Top-level REPL
// input works on the PostMessage channel; interruption does not — recovery is
// the kill/restart path in WebRService.

export interface ConsoleEvents {
  stdout?(line: string): void;
  stderr?(line: string): void;
  prompt?(prompt: string): void;
  // A completed plot image (browser: ImageBitmap from the canvas device).
  canvasImage?(image: unknown): void;
  canvasNewPage?(): void;
  closed?(): void;
}

export class ConsoleDriver {
  private running = false;

  constructor(private instance: WebRInstanceLike, private events: ConsoleEvents) {}

  // Pump the output stream until the instance closes or stop() is called.
  async start(): Promise<void> {
    if (!this.instance.read) throw new Error("This webR instance has no output stream");
    this.running = true;
    while (this.running) {
      let message: WebROutputMessage;
      try {
        message = await this.instance.read();
      } catch {
        break; // instance closed underneath us (Stop R)
      }
      this.dispatch(message);
      if (message.type === "closed") break;
    }
    this.events.closed?.();
  }

  private dispatch(message: WebROutputMessage) {
    switch (message.type) {
      case "stdout":
        this.events.stdout?.(String(message.data ?? ""));
        break;
      case "stderr":
        this.events.stderr?.(String(message.data ?? ""));
        break;
      case "prompt":
        this.events.prompt?.(String(message.data ?? "> "));
        break;
      case "canvas": {
        const data = message.data as { event?: string; image?: unknown } | undefined;
        if (data?.event === "canvasImage") this.events.canvasImage?.(data.image);
        else if (data?.event === "canvasNewPage") this.events.canvasNewPage?.();
        break;
      }
      default:
        break; // other message types are internal
    }
  }

  input(line: string) {
    this.instance.writeConsole?.(line);
  }

  stop() {
    this.running = false;
  }
}
