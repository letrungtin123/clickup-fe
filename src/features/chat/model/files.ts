/** Human file sizes: "820 B", "4.2 KB", "12 MB". */
export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};

export type FileKind = "image" | "video" | "audio" | "archive" | "sheet" | "document" | "other";

export const fileKindOf = (mimeType: string, fileName: string): FileKind => {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (/zip|rar|7z|tar|gzip/.test(mimeType) || ["zip", "rar", "7z", "gz", "tar"].includes(ext)) {
    return "archive";
  }
  if (/sheet|excel|csv/.test(mimeType) || ["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  if (/pdf|word|text|document|presentation/.test(mimeType) || ["pdf", "doc", "docx", "txt", "md"].includes(ext)) {
    return "document";
  }
  return "other";
};
