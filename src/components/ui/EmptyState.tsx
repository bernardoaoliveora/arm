import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}) => {
  return (
    <div style={{
      padding: 'var(--space-10) var(--space-4)',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-3)',
      color: 'var(--color-text-secondary)',
    }}>
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--color-surface-hover)',
        border: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
      }}>
        {icon || <PackageOpen size={28} />}
      </div>
      <div>
        <h4 style={{ color: 'var(--color-text-main)', marginBottom: 'var(--space-1)' }}>
          {title}
        </h4>
        <p style={{ maxWidth: '420px', margin: '0 auto', fontSize: 'var(--font-size-sm)' }}>
          {description}
        </p>
      </div>
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction} style={{ marginTop: 'var(--space-2)' }}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
