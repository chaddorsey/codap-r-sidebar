import { CodapApi, CodapRequest, CodapResponse, NotificationHandler } from "../services/codap-api";

// Fake-CODAP test harness (plan Unit 2): canned responses keyed by resource,
// notification injection, and a request log. Reused by every suite that talks
// to the CODAP seam — mock here, never at postMessage/iframe-phone level.

type Responder = CodapResponse | ((request: CodapRequest) => CodapResponse | undefined);

export class FakeCodap implements CodapApi {
  readonly requests: CodapRequest[] = [];
  private responders = new Map<string, Responder>();
  private handlers: { resourceSpec: string; handler: NotificationHandler }[] = [];
  // Resources that should reject, simulating timeouts/disconnects.
  private failing = new Set<string>();

  respondTo(resource: string, responder: Responder) {
    this.responders.set(resource, responder);
    this.failing.delete(resource);
    return this;
  }

  failOn(resource: string) {
    this.failing.add(resource);
    return this;
  }

  async sendRequest(request: CodapRequest): Promise<CodapResponse> {
    this.requests.push(request);
    if (this.failing.has(request.resource)) {
      throw new Error(`FakeCodap: simulated failure for ${request.resource}`);
    }
    const responder = this.responders.get(request.resource);
    if (responder == null) return { success: false };
    const response = typeof responder === "function" ? responder(request) : responder;
    return response ?? { success: false };
  }

  on(resourceSpec: string, handler: NotificationHandler) {
    this.handlers.push({ resourceSpec, handler });
  }

  // Drive a notification into every handler registered for the exact resource.
  notify(resource: string, values: unknown) {
    for (const { resourceSpec, handler } of this.handlers) {
      if (resourceSpec === resource) handler({ resource, values });
    }
  }

  subscribedResources(): string[] {
    return this.handlers.map(h => h.resourceSpec);
  }

  requestsFor(resource: string): CodapRequest[] {
    return this.requests.filter(r => r.resource === resource);
  }
}

// Small builders for canned CODAP payloads used across suites.

export function contextValues(
  name: string,
  collections: { name: string; attrs: { name: string; id?: number; formula?: string; type?: string }[] }[],
  id = 1
) {
  return {
    id,
    name,
    title: name,
    collections: collections.map((c, i) => ({
      id: i + 100,
      name: c.name,
      attrs: c.attrs
    }))
  };
}

export function graphValues(id: number, config: Record<string, unknown>) {
  return { id, type: "graph", ...config };
}
