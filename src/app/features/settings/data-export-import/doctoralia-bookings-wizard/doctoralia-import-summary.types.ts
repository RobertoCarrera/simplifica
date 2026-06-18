export interface DoctoraliaImportSummary {
  total: number;
  imported: number;
  deduped: number;
  notesImported: number;
  notesDropped: number;
  failed: { rowIndex: number; errorCode: string; errorMessage: string }[];
  elapsedMs: number;
}
