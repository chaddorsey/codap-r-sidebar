/* eslint-disable testing-library/no-node-access --
   These tests assert structural contracts (per-line token spans, the setup
   <details> element, aria-describedby targets) that Testing Library queries
   cannot reach by role or text. */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { RBlock } from "../../models/r-blocks";
import { ScriptStore } from "../../models/script-store";
import { ScriptPane } from "./script-pane";

function block(id: string, overrides: Partial<RBlock> = {}): RBlock {
  return {
    id,
    kind: "code",
    code: `pets <- pets |>\n  filter(!(case_id %in% ${id.length}))`,
    annotation: `Annotation for ${id}.`,
    status: "pending",
    provenance: { eventType: "casesDeleted", contextName: "Pets" },
    ...overrides
  };
}

describe("ScriptPane", () => {
  it("shows onboarding copy when the script is empty", () => {
    render(<ScriptPane store={new ScriptStore()} />);
    expect(screen.getByText(/watch it become R code/i)).toBeInTheDocument();
  });

  it("renders appended blocks with annotation tied via aria-describedby", () => {
    const store = new ScriptStore();
    render(<ScriptPane store={store} />);
    act(() => store.append(block("b1")));
    const item = screen.getByRole("listitem");
    const describedBy = item.getAttribute("aria-describedby");
    expect(describedBy).toBe("b1-annotation");
    expect(document.getElementById(describedBy!)).toHaveTextContent("Annotation for b1.");
    // Code renders as per-line elements with token spans (Pretext contract).
    expect(item.querySelectorAll(".r-block__line")).toHaveLength(2);
  });

  it("groups setup blocks in a collapsed disclosure", () => {
    const store = new ScriptStore();
    store.append(block("s1", { isSetup: true }));
    store.append(block("b1"));
    render(<ScriptPane store={store} />);
    const details = document.querySelector("details.script-pane__setup");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText(/Setup — recreates what was already/)).toBeInTheDocument();
  });

  it("moves focus between blocks with arrow keys (roving tabindex)", async () => {
    const user = userEvent.setup();
    const store = new ScriptStore();
    store.append(block("b1"));
    store.append(block("b2"));
    render(<ScriptPane store={store} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("tabindex", "0");
    expect(items[1]).toHaveAttribute("tabindex", "-1");
    items[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    expect(items[1]).toHaveAttribute("tabindex", "0");
    await user.keyboard("{ArrowUp}");
    expect(items[0]).toHaveFocus();
  });

  it("conveys status with icon + text and exposes failure details", () => {
    const store = new ScriptStore();
    store.append(block("b1", { status: "failed", validationErrors: ["object 'x' not found"] }));
    render(<ScriptPane store={store} validatorReady={true} />);
    expect(screen.getByText("did not run")).toBeInTheDocument();
    expect(screen.getByText(/Why it didn't run/)).toBeInTheDocument();
    expect(screen.getByText(/object 'x' not found/)).toBeInTheDocument();
  });

  it("labels pending blocks differently before the validator is ready", () => {
    const store = new ScriptStore();
    store.append(block("b1"));
    const { rerender } = render(<ScriptPane store={store} validatorReady={false} />);
    expect(screen.getByText("will check when R is ready")).toBeInTheDocument();
    rerender(<ScriptPane store={store} validatorReady={true} />);
    expect(screen.getByText("checking")).toBeInTheDocument();
  });

  it("disables send-to-console for undone blocks and calls back for active ones", async () => {
    const user = userEvent.setup();
    const store = new ScriptStore();
    store.append(block("b1"));
    store.append(block("b2", { status: "undone" }));
    const sent: string[] = [];
    render(<ScriptPane store={store} onSendToConsole={b => sent.push(b.id)} />);
    const buttons = screen.getAllByRole("button", { name: "Send to console" });
    expect(buttons[1]).toBeDisabled();
    await user.click(buttons[0]);
    expect(sent).toEqual(["b1"]);
  });

  it("has no axe violations with a populated script", async () => {
    const store = new ScriptStore();
    store.append(block("s1", { isSetup: true }));
    store.append(block("b1", { status: "validated" }));
    store.append(block("b2", { kind: "comment", status: "untranslated", code: "# note" }));
    const { container } = render(<ScriptPane store={store} validatorReady={true} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
/* eslint-enable testing-library/no-node-access */
