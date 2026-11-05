import React, { forwardRef, useRef, useState, useEffect, useCallback } from 'react';
import type { InputHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  leftIcon,
  className,
  id,
  required,
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const labelRef = useRef<HTMLLabelElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [showFullLabel, setShowFullLabel] = useState(false);

  const checkTruncation = useCallback(() => {
    const el = labelRef.current;
    if (!el) return false;
    const truncated = el.scrollWidth > el.clientWidth + 1;
    setIsTruncated(truncated);
    if (!truncated) {
      setShowFullLabel(false);
    }
    return truncated;
  }, []);

  useEffect(() => {
    checkTruncation();
    const el = labelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      checkTruncation();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [label, checkTruncation]);

  const handleLabelMouseEnter = () => {
    if (checkTruncation()) {
      setShowFullLabel(true);
    }
  };

  const handleLabelMouseLeave = () => {
    setShowFullLabel(false);
  };

  return (
    <div className="form-group">
      {label && (
        <div
          className="form-label-wrapper"
          onMouseEnter={handleLabelMouseEnter}
          onMouseLeave={handleLabelMouseLeave}
        >
          <label
            ref={labelRef}
            htmlFor={inputId}
            className={clsx('form-label', isTruncated && 'form-label-truncated')}
          >
            {label} {required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
          </label>
          {isTruncated && showFullLabel && (
            <label htmlFor={inputId} className="form-label-full-overlay">
              {label} {required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
            </label>
          )}
        </div>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
        {leftIcon && (
          <span style={{ 
            position: 'absolute', 
            left: '0.75rem', 
            color: 'var(--color-text-muted)', 
            display: 'flex', 
            alignItems: 'center', 
            pointerEvents: 'none' 
          }}>
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'input',
            error && 'input-error',
            leftIcon && { style: { paddingLeft: '2.5rem' } },
            className
          )}
          style={leftIcon ? { paddingLeft: '2.4rem' } : undefined}
          required={required}
          {...props}
        />
      </div>
      {error && <span className="form-error">{error}</span>}
      {hint && !error && <span className="form-hint">{hint}</span>}
    </div>
  );
});

Input.displayName = 'Input';
