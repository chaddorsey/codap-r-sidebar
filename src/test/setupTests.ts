import "@testing-library/jest-dom";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { TextDecoder, TextEncoder } from "util";

// jsdom ships without the encoding API; webr-service and dataset provisioning
// use it.
if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}
