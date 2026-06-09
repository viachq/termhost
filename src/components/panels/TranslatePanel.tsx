import { useState, useCallback, useRef, useEffect } from "react";
import { usePanelStore } from "../../store/panelStore";
import s from "./TranslatePanel.module.css";

type Lang = "uk" | "en" | "auto";

const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "auto", label: "Auto" },
  { code: "uk", label: "UK" },
  { code: "en", label: "EN" },
];

const CYRILLIC_RE = /[Ѐ-ӿ]/;

function detectLang(text: string): "uk" | "en" {
  const sample = text.slice(0, 80);
  let cyr = 0, lat = 0;
  for (const ch of sample) {
    if (CYRILLIC_RE.test(ch)) cyr++;
    else if (/[a-zA-Z]/.test(ch)) lat++;
  }
  return cyr > lat ? "uk" : "en";
}

function resolveTarget(src: Lang, target: Lang): string {
  if (target !== "auto") return target;
  return src === "uk" ? "en" : "uk";
}

async function translateText(text: string, srcLang: Lang, tgtLang: string): Promise<string> {
  const sl = srcLang === "auto" ? "" : srcLang;
  const chunks = splitText(text, 4000);
  const results: string[] = [];

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      client: "gtx",
      sl,
      tl: tgtLang,
      dt: "t",
      q: chunk,
    });
    const resp = await fetch(
      `https://translate.googleapis.com/translate_a/single?${params}`
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const translated = (data[0] as [string, string][])
      .map((seg) => seg[0])
      .join("");
    results.push(translated);
  }

  return results.join("\n");
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf(". ", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt + 1));
    remaining = remaining.slice(splitAt + 1);
  }
  return chunks;
}

interface HistoryEntry {
  src: string;
  result: string;
  srcLang: string;
  tgtLang: string;
}

export default function TranslatePanel({ embedded }: { embedded?: boolean } = {}) {
  const [srcText, setSrcText] = useState("");
  const [resultText, setResultText] = useState("");
  const [srcLang, setSrcLang] = useState<Lang>("auto");
  const [tgtLang, setTgtLang] = useState<Lang>("auto");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [detectedLang, setDetectedLang] = useState<string>("");
  const [autoCopy, setAutoCopy] = useState(false);
  const [srcCollapsed, setSrcCollapsed] = useState(false);
  const [resultCollapsed, setResultCollapsed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const srcRef = useRef<HTMLTextAreaElement>(null);
  const toggleTranslate = usePanelStore((st) => st.toggleTranslate);
  const explorerOpen = usePanelStore((st) => st.explorerOpen);
  const explorerTab = usePanelStore((st) => st.explorerTab);
  const translateOpen = explorerOpen && explorerTab === "translate";

  useEffect(() => {
    srcRef.current?.focus();
  }, []);

  const doTranslate = useCallback(async (text: string, sl: Lang, tl: Lang) => {
    if (!text.trim()) {
      setResultText("");
      setDetectedLang("");
      return;
    }

    const effectiveSrc = sl === "auto" ? detectLang(text) : sl;
    const effectiveTgt = resolveTarget(effectiveSrc, tl);
    setDetectedLang(sl === "auto" ? effectiveSrc.toUpperCase() : "");

    setLoading(true);
    try {
      const result = await translateText(text, effectiveSrc, effectiveTgt);
      setResultText(result);
      setHistory((prev) => {
        const entry: HistoryEntry = {
          src: text.slice(0, 100),
          result: result.slice(0, 100),
          srcLang: effectiveSrc,
          tgtLang: effectiveTgt,
        };
        const next = [entry, ...prev.filter((h) => h.src !== entry.src)];
        return next.slice(0, 30);
      });
    } catch (err) {
      setResultText(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoCopy || !translateOpen) return;
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text && text.trim()) {
        setSrcText(text);
        setSrcCollapsed(false);
        setResultCollapsed(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => doTranslate(text, srcLang, tgtLang), 300);
      }
    };
    window.addEventListener("agentworkspace:terminal-copy", handler);
    return () => window.removeEventListener("agentworkspace:terminal-copy", handler);
  }, [autoCopy, translateOpen, srcLang, tgtLang, doTranslate]);

  const handleSrcChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      setSrcText(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => doTranslate(text, srcLang, tgtLang), 600);
    },
    [srcLang, tgtLang, doTranslate]
  );

  const handleSwap = useCallback(() => {
    const newSrc = resultText;
    const newSrcLang = tgtLang === "auto" ? "auto" as Lang : tgtLang;
    const newTgtLang = srcLang === "auto" ? "auto" as Lang : srcLang;
    setSrcText(newSrc);
    setResultText("");
    setSrcLang(newSrcLang);
    setTgtLang(newTgtLang);
    if (newSrc.trim()) {
      doTranslate(newSrc, newSrcLang, newTgtLang);
    }
  }, [resultText, srcLang, tgtLang, doTranslate]);

  const handleCopy = useCallback(() => {
    if (!resultText) return;
    navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [resultText]);

  const handleClear = useCallback(() => {
    setSrcText("");
    setResultText("");
    setDetectedLang("");
    srcRef.current?.focus();
  }, []);

  const handleSrcLangChange = useCallback(
    (lang: Lang) => {
      setSrcLang(lang);
      if (srcText.trim()) doTranslate(srcText, lang, tgtLang);
    },
    [srcText, tgtLang, doTranslate]
  );

  const handleTgtLangChange = useCallback(
    (lang: Lang) => {
      setTgtLang(lang);
      if (srcText.trim()) doTranslate(srcText, srcLang, lang);
    },
    [srcText, srcLang, doTranslate]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doTranslate(srcText, srcLang, tgtLang);
      }
    },
    [srcText, srcLang, tgtLang, doTranslate]
  );

  const handleHistoryClick = useCallback(
    (entry: HistoryEntry) => {
      setSrcText(entry.src);
      setResultText(entry.result);
      setShowHistory(false);
    },
    []
  );

  const content = (
    <>
      {/* Language bar */}
      <div className={s.langBar}>
        <div className={s.langGroup}>
          {LANGUAGES.map((l) => (
            <button
              key={`src-${l.code}`}
              className={srcLang === l.code ? s.langBtnActive : s.langBtn}
              onClick={() => handleSrcLangChange(l.code)}
            >
              {l.label}
            </button>
          ))}
          {detectedLang && <span className={s.detected}>({detectedLang})</span>}
        </div>
        <button className={s.swapBtn} onClick={handleSwap} title="Swap languages">
          ⇄
        </button>
        <div className={s.langGroup}>
          {LANGUAGES.filter((l) => l.code !== "auto").map((l) => (
            <button
              key={`tgt-${l.code}`}
              className={tgtLang === l.code ? s.langBtnActive : s.langBtn}
              onClick={() => handleTgtLangChange(l.code)}
            >
              {l.label}
            </button>
          ))}
          {tgtLang === "auto" && (
            <button className={s.langBtnActive}>Auto</button>
          )}
        </div>
      </div>

      {/* Auto-copy toggle */}
      <div className={s.autoCopyBar}>
        <label className={s.autoCopyLabel}>
          <input
            type="checkbox"
            checked={autoCopy}
            onChange={(e) => setAutoCopy(e.target.checked)}
            className={s.autoCopyCheckbox}
          />
          Auto-copy from terminal
        </label>
      </div>

      {/* Content */}
      <div className={s.content}>
        <div className={`${s.pane} ${srcCollapsed ? s.paneCollapsed : ""}`}>
          <div className={s.sectionHeader} onClick={() => setSrcCollapsed(!srcCollapsed)}>
            <span className={s.collapseIcon}>{srcCollapsed ? "▸" : "▾"}</span>
            <span className={s.sectionLabel}>Original</span>
          </div>
          {!srcCollapsed && (
            <textarea
              ref={srcRef}
              className={s.textArea}
              value={srcText}
              onChange={handleSrcChange}
              onKeyDown={handleKeyDown}
              placeholder="Type or paste text..."
              spellCheck={false}
            />
          )}
          {srcText && !srcCollapsed && (
            <button className={s.clearBtn} onClick={handleClear} title="Clear">
              ✕
            </button>
          )}
        </div>
        <div className={s.divider} />
        <div className={`${s.pane} ${resultCollapsed ? s.paneCollapsed : ""}`}>
          <div className={s.sectionHeader} onClick={() => setResultCollapsed(!resultCollapsed)}>
            <span className={s.collapseIcon}>{resultCollapsed ? "▸" : "▾"}</span>
            <span className={s.sectionLabel}>Translation</span>
            {loading && <span className={s.spinnerSmall} />}
          </div>
          {!resultCollapsed && (
            <div
              className={`${s.resultArea} ${copied ? s.resultCopied : ""}`}
              onClick={handleCopy}
              title="Click to copy"
            >
              {resultText || (
                <span className={s.placeholder}>Translation will appear here...</span>
              )}
            </div>
          )}
          {resultText && !resultCollapsed && (
            <button className={s.copyBtn} onClick={handleCopy} title="Copy">
              {copied ? "✓" : "⎘"}
            </button>
          )}
        </div>
      </div>

      {/* History dropdown */}
      {showHistory && (
        <div className={s.historyPanel}>
          <div className={s.historyTitle}>Recent translations</div>
          {history.length === 0 ? (
            <div className={s.historyEmpty}>No history yet</div>
          ) : (
            history.map((entry, i) => (
              <div
                key={i}
                className={s.historyItem}
                onClick={() => handleHistoryClick(entry)}
              >
                <span className={s.histLangs}>
                  {entry.srcLang.toUpperCase()}→{entry.tgtLang.toUpperCase()}
                </span>
                <span className={s.histText}>{entry.src}</span>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className={s.panelEmbedded}>{content}</div>;
  }

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <span className={s.title}>Translate</span>
          {loading && <span className={s.spinner} />}
        </div>
        <div className={s.headerRight}>
          <button className={s.histBtn} onClick={() => setShowHistory(!showHistory)} title="History">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.515 1.019A7 7 0 008 15a7 7 0 006.96-6.281.5.5 0 00-.992-.098A6 6 0 118 2c.691 0 1.366.118 2 .337V1.5a.5.5 0 011 0v2a.5.5 0 01-.5.5h-2a.5.5 0 010-1h.965A5.97 5.97 0 008 2.5a5.5 5.5 0 100 11 5.5 5.5 0 005.452-4.769.5.5 0 01.992.098A6.5 6.5 0 018 14a6 6 0 010-12 6.02 6.02 0 01.515.019zM8 4.5a.5.5 0 01.5.5v3.29l2.354 1.177a.5.5 0 01-.448.894l-2.5-1.25A.5.5 0 017.5 8.5V5a.5.5 0 01.5-.5z" />
            </svg>
          </button>
          <button className={s.closeBtn} onClick={toggleTranslate} title="Close">✕</button>
        </div>
      </div>
      {content}
    </div>
  );
}
