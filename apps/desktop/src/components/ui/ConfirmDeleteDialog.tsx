import React, { useState, createContext, useContext, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import './confirmDialog.css';

export interface ConfirmDialogOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmDialogState extends ConfirmDialogOptions {
  isOpen: boolean;
  resolve?: (value: boolean) => void;
}

interface ConfirmDialogContextType {
  confirm: (options: ConfirmDialogOptions | string) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '确认删除',
    description: '此操作无法撤销，确定要删除吗？',
    confirmText: '确定删除',
    cancelText: '取消',
    danger: true,
  });

  const confirm = useCallback((options: ConfirmDialogOptions | string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const opts: ConfirmDialogOptions =
        typeof options === 'string' ? { description: options } : options;

      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      setDialogState({
        isOpen: true,
        title: opts.title || '确认删除',
        description: opts.description || '此操作无法撤销，确定要删除吗？',
        confirmText: opts.confirmText || '确定删除',
        cancelText: opts.cancelText || '取消',
        danger: opts.danger ?? true,
        resolve,
      });
    });
  }, []);

  const handleClose = (result: boolean) => {
    if (dialogState.resolve) {
      dialogState.resolve(result);
    }
    setDialogState((prev) => ({ ...prev, isOpen: false, resolve: undefined }));
  };

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      <Dialog.Root open={dialogState.isOpen} onOpenChange={(open) => !open && handleClose(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="confirm-dialog-overlay" />
          <Dialog.Content className="confirm-dialog-content">
            <div className="confirm-dialog-header">
              <div className={`confirm-dialog-icon ${dialogState.danger ? 'danger' : ''}`}>
                <AlertTriangle size={20} />
              </div>
              <div className="confirm-dialog-titles">
                <Dialog.Title className="confirm-dialog-title">
                  {dialogState.title}
                </Dialog.Title>
                <Dialog.Description className="confirm-dialog-description">
                  {dialogState.description}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="confirm-dialog-close" onClick={() => handleClose(false)}>
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="confirm-dialog-btn cancel"
                onClick={() => handleClose(false)}
              >
                {dialogState.cancelText}
              </button>
              <button
                type="button"
                className={`confirm-dialog-btn ${dialogState.danger ? 'danger' : 'primary'}`}
                onClick={() => handleClose(true)}
              >
                {dialogState.confirmText}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('useConfirmDialog must be used within a ConfirmDialogProvider');
  }
  return context;
}

export interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteDialog({
  isOpen,
  title = '确认删除',
  description = '此操作无法撤销，确定要删除吗？',
  confirmText = '确定删除',
  cancelText = '取消',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="confirm-dialog-overlay" />
        <Dialog.Content className="confirm-dialog-content">
          <div className="confirm-dialog-header">
            <div className={`confirm-dialog-icon ${danger ? 'danger' : ''}`}>
              <AlertTriangle size={20} />
            </div>
            <div className="confirm-dialog-titles">
              <Dialog.Title className="confirm-dialog-title">{title}</Dialog.Title>
              <Dialog.Description className="confirm-dialog-description">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="confirm-dialog-close" onClick={onCancel}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="confirm-dialog-actions">
            <button type="button" className="confirm-dialog-btn cancel" onClick={onCancel}>
              {cancelText}
            </button>
            <button
              type="button"
              className={`confirm-dialog-btn ${danger ? 'danger' : 'primary'}`}
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
