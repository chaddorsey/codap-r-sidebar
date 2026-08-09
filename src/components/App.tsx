import React, { useEffect, useRef, useState } from "react";
import { Orchestrator } from "../app/orchestrator";
import {
  ConnectionStatus,
  initializeCodapConnection,
  persistInteractiveState
} from "../lib/codap-connection";
import { downloadBundle } from "../lib/export-r";
import { realCodapApi } from "../services/codap-api";
import { Announcer } from "./script-pane/announcer";
import { ScriptPane } from "./script-pane/script-pane";
import { SidebarShell } from "./sidebar-shell";

// App wiring: connection -> orchestrator (observer -> engine -> store) ->
// shell + pane. Collapsed policy (plan Unit 6): announcements are suppressed
// while collapsed and coalesced into one summary on expand; the badge counts
// unseen blocks.

export const App = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [expanded, setExpanded] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasBlocks, setHasBlocks] = useState(false);

  const expandedRef = useRef(true);
  const announcerRef = useRef<Announcer | undefined>(undefined);
  const orchestratorRef = useRef<Orchestrator | undefined>(undefined);

  if (!announcerRef.current) {
    announcerRef.current = new Announcer(
      () => document.querySelector<HTMLElement>('[data-testid="announcer"]')
    );
  }
  if (!orchestratorRef.current) {
    orchestratorRef.current = new Orchestrator({
      api: realCodapApi(),
      announcer: announcerRef.current,
      persist: persistInteractiveState
    });
  }
  const orchestrator = orchestratorRef.current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await initializeCodapConnection();
      if (cancelled) return;
      setConnectionStatus(result.status);
      if (result.status === "connected") {
        await orchestrator.start(result.savedState);
        if (cancelled) return;
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

  return (
    <SidebarShell
      connectionStatus={connectionStatus}
      expanded={expanded}
      onToggleExpanded={handleToggleExpanded}
      unreadCount={unreadCount}
      exportEnabled={hasBlocks}
      onExport={handleExport}
      scriptSlot={<ScriptPane store={orchestrator.store} />}
    />
  );
};
