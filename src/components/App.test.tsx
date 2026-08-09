import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { App } from "./App";

jest.mock("@concord-consortium/codap-plugin-api", () => ({
  initializePlugin: jest.fn().mockResolvedValue({ values: { savedState: undefined } }),
  codapInterface: {
    sendRequest: jest.fn().mockResolvedValue({ success: true }),
    updateInteractiveState: jest.fn(),
    on: jest.fn()
  }
}));

const mockApi = jest.requireMock("@concord-consortium/codap-plugin-api");

describe("App / SidebarShell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.initializePlugin.mockResolvedValue({ values: { savedState: undefined } });
    mockApi.codapInterface.sendRequest.mockResolvedValue({ success: true });
  });

  const renderSettled = async () => {
    const view = render(<App />);
    await waitFor(() => expect(mockApi.initializePlugin).toHaveBeenCalled());
    await screen.findByRole("region", { name: "Generated R script" });
    return view;
  };

  it("renders the landmark structure with a pre-created announcer", async () => {
    await renderSettled();
    expect(screen.getByRole("region", { name: "Generated R script" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "R console" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "R sidebar tools" })).toBeInTheDocument();
    const announcer = screen.getByTestId("announcer");
    expect(announcer).toHaveAttribute("role", "status");
  });

  it("shows empty-state onboarding copy on an empty document", async () => {
    await renderSettled();
    expect(screen.getByText(/watch it become R code/i)).toBeInTheDocument();
    // Export disabled until the script has steps.
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("collapses and expands via keyboard-operable controls", async () => {
    const user = userEvent.setup();
    await renderSettled();
    const collapse = screen.getByRole("button", { name: "Collapse" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    await user.click(collapse);
    expect(screen.queryByRole("region", { name: "Generated R script" })).not.toBeInTheDocument();
    const expand = screen.getByRole("button", { name: /expand r sidebar/i });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    await user.click(expand);
    expect(screen.getByRole("region", { name: "Generated R script" })).toBeInTheDocument();
  });

  it("shows a standalone banner when the CODAP handshake fails", async () => {
    mockApi.initializePlugin.mockRejectedValue(new Error("no CODAP"));
    render(<App />);
    expect(await screen.findByRole("note")).toHaveTextContent(/not connected to CODAP/i);
  });

  it("has no axe violations in the empty state", async () => {
    const { container } = await renderSettled();
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
