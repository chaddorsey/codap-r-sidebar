import React from "react";
import { RBlock } from "../../models/r-blocks";
import { tokenizeRLine } from "../../lib/highlight-r";

// One annotated block (plan Unit 6): per-line DOM elements inside <pre><code>
// (the Pretext construction contract), status as icon + text (never color
// alone), annotation tied to the code via aria-describedby, failed stderr
// behind a native disclosure.

interface BlockViewProps {
  block: RBlock;
  // Roving tabindex: exactly one block is the tab stop.
  isTabStop: boolean;
  validatorReady: boolean;
  highlighted?: boolean;
  onSendToConsole?: (block: RBlock) => void;
  onFocusMove?: (direction: 1 | -1, blockId: string) => void;
  // Cross-highlight (plan Unit 8): hover and keyboard focus share one path.
  onHighlightEnter?: (block: RBlock) => void;
  onHighlightLeave?: () => void;
  onHighlightDismiss?: () => void;
}

interface StatusSpec {
  icon: string;
  label: string;
}

function statusSpec(block: RBlock, validatorReady: boolean): StatusSpec | null {
  switch (block.status) {
    case "pending":
      return validatorReady
        ? { icon: "…", label: "checking" }
        : { icon: "…", label: "will check when R is ready" };
    case "validated":
      return { icon: "✓", label: "runs" };
    case "failed":
      return { icon: "✗", label: "did not run" };
    case "untranslated":
      return { icon: "≠", label: "not translated" };
    case "undone":
      return { icon: "⤺", label: "undone" };
    case "note":
      return null;
    default:
      return null;
  }
}

export const BlockView = ({
  block, isTabStop, validatorReady, highlighted,
  onSendToConsole, onFocusMove, onHighlightEnter, onHighlightLeave, onHighlightDismiss
}: BlockViewProps) => {
  const annotationId = `${block.id}-annotation`;
  const status = statusSpec(block, validatorReady);
  const sendable = block.kind === "code" && block.status !== "undone";

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onFocusMove?.(1, block.id);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onFocusMove?.(-1, block.id);
    } else if (event.key === "Escape") {
      // 1.4.13: dismiss the highlight without moving the pointer or focus.
      onHighlightDismiss?.();
    }
  };

  return (
    <li
      className={`r-block r-block--${block.status}${highlighted ? " r-block--highlighted" : ""}`}
      data-block-id={block.id}
      tabIndex={isTabStop ? 0 : -1}
      aria-describedby={annotationId}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => onHighlightEnter?.(block)}
      onMouseLeave={() => onHighlightLeave?.()}
      onFocus={() => onHighlightEnter?.(block)}
      onBlur={() => onHighlightLeave?.()}
    >
      <p id={annotationId} className="r-block__annotation">
        {block.annotation}
      </p>
      <pre className="r-block__code">
        <code>
          {block.code.split("\n").map((line, lineIndex) => (
            <span className="r-block__line" key={lineIndex}>
              {tokenizeRLine(line).map((token, tokenIndex) => (
                <span key={tokenIndex} className={`tok tok--${token.type}`}>
                  {token.text}
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
      <div className="r-block__meta">
        {status && (
          <span className="r-block__status">
            <span aria-hidden="true">{status.icon}</span> {status.label}
          </span>
        )}
        {block.kind === "code" && (
          <button
            className="r-block__send"
            disabled={!sendable}
            title={sendable ? "Send this code to the R console" : "This step can't be sent to the console"}
            onClick={() => onSendToConsole?.(block)}
          >
            Send to console
          </button>
        )}
        {block.status === "failed" && block.validationErrors && (
          <details className="r-block__errors">
            <summary>Why it didn&apos;t run</summary>
            <pre>{block.validationErrors.join("\n")}</pre>
          </details>
        )}
      </div>
    </li>
  );
};
