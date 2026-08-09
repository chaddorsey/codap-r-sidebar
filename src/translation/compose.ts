import { RBlock } from "../models/r-blocks";

// Compose blocks into one R script: each block's annotation rides above its
// code as a comment, so the artifact reads as an annotated program. Used by
// the corpus runner, the validator's replay, and the .R export (one
// representation, three consumers — plan System-Wide Impact).

export interface ComposeOptions {
  // Export mode comments out undone and failed blocks so the emitted script
  // always runs and matches final CODAP state (ratified R4 contract).
  forExport?: boolean;
}

export function composeScript(blocks: RBlock[], options?: ComposeOptions): string {
  const parts: string[] = [];
  for (const block of blocks) {
    const lines: string[] = [];
    lines.push(`# ${block.annotation}`);
    const neutralized =
      options?.forExport && (block.status === "undone" || block.status === "failed");
    if (neutralized) {
      const label = block.status === "undone" ? "undone in CODAP" : "did not run cleanly";
      lines.push(`# (This step was ${label}, so it is commented out.)`);
      lines.push(...block.code.split("\n").map(line => `# ${line}`));
    } else {
      lines.push(block.code);
    }
    parts.push(lines.join("\n"));
  }
  return `${parts.join("\n\n")}\n`;
}

// Only executable code (skips comment blocks and neutralized statuses):
// what the validator actually runs.
export function executableBlocks(blocks: RBlock[]): RBlock[] {
  return blocks.filter(
    b => b.kind === "code" && b.status !== "undone" && b.status !== "untranslated"
  );
}
