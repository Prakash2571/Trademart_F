'use client';

/**
 * Generic table.
 *
 * Handles the four states every list page needs - loading, error, empty and
 * populated - so no page reimplements them.
 */

import type { ReactNode } from 'react';

import type { ApiError } from '@/lib/api';
import { EmptyState, ErrorState, SkeletonTable } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | null;
  getRowKey: (row: T) => string;
  loading?: boolean;
  error?: ApiError | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading,
  error,
  onRetry,
  onRowClick,
  emptyTitle = 'Nothing to show',
  emptyDescription,
}: DataTableProps<T>) {
  if (loading && rows === null) {
    return <SkeletonTable rows={6} columns={columns.length} />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (rows === null || rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{
                  width: column.width,
                  textAlign: column.align === 'right' ? 'right' : 'left',
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.align === 'right' ? 'table__num' : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
