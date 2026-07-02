import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
// "diff" is registered as a side effect of importing FilePreview (always
// loaded alongside this component from FilesPage) — no need to re-register.

interface Props {
  diff: string | null;
  loading: boolean;
}

export function GitDiffView({ diff, loading }: Props) {
  const html = useMemo(() => {
    if (!diff) return "";
    if (hljs.getLanguage("diff")) {
      return hljs.highlight(diff, { language: "diff" }).value;
    }
    return diff.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }, [diff]);

  if (loading) return <div className="mp-loading">Loading diff…</div>;
  if (diff === null) return <div className="mp-error">Failed to load diff</div>;
  if (diff === "") return <div className="mp-loading">No changes (file may be untracked or binary)</div>;

  return (
    <pre className="mp-code-block">
      <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
