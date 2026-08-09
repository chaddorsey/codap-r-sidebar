// Overlay anchoring seam (plan Unit 8 / R13 construction contract).
//
// V1 measures DOM text with the browser's own geometry — Range.getClientRects
// is exact, free, and wrapping/zoom-proof. Tokens address as (blockId, line,
// charRange), the exact shape that maps onto Pretext LayoutCursors when the
// sprite-displacement feature flips this seam to Pretext-owned layout.

export interface TokenAddress {
  blockId: string;
  line: number; // 0-based line within the block's code
  start: number; // char offset within the line
  end: number;
}

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AnchorMeasurer {
  measure(address: TokenAddress): AnchorRect[];
  invalidate(): void;
}

// Measures against the pane's per-line DOM elements
// (`[data-block-id] .r-block__line`). Caches per address; the owner calls
// invalidate() from a ResizeObserver on the pane.
export class DomAnchorMeasurer implements AnchorMeasurer {
  private cache = new Map<string, AnchorRect[]>();

  constructor(private root: () => HTMLElement | null) {}

  measure(address: TokenAddress): AnchorRect[] {
    const key = `${address.blockId}:${address.line}:${address.start}:${address.end}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const root = this.root();
    if (!root) return [];
    const block = root.querySelector(`[data-block-id="${CSS.escape(address.blockId)}"]`);
    const line = block?.querySelectorAll(".r-block__line")[address.line];
    if (!line) return [];

    // Walk the line's text nodes to locate the char range across token spans.
    const range = document.createRange();
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let startSet = false;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      const nodeEnd = offset + text.length;
      if (!startSet && address.start < nodeEnd) {
        range.setStart(node, Math.max(0, address.start - offset));
        startSet = true;
      }
      if (startSet && address.end <= nodeEnd) {
        range.setEnd(node, Math.max(0, address.end - offset));
        break;
      }
      offset = nodeEnd;
    }
    if (!startSet) return [];

    const rootRect = root.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).map(rect => ({
      left: rect.left - rootRect.left,
      top: rect.top - rootRect.top,
      width: rect.width,
      height: rect.height
    }));
    this.cache.set(key, rects);
    return rects;
  }

  invalidate() {
    this.cache.clear();
  }
}
