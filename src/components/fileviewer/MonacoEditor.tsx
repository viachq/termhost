import { useEffect, useRef } from "react";
import { useSettingsStore } from "../../store/settingsStore";
import { useFileViewerStore } from "../../store/fileViewerStore";
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
  tabId: string;
  content: string;
  filename: string;
  gotoLine?: number;
}

export default function MonacoEditor({ tabId, content, filename, gotoLine }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const savedContentRef = useRef(content);

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
      const initial = useFileViewerStore.getState().fileTabs.find((t) => t.id === tabId)?.content ?? content;
      savedContentRef.current = initial;

      const editor = monaco.editor.create(containerRef.current, {
        value: initial,
        language,
        theme: uiTheme !== "dark" ? "vs" : "vs-dark",
        fontSize: 14,
        fontFamily: termFontFamily,
        minimap: { enabled: false },
        readOnly: false,
        automaticLayout: true,
      });
      editorRef.current = editor;

      editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        useFileViewerStore.getState().updateContent(tabId, value, value !== savedContentRef.current);
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
        const value = editor.getValue();
        try {
          await useFileViewerStore.getState().saveTab(tabId, value);
          savedContentRef.current = value;
        } catch (e) {
          console.error("Save failed:", e);
        }
      });
    })();

    return () => {
      disposed = true;
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, [tabId, language]);

  useEffect(() => {
    if (!gotoLine) return;
    const t = setInterval(() => {
      if (!editorRef.current) return;
      editorRef.current.revealLineInCenter(gotoLine);
      editorRef.current.setPosition({ lineNumber: gotoLine, column: 1 });
      editorRef.current.focus();
      useFileViewerStore.getState().clearGotoLine(tabId);
      clearInterval(t);
    }, 50);
    return () => clearInterval(t);
  }, [gotoLine, tabId]);

  useEffect(() => {
    const unsub = useSettingsStore.subscribe((state) => {
      if (!editorRef.current) return;
      import("monaco-editor").then((monaco) => {
        monaco.editor.setTheme(state.uiTheme !== "dark" ? "vs" : "vs-dark");
        editorRef.current?.updateOptions({ fontFamily: state.termFontFamily });
      });
    });
    return unsub;
  }, []);

  return <div ref={containerRef} className={s.editorWrap} />;
}
