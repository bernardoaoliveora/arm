import { forwardRef, useRef, useState, useEffect, useCallback } from 'react';
import type { SelectHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  hint?: string;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  options,
  error,
  hint,
  placeholder,
  className,
  id,
  required,
  ...props
}, ref) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
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
            htmlFor={selectId}
            className={clsx('form-label', isTruncated && 'form-label-truncated')}
          >
            {label} {required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
          </label>
          {isTruncated && showFullLabel && (
            <label htmlFor={selectId} className="form-label-full-overlay">
              {label} {required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
            </label>
          )}
        </div>
      )}
      <select
        ref={ref}
        id={selectId}
        className={clsx('select', error && 'input-error', className)}
        required={required}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="form-error">{error}</span>}
      {hint && !error && <span className="form-hint">{hint}</span>}
    </div>
  );
});

Select.displayName = 'Select';
