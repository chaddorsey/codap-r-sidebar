import React, { ReactNode } from "react";
import { ConnectionStatus } from "../lib/codap-connection";
import "./sidebar-shell.scss";

interface SidebarShellProps {
  connectionStatus: ConnectionStatus;
  expanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
  // Blocks appended while collapsed — badge on the collapsed strip.
  unreadCount: number;
  exportEnabled: boolean;
  onExport: () => void;
  scriptSlot: ReactNode;
  consoleSlot?: ReactNode;
}

// The shell owns the sidebar's information architecture (plan Unit 1/6):
// script pane dominant, console minimized until Unit 7 fills it, toolbar
// enumerated, and a pre-created status announcer — live regions must be in
// the DOM before any content is injected into them.
export const SidebarShell = ({
  connectionStatus,
  expanded,
  onToggleExpanded,
  unreadCount,
  exportEnabled,
  onExport,
  scriptSlot,
  consoleSlot
}: SidebarShellProps) => {
  if (!expanded) {
    return (
      <div className="r-sidebar r-sidebar--collapsed">
        <button
          className="r-sidebar__expand"
          aria-expanded={false}
          onClick={() => onToggleExpanded(true)}
        >
          Expand R sidebar
          {unreadCount > 0 && (
            <span className="r-sidebar__badge">
              {unreadCount}
              <span className="visually-hidden"> new steps</span>
            </span>
          )}
        </button>
        <Announcer />
      </div>
    );
  }

  return (
    <div className="r-sidebar">
      <div className="r-sidebar__toolbar" role="toolbar" aria-label="R sidebar tools">
        <h1 className="r-sidebar__title">R Sidebar</h1>
        <button
          disabled={!exportEnabled}
          title={exportEnabled ? "Download your script (and data) as R files" : "Available once your script has steps"}
          onClick={onExport}
        >
          Export
        </button>
        <button aria-expanded={true} onClick={() => onToggleExpanded(false)}>
          Collapse
        </button>
      </div>

      {connectionStatus === "standalone" && (
        <p className="r-sidebar__banner" role="note">
          Not connected to CODAP — open this plugin inside a CODAP document to
          see your moves become R code.
        </p>
      )}

      <section className="r-sidebar__script" aria-label="Generated R script">
        {scriptSlot}
      </section>

      <section className="r-sidebar__console" aria-label="R console">
        {consoleSlot ?? (
          <p className="r-sidebar__console-placeholder">The R console will appear here.</p>
        )}
      </section>

      <Announcer />
    </div>
  );
};

// role="status" is implicitly aria-live="polite"; the Announcer class writes
// debounced, human-language summaries (never code) into this node.
const Announcer = () => (
  <div className="visually-hidden" role="status" data-testid="announcer" />
);
