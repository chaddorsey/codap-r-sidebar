import { ConsoleDriver } from "./console-driver";
import { WebRInstanceLike, WebROutputMessage } from "./webr-service";

function streamInstance(messages: WebROutputMessage[]) {
  const written: string[] = [];
  let index = 0;
  let release: (() => void) | undefined;
  const instance = {
    read: async (): Promise<WebROutputMessage> => {
      if (index < messages.length) return messages[index++];
      // Block forever until closed (like a quiet REPL).
      return new Promise<WebROutputMessage>(resolve => {
        release = () => resolve({ type: "closed" });
      });
    },
    writeConsole: (input: string) => written.push(input),
    init: async () => undefined,
    close: async () => release?.(),
    installPackages: async () => undefined,
    evalR: async () => undefined,
    FS: { writeFile: async () => undefined },
    Shelter: class {} as any
  } as unknown as WebRInstanceLike;
  return { instance, written, closeStream: () => release?.() };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("ConsoleDriver", () => {
  it("dispatches stdout/stderr/prompt/canvas messages to events", async () => {
    const { instance, closeStream } = streamInstance([
      { type: "stdout", data: "[1] 42" },
      { type: "stderr", data: "Warning: hmm" },
      { type: "prompt", data: "> " },
      { type: "canvas", data: { event: "canvasNewPage" } },
      { type: "canvas", data: { event: "canvasImage", image: "BITMAP" } }
    ]);
    const seen: [string, unknown][] = [];
    const driver = new ConsoleDriver(instance, {
      stdout: line => seen.push(["stdout", line]),
      stderr: line => seen.push(["stderr", line]),
      prompt: p => seen.push(["prompt", p]),
      canvasNewPage: () => seen.push(["newPage", null]),
      canvasImage: image => seen.push(["image", image])
    });
    const running = driver.start();
    await flush();
    expect(seen).toEqual([
      ["stdout", "[1] 42"],
      ["stderr", "Warning: hmm"],
      ["prompt", "> "],
      ["newPage", null],
      ["image", "BITMAP"]
    ]);
    closeStream();
    await running;
  });

  it("forwards input lines to writeConsole", async () => {
    const { instance, written, closeStream } = streamInstance([]);
    const driver = new ConsoleDriver(instance, {});
    const running = driver.start();
    driver.input("1 + 1");
    driver.input("library(dplyr)");
    expect(written).toEqual(["1 + 1", "library(dplyr)"]);
    closeStream();
    await running;
  });

  it("fires closed when the stream ends", async () => {
    const { instance, closeStream } = streamInstance([{ type: "stdout", data: "hi" }]);
    let closed = false;
    const driver = new ConsoleDriver(instance, { closed: () => (closed = true) });
    const running = driver.start();
    await flush();
    closeStream();
    await running;
    expect(closed).toBe(true);
  });
});
