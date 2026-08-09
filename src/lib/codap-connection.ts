import { codapInterface, initializePlugin } from "@concord-consortium/codap-plugin-api";

export const kPluginName = "R Sidebar";
export const kVersion = "0.1.0";
// Tall, narrow tile presented as a sidebar-shaped panel (plan Unit 1 / origin R14).
export const kInitialDimensions = {
  width: 380,
  height: 700
};

export type ConnectionStatus = "connecting" | "connected" | "standalone";

export interface ConnectionResult {
  status: "connected" | "standalone";
  // Plugin state persisted in the CODAP document from a prior session, if any.
  // Unit 6 deserializes the script store (+ snapshot digest) from here.
  savedState?: unknown;
}

export async function initializeCodapConnection(): Promise<ConnectionResult> {
  try {
    const initResult: any = await initializePlugin({
      pluginName: kPluginName,
      version: kVersion,
      dimensions: kInitialDimensions
    });
    // Let users resize the sidebar; failure here is cosmetic, not fatal.
    await codapInterface
      .sendRequest({
        action: "update",
        resource: "interactiveFrame",
        values: { isResizable: { width: true, height: true } }
      })
      .catch(() => undefined);
    return { status: "connected", savedState: initResult?.values?.savedState };
  } catch {
    // Opened outside CODAP (or the handshake timed out): the shell shows a
    // standalone banner and the plugin stays usable as a static page.
    return { status: "standalone" };
  }
}

// savedState write seam: CODAP calls back for interactive state on document
// save; the plugin-api keeps the latest value passed here.
export function persistInteractiveState(state: unknown) {
  codapInterface.updateInteractiveState(state);
}
