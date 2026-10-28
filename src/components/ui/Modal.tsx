import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footerActions?: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footerActions,
  maxWidth = '540px',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="modal-dialog"
        style={{
          maxWidth,
          animation: 'fadeIn 0.15s ease-out',
        }}
      >
        <div className="modal-header">
          <div>
            <h3 id="modal-title" className="card-title">{title}</h3>
            {description && <p className="form-hint" style={{ marginTop: '2px' }}>{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="btn-icon btn-ghost"
            aria-label="Fechar modal"
            style={{ color: 'var(--color-text-muted)', minWidth: '36px', minHeight: '36px' }}
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footerActions && (
          <div className="modal-footer">
            {footerActions}
          </div>
        )}
      </div>
    </div>
  );
};
