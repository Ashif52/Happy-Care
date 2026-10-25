/**
 * Safe clipboard copy utility that works on both HTTPS and HTTP (LAN IP) contexts.
 * When navigator.clipboard is undefined (insecure context like http://192.168.x.x),
 * it gracefully falls back to document.execCommand('copy').
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Modern Async Clipboard API (available in HTTPS or localhost)
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // 2. Legacy execCommand Fallback (works in plain HTTP LAN IP)
  try {
    if (typeof document !== "undefined") {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "-9999px";
      textArea.style.left = "-9999px";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    }
  } catch (err) {
    console.warn("Clipboard fallback copy failed:", err);
  }

  return false;
}
