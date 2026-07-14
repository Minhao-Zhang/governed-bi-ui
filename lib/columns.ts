/**
 * Physical column → the engine's derived column id.
 *
 * The id scheme is `col_<table_id without the 'tbl_' prefix>_<physical_name>`
 * (mirrors `corpus.ids.derive_column_id`; handoff §14.1). It is the id used by
 * `Column.references`, `TermBinding.asset_id`, and `RuleAsset.scope`, and the key
 * `GET /columns/{column_id}/related` resolves. Joins are matched server-side from
 * physical predicates, so the frontend never parses `on` strings itself (§14.3).
 */
export function deriveColumnId(tableId: string, physicalName: string): string {
  const base = tableId.startsWith("tbl_") ? tableId.slice(4) : tableId;
  return `col_${base}_${physicalName}`;
}
