import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { WebRInstanceLike, WebROutputMessage, WebRService } from "../../services/webr-service";
import { RConsole } from "./r-console";

// Scripted fake webR instance: eval echoes back through the output stream.
function makeFakeInstance() {
  const written: string[] = [];
  const evaled: string[] = [];
  const queue: WebROutputMessage[] = [];
  let notify: (() => void) | undefined;
  const push = (message: WebROutputMessage) => {
    queue.push(message);
    notify?.();
  };
  const instance = {
    init: async () => undefined,
    close: async () => push({ type: "closed" }),
    installPackages: async () => undefined,
    evalR: async () => undefined,
    evalRVoid: async (code: string) => {
      evaled.push(code);
    },
    read: async (): Promise<WebROutputMessage> => {
      while (queue.length === 0) {
        await new Promise<void>(resolve => {
          notify = resolve;
        });
      }
      return queue.shift()!;
    },
    writeConsole: (input: string) => {
      written.push(input);
      // Echo REPL: "N + N" -> stdout result.
      push({ type: "stdout", data: `[1] ${input.length}` });
    },
    FS: { writeFile: async () => undefined },
    Shelter: function Shelter(this: unknown) {
      return Promise.resolve({ captureR: async () => ({ output: [] }), purge: async () => undefined });
    } as any
  } as unknown as WebRInstanceLike & { evalRVoid(code: string): Promise<void> };
  return { instance, written, evaled, push };
}

function makeService() {
  const instances: ReturnType<typeof makeFakeInstance>[] = [];
  const service = new WebRService(() => {
    const fake = makeFakeInstance();
    instances.push(fake);
    return fake.instance;
  });
  return { service, instances };
}

describe("RConsole", () => {
  it("shows the designed boot staging and enables input on ready", async () => {
    const { service } = makeService();
    render(<RConsole service={service} getSetupScript={() => ""} />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Type R code/)).toBeEnabled()
    );
    expect(screen.getByRole("log", { name: "R console output" })).toBeInTheDocument();
  });

  it("auto-runs the setup script silently and says so", async () => {
    const { service, instances } = makeService();
    render(<RConsole service={service} getSetupScript={() => "library(dplyr)\npets <- 1"} />);
    await waitFor(() => expect(screen.getByPlaceholderText(/Type R code/)).toBeEnabled());
    expect(instances[0].evaled).toEqual(["library(dplyr)\npets <- 1"]);
    expect(screen.getByText(/console matches your CODAP session/)).toBeInTheDocument();
  });

  it("runs input on Enter, echoes it, shows output, and keeps focus in the input", async () => {
    const user = userEvent.setup();
    const { service, instances } = makeService();
    render(<RConsole service={service} getSetupScript={() => ""} />);
    const input = await screen.findByPlaceholderText(/Type R code/);
    await waitFor(() => expect(input).toBeEnabled());
    await user.click(input);
    await user.keyboard("1 + 1{Enter}");
    expect(instances[0].written).toEqual(["1 + 1"]);
    expect(await screen.findByText("> 1 + 1")).toBeInTheDocument();
    expect(await screen.findByText("[1] 5")).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("recalls history with arrow keys", async () => {
    const user = userEvent.setup();
    const { service } = makeService();
    render(<RConsole service={service} getSetupScript={() => ""} />);
    const input = await screen.findByPlaceholderText(/Type R code/);
    await waitFor(() => expect(input).toBeEnabled());
    await user.click(input);
    await user.keyboard("first{Enter}");
    await user.keyboard("second{Enter}");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("second");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("first");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveValue("second");
  });

  it("Stop R restarts the instance, reruns setup, and preserves the log", async () => {
    const user = userEvent.setup();
    const { service, instances } = makeService();
    render(<RConsole service={service} getSetupScript={() => "setup_code <- 1"} />);
    const input = await screen.findByPlaceholderText(/Type R code/);
    await waitFor(() => expect(input).toBeEnabled());
    await user.click(input);
    await user.keyboard("slow_thing(){Enter}");
    await user.click(screen.getByRole("button", { name: "Stop R" }));
    await waitFor(() => expect(screen.getByPlaceholderText(/Type R code/)).toBeEnabled());
    // A second instance booted and reran setup.
    expect(instances).toHaveLength(2);
    expect(instances[1].evaled).toEqual(["setup_code <- 1"]);
    // History entries survive.
    expect(screen.getByText("> slow_thing()")).toBeInTheDocument();
    expect(screen.getByText("(Stopped R.)")).toBeInTheDocument();
  });

  it("renders an unavailable message without a service", () => {
    render(<RConsole service={null} getSetupScript={() => ""} />);
    expect(screen.getByText(/isn't available in this browser/)).toBeInTheDocument();
  });

  it("inserts pending code from send-to-console without running it", async () => {
    const { service, instances } = makeService();
    const consumed = jest.fn();
    render(
      <RConsole
        service={service}
        getSetupScript={() => ""}
        pendingInsert={'pets <- read.csv("pets.csv")'}
        onInsertConsumed={consumed}
      />
    );
    const input = await screen.findByPlaceholderText(/Type R code/);
    await waitFor(() => expect(input).toHaveValue('pets <- read.csv("pets.csv")'));
    expect(consumed).toHaveBeenCalled();
    expect(instances[0]?.written ?? []).toEqual([]);
  });

  it("has no axe violations", async () => {
    const { service } = makeService();
    const { container } = render(<RConsole service={service} getSetupScript={() => ""} />);
    await waitFor(() => expect(screen.getByPlaceholderText(/Type R code/)).toBeEnabled());
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
