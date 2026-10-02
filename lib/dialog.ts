// In-app replacements for window.alert / window.confirm, rendered by <DialogHost /> in the root
// layout. Same call shape as the natives, but async:
//   if (!(await confirmDialog('ลบคำนี้?'))) return;
//   alertDialog('บันทึกไม่สำเร็จ');

export interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  /** Red confirm button, for deletes and other destructive actions. */
  danger?: boolean;
}

export interface DialogRequest extends DialogOptions {
  kind: 'alert' | 'confirm';
  message: string;
  resolve: (ok: boolean) => void;
}

let show: ((req: DialogRequest) => void) | null = null;

/** Called by DialogHost on mount. */
export function registerDialogHost(fn: ((req: DialogRequest) => void) | null) {
  show = fn;
}

function open(kind: DialogRequest['kind'], message: string, opts: DialogOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    // No host (shouldn't happen once the layout mounts): fall back to the native dialog.
    if (!show) return resolve(kind === 'confirm' ? window.confirm(message) : (window.alert(message), true));
    show({ kind, message, resolve, ...opts });
  });
}

export const confirmDialog = (message: string, opts?: DialogOptions) => open('confirm', message, opts);
export const alertDialog = (message: string, opts?: DialogOptions) => open('alert', message, opts).then(() => {});
