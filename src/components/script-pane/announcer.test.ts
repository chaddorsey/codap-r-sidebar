import { Announcer } from "./announcer";

describe("Announcer", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function makeNode() {
    const node = document.createElement("div");
    node.setAttribute("role", "status");
    document.body.appendChild(node);
    return node;
  }

  it("announces a single message after the debounce window", () => {
    const node = makeNode();
    const announcer = new Announcer(() => node, 100);
    announcer.announce("You deleted 2 cases.");
    expect(node.textContent).toBe("");
    jest.advanceTimersByTime(120);
    expect(node.textContent).toBe("You deleted 2 cases.");
  });

  it("coalesces a burst into one summary announcement", () => {
    const node = makeNode();
    const announcer = new Announcer(() => node, 100);
    announcer.announce("Step one.");
    announcer.announce("Step two.");
    announcer.announce("Step three.");
    jest.advanceTimersByTime(120);
    expect(node.textContent).toBe("3 steps added. Latest: Step three.");
  });

  it("announceNow bypasses the buffer and clears pending items", () => {
    const node = makeNode();
    const announcer = new Announcer(() => node, 100);
    announcer.announce("Buffered.");
    announcer.announceNow("Restored your script.");
    expect(node.textContent).toBe("Restored your script.");
    jest.advanceTimersByTime(200);
    expect(node.textContent).toBe("Restored your script.");
  });
});
