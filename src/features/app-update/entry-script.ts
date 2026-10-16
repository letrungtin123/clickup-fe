/**
 * The SPA entry chunk named by an index.html ("/assets/index-<hash>.js"): a deploy changes it. Pure helper of the
 * update notice (update-runtime.tsx), unit-tested.
 */
export const entryScriptOf = (html: string): string | null => {
  const match =
    /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/i.exec(html) ??
    /<script[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"[^>]*type="module"/i.exec(html);
  return match?.[1] ? new URL(match[1], "http://x").pathname : null;
};

/** The entry chunk this tab runs (null in the dev server, which serves /src/main.tsx). */
export const currentEntryScript = (doc: Document = document): string | null => {
  const script = doc.querySelector<HTMLScriptElement>(
    'script[type="module"][src*="/assets/index-"]'
  );
  return script ? new URL(script.src, "http://x").pathname : null;
};

/** How often an open tab asks whether a new version was deployed (also on focus / becoming visible). */
export const UPDATE_CHECK_MS = 3 * 60_000;
