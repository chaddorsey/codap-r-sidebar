import React, { useCallback, useEffect, useRef, useState } from "react";
import { Orchestrator } from "../app/orchestrator";
import {
  ConnectionStatus,
  initializeCodapConnection,
  persistInteractiveState
} from "../lib/codap-connection";
import { downloadBundle } from "../lib/export-r";
import { RBlock } from "../models/r-blocks";
import { realCodapApi } from "../services/codap-api";
import { CrossHighlightController } from "../services/cross-highlight";
import { ValidationOutcome, Validator } from "../services/validator";
import { WebRService } from "../services/webr-service";
import { Announcer } from "./script-pane/announcer";
import { RConsole } from "./console/r-console";
import { ScriptPane } from "./script-pane/script-pane";
import { SidebarShell } from "./sidebar-shell";

// App wiring: connection -> orchestrator (observer -> engine -> store) ->
// shell + pane + console, with the webR validator attached when the browser
// supports workers. Collapsed policy (plan Unit 6): announcements suppressed
// while collapsed, one summary + badge reset on expand.

function outcomeToStatus(outcome: ValidationOutcome): { status: RBlock["status"]; errors?: string[] } {
  if (outcome.status === "validated") return { status: "validated" };
  if (outcome.status === "timeout") {
    return { status: "failed", errors: ["Took too long to run — R was restarted."] };
  }
  return { status: "failed", errors: outcome.errors };
}

export const App = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [expanded, setExpanded] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasBlocks, setHasBlocks] = useState(false);
  const [validatorReady, setValidatorReady] = useState(false);
  const [pendingInsert, setPendingInsert] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<ReadonlySet<string>>(new Set());

  const expandedRef = useRef(true);
  const announcerRef = useRef<Announcer | undefined>(undefined);
  const serviceRef = useRef<WebRService | null | undefined>(undefined);
  const validatorRef = useRef<Validator | null | undefined>(undefined);
  const orchestratorRef = useRef<Orchestrator | undefined>(undefined);
  const crossHighlightRef = useRef<CrossHighlightController | undefined>(undefined);

  if (announcerRef.current === undefined) {
    announcerRef.current = new Announcer(
      () => document.querySelector<HTMLElement>('[data-testid="announcer"]')
    );
  }
  if (serviceRef.current === undefined) {
    // jsdom and very old browsers have no Worker: script translation still
    // works; validation and the console degrade gracefully.
    serviceRef.current = typeof Worker === "function" ? new WebRService() : null;
  }
  if (orchestratorRef.current === undefined) {
    const service = serviceRef.current;
    const validator = service
      ? new Validator(service, {
          onStatus: (blockId, outcome) => {
            const mapped = outcomeToStatus(outcome);
            orchestratorRef.current?.store.setStatus(blockId, mapped.status, mapped.errors);
          }
        })
      : null;
    validatorRef.current = validator;
    orchestratorRef.current = new Orchestrator({
      api: realCodapApi(),
      announcer: announcerRef.current,
      persist: persistInteractiveState,
      validate: validator ? block => void validator.validate(block) : undefined,
      revalidate: validator
        ? blocks => {
            void validator.revalidateAll(blocks).then(outcomes => {
              for (const [blockId, outcome] of outcomes) {
                const mapped = outcomeToStatus(outcome);
                orchestratorRef.current?.store.setStatus(blockId, mapped.status, mapped.errors);
              }
            });
          }
        : undefined,
      provisionData: service ? (fileName, csv) => void service.provisionData(fileName, csv) : undefined
    });
  }
  const orchestrator = orchestratorRef.current;

  useEffect(() => {
    const service = serviceRef.current;
    if (!service) return;
    return service.onBootStage((kind, stage) => {
      if (kind === "validator" && stage === "ready") setValidatorReady(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await initializeCodapConnection();
      if (cancelled) return;
      setConnectionStatus(result.status);
      if (result.status === "connected") {
        // Provision every snapshot dataset before validation starts.
        await orchestrator.start(result.savedState);
        if (cancelled) return;
        const service = serviceRef.current;
        if (service) {
          for (const dataset of orchestrator.exportDatasets()) {
            void service.provisionData(dataset.fileName, dataset.csv);
          }
        }
        // Cross-highlight (Unit 8): needs the live observer for recording
        // hygiene; CODAP-side selections light up matching blocks.
        const observer = orchestrator.observer;
        if (observer) {
          const controller = new CrossHighlightController({
            api: realCodapApi(),
            tagger: observer,
            onHighlightBlocks: blockIds => setHighlightedIds(new Set(blockIds))
          });
          crossHighlightRef.current = controller;
          observer.on(event => {
            if (event.type === "selectionChanged") {
              controller.handleSelection(event, orchestrator.store.blocks);
            }
          });
        }
        setHasBlocks(orchestrator.store.blocks.length > 0);
        orchestrator.store.listen({
          onAppend: () => {
            setHasBlocks(true);
            if (!expandedRef.current) setUnreadCount(count => count + 1);
          }
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleExpanded = (nextExpanded: boolean) => {
    expandedRef.current = nextExpanded;
    setExpanded(nextExpanded);
    if (nextExpanded && unreadCount > 0) {
      announcerRef.current?.announceNow(
        `${unreadCount} new step${unreadCount === 1 ? "" : "s"} added while collapsed.`
      );
      setUnreadCount(0);
    }
  };

  const handleExport = () => {
    downloadBundle(orchestrator.buildExport());
  };

  const handleSendToConsole = useCallback((block: RBlock) => {
    setPendingInsert(block.code);
  }, []);

  const getSetupScript = useCallback(() => orchestrator.currentScript(), [orchestrator]);

  return (
    <SidebarShell
      connectionStatus={connectionStatus}
      expanded={expanded}
      onToggleExpanded={handleToggleExpanded}
      unreadCount={unreadCount}
      exportEnabled={hasBlocks}
      onExport={handleExport}
      scriptSlot={
        <ScriptPane
          store={orchestrator.store}
          validatorReady={validatorReady}
          onSendToConsole={handleSendToConsole}
          highlightedIds={highlightedIds}
          crossHighlight={{
            enter: block => crossHighlightRef.current?.enter(block),
            leave: () => void crossHighlightRef.current?.leave(),
            dismiss: () => crossHighlightRef.current?.dismiss()
          }}
        />
      }
      consoleSlot={
        <RConsole
          service={serviceRef.current ?? null}
          getSetupScript={getSetupScript}
          pendingInsert={pendingInsert}
          onInsertConsumed={() => setPendingInsert(null)}
        />
      }
    />
  );
};
