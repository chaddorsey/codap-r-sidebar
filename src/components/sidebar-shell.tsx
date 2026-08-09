import React, { useState } from "react";
import { ConnectionStatus } from "../lib/codap-connection";
import "./sidebar-shell.scss";

interface SidebarShellProps {
  connectionStatus: ConnectionStatus;
  // Blocks appended while collapsed (wired up by the script pane in Unit 6).
  unreadCount?: number;
}

// The shell owns the sidebar's information architecture (plan Unit 1):
// script pane dominant, console minimized until it exists (Unit 7), toolbar
// enumerated, and a pre-created status announcer — live regions must be in the
// DOM before any content is injected into them.
export const SidebarShell = ({ connectionStatus, unreadCount = 0 }: SidebarShellProps) => {
  const [expanded, setExpanded] = useState(true);

  if (!expanded) {
    return (
      <div className="r-sidebar r-sidebar--collapsed">
        <button
          className="r-sidebar__expand"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
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
        <button disabled title="Available once your script has steps">
          Export
        </button>
        <button aria-expanded={true} onClick={() => setExpanded(false)}>
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
        {/* Empty-state onboarding (plan Unit 6 owns the full spec; the copy
            lives here so first-open is never blank). */}
        <div className="r-sidebar__empty-state">
          <p>
            Make a change in CODAP — drag an attribute, make a graph — and
            watch it become R code here.
          </p>
          <p className="r-sidebar__empty-example">
            <code>mammals &lt;- mammals |&gt; filter(diet == &quot;meat&quot;)</code>
          </p>
        </div>
      </section>

      <section className="r-sidebar__console" aria-label="R console">
        <p className="r-sidebar__console-placeholder">
          The R console will appear here.
        </p>
      </section>

      <Announcer />
    </div>
  );
};

// role="status" is implicitly aria-live="polite"; Unit 6's announcer module
// writes debounced, human-language summaries (never code) into this node.
const Announcer = () => (
  <div className="visually-hidden" role="status" data-testid="announcer" />
);
