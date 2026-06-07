import { useEffect, useRef } from "react";
import { useSettingsStore } from "../../store/settingsStore";
import s from "./FileViewer.module.css";

const LANG_MAP: Record<string, string> = {
  js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
  py: "python", rs: "rust", go: "go", java: "java", cs: "csharp",
  css: "css", html: "html", json: "json", md: "markdown",
  yaml: "yaml", yml: "yaml", toml: "ini", xml: "xml",
  sh: "shell", ps1: "powershell", sql: "sql",
  cpp: "cpp", c: "c", h: "c", hpp: "cpp",
};

interface Props {
  content: string;
  filename: string;
}

export default function MonacoEditor({ content, filename }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);

  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const language = LANG_MAP[ext] || "plaintext";

  useEffect(() => {
    let disposed = false;

    (async () => {
      const monaco = await import("monaco-editor");
      if (disposed) return;

      if (!self.MonacoEnvironment) {
        self.MonacoEnvironment = {
          getWorker: () =>
            new Worker(
              new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
              { type: "module" }
            ),
        };
      }

      if (!containerRef.current) return;

      const { uiTheme, termFontFamily } = useSettingsStore.getState();

      editorRef.current = monaco.editor.create(containerRef.current, {
        value: content,
        language,
        theme: uiTheme === "light" ? "vs" : "vs-dark",
        fontSize: 14,
        fontFamily: termFontFamily,
        minimap: { enabled: false },
        readOnly: true,
        automaticLayout: true,
      });
    })();

    return () => {
      disposed = true;
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, [content, language]);

  useEffect(() => {
    const unsub = useSettingsStore.subscribe((state) => {
      if (!editorRef.current) return;
      import("monaco-editor").then((monaco) => {
        monaco.editor.setTheme(state.uiTheme === "light" ? "vs" : "vs-dark");
        editorRef.current?.updateOptions({ fontFamily: state.termFontFamily });
      });
    });
    return unsub;
  }, []);

  return <div ref={containerRef} className={s.editorWrap} />;
}
