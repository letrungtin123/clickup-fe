import { memo } from "react";

import { highlightSegments } from "../model";

/** Renders `text` with the parts matching `query` emphasised (accent/case-insensitive). */
export const Highlight = memo(function Highlight({
  text,
  query
}: {
  text: string;
  query: string;
}) {
  const segments = highlightSegments(text, query);
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            className="rounded-[3px] bg-warning-soft px-px text-foreground [box-decoration-break:clone]"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  );
});
