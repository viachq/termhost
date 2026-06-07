using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using TerminalHub.Services;

namespace TerminalHub.Controls;

public class TerminalHostPanel : Border
{
    private EmbeddedTerminal? _terminal;
    private AlacrittyHwndHost? _host;

    public TerminalHostPanel()
    {
        Background = new SolidColorBrush(Color.FromRgb(30, 30, 30));
        BorderBrush = new SolidColorBrush(Color.FromRgb(60, 60, 60));
        BorderThickness = new Thickness(1);
        Margin = new Thickness(2);

        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    public string TerminalPath { get; set; } = "alacritty";
    public string WorkingDirectory { get; set; } = "";
    public string Command { get; set; } = "";
    public string Title { get; set; } = "";

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        Child = new TextBlock
        {
            Text = string.IsNullOrEmpty(Title) ? "Loading..." : Title,
            Foreground = Brushes.Gray,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            FontSize = 14
        };
    }

    public async void LaunchTerminal()
    {
        _host = new AlacrittyHwndHost();
        Child = _host;

        // Wait for WPF layout to assign size to HwndHost
        await Dispatcher.InvokeAsync(() => { }, System.Windows.Threading.DispatcherPriority.Loaded);

        var hostHandle = _host.HostHandle;
        if (hostHandle == IntPtr.Zero) return;

        _terminal = new EmbeddedTerminal();
        var success = await _terminal.Launch(TerminalPath, WorkingDirectory, Command, hostHandle);

        if (success)
        {
            _host.SetAlacrittyHandle(_terminal.WindowHandle);
            _host.ResizeAlacritty();
            return;
        }

        _host = null;
        Child = new TextBlock
        {
            Text = $"Failed to launch: {TerminalPath}",
            Foreground = Brushes.Red,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        _terminal?.Dispose();
        _host?.Dispose();
    }

    public void FocusTerminal()
    {
        _terminal?.Focus();
    }
}

public class AlacrittyHwndHost : HwndHost
{
    private IntPtr _hostHwnd;
    private IntPtr _alacrittyHwnd;

    public IntPtr HostHandle => _hostHwnd;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr CreateWindowEx(
        uint dwExStyle, string lpClassName, string lpWindowName,
        uint dwStyle, int x, int y, int nWidth, int nHeight,
        IntPtr hWndParent, IntPtr hMenu, IntPtr hInstance, IntPtr lpParam);

    [DllImport("user32.dll")]
    private static extern bool DestroyWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);

    private const uint WS_CHILD = 0x40000000;
    private const uint WS_VISIBLE = 0x10000000;
    private const uint WS_CLIPCHILDREN = 0x02000000;
    private const int WM_SIZE = 0x0005;

    protected override HandleRef BuildWindowCore(HandleRef hwndParent)
    {
        var dpi = GetDpiScale();
        int w = (int)(ActualWidth * dpi.X);
        int h = (int)(ActualHeight * dpi.Y);
        if (w <= 0) w = 400;
        if (h <= 0) h = 300;

        _hostHwnd = CreateWindowEx(
            0, "static", "",
            WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN,
            0, 0, w, h,
            hwndParent.Handle, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);

        return new HandleRef(this, _hostHwnd);
    }

    protected override void DestroyWindowCore(HandleRef hwnd)
    {
        DestroyWindow(hwnd.Handle);
    }

    public void SetAlacrittyHandle(IntPtr hwnd)
    {
        _alacrittyHwnd = hwnd;
    }

    public void ResizeAlacritty()
    {
        if (_alacrittyHwnd == IntPtr.Zero) return;

        var dpi = GetDpiScale();
        int w = (int)(ActualWidth * dpi.X);
        int h = (int)(ActualHeight * dpi.Y);

        if (w > 0 && h > 0)
            MoveWindow(_alacrittyHwnd, 0, 0, w, h, true);
    }

    protected override void OnRenderSizeChanged(SizeChangedInfo sizeInfo)
    {
        base.OnRenderSizeChanged(sizeInfo);
        ResizeAlacritty();
    }

    protected override IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_SIZE)
            ResizeAlacritty();

        handled = false;
        return IntPtr.Zero;
    }

    private (double X, double Y) GetDpiScale()
    {
        var source = PresentationSource.FromVisual(this);
        if (source?.CompositionTarget != null)
        {
            var m = source.CompositionTarget.TransformToDevice;
            return (m.M11, m.M22);
        }
        return (1.0, 1.0);
    }
}
