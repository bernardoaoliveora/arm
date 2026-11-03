import { useState } from 'react';
import type { TableColumn } from '../../types/app.types';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  keyExtractor: (item: T) => string;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  isLoading = false,
  emptyTitle = 'Nenhum registro encontrado',
  emptyDescription = 'Não existem dados correspondentes aos filtros aplicados.',
  keyExtractor,
  className,
}: TableProps<T>) {
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  return (
    <div className="table-container">
      <table className={`table ${className || ''}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  width: col.width,
                  textAlign: col.align || 'left',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <tr key={`skeleton-${idx}`}>
                {columns.map((col) => (
                  <td key={col.key}>
                    <Skeleton height="1.25rem" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 0 }}>
                <EmptyState
                  title={emptyTitle}
                  description={emptyDescription}
                />
              </td>
            </tr>
          ) : (
            data.map((row) => {
              const rowKey = keyExtractor(row);
              const isSelected = selectedRowKey === rowKey;
              return (
                <tr
                  key={rowKey}
                  className={isSelected ? 'table-row-selected' : undefined}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('button, a, input, select')) {
                      setSelectedRowKey(rowKey);
                    } else {
                      setSelectedRowKey((prev) => (prev === rowKey ? null : rowKey));
                    }
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        textAlign: col.align || 'left',
                      }}
                    >
                      {col.render ? col.render(row) : (row as Record<string, any>)[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
