import styled from "styled-components";

export type PropRow = {
  name: string;
  type: string;
  defaultValue?: string;
  description: string;
};

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
    vertical-align: top;
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

  td:first-child {
    white-space: nowrap;
  }
`;

const Code = styled.code`
  padding: 2px 5px;
  color: #111111;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 12px;
`;

const Description = styled.span`
  color: rgba(17, 17, 17, 0.68);
  line-height: 1.5;
`;

export default function PropsTable({ rows }: { rows: PropRow[] }) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Default</th>
            <th scope="col">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>
                <Code>{row.name}</Code>
              </td>
              <td>
                <Code>{row.type}</Code>
              </td>
              <td>{row.defaultValue ? <Code>{row.defaultValue}</Code> : "—"}</td>
              <td>
                <Description>{row.description}</Description>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
