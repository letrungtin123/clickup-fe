import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo
} from "lucide-react";

import { fileKindOf } from "../model/files";

/** Icon for a file by MIME type / extension. */
export const FileTypeIcon = ({
  mimeType,
  fileName,
  className
}: {
  mimeType: string;
  fileName: string;
  className?: string;
}) => {
  const props = { className, "aria-hidden": true } as const;
  switch (fileKindOf(mimeType, fileName)) {
    case "image":
      return <FileImage {...props} />;
    case "video":
      return <FileVideo {...props} />;
    case "audio":
      return <FileAudio {...props} />;
    case "archive":
      return <FileArchive {...props} />;
    case "sheet":
      return <FileSpreadsheet {...props} />;
    case "document":
      return <FileText {...props} />;
    default:
      return <File {...props} />;
  }
};
