"use client";

export type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <p className="text-xs text-muted">{message}</p>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg border border-[#5e3c3c] bg-accent-red/15 py-2 text-xs font-bold text-accent-red hover:brightness-125"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
