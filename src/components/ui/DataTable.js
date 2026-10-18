import React from 'react';

/**
 * DataTable
 *   columns: [{ key, header, render?: (row) => node, className?, strong?, mono? }]
 *   rows:    array of objects
 *   rowKey:  field used as React key (default 'id')
 *   onRowClick: makes rows clickable
 */
export default function DataTable({ columns, rows, rowKey = 'id', onRowClick, emptyText = 'No data to show.' }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[rowKey]}
              className={onRowClick ? 'is-clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={[c.strong && 'cell-strong', c.mono && 'cell-mono', c.className].filter(Boolean).join(' ')}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="table-empty">{emptyText}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
