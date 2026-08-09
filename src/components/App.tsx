import React, { useEffect, useState } from "react";
import { ConnectionStatus, initializeCodapConnection } from "../lib/codap-connection";
import { SidebarShell } from "./sidebar-shell";

export const App = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    let cancelled = false;
    initializeCodapConnection().then(result => {
      if (!cancelled) setConnectionStatus(result.status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <SidebarShell connectionStatus={connectionStatus} />;
};
