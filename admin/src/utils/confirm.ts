import { ElMessageBox, ElMessage } from 'element-plus';

export interface ConfirmActionOptions {
  /** Dialog title (second ElMessageBox argument). */
  title: string;
  /** Dialog body message (first ElMessageBox argument). */
  message: string;
  /** Action to run after the user confirms. Throws => error shown by interceptor. */
  onConfirm: () => Promise<void>;
  /** Optional success toast shown after onConfirm resolves. */
  successMsg?: string;
  /** Confirm button label. Defaults to '确定'. */
  confirmButtonText?: string;
  /** Cancel button label. Defaults to '取消'. */
  cancelButtonText?: string;
  /** Dialog icon type. Defaults to 'warning'. */
  type?: 'success' | 'info' | 'warning' | 'error';
}

/**
 * Runs `ElMessageBox.confirm` → `onConfirm` → success toast in one shot.
 *
 * Cancellation and API errors are swallowed:
 *  - cancellation is an expected user action (no message needed)
 *  - API errors are already surfaced by the `request.ts` response interceptor
 *
 * Dialog wording (title/message/buttons/type) is fully controlled by the
 * caller via options so existing wording can be preserved verbatim.
 */
export async function confirmAction(options: ConfirmActionOptions): Promise<void> {
  const {
    title,
    message,
    onConfirm,
    successMsg,
    confirmButtonText = '确定',
    cancelButtonText = '取消',
    type = 'warning',
  } = options;

  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText,
      cancelButtonText,
      type,
    });
  } catch {
    // User cancelled — nothing to do.
    return;
  }

  try {
    await onConfirm();
  } catch {
    // API error already surfaced by request interceptor.
    return;
  }

  if (successMsg) {
    ElMessage.success(successMsg);
  }
}
