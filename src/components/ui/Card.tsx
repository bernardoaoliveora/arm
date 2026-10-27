import React from 'react';
import clsx from 'clsx';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  padding?: 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  action,
  footer,
  children,
  className,
  padding,
  style,
  ...props
}) => {
  const hasHeader = title || subtitle || action;
  const paddingMap = {
    sm: 'var(--space-3)',
    md: 'var(--space-4)',
    lg: 'var(--space-6)',
  };

  const bodyStyle = padding ? { padding: paddingMap[padding] } : undefined;

  return (
    <div className={clsx('card', className)} style={style} {...props}>
      {hasHeader && (
        <div className="card-header">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="form-hint" style={{ marginTop: '2px' }}>{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="card-body" style={bodyStyle}>{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
};
