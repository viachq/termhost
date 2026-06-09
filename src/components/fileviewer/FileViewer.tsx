import { lazy, Suspense } from "react";
import { useFileViewerStore } from "../../store/fileViewerStore";
import { getFileIcon } from "../../constants/fileIcons";
import MarkdownPreview from "./MarkdownPreview";
import s from "./FileViewer.module.css";

const MonacoEditor = lazy(() => import("./MonacoEditor"));

export default function FileViewer() {
  const fileTabs = useFileViewerStore((st) => st.fileTabs);
  const activeTabId = useFileViewerStore((st) => st.activeTabId);
  const switchToTab = useFileViewerStore((st) => st.switchToTab);
  const closeTab = useFileViewerStore((st) => st.closeTab);
  const closeAll = useFileViewerStore((st) => st.closeAll);

  if (fileTabs.length === 0) return (
    <div className={s.container}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 13 }}>
        Open a file from Files tab
      </div>
    </div>
  );

  const activeTab = fileTabs.find((t) => t.id === activeTabId);

  return (
    <div className={s.container}>
      <div className={s.tabBar}>
        {fileTabs.map((tab) => {
          const icon = getFileIcon(tab.name, false);
          return (
            <div
              key={tab.id}
              className={tab.id === activeTabId ? s.tabActive : s.tab}
              onClick={() => switchToTab(tab.id)}
            >
              <span
                className={s.tabIcon}
                style={{ color: icon.color }}
                dangerouslySetInnerHTML={{ __html: icon.svg }}
              />
              <span>{tab.name}</span>
              <span
                className={s.tabClose}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ✕
              </span>
            </div>
          );
        })}
        <button className={s.closeAll} onClick={closeAll}>
          Close All
        </button>
      </div>
      <div className={s.content}>
        {activeTab &&
          (activeTab.isImage ? (
            <div className={s.imagePreview}>
              <img src={activeTab.content} alt={activeTab.name} />
            </div>
          ) : activeTab.isMd ? (
            <MarkdownPreview content={activeTab.content} filePath={activeTab.path} />
          ) : (
            <Suspense
              fallback={
                <div style={{ padding: 16, color: "var(--text-dim)", fontSize: 13 }}>
                  Loading editor…
                </div>
              }
            >
              <MonacoEditor content={activeTab.content} filename={activeTab.name} />
            </Suspense>
          ))}
      </div>
    </div>
  );
}
