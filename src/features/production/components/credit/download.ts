/**
 * Saves generated text (CSV export / template) as a file. UTF-8 with BOM so Excel opens
 * Vietnamese text correctly.
 */
export const downloadText = (fileName: string, text: string, type = "text/csv;charset=utf-8") => {
  const blob = new Blob(["﻿", text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
