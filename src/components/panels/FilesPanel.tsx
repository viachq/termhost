import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useFileBrowserStore } from "../../store/fileBrowserStore";
import type { FlatTreeEntry } from "../../store/fileBrowserStore";
import { useFileViewerStore } from "../../store/fileViewerStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { openFolder, writeTerminal } from "../../hooks/useTauriIpc";
import { useTerminalStore } from "../../store/terminalStore";
import { getFileIcon, FILE_ICON_SVG } from "../../constants/fileIcons";
import s from "./Panels.module.css";

const BOOKMARKS_HIDDEN_KEY = "agentworkspace-bookmarks-hidden";

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function formatDate(epochSecs: number): string {
  if (!epochSecs) return "";
  const d = new Date(epochSecs * 1000);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
}

const CHEVRON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>`;

export default function FilesPanel() {
  const currentPath = useFileBrowserStore((st) => st.currentBrowsePath);
  const setCurrentPath = useFileBrowserStore((st) => st.setCurrentBrowsePath);
  const detectedDrives = useFileBrowserStore((st) => st.detectedDrives);
  const detectDrives = useFileBrowserStore((st) => st.detectDrives);
  const bookmarks = useFileBrowserStore((st) => st.bookmarks);
  const toggleBookmark = useFileBrowserStore((st) => st.toggleBookmark);
  const removeBookmark = useFileBrowserStore((st) => st.removeBookmark);
  const selectedPaths = useFileBrowserStore((st) => st.selectedPaths);
  const setSelectedPaths = useFileBrowserStore((st) => st.setSelectedPaths);
  const lastSelectedIndex = useFileBrowserStore((st) => st.lastSelectedIndex);
  const setLastSelectedIndex = useFileBrowserStore((st) => st.setLastSelectedIndex);
  const toggleExpand = useFileBrowserStore((st) => st.toggleExpand);
  const collapseAll = useFileBrowserStore((st) => st.collapseAll);
  const loadRoot = useFileBrowserStore((st) => st.loadRoot);
  const rootEntries = useFileBrowserStore((st) => st.rootEntries);
  const expandedPaths = useFileBrowserStore((st) => st.expandedPaths);
  const dirCache = useFileBrowserStore((st) => st.dirCache);
  const homeDir = useWorkspaceStore((st) => st.homeDir);
  const openFile = useFileViewerStore((st) => st.openFile);

  const [filter, setFilter] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [bookmarksHidden, setBookmarksHidden] = useState(() => {
    try {
      return localStorage.getItem(BOOKMARKS_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const breadcrumbRef = useRef<HTMLDivElement>(null);
  const fileTreeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    detectDrives();
  }, [detectDrives]);

  useEffect(() => {
    const path = currentPath || homeDir || "C:\\";
    if (!currentPath && path) {
      setCurrentPath(path);
    }
  }, [currentPath, homeDir, setCurrentPath]);

  useEffect(() => {
    if (currentPath) loadRoot(currentPath);
  }, [currentPath]);

  const flatTree = useMemo(
    () => useFileBrowserStore.getState().getFlatTree(),
    [rootEntries, expandedPaths, dirCache]
  );

  const filtered: FlatTreeEntry[] = useMemo(() => {
    if (!filter) return flatTree;
    const lf = filter.toLowerCase();
    return flatTree.filter((item) =>
      item.entry.name.toLowerCase().includes(lf)
    );
  }, [flatTree, filter]);

  const navigateTo = useCallback(
    (path: string) => {
      setCurrentPath(path);
      setFilter("");
      setHighlightIndex(-1);
    },
    [setCurrentPath]
  );

  const handleFileClick = useCallback(
    (entry: { path: string; is_dir: boolean }) => {
      if (entry.is_dir) {
        toggleExpand(entry.path);
      } else {
        openFile(entry.path);
      }
    },
    [toggleExpand, openFile]
  );

  const handleItemClick = useCallback(
    (e: React.MouseEvent, item: FlatTreeEntry, index: number) => {
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(selectedPaths);
        if (next.has(item.entry.path)) {
          next.delete(item.entry.path);
        } else {
          next.add(item.entry.path);
        }
        setSelectedPaths(next);
        setLastSelectedIndex(index);
        return;
      }
      if (e.shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const next = new Set(selectedPaths);
        for (let i = start; i <= end; i++) {
          if (filtered[i]) next.add(filtered[i].entry.path);
        }
        setSelectedPaths(next);
        return;
      }
      setSelectedPaths(new Set());
      setLastSelectedIndex(index);
      handleFileClick(item.entry);
    },
    [selectedPaths, lastSelectedIndex, filtered, handleFileClick, setSelectedPaths, setLastSelectedIndex]
  );

  const handleItemDoubleClick = useCallback(
    (item: FlatTreeEntry) => {
      if (item.entry.is_dir) {
        navigateTo(item.entry.path);
      }
    },
    [navigateTo]
  );

  const copyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
    setCopyFeedback(path);
    setTimeout(() => setCopyFeedback(null), 1200);
  }, []);

  const parentPath = currentPath ? currentPath.replace(/\\[^\\]+$/, "") || "C:\\" : null;
  const showParent = parentPath && parentPath !== currentPath;

  const parts = currentPath ? currentPath.split("\\").filter(Boolean) : [];

  useEffect(() => {
    if (breadcrumbRef.current) {
      breadcrumbRef.current.scrollLeft = breadcrumbRef.current.scrollWidth;
    }
  }, [currentPath]);

  useEffect(() => {
    try {
      localStorage.setItem(BOOKMARKS_HIDDEN_KEY, bookmarksHidden ? "1" : "0");
    } catch {
      // ignore localStorage write failures
    }
  }, [bookmarksHidden]);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [filter]);

  const scrollToHighlighted = useCallback((idx: number) => {
    if (!fileTreeRef.current) return;
    const items = fileTreeRef.current.querySelectorAll("[data-file-index]");
    const item = items[idx + (showParent ? 1 : 0)] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [showParent]);

  const handleFilterKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(highlightIndex + 1, filtered.length - 1);
        setHighlightIndex(next);
        scrollToHighlighted(next);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(highlightIndex - 1, showParent ? -1 : 0);
        setHighlightIndex(next);
        scrollToHighlighted(next);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightIndex === -1 && showParent && parentPath) {
          navigateTo(parentPath);
        } else if (highlightIndex >= 0 && filtered[highlightIndex]) {
          handleFileClick(filtered[highlightIndex].entry);
        }
      } else if (e.key === "Escape") {
        setFilter("");
        setHighlightIndex(-1);
      }
    },
    [highlightIndex, filtered, showParent, parentPath, navigateTo, handleFileClick, scrollToHighlighted]
  );

  const isBookmarked = bookmarks.includes(currentPath);

  return (
    <div className={s.filesPanel}>
      <div className={s.filesPanelHeader}>
        <input
          className={s.filesSearch}
          placeholder="Filter files…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={handleFilterKeyDown}
          spellCheck={false}
        />
        <button
          className={s.headerBtn}
          title={isBookmarked ? "Remove bookmark" : "Bookmark this folder"}
          onClick={() => toggleBookmark(currentPath)}
          style={{ color: isBookmarked ? "var(--accent)" : undefined }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
            <path d="M3 1.5A1.5 1.5 0 014.5 0h7A1.5 1.5 0 0113 1.5v13.25a.25.25 0 01-.4.2L8 11.5l-4.6 3.45a.25.25 0 01-.4-.2V1.5z"/>
          </svg>
        </button>
        {bookmarks.length > 0 && (
          <button
            className={s.headerBtn}
            title={bookmarksHidden ? "Show saved folders" : "Hide saved folders"}
            onClick={() => setBookmarksHidden((prev) => !prev)}
            style={{ color: !bookmarksHidden ? "var(--accent)" : undefined }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.75 4.75h10.5" />
              <path d="M2.75 8h10.5" />
              <path d="M2.75 11.25h7.5" />
            </svg>
          </button>
        )}
        <button
          className={s.headerBtn}
          title="Collapse all"
          onClick={collapseAll}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6l4-3 4 3M4 10l4 3 4-3"/>
          </svg>
        </button>
        <button
          className={s.headerBtn}
          title="Open in Terminal"
          onClick={() => {
            const id = useTerminalStore.getState().focusedTerminalId;
            if (id && currentPath) {
              writeTerminal(id, `cd "${currentPath}"\r`);
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="14" height="14" rx="2"/>
            <polyline points="4,5 7,8 4,11"/>
            <line x1="9" y1="11" x2="12" y2="11"/>
          </svg>
        </button>
        <button
          className={s.headerBtn}
          title="Open in Explorer"
          onClick={() => { if (currentPath) openFolder(currentPath); }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3.5A1.5 1.5 0 012.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/>
          </svg>
        </button>
      </div>

      {!bookmarksHidden && bookmarks.length > 0 && (
        <div className={s.bookmarks}>
          {bookmarks.map((bm) => {
            return (
              <div
                key={bm}
                className={s.bookmarkItem}
                onClick={() => navigateTo(bm)}
                title={bm}
              >
                <span className={s.fileIcon} style={{ color: "#e94560" }} dangerouslySetInnerHTML={{ __html: FILE_ICON_SVG.folder }} />
                <span className={s.bookmarkPath}>{bm}</span>
                <button
                  className={s.bookmarkRemove}
                  onClick={(e) => { e.stopPropagation(); removeBookmark(bm); }}
                  title="Remove bookmark"
                >
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l8 8M11 3l-8 8" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {detectedDrives.length > 1 && (
        <div className={s.driveBar}>
          {detectedDrives.map((d) => (
            <button
              key={d}
              className={
                currentPath.toUpperCase().startsWith(d.toUpperCase())
                  ? s.driveBtnActive
                  : s.driveBtn
              }
              onClick={() => navigateTo(`${d}\\`)}
            >
              {d}\
            </button>
          ))}
        </div>
      )}

      <div className={s.breadcrumb} ref={breadcrumbRef}>
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 && <span className={s.breadcrumbSep}>›</span>}
            <span
              className={`${s.breadcrumbSeg} ${i === parts.length - 1 ? s.breadcrumbCurrent : ""}`}
              onClick={
                i < parts.length - 1
                  ? () => navigateTo(parts.slice(0, i + 1).join("\\"))
                  : undefined
              }
            >
              {part}
            </span>
          </span>
        ))}
      </div>

      <div className={s.fileTree} ref={fileTreeRef}>
        {showParent && (
          <div
            className={`${s.fileItemDir} ${highlightIndex === -1 && filter ? s.fileItemHighlight : ""}`}
            data-file-index="-1"
            onClick={() => navigateTo(parentPath)}
          >
            <span className={s.treeChevronHidden} />
            <span
              className={s.fileIcon}
              style={{ color: "#6a6a6a" }}
              dangerouslySetInnerHTML={{ __html: FILE_ICON_SVG.up }}
            />
            <span className={s.fileName}>..</span>
          </div>
        )}
        {filtered.length === 0 && !showParent && (
          <div className={s.filesEmpty}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            <span>{filter ? "No matching files" : "Empty folder"}</span>
          </div>
        )}
        {filtered.map((item, index) => {
          const { entry, depth, expanded } = item;
          const icon = getFileIcon(entry.name, entry.is_dir);
          const isSelected = selectedPaths.has(entry.path);
          const isHighlighted = highlightIndex === index;
          const isCopied = copyFeedback === entry.path;
          const indent = filter ? 0 : depth * 16;
          return (
            <div
              key={entry.path}
              data-file-index={index}
              className={`${entry.is_dir ? s.fileItemDir : s.fileItem} ${isSelected ? s.fileItemSelected : ""} ${isHighlighted ? s.fileItemHighlight : ""}`}
              style={{ paddingLeft: 8 + indent }}
              onClick={(e) => handleItemClick(e, item, index)}
              onDoubleClick={() => handleItemDoubleClick(item)}
              draggable
              onDragStart={(e) => {
                const paths = selectedPaths.size > 0 && selectedPaths.has(entry.path)
                  ? Array.from(selectedPaths).join("\n")
                  : entry.path;
                e.dataTransfer.setData("text/plain", paths);
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              {entry.is_dir ? (
                <span
                  className={expanded ? s.treeChevronOpen : s.treeChevron}
                  dangerouslySetInnerHTML={{ __html: CHEVRON_SVG }}
                />
              ) : (
                <span className={s.treeChevronHidden} />
              )}
              <span
                className={s.fileIcon}
                style={{ color: icon.color }}
                dangerouslySetInnerHTML={{ __html: icon.svg }}
              />
              <span className={s.fileName}>{entry.name}</span>
              <span className={s.fileMeta}>
                {!entry.is_dir && <span>{formatSize(entry.size)}</span>}
                <span>{formatDate(entry.modified)}</span>
              </span>
              <button
                className={s.fileCopy}
                title={isCopied ? "Copied!" : "Copy path"}
                onClick={(e) => { e.stopPropagation(); copyPath(entry.path); }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  {isCopied
                    ? <path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z"/>
                    : <path d="M4 1.5H3a2 2 0 00-2 2V14a2 2 0 002 2h6.5a2 2 0 002-2V13h-1v1a1 1 0 01-1 1H3a1 1 0 01-1-1V3.5a1 1 0 011-1h1v-1zM6.5 0A1.5 1.5 0 005 1.5v9A1.5 1.5 0 006.5 12h6a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0012.5 0h-6zM6 1.5a.5.5 0 01.5-.5h6a.5.5 0 01.5.5v9a.5.5 0 01-.5.5h-6a.5.5 0 01-.5-.5v-9z"/>
                  }
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
