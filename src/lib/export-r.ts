import { zipSync, strToU8 } from "fflate";
import { RBlock } from "../models/r-blocks";
import { composeScript } from "../translation/compose";

// Export bundle (plan Unit 6, ratified contracts): the .R script (undone and
// failed blocks commented out so it always runs) plus one CSV per dataset at
// the initial-observation vintage. Single .R downloads bare; multiple files
// zip via fflate. Must run in plain RStudio with no edits.

export interface ExportDataset {
  fileName: string; // e.g. "mammals.csv" — matches the preamble's read.csv path
  csv: string;
}

export interface ExportFile {
  name: string;
  content: string;
}

export interface ExportBundle {
  // Single .R file, or script + CSVs zipped.
  kind: "file" | "zip";
  fileName: string;
  files: ExportFile[];
}

export function buildExportBundle(
  blocks: readonly RBlock[],
  datasets: ExportDataset[],
  baseName = "codap-session"
): ExportBundle {
  const script: ExportFile = {
    name: `${baseName}.R`,
    content: composeScript([...blocks], { forExport: true })
  };
  // Only ship CSVs the script actually reads (tribble-inlined datasets don't
  // appear as read.csv calls).
  const needed = datasets.filter(d => script.content.includes(`read.csv("${d.fileName}")`));
  if (needed.length === 0) {
    return { kind: "file", fileName: script.name, files: [script] };
  }
  return {
    kind: "zip",
    fileName: `${baseName}.zip`,
    files: [script, ...needed.map(d => ({ name: d.fileName, content: d.csv }))]
  };
}

export function bundleToBlob(bundle: ExportBundle): Blob {
  if (bundle.kind === "file") {
    return new Blob([bundle.files[0].content], { type: "text/plain;charset=utf-8" });
  }
  const entries: Record<string, Uint8Array> = {};
  for (const file of bundle.files) entries[file.name] = strToU8(file.content);
  const zipped = zipSync(entries);
  return new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
}

// Browser download trigger — kept apart from the pure builders for testability.
export function downloadBundle(bundle: ExportBundle, doc: Document = document) {
  const url = URL.createObjectURL(bundleToBlob(bundle));
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = bundle.fileName;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
