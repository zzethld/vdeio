/**
 * Unified error-message extraction.
 *
 * The axios response interceptor in `request.ts` already surfaces
 * `ElMessage.error(...)` for every non-401 API failure, so view code that
 * catches a thrown `request.*` promise should NOT show a second message —
 * the interceptor has already informed the user.
 *
 * Use this helper only for error paths the interceptor does NOT cover
 * (e.g. validation failures that throw before the request is sent, or when
 * you need the string for non-toast purposes such as inline form messages).
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const response = (err as { response?: { data?: { message?: unknown } } }).response;
    const dataMessage = response?.data?.message;
    if (typeof dataMessage === 'string' && dataMessage.length > 0) {
      return dataMessage;
    }
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  if (typeof err === 'string' && err.length > 0) {
    return err;
  }
  return fallback;
}
