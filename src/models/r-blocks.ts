import { MoveEventType } from "./move-events";

// The RBlock contract from the plan's High-Level Technical Design: one block
// per translated move, consumed identically by the script pane, the validator,
// the corpus runner, and export.

export type RBlockStatus =
  | "pending" // appended, validation not yet run (or webR not booted)
  | "validated" // executed cleanly against the session environment
  | "failed" // execution failed; visibly quarantined, commented out on export
  | "untranslated" // R can't express this move; comment block, never validated
  | "undone"; // narrated undo; struck in the pane, commented out on export

export interface RBlockProvenance {
  eventType: MoveEventType;
  contextName?: string;
  componentId?: number;
  caseIds?: number[];
  // Attribute names this block reads or writes — powers cross-highlight and
  // schema-change re-validation (plan validation contract).
  attrNames?: string[];
}

export interface RBlock {
  id: string;
  kind: "code" | "comment";
  // R source. For kind "comment" every line is a comment — comments aren't
  // code, so the exported script stays runnable (ratified R4 contract).
  code: string;
  // Plain-language explanation paired with the block (origin R5). This is
  // what the announcer speaks — never the code.
  annotation: string;
  provenance: RBlockProvenance;
  status: RBlockStatus;
  // Setup-preamble blocks render inside the collapsed "Setup" section.
  isSetup?: boolean;
}
