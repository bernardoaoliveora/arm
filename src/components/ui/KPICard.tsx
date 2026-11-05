import React from 'react';
import clsx from 'clsx';

export interface KPICardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  variant?: 'default' | 'warning' | 'success' | 'danger';
  className?: string;
  onClick?: () => void;
  active?: boolean;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtext,
  icon,
  badge,
  variant = 'default',
  className,
  onClick,
  active = false,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={clsx(
        'kpi-card',
        onClick && 'kpi-card-clickable',
        active && 'kpi-card-active',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
    >
      <div className="kpi-header">
        <span className="kpi-title">{title}</span>
        {icon && <div className={clsx('kpi-icon', `kpi-icon-${variant}`)}>{icon}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span className="kpi-value">{value}</span>
        {badge}
      </div>
      {subtext && <span className="kpi-subtext">{subtext}</span>}
    </div>
  );
};
