import { useMemo } from "react";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import markdownLang from "highlight.js/lib/languages/markdown";
import sql from "highlight.js/lib/languages/sql";
import csharp from "highlight.js/lib/languages/csharp";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import diff from "highlight.js/lib/languages/diff";
import ini from "highlight.js/lib/languages/ini";
import powershell from "highlight.js/lib/languages/powershell";
import { apiQuery, apiOrigin } from "../api";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("zsh", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("scss", css);
hljs.registerLanguage("less", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("svg", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("markdown", markdownLang);
hljs.registerLanguage("md", markdownLang);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("cs", csharp);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("kt", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c", cpp);
hljs.registerLanguage("h", cpp);
hljs.registerLanguage("hpp", cpp);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("patch", diff);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("toml", ini);
hljs.registerLanguage("cfg", ini);
hljs.registerLanguage("conf", ini);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("ps1", powershell);

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string | null }) {
      let highlighted: string;
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(text, { language: lang }).value;
      } else {
        try {
          highlighted = hljs.highlightAuto(text).value;
        } catch {
          highlighted = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
      }
      const langLabel = lang ? `<span class="mp-code-lang">${lang}</span>` : "";
      return `<pre class="mp-code-block">${langLabel}<code class="hljs">${highlighted}</code></pre>`;
    },
  },
});
marked.setOptions({ breaks: true, gfm: true });

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico",
]);

interface FilePreviewProps {
  host: string;
  path: string;
  content: string | null;
  loading: boolean;
  error: string | null;
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
}

function isImage(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTENSIONS.has(ext);
}

function isSvg(name: string): boolean {
  return name.toLowerCase().endsWith(".svg");
}

function isMarkdown(name: string): boolean {
  return name.toLowerCase().endsWith(".md");
}

function highlightCode(content: string, fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext && hljs.getLanguage(ext)) {
    return hljs.highlight(content, { language: ext }).value;
  }
  try {
    return hljs.highlightAuto(content).value;
  } catch {
    return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

export function FilePreview({
  host,
  path,
  content,
  loading,
  error,
  editing,
  draft,
  onDraftChange,
}: FilePreviewProps) {
  const fileName = path.split("\\").pop()?.split("/").pop() || path;

  const isImg = isImage(fileName);
  const isMd = isMarkdown(fileName);

  const renderedContent = useMemo(() => {
    if (!content) return "";
    if (isMd) return marked.parse(content) as string;
    return highlightCode(content, fileName);
  }, [content, fileName, isMd]);

  const rawUrl = `${apiOrigin(host)}/api/raw${apiQuery({ path })}`;

  if (loading) {
    return <div className="mp-loading">Loading...</div>;
  }

  if (error) {
    return (
      <div className="mp-error">
        <p>{error}</p>
      </div>
    );
  }

  if (editing) {
    return (
      <textarea
        className="mp-editor"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
    );
  }

  if (isImg || isSvg(fileName)) {
    return (
      <div className="mp-image-container">
        <img
          className="mp-image"
          src={rawUrl}
          alt={fileName}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
            const parent = (e.target as HTMLImageElement).parentElement;
            if (parent) {
              const errMsg = document.createElement("p");
              errMsg.className = "mp-error";
              errMsg.textContent = "Failed to load image";
              parent.appendChild(errMsg);
            }
          }}
        />
      </div>
    );
  }

  if (isMd) {
    return (
      <div className="mp-markdown" dangerouslySetInnerHTML={{ __html: renderedContent }} />
    );
  }

  if (content !== null) {
    return (
      <pre className="mp-code-block">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: renderedContent }} />
      </pre>
    );
  }

  return (
    <div className="mp-unsupported">
      <p>Cannot preview {fileName}</p>
      <a
        className="mp-download-link"
        href={rawUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={fileName}
      >
        Download file
      </a>
    </div>
  );
}
