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
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtext,
  icon,
  badge,
  variant = 'default',
  className,
}) => {
  return (
    <div className={clsx('kpi-card', className)}>
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
