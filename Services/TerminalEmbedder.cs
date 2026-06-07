using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

namespace TerminalHub.Services;

public class EmbeddedTerminal : IDisposable
{
    public Process? Process { get; private set; }
    public IntPtr WindowHandle { get; private set; }

    private const int GWL_STYLE = -16;
    private const int GWL_EXSTYLE = -20;
    private const uint WS_CHILD = 0x40000000;
    private const uint WS_VISIBLE = 0x10000000;
    private const uint WS_POPUP = 0x80000000;
    private const uint WS_CAPTION = 0x00C00000;
    private const uint WS_THICKFRAME = 0x00040000;
    private const uint WS_BORDER = 0x00800000;
    private const uint WS_SYSMENU = 0x00080000;

    private const uint SWP_FRAMECHANGED = 0x0020;
    private const uint SWP_NOZORDER = 0x0004;

    private const int DWMWA_NCRENDERING_POLICY = 2;
    private const int DWMNCRP_DISABLED = 1;

    [DllImport("user32.dll")]
    private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll")]
    private static extern uint GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll")]
    private static extern uint SetWindowLong(IntPtr hWnd, int nIndex, uint dwNewLong);

    [DllImport("user32.dll")]
    private static extern bool MoveWindow(IntPtr hWnd, int x, int y, int width, int height, bool repaint);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SetFocus(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    private static string GetEmbedConfigPath()
    {
        var exeDir = AppDomain.CurrentDomain.BaseDirectory;
        var configPath = Path.Combine(exeDir, "alacritty-embed.toml");
        if (File.Exists(configPath)) return configPath;

        var srcDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        configPath = Path.Combine(srcDir ?? exeDir, "..", "..", "..", "alacritty-embed.toml");
        if (File.Exists(configPath)) return Path.GetFullPath(configPath);

        return "";
    }

    public async Task<bool> Launch(string terminalPath, string workingDir, string command, IntPtr containerHandle)
    {
        var configPath = GetEmbedConfigPath();
        var args = "";
        if (!string.IsNullOrEmpty(configPath))
            args += $"--config-file \"{configPath}\" ";
        args += $"--working-directory \"{workingDir}\"";
        if (!string.IsNullOrWhiteSpace(command))
            args += $" -e cmd /k \"{command}\"";

        var psi = new ProcessStartInfo
        {
            FileName = terminalPath,
            Arguments = args,
            UseShellExecute = false,
        };

        Process = Process.Start(psi);
        if (Process == null) return false;

        WindowHandle = await WaitForWindowHandle(Process.Id, 5000);
        if (WindowHandle == IntPtr.Zero) return false;

        await Task.Delay(200);

        // Disable DWM non-client area rendering (removes title bar at compositor level)
        int policy = DWMNCRP_DISABLED;
        DwmSetWindowAttribute(WindowHandle, DWMWA_NCRENDERING_POLICY, ref policy, sizeof(int));

        // Strip remaining window styles
        var style = GetWindowLong(WindowHandle, GWL_STYLE);
        style &= ~WS_POPUP;
        style &= ~WS_CAPTION;
        style &= ~WS_THICKFRAME;
        style &= ~WS_BORDER;
        style &= ~WS_SYSMENU;
        style |= WS_CHILD | WS_VISIBLE;
        SetWindowLong(WindowHandle, GWL_STYLE, style);

        // Force frame recalculation
        SetWindowPos(WindowHandle, IntPtr.Zero, 0, 0, 0, 0,
            SWP_FRAMECHANGED | SWP_NOZORDER | 0x0001 | 0x0002);

        // Reparent into container
        SetParent(WindowHandle, containerHandle);

        // Fill container
        GetClientRect(containerHandle, out RECT rect);
        MoveWindow(WindowHandle, 0, 0, rect.Right, rect.Bottom, true);
        ShowWindow(WindowHandle, 5);

        return true;
    }

    public void Resize(int width, int height)
    {
        if (WindowHandle != IntPtr.Zero)
            MoveWindow(WindowHandle, 0, 0, width, height, true);
    }

    public void Focus()
    {
        if (WindowHandle != IntPtr.Zero)
        {
            SetForegroundWindow(WindowHandle);
            SetFocus(WindowHandle);
        }
    }

    private static async Task<IntPtr> WaitForWindowHandle(int processId, int timeoutMs)
    {
        var sw = Stopwatch.StartNew();
        while (sw.ElapsedMilliseconds < timeoutMs)
        {
            var hwnd = FindWindowByProcessId((uint)processId);
            if (hwnd != IntPtr.Zero)
                return hwnd;
            await Task.Delay(100);
        }
        return IntPtr.Zero;
    }

    private static IntPtr FindWindowByProcessId(uint targetPid)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hwnd, _) =>
        {
            GetWindowThreadProcessId(hwnd, out uint pid);
            if (pid == targetPid && IsWindowVisible(hwnd))
            {
                found = hwnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public void Dispose()
    {
        if (Process != null && !Process.HasExited)
        {
            try { Process.Kill(); } catch { }
        }
        Process?.Dispose();
    }
}
