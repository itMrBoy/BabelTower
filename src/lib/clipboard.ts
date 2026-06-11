"use client";

function copyViaExecCommand(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * 复制文本到剪贴板，成功返回 true。
 * navigator.clipboard 仅在安全上下文（HTTPS / localhost）下存在；
 * 生产为 HTTP + IP 直访形态，需降级为 execCommand("copy")。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 安全上下文下也可能因权限被拒，继续走降级路径。
    }
  }
  return copyViaExecCommand(text);
}
