import { useState, useCallback } from "react";

interface UseCopyToClipboardReturn {
  copied: boolean;
  copyToClipboard: (text: string) => Promise<void>;
}

export const useCopyToClipboard = (
  resetDelay: number = 2000
): UseCopyToClipboardReturn => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          document.execCommand("copy");
          setCopied(true);
        } catch (err) {
          console.error("Failed to copy text: ", err);
          setCopied(false);
        } finally {
          document.body.removeChild(textArea);
        }
      }

      // Reset the copied state after the specified delay
      setTimeout(() => {
        setCopied(false);
      }, resetDelay);
    },
    [resetDelay]
  );

  return { copied, copyToClipboard };
};
