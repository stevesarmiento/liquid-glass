import styled from "styled-components";
import type { GlassComponentSize } from "@liquid-glass/design-system";
import type { LensParams } from "liquid-glass";

/**
 * Size-tier optics table generated from the design-system's real presets
 * (sizes.ts), so documented tier values can never drift from the shipped
 * ones. Tiers are derived from one ratio profile per component anchored at
 * md — the same material at every size.
 */
type PresetWithLens = { lens: Omit<LensParams, "mapSize"> & { mapSize?: number } };

const TableWrap = styled.div`
  overflow-x: auto;
  border: 1px solid rgba(17, 17, 17, 0.1);
  border-radius: 8px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 10px 14px;
    text-align: left;
    border-bottom: 1px solid rgba(17, 17, 17, 0.08);
  }

  th {
    color: rgba(17, 17, 17, 0.54);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: #fafafa;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }
`;

const OPTIC_COLUMNS = ["scaleX", "scaleY", "depth", "dome", "blur", "chroma"] as const;

function formatCell(value: number): string {
  return Number.isInteger(value) ? String(value) : (Math.round(value * 100) / 100).toString();
}

export default function PresetTable({
  presets,
}: {
  presets: Record<GlassComponentSize, PresetWithLens>;
}) {
  const sizes = Object.keys(presets) as GlassComponentSize[];
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <th>size</th>
            <th>lens</th>
            {OPTIC_COLUMNS.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sizes.map((size) => {
            const lens = presets[size].lens;
            return (
              <tr key={size}>
                <td>{size}</td>
                <td>
                  {lens.width}×{lens.height}
                </td>
                {OPTIC_COLUMNS.map((column) => (
                  <td key={column}>{formatCell(lens[column])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
