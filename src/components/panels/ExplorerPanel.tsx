import { useCallback, useRef, useEffect } from "react";
import { usePanelStore, type ExplorerTab } from "../../store/panelStore";
import { useFileViewerStore } from "../../store/fileViewerStore";
import { browserHide } from "../../hooks/useTauriIpc";
import FilesContent from "./FilesContent";
import BrowserPanel from "./BrowserPanel";
import TranslatePanel from "./TranslatePanel";
import SettingsPanel from "./SettingsPanel";
import FileViewer from "../fileviewer/FileViewer";
import NoteGraph from "../graph/NoteGraph";
import s from "./Panels.module.css";

const TABS: { key: ExplorerTab; label: string; icon: string }[] = [
  {
    key: "files",
    label: "Files",
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  },
  {
    key: "preview",
    label: "Preview",
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  },
  {
    key: "browser",
    label: "Browser",
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20"/></svg>',
  },
  {
    key: "graph",
    label: "Graph",
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="19" r="2.5"/><line x1="8" y1="7" x2="10.5" y2="17"/><line x1="16" y1="7" x2="13.5" y2="17"/><line x1="8.5" y1="6" x2="15.5" y2="6"/></svg>',
  },
  {
    key: "translate",
    label: "Translate",
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h7M9 3v2M6 5c.6 3.5 2.7 6.5 5 8.5M7 15l4-4"/><path d="M13.5 9l4.5 12M15.7 15h4.6"/></svg>',
  },
  {
    key: "settings",
    label: "Settings",
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  },
];

export default function ExplorerPanel() {
  const explorerTab = usePanelStore((st) => st.explorerTab);
  const explorerWidth = usePanelStore((st) => st.explorerWidth);
  const setExplorerWidth = usePanelStore((st) => st.setExplorerWidth);
  const openExplorer = usePanelStore((st) => st.openExplorer);
  const fileTabs = useFileViewerStore((st) => st.fileTabs);
  const dragRef = useRef(false);
  const prevTabRef = useRef(explorerTab);

  useEffect(() => {
    if (prevTabRef.current === "browser" && explorerTab !== "browser") {
      browserHide().catch(() => {});
    }
    prevTabRef.current = explorerTab;
  }, [explorerTab]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    const startX = e.clientX;
    const startW = usePanelStore.getState().explorerWidth;

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = startX - ev.clientX;
      const newW = Math.max(200, Math.min(800, startW + delta));
      setExplorerWidth(newW);
    };
    const onUp = () => {
      dragRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [setExplorerWidth]);

  return (
    <div className={s.explorerPanel} style={{ width: explorerWidth }}>
      <div className={s.explorerResize} onMouseDown={handleResizeStart} />
      <div className={s.explorerTabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`${s.explorerTab} ${explorerTab === t.key ? s.explorerTabActive : ""}`}
            onClick={() => openExplorer(t.key)}
            title={t.label}
          >
            <span dangerouslySetInnerHTML={{ __html: t.icon }} />
            <span className={s.explorerTabLabel}>{t.label}</span>
            {t.key === "preview" && fileTabs.length > 0 && (
              <span className={s.explorerBadge}>{fileTabs.length}</span>
            )}
          </button>
        ))}
      </div>
      <div className={s.explorerContent}>
        {explorerTab === "files" && <FilesContent />}
        {explorerTab === "preview" && <FileViewer />}
        {explorerTab === "browser" && <BrowserPanel embedded />}
        {explorerTab === "graph" && <NoteGraph embedded />}
        {explorerTab === "translate" && <TranslatePanel embedded />}
        {explorerTab === "settings" && <SettingsPanel embedded />}
      </div>
    </div>
  );
}
