import React from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

export interface AlertProps {
  children: React.ReactNode;
  variant?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({
  children,
  variant = 'info',
  title,
  className,
  style,
  icon,
  onClose,
}) => {
  const defaultIcons = {
    info: <Info size={18} />,
    warning: <AlertTriangle size={18} />,
    danger: <AlertCircle size={18} />,
    success: <CheckCircle size={18} />,
  };

  return (
    <div className={clsx('alert', `alert-${variant}`, className)} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', ...style }} role="alert">
      <div style={{ flexShrink: 0, marginTop: '2px' }}>
        {icon || defaultIcons[variant]}
      </div>
      <div style={{ flex: 1 }}>
        {title && (
          <strong style={{ display: 'block', marginBottom: '2px', fontWeight: 600 }}>
            {title}
          </strong>
        )}
        <div>{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            color: 'inherit',
            opacity: 0.7,
            marginLeft: 'auto',
          }}
          aria-label="Fechar"
        >
          ×
        </button>
      )}
    </div>
  );
};
