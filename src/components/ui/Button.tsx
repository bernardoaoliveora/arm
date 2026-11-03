import React, { useState, useRef, useEffect } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className,
  disabled,
  onClick,
  ...props
}) => {
  const [isClicked, setIsClicked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsClicked(true);
    timerRef.current = setTimeout(() => {
      setIsClicked(false);
    }, 260);

    if (onClick) {
      onClick(e);
    }
  };

  return (
    <button
      className={clsx(
        'btn',
        `btn-${variant}`,
        size !== 'md' && `btn-${size}`,
        isClicked && 'btn-clicked',
        className
      )}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      onClick={handleClick}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="spinner" aria-hidden="true" />
          <span>Processando...</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="btn-icon-left">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="btn-icon-right">{rightIcon}</span>}
        </>
      )}
    </button>
  );
};
