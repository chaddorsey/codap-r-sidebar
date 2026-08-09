import { codapInterface } from "@concord-consortium/codap-plugin-api";

// The narrow seam the observer and snapshot services depend on. Tests inject
// the FakeCodap harness; production wraps codapInterface. Keeping this tiny
// means CODAP API churn stays contained here and in the observer.

export interface CodapRequest {
  action: string;
  resource: string;
  values?: unknown;
}

export interface CodapResponse {
  success?: boolean;
  values?: any;
}

export type NotificationHandler = (notification: { resource: string; values: any }) => void;

export interface CodapApi {
  sendRequest(request: CodapRequest): Promise<CodapResponse>;
  // actionSpec is always "notify" for our observer registrations.
  on(resourceSpec: string, handler: NotificationHandler): void;
}

export function realCodapApi(): CodapApi {
  return {
    sendRequest: request => codapInterface.sendRequest(request) as Promise<CodapResponse>,
    on: (resourceSpec, handler) =>
      codapInterface.on("notify", resourceSpec, (notification: any) => {
        handler(notification);
        // codapInterface treats a handler's return value as the RPC reply;
        // returning success keeps the iframe-phone channel happy.
        return { success: true };
      })
  };
}
