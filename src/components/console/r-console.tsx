import React, { useCallback, useEffect, useRef, useState } from "react";
import { ConsoleDriver } from "../../services/console-driver";
import { BootStage, WebRService } from "../../services/webr-service";
import "./r-console.scss";

// Learner-facing R console (plan Unit 7): role="log" output (polite,
// non-atomic — correct REPL semantics), textarea input with history, a
// designed boot experience, plot display, and the prominent Stop R
// kill/restart control (the PostMessage no-interrupt mitigation).

export interface RConsoleProps {
  service: WebRService | null;
  // The current script (setup + validated steps) auto-run on ready so sent
  // blocks always have their prerequisites (plan data provisioning contract).
  getSetupScript: () => string;
  // Code pushed from the script pane's "Send to console" — inserted into the
  // input; the learner presses run (keeps agency, avoids surprise announcements).
  pendingInsert?: string | null;
  onInsertConsumed?: () => void;
}

type ConsoleState = "idle" | BootStage | "setup" | "restarting";

interface ConsoleEntry {
  id: number;
  type: "input" | "stdout" | "stderr" | "system" | "plot";
  text?: string;
  image?: unknown;
}

const kStageCopy: Record<Exclude<ConsoleState, "ready">, string> = {
  idle: "The R console will appear here.",
  starting: "Starting R…",
  packages: "Getting R ready — the first time takes a few minutes; it's fast after that.",
  data: "Loading your data into R…",
  setup: "Running your script so the console matches your CODAP session…",
  restarting: "Stopping R and starting fresh…"
};

export const RConsole = ({ service, getSetupScript, pendingInsert, onInsertConsumed }: RConsoleProps) => {
  const [state, setState] = useState<ConsoleState>("idle");
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [input, setInput] = useState("");
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const driverRef = useRef<ConsoleDriver | null>(null);
  const nextIdRef = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const appendEntry = useCallback((entry: Omit<ConsoleEntry, "id">) => {
    setEntries(prev => [...prev, { ...entry, id: nextIdRef.current++ }]);
  }, []);

  const bootConsole = useCallback(async () => {
    if (!service) return;
    try {
      const instance = await service.getConsole();
      setState("setup");
      const setup = getSetupScript();
      if (setup.trim().length > 0 && instance.evalRVoid) {
        try {
          await instance.evalRVoid(setup);
          appendEntry({ type: "system", text: "(Ran your script's setup — the console matches your CODAP session.)" });
        } catch {
          appendEntry({
            type: "system",
            text: "(Some of your script's setup didn't run — the console may not fully match CODAP.)"
          });
        }
      }
      const driver = new ConsoleDriver(instance, {
        stdout: line => appendEntry({ type: "stdout", text: line }),
        stderr: line => appendEntry({ type: "stderr", text: line }),
        canvasImage: image => appendEntry({ type: "plot", image })
      });
      driverRef.current = driver;
      void driver.start();
      setState("ready");
    } catch {
      appendEntry({ type: "system", text: "R couldn't start. Check your connection and try Stop R to retry." });
      setState("idle");
    }
  }, [service, getSetupScript, appendEntry]);

  useEffect(() => {
    if (!service) return;
    const unsubscribe = service.onBootStage((kind, stage) => {
      if (kind === "console" && stage !== "ready") setState(stage);
    });
    void bootConsole();
    return () => {
      unsubscribe();
      driverRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  // "Send to console" insertions.
  useEffect(() => {
    if (pendingInsert != null && pendingInsert !== "") {
      setInput(pendingInsert);
      inputRef.current?.focus();
      onInsertConsumed?.();
    }
  }, [pendingInsert, onInsertConsumed]);

  const run = () => {
    const code = input.trim();
    if (!code || state !== "ready") return;
    appendEntry({ type: "input", text: code });
    historyRef.current.push(code);
    historyIndexRef.current = historyRef.current.length;
    driverRef.current?.input(code);
    setInput("");
    // Focus stays in the input; the log announces the output (2.4.11-friendly).
    inputRef.current?.focus();
  };

  const stopR = async () => {
    if (!service) return;
    setState("restarting");
    driverRef.current?.stop();
    appendEntry({ type: "system", text: "(Stopped R.)" });
    await service.restart("console");
    await bootConsole();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      run();
    } else if (event.key === "ArrowUp" && historyRef.current.length > 0 && !input.includes("\n")) {
      event.preventDefault();
      historyIndexRef.current = Math.max(0, historyIndexRef.current - 1);
      setInput(historyRef.current[historyIndexRef.current] ?? "");
    } else if (event.key === "ArrowDown" && historyRef.current.length > 0 && !input.includes("\n")) {
      event.preventDefault();
      historyIndexRef.current = Math.min(historyRef.current.length, historyIndexRef.current + 1);
      setInput(historyRef.current[historyIndexRef.current] ?? "");
    } else if (event.key === "Escape") {
      inputRef.current?.blur();
    }
  };

  if (!service) {
    return <p className="r-console__unavailable">The R console isn&apos;t available in this browser.</p>;
  }

  const busy = state !== "ready";

  return (
    <div className="r-console">
      {busy && (
        <p className="r-console__boot" role="status">
          {kStageCopy[state as Exclude<ConsoleState, "ready">]}
        </p>
      )}
      <div className="r-console__log" role="log" aria-label="R console output">
        {entries.map(entry =>
          entry.type === "plot" ? (
            <PlotView key={entry.id} image={entry.image} index={entry.id} />
          ) : (
            <div key={entry.id} className={`r-console__entry r-console__entry--${entry.type}`}>
              {entry.type === "input" ? `> ${entry.text}` : entry.text}
            </div>
          )
        )}
      </div>
      <div className="r-console__controls">
        <label className="visually-hidden" htmlFor="r-console-input">
          R console input
        </label>
        <textarea
          id="r-console-input"
          ref={inputRef}
          rows={2}
          value={input}
          disabled={busy}
          placeholder={busy ? "R is getting ready…" : "Type R code — Enter runs it"}
          aria-keyshortcuts="Enter ArrowUp ArrowDown"
          onChange={event => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="r-console__buttons">
          <button disabled={busy || input.trim() === ""} onClick={run}>
            Run
          </button>
          <button
            className="r-console__stop"
            disabled={state === "restarting" || state === "idle"}
            title="Stop R and start it fresh (your console history stays)"
            onClick={stopR}
          >
            Stop R
          </button>
        </div>
      </div>
    </div>
  );
};

// Draws a completed plot ImageBitmap into a canvas, with a text alternative.
const PlotView = ({ image, index }: { image: unknown; index: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const bitmap = image as ImageBitmap | undefined;
    if (!canvas || !bitmap || typeof (bitmap as ImageBitmap).width !== "number") return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  }, [image]);
  return (
    <canvas
      ref={canvasRef}
      className="r-console__plot"
      role="img"
      aria-label={`Plot ${index} from your R code`}
    />
  );
};
