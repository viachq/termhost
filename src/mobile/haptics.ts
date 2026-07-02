/** Best-effort tap feedback — no-ops silently on iOS Safari / desktop browsers
 * that don't implement the Vibration API. */
export function haptic(ms: number = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Vibration API unsupported or blocked — ignore.
  }
}
