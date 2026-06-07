import { useState, useCallback, useRef, useEffect } from "react";
import {
  browserOpen,
  browserResize,
  browserClose,
  browserHide,
} from "../../hooks/useTauriIpc";
import { useBrowserStore } from "../../store/browserStore";
import { terminalRefs } from "../../store/terminalStore";
import s from "./Panels.module.css";

function normalizeUrl(input: string): string {
  if (!input) return "";
  if (!input.startsWith("http://") && !input.startsWith("https://")) {
    return "https://" + input;
  }
  return input;
}

export default function BrowserPanel({ embedded }: { embedded?: boolean }) {
  const [urlInput, setUrlInput] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const tabs = useBrowserStore((st) => st.tabs);
  const activeTabId = useBrowserStore((st) => st.activeTabId);
  const history = useBrowserStore((st) => st.history);
  const addTab = useBrowserStore((st) => st.addTab);
  const closeTab = useBrowserStore((st) => st.closeTab);
  const setActiveTab = useBrowserStore((st) => st.setActiveTab);
  const navigateTab = useBrowserStore((st) => st.navigateTab);

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;
  const activeUrl = activeTab?.url || "";

  useEffect(() => {
    if (activeTab) {
      setUrlInput(activeTab.url);
    } else {
      setUrlInput("");
    }
  }, [activeTabId]);

  const getRect = useCallback(() => {
    if (!panelRef.current) return null;
    const panelRect = panelRef.current.getBoundingClientRect();
    const toolbarH = toolbarRef.current?.getBoundingClientRect().height ?? 32;
    return {
      x: panelRect.left,
      y: panelRect.top + toolbarH,
      width: panelRect.width,
      height: panelRect.height - toolbarH,
    };
  }, []);

  const showWebview = useCallback(async (url: string) => {
    const rect = getRect();
    if (!rect || !url) return;
    try {
      await browserOpen(url, rect.x, rect.y, rect.width, rect.height);
    } catch (e) {
      console.error("Browser open error:", e);
    }
  }, [getRect]);

  const navigate = useCallback(
    async (targetUrl: string) => {
      if (!targetUrl) return;
      const normalized = normalizeUrl(targetUrl);
      setUrlInput(normalized);

      if (activeTabId) {
        navigateTab(activeTabId, normalized);
      } else {
        addTab(normalized);
      }

      await showWebview(normalized);
    },
    [activeTabId, navigateTab, addTab, showWebview]
  );

  const handleTabClick = useCallback(
    async (tabId: string) => {
      setActiveTab(tabId);
      const tab = useBrowserStore.getState().tabs.find((t) => t.id === tabId);
      if (tab?.url) {
        setUrlInput(tab.url);
        await showWebview(tab.url);
      } else {
        await browserHide().catch(() => {});
      }
    },
    [setActiveTab, showWebview]
  );

  const handleNewTab = useCallback(async () => {
    addTab();
    setUrlInput("");
    await browserHide().catch(() => {});
    setTimeout(() => urlRef.current?.focus(), 50);
  }, [addTab]);

  const handleCloseTab = useCallback(
    async (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      closeTab(tabId);
      const state = useBrowserStore.getState();
      if (state.tabs.length === 0) {
        await browserClose().catch(() => {});
      } else {
        const nextTab = state.tabs.find((t) => t.id === state.activeTabId);
        if (nextTab?.url) {
          await showWebview(nextTab.url);
        } else {
          await browserHide().catch(() => {});
        }
      }
    },
    [closeTab, showWebview]
  );

  const handleReload = useCallback(() => {
    if (activeUrl) showWebview(activeUrl);
  }, [activeUrl, showWebview]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") navigate(urlInput);
    },
    [urlInput, navigate]
  );

  useEffect(() => {
    if (activeUrl) {
      requestAnimationFrame(() => showWebview(activeUrl));
    }
    return () => {
      browserHide().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!panelRef.current || !activeUrl) return;
    let timer: ReturnType<typeof setTimeout>;
    const obs = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!activeUrl) return;
        const rect = getRect();
        if (rect) {
          await browserResize(rect.x, rect.y, rect.width, rect.height).catch(() => {});
        }
      }, 50);
    });
    obs.observe(panelRef.current);
    return () => {
      obs.disconnect();
      clearTimeout(timer);
    };
  }, [activeUrl, getRect]);

  const hasActiveUrl = !!activeUrl;

  const content = (
    <>
      {/* Browser tabs bar */}
      <div className={s.browserTabsBar}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`${s.browserTabItem} ${tab.id === activeTabId ? s.browserTabItemActive : ""}`}
            onClick={() => handleTabClick(tab.id)}
            title={tab.url || "New Tab"}
          >
            <span className={s.browserTabTitle}>{tab.title || "New Tab"}</span>
            <button
              className={s.browserTabClose}
              onClick={(e) => handleCloseTab(e, tab.id)}
            >
              ✕
            </button>
          </div>
        ))}
        <button className={s.browserTabAdd} onClick={handleNewTab} title="New tab">
          +
        </button>
      </div>

      {/* Toolbar */}
      <div className={s.browserToolbar} ref={toolbarRef}>
        <input
          ref={urlRef}
          className={s.browserUrl}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL…"
          spellCheck={false}
        />
        <button className={s.browserBtn} onClick={() => navigate(urlInput)}>
          Go
        </button>
        <button className={s.browserBtn} onClick={handleReload}>
          ↻
        </button>
      </div>

      {hasActiveUrl ? (
        <div className={s.browserContent} />
      ) : (
        <div className={s.browserLanding}>
          <div className={s.browserLandingInner}>
            <svg className={s.browserLandingIcon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <ellipse cx="12" cy="12" rx="4" ry="10"/>
              <path d="M2 12h20"/>
            </svg>
            <h3 className={s.browserLandingTitle}>Browser</h3>
            <p className={s.browserLandingDesc}>Enter a URL above or open a recent page</p>
            <button className={s.browserLandingBtn} onClick={() => urlRef.current?.focus()}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2v8M2 6h8"/></svg>
              New tab
            </button>
            {history.length > 0 && (
              <div className={s.browserHistory}>
                <span className={s.browserHistoryLabel}>Recently opened</span>
                {history.slice(0, 8).map((u) => (
                  <button key={u} className={s.browserHistoryItem} onClick={() => navigate(u)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20"/>
                    </svg>
                    <span className={s.browserHistoryUrl}>{u.replace(/^https?:\/\//, "")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div ref={panelRef} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>{content}</div>;
  }

  return (
    <div className={s.browserPanel} ref={panelRef}>
      {content}
    </div>
  );
}
