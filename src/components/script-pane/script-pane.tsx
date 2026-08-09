import React, { useCallback, useEffect, useRef, useState } from "react";
import { RBlock } from "../../models/r-blocks";
import { ScriptStore } from "../../models/script-store";
import { BlockView } from "./block-view";
import "./script-pane.scss";

// The annotated script experience (plan Unit 6): empty-state onboarding,
// collapsed Setup section, roving tabindex, log-follow scrolling with a
// "N new steps" jump affordance, and append-never-steals-focus (2.4.11).

interface ScriptPaneProps {
  store: ScriptStore;
  validatorReady?: boolean;
  onSendToConsole?: (block: RBlock) => void;
}

export const ScriptPane = ({ store, validatorReady = false, onSendToConsole }: ScriptPaneProps) => {
  const [, setVersion] = useState(0);
  const [unseen, setUnseen] = useState(0);
  const [tabStopId, setTabStopId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const rerender = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    return store.listen({
      onAppend: () => {
        rerender();
        const scroller = scrollRef.current;
        if (!scroller) return;
        if (atBottomRef.current) {
          // Follow the log without moving keyboard focus.
          requestAnimationFrame(() => {
            scroller.scrollTop = scroller.scrollHeight;
          });
        } else {
          setUnseen(u => u + 1);
        }
      },
      onStatusChange: rerender
    });
  }, [store, rerender]);

  const handleScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
    atBottomRef.current = atBottom;
    if (atBottom && unseen > 0) setUnseen(0);
  };

  const jumpToNewest = () => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    atBottomRef.current = true;
    setUnseen(0);
  };

  const blocks = store.blocks;
  const setupBlocks = blocks.filter(b => b.isSetup);
  const liveBlocks = blocks.filter(b => !b.isSetup);
  const focusable = liveBlocks.length > 0 ? liveBlocks : setupBlocks;
  const currentTabStop = focusable.find(b => b.id === tabStopId)?.id ?? focusable[0]?.id;

  const moveFocus = (direction: 1 | -1, fromId: string) => {
    const index = focusable.findIndex(b => b.id === fromId);
    const next = focusable[index + direction];
    if (!next) return;
    setTabStopId(next.id);
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-block-id="${next.id}"]`);
    el?.focus();
  };

  if (blocks.length === 0) {
    return (
      <div className="script-pane script-pane--empty">
        <p>
          Make a change in CODAP — drag an attribute, make a graph — and watch
          it become R code here.
        </p>
        <p className="script-pane__example">
          <code>mammals &lt;- mammals |&gt; filter(diet == &quot;meat&quot;)</code>
        </p>
      </div>
    );
  }

  return (
    <div className="script-pane" ref={scrollRef} onScroll={handleScroll}>
      {setupBlocks.length > 0 && (
        <details className="script-pane__setup">
          <summary>Setup — recreates what was already in your document</summary>
          <ol className="script-pane__blocks">
            {setupBlocks.map(block => (
              <BlockView
                key={block.id}
                block={block}
                isTabStop={block.id === currentTabStop}
                validatorReady={validatorReady}
                onSendToConsole={onSendToConsole}
                onFocusMove={moveFocus}
              />
            ))}
          </ol>
        </details>
      )}
      <ol className="script-pane__blocks">
        {liveBlocks.map(block => (
          <BlockView
            key={block.id}
            block={block}
            isTabStop={block.id === currentTabStop}
            validatorReady={validatorReady}
            onSendToConsole={onSendToConsole}
            onFocusMove={moveFocus}
          />
        ))}
      </ol>
      {unseen > 0 && (
        <button className="script-pane__jump" onClick={jumpToNewest}>
          {unseen} new step{unseen === 1 ? "" : "s"} ↓
        </button>
      )}
    </div>
  );
};
