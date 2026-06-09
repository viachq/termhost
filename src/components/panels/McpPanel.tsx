import { useState, useEffect, useCallback } from "react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { readFile, writeFile } from "../../hooks/useTauriIpc";
import s from "./Panels.module.css";

interface McpServer {
  name: string;
  fullName: string;
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
  source: "claude-settings" | "claude-mcp-json" | "codex-toml";
  sourcePath: string;
}

interface PluginEntry {
  name: string;
  fullName: string;
  version?: string;
  enabled: boolean;
  source: "claude" | "codex";
  sourcePath: string;
}

interface SkillEntry {
  name: string;
  system?: boolean;
}

interface CloudService {
  name: string;
}

interface ToolData {
  mcpServers: McpServer[];
  plugins: PluginEntry[];
  skills: SkillEntry[];
  cloudServices: CloudService[];
  projectMcp: { cwd: string; servers: McpServer[] }[];
}

async function tryRead(path: string): Promise<string | null> {
  try { return await readFile(path); } catch { return null; }
}

function np(p: string) { return p.replace(/\//g, "\\"); }

function maskSecrets(text: string): string {
  return text
    .replace(/(--api-key\s+)\S+/gi, "$1***")
    .replace(/(--token\s+)\S+/gi, "$1***")
    .replace(/(bearer\s+)\S+/gi, "$1***");
}

function shortenCommand(cmd: string, args?: string[]): string {
  let full = cmd;
  if (args?.length) full += " " + args.join(" ");
  full = maskSecrets(full);
  return full;
}

// --- Toggle logic ---

async function toggleClaudeMcpServer(srv: McpServer, enabled: boolean) {
  const raw = await tryRead(srv.sourcePath);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.mcpServers?.[srv.fullName]) {
      data.mcpServers[srv.fullName].disabled = !enabled;
    }
    await writeFile(srv.sourcePath, JSON.stringify(data, null, 2));
  } catch {}
}

async function toggleClaudeMcpJsonServer(srv: McpServer, enabled: boolean) {
  const raw = await tryRead(srv.sourcePath);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    const servers = data.mcpServers || data;
    if (servers[srv.fullName]) {
      servers[srv.fullName].disabled = !enabled;
    }
    await writeFile(srv.sourcePath, JSON.stringify(data, null, 2));
  } catch {}
}

async function toggleClaudePlugin(plugin: PluginEntry, enabled: boolean) {
  const raw = await tryRead(plugin.sourcePath);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (!data.enabledPlugins) data.enabledPlugins = {};
    data.enabledPlugins[plugin.fullName] = enabled;
    await writeFile(plugin.sourcePath, JSON.stringify(data, null, 2));
  } catch {}
}

async function toggleCodexMcpServer(srv: McpServer, enabled: boolean) {
  const raw = await tryRead(srv.sourcePath);
  if (!raw) return;
  const sectionHeader = `[mcp_servers.${srv.fullName}]`;
  const idx = raw.indexOf(sectionHeader);
  if (idx === -1) return;
  const afterHeader = idx + sectionHeader.length;
  const nextSection = raw.indexOf("\n[", afterHeader + 1);
  const blockEnd = nextSection !== -1 ? nextSection : raw.length;
  const block = raw.slice(afterHeader, blockEnd);
  const enabledRegex = /^enabled\s*=\s*(true|false)/m;
  let newBlock: string;
  if (enabledRegex.test(block)) {
    newBlock = block.replace(enabledRegex, `enabled = ${enabled}`);
  } else {
    newBlock = `\nenabled = ${enabled}` + block;
  }
  const result = raw.slice(0, afterHeader) + newBlock + raw.slice(blockEnd);
  await writeFile(srv.sourcePath, result);
}

async function toggleCodexPlugin(plugin: PluginEntry, enabled: boolean) {
  const raw = await tryRead(plugin.sourcePath);
  if (!raw) return;
  const sectionHeader = `[plugins."${plugin.fullName}"]`;
  const idx = raw.indexOf(sectionHeader);
  if (idx === -1) return;
  const afterHeader = idx + sectionHeader.length;
  const nextSection = raw.indexOf("\n[", afterHeader + 1);
  const blockEnd = nextSection !== -1 ? nextSection : raw.length;
  const block = raw.slice(afterHeader, blockEnd);
  const newBlock = block.replace(/^enabled\s*=\s*(true|false)/m, `enabled = ${enabled}`);
  const result = raw.slice(0, afterHeader) + newBlock + raw.slice(blockEnd);
  await writeFile(plugin.sourcePath, result);
}

// --- Data loading ---

async function loadClaudeData(homeDir: string, cwds: string[]): Promise<ToolData> {
  const data: ToolData = { mcpServers: [], plugins: [], skills: [], cloudServices: [], projectMcp: [] };
  const settingsPath = np(`${homeDir}/.claude/settings.json`);

  const settingsRaw = await tryRead(settingsPath);
  if (settingsRaw) {
    try {
      const settings = JSON.parse(settingsRaw);
      const enabledMcp = new Set<string>(settings.enabledMcpjsonServers || []);
      const enabledPlugins: Record<string, boolean> = settings.enabledPlugins || {};

      if (settings.mcpServers) {
        for (const [name, cfg] of Object.entries<any>(settings.mcpServers)) {
          data.mcpServers.push({
            name, fullName: name, command: cfg.command, args: cfg.args, url: cfg.url,
            enabled: cfg.disabled !== true,
            source: "claude-settings", sourcePath: settingsPath,
          });
        }
      }

      for (const [fullName, enabled] of Object.entries(enabledPlugins)) {
        const shortName = fullName.split("@")[0];
        data.plugins.push({ name: shortName, fullName, enabled: !!enabled, source: "claude", sourcePath: settingsPath });
      }

      for (const name of enabledMcp) {
        if (!data.mcpServers.find((m) => m.name === name)) {
          data.mcpServers.push({ name, fullName: name, enabled: true, source: "claude-settings", sourcePath: settingsPath });
        }
      }
    } catch {}
  }

  const pluginsRaw = await tryRead(np(`${homeDir}/.claude/plugins/installed_plugins.json`));
  if (pluginsRaw) {
    try {
      const pluginsData = JSON.parse(pluginsRaw);
      const plugins: Record<string, any[]> = pluginsData.plugins || {};
      for (const fullName of Object.keys(plugins)) {
        const shortName = fullName.split("@")[0];
        const existing = data.plugins.find((p) => p.fullName === fullName);
        if (existing) {
          existing.version = plugins[fullName][0]?.version;
        } else {
          data.plugins.push({
            name: shortName, fullName, version: plugins[fullName][0]?.version,
            enabled: false, source: "claude", sourcePath: settingsPath,
          });
        }
      }
    } catch {}
  }

  const authRaw = await tryRead(np(`${homeDir}/.claude/mcp-needs-auth-cache.json`));
  if (authRaw) {
    try {
      for (const name of Object.keys(JSON.parse(authRaw))) {
        data.cloudServices.push({ name });
      }
    } catch {}
  }

  for (const cwd of cwds) {
    const servers: McpServer[] = [];
    const mcpJsonPath = np(`${cwd}/.mcp.json`);
    const mcpRaw = await tryRead(mcpJsonPath);
    if (mcpRaw) {
      try {
        const d = JSON.parse(mcpRaw);
        const mcpServers = d.mcpServers || d;
        for (const [name, cfg] of Object.entries<any>(mcpServers)) {
          servers.push({
            name, fullName: name, command: cfg.command, args: cfg.args, url: cfg.url,
            enabled: cfg.disabled !== true,
            source: "claude-mcp-json", sourcePath: mcpJsonPath,
          });
        }
      } catch {}
    }
    if (servers.length > 0) data.projectMcp.push({ cwd, servers });
  }

  return data;
}

async function loadCodexData(homeDir: string): Promise<ToolData> {
  const data: ToolData = { mcpServers: [], plugins: [], skills: [], cloudServices: [], projectMcp: [] };
  const tomlPath = np(`${homeDir}/.codex/config.toml`);

  const tomlRaw = await tryRead(tomlPath);
  if (tomlRaw) {
    const mcpRegex = /^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/gm;
    let match;
    const sections: { name: string; start: number }[] = [];
    while ((match = mcpRegex.exec(tomlRaw)) !== null) {
      sections.push({ name: match[1], start: match.index + match[0].length });
    }
    for (let i = 0; i < sections.length; i++) {
      const nextSection = tomlRaw.indexOf("\n[", sections[i].start + 1);
      const end = nextSection !== -1 ? nextSection : tomlRaw.length;
      const block = tomlRaw.slice(sections[i].start, end);
      const getVal = (key: string) => {
        const m = block.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
        return m ? m[1] : undefined;
      };
      const getBool = (key: string) => {
        const m = block.match(new RegExp(`^${key}\\s*=\\s*(true|false)`, "m"));
        return m ? m[1] === "true" : undefined;
      };
      const getArr = (key: string) => {
        const m = block.match(new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)]`, "m"));
        if (!m) return undefined;
        return m[1].match(/"([^"]*)"/g)?.map((v) => v.replace(/"/g, "")) || [];
      };
      data.mcpServers.push({
        name: sections[i].name, fullName: sections[i].name,
        command: getVal("command"), args: getArr("args"), url: getVal("url"),
        enabled: getBool("enabled") ?? true,
        source: "codex-toml", sourcePath: tomlPath,
      });
    }

    const pluginRegex = /\[plugins\."([^"]+)"\]/g;
    while ((match = pluginRegex.exec(tomlRaw)) !== null) {
      const pStart = match.index + match[0].length;
      const pNext = tomlRaw.indexOf("\n[", pStart + 1);
      const pBlock = tomlRaw.slice(pStart, pNext !== -1 ? pNext : tomlRaw.length);
      const enabledMatch = pBlock.match(/^enabled\s*=\s*(true|false)/m);
      const enabled = enabledMatch ? enabledMatch[1] === "true" : true;
      const fullName = match[1];
      data.plugins.push({
        name: fullName.split("@")[0], fullName,
        enabled, source: "codex", sourcePath: tomlPath,
      });
    }
  }

  const skillsPath = np(`${homeDir}/.codex/skills`);
  try {
    const { listDir } = await import("../../hooks/useTauriIpc");
    const entries = await listDir(skillsPath);
    for (const entry of entries) {
      if (entry.name === ".system") continue;
      if (entry.is_dir) data.skills.push({ name: entry.name });
    }
    try {
      const sysEntries = await listDir(np(`${skillsPath}/.system`));
      for (const entry of sysEntries) {
        if (entry.is_dir) data.skills.push({ name: entry.name, system: true });
      }
    } catch {}
  } catch {}

  return data;
}

// --- Components ---

const ICON_MCP = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 8v4M9.5 14.5L7 17M14.5 14.5L17 17"/></svg>';
const ICON_CLOUD = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>';
const ICON_PLUGIN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3"/></svg>';
const ICON_SKILL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>';
const ICON_PROJECT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`${s.mcpToggle} ${on ? s.mcpToggleOn : ""}`}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      title={on ? "Disable" : "Enable"}
    >
      <span className={s.mcpToggleKnob} />
    </button>
  );
}

function CollapsibleSection({ title, icon, count, defaultOpen, children }: {
  title: string; icon: string; count: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  if (count === 0) return null;
  return (
    <div className={s.mcpSection}>
      <button className={s.mcpSectionHeader} onClick={() => setOpen(!open)}>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0, opacity: 0.5 }}>
          <path d="M2 0l4 4-4 4z" />
        </svg>
        <span className={s.mcpSectionIcon} dangerouslySetInnerHTML={{ __html: icon }} />
        <span>{title}</span>
        <span className={s.mcpCount}>{count}</span>
      </button>
      {open && <div className={s.mcpSectionBody}>{children}</div>}
    </div>
  );
}

function ServerCard({ srv, onToggle }: { srv: McpServer; onToggle: (enabled: boolean) => void }) {
  const detail = srv.command ? shortenCommand(srv.command, srv.args) : srv.url || null;

  return (
    <div className={`${s.mcpCard} ${!srv.enabled ? s.mcpCardDim : ""}`}>
      <div className={s.mcpCardRow}>
        <span className={s.mcpDot} data-status={srv.enabled ? "on" : "off"} />
        <span className={s.mcpCardName}>{srv.name}</span>
        <Toggle on={srv.enabled} onChange={onToggle} />
      </div>
      {detail && <div className={s.mcpCardDetail} title={detail}>{detail}</div>}
    </div>
  );
}

function ProviderBlock({ label, icon, data, accent, onToggleMcp, onTogglePlugin, onRefresh }: {
  label: string; icon: string; data: ToolData | null; accent: string;
  onToggleMcp: (srv: McpServer, enabled: boolean) => void;
  onTogglePlugin: (p: PluginEntry, enabled: boolean) => void;
  onRefresh: () => void;
}) {
  if (!data) return null;
  const hasAnything = data.mcpServers.length > 0 || data.plugins.length > 0
    || data.skills.length > 0 || data.cloudServices.length > 0 || data.projectMcp.length > 0;
  if (!hasAnything) return null;

  return (
    <div className={s.mcpProvider}>
      <div className={s.mcpProviderHeader} style={{ borderLeftColor: accent }}>
        <span dangerouslySetInnerHTML={{ __html: icon }} />
        <span>{label}</span>
      </div>

      <CollapsibleSection title="MCP Servers" icon={ICON_MCP} count={data.mcpServers.length} defaultOpen>
        {data.mcpServers.map((srv) => (
          <ServerCard key={srv.name} srv={srv} onToggle={(v) => onToggleMcp(srv, v)} />
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Cloud Services" icon={ICON_CLOUD} count={data.cloudServices.length}>
        {data.cloudServices.map((svc) => (
          <div key={svc.name} className={s.mcpCard}>
            <div className={s.mcpCardRow}>
              <span className={s.mcpDot} data-status="on" />
              <span className={s.mcpCardName}>{svc.name.replace("claude.ai ", "")}</span>
              <span className={s.mcpBadge}>OAuth</span>
            </div>
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Plugins" icon={ICON_PLUGIN} count={data.plugins.length}>
        {data.plugins.map((p) => (
          <div key={p.fullName} className={`${s.mcpCard} ${!p.enabled ? s.mcpCardDim : ""}`}>
            <div className={s.mcpCardRow}>
              <span className={s.mcpDot} data-status={p.enabled ? "on" : "off"} />
              <span className={s.mcpCardName}>{p.name}</span>
              {p.version && p.version !== "unknown" && (
                <span className={s.mcpVersion}>{p.version}</span>
              )}
              <Toggle on={p.enabled} onChange={(v) => onTogglePlugin(p, v)} />
            </div>
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Skills" icon={ICON_SKILL} count={data.skills.length}>
        {data.skills.map((sk) => (
          <div key={sk.name + (sk.system ? "-sys" : "")} className={s.mcpCard} style={{ padding: "4px 8px" }}>
            <div className={s.mcpCardRow}>
              <span className={s.mcpCardName}>{sk.name}</span>
              {sk.system && <span className={s.mcpBadge}>system</span>}
            </div>
          </div>
        ))}
      </CollapsibleSection>

      {data.projectMcp.map((proj) => (
        <CollapsibleSection
          key={proj.cwd}
          title={proj.cwd.split("\\").pop() || proj.cwd}
          icon={ICON_PROJECT}
          count={proj.servers.length}
        >
          {proj.servers.map((srv) => (
            <ServerCard key={srv.name} srv={srv} onToggle={(v) => onToggleMcp(srv, v)} />
          ))}
        </CollapsibleSection>
      ))}
    </div>
  );
}

const CLAUDE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
const CODEX_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

export default function McpPanel({ embedded }: { embedded?: boolean } = {}) {
  const homeDir = useWorkspaceStore((st) => st.homeDir);
  const workspaces = useWorkspaceStore((st) => st.workspaces);
  const activeIdx = useWorkspaceStore((st) => st.activeWorkspaceIdx);
  const [claudeData, setClaudeData] = useState<ToolData | null>(null);
  const [codexData, setCodexData] = useState<ToolData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadAll = useCallback(async () => {
    if (!homeDir) return;
    setLoading(true);
    const activeWs = workspaces[activeIdx];
    const cwds = activeWs ? [...new Set(activeWs.panes.map((p) => p.cwd).filter(Boolean))] : [];
    const [claude, codex] = await Promise.all([
      loadClaudeData(homeDir, cwds),
      loadCodexData(homeDir),
    ]);
    setClaudeData(claude);
    setCodexData(codex);
    setLoading(false);
  }, [homeDir, workspaces, activeIdx]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleToggleMcp = useCallback(async (srv: McpServer, enabled: boolean) => {
    if (srv.source === "claude-settings") await toggleClaudeMcpServer(srv, enabled);
    else if (srv.source === "claude-mcp-json") await toggleClaudeMcpJsonServer(srv, enabled);
    else if (srv.source === "codex-toml") await toggleCodexMcpServer(srv, enabled);
    await loadAll();
  }, [loadAll]);

  const handleTogglePlugin = useCallback(async (p: PluginEntry, enabled: boolean) => {
    if (p.source === "claude") await toggleClaudePlugin(p, enabled);
    else if (p.source === "codex") await toggleCodexPlugin(p, enabled);
    await loadAll();
  }, [loadAll]);

  const isEmpty = claudeData && codexData
    && claudeData.mcpServers.length === 0 && claudeData.plugins.length === 0
    && claudeData.cloudServices.length === 0 && claudeData.projectMcp.length === 0
    && codexData.mcpServers.length === 0 && codexData.plugins.length === 0
    && codexData.skills.length === 0 && codexData.projectMcp.length === 0;

  return (
    <div className={s.settingsWrap}>
      <div className={s.settingsScroll}>
        <div className={s.mcpToolbar}>
          <span className={s.mcpToolbarTitle}>MCP & Tools</span>
          <button className={s.mcpRefreshBtn} onClick={loadAll} disabled={loading} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? s.mcpSpin : ""}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>
        </div>

        {loading && !claudeData && !codexData && (
          <div className={s.mcpEmpty}>Loading...</div>
        )}

        <ProviderBlock
          label="Claude Code" icon={CLAUDE_ICON} data={claudeData} accent="#f97316"
          onToggleMcp={handleToggleMcp} onTogglePlugin={handleTogglePlugin} onRefresh={loadAll}
        />
        <ProviderBlock
          label="Codex" icon={CODEX_ICON} data={codexData} accent="#22d3ee"
          onToggleMcp={handleToggleMcp} onTogglePlugin={handleTogglePlugin} onRefresh={loadAll}
        />

        {!loading && isEmpty && (
          <div className={s.mcpEmpty}>No MCP servers or tools found</div>
        )}
      </div>
    </div>
  );
}
