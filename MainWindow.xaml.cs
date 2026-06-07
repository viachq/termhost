using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using TerminalHub.Controls;
using TerminalHub.Models;
using TerminalHub.Services;

namespace TerminalHub;

public partial class MainWindow : Window
{
    private AppConfig _config = null!;
    private int _activeWorkspaceIndex = -1;
    private readonly List<TerminalHostPanel> _activePanels = new();

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        _config = ConfigService.Load();
        BuildTabs();
        if (_config.Workspaces.Count > 0)
            SwitchWorkspace(0);
    }

    private void BuildTabs()
    {
        TabBar.Children.Clear();
        for (int i = 0; i < _config.Workspaces.Count; i++)
        {
            var ws = _config.Workspaces[i];
            var btn = new Button
            {
                Content = ws.Name,
                Tag = i
            };
            btn.Click += TabButton_Click;
            TabBar.Children.Add(btn);
        }
        UpdateTabStyles();
    }

    private void UpdateTabStyles()
    {
        for (int i = 0; i < TabBar.Children.Count; i++)
        {
            var btn = (Button)TabBar.Children[i];
            btn.Style = (Style)FindResource(i == _activeWorkspaceIndex ? "ActiveTabStyle" : "TabButtonStyle");
        }
    }

    private void TabButton_Click(object sender, RoutedEventArgs e)
    {
        var btn = (Button)sender;
        var index = (int)btn.Tag;
        if (index != _activeWorkspaceIndex)
            SwitchWorkspace(index);
    }

    private void SwitchWorkspace(int index)
    {
        DisposeCurrentTerminals();
        _activeWorkspaceIndex = index;
        UpdateTabStyles();

        var ws = _config.Workspaces[index];
        BuildGrid(ws);
    }

    private void BuildGrid(Workspace workspace)
    {
        TerminalGrid.Children.Clear();
        TerminalGrid.RowDefinitions.Clear();
        TerminalGrid.ColumnDefinitions.Clear();
        _activePanels.Clear();

        int count = workspace.Terminals.Count;
        if (count == 0) return;

        int cols, rows;
        switch (count)
        {
            case 1: rows = 1; cols = 1; break;
            case 2: rows = 1; cols = 2; break;
            case 3: rows = 2; cols = 2; break;
            default: rows = 2; cols = 2; break;
        }

        for (int r = 0; r < rows; r++)
            TerminalGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        for (int c = 0; c < cols; c++)
            TerminalGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        for (int i = 0; i < Math.Min(count, rows * cols); i++)
        {
            var tc = workspace.Terminals[i];
            var panel = new TerminalHostPanel
            {
                TerminalPath = _config.TerminalPath,
                WorkingDirectory = tc.Path,
                Command = tc.Command,
                Title = string.IsNullOrEmpty(tc.Title) ? $"Terminal {i + 1}" : tc.Title
            };

            int row, col;
            if (count == 3 && i == 0)
            {
                row = 0; col = 0;
                Grid.SetColumnSpan(panel, 2);
            }
            else if (count == 3)
            {
                row = 1; col = i - 1;
            }
            else
            {
                row = i / cols;
                col = i % cols;
            }

            Grid.SetRow(panel, row);
            Grid.SetColumn(panel, col);
            TerminalGrid.Children.Add(panel);
            _activePanels.Add(panel);
        }

        Dispatcher.InvokeAsync(() =>
        {
            foreach (var panel in _activePanels)
                panel.LaunchTerminal();
        }, System.Windows.Threading.DispatcherPriority.Loaded);
    }

    private void DisposeCurrentTerminals()
    {
        foreach (var panel in _activePanels)
        {
            try
            {
                TerminalGrid.Children.Remove(panel);
            }
            catch { }
        }
        _activePanels.Clear();
    }

    private void EditConfig_Click(object sender, RoutedEventArgs e)
    {
        var configPath = ConfigService.GetConfigPath();
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = configPath,
                UseShellExecute = true
            });
        }
        catch
        {
            MessageBox.Show($"Config file:\n{configPath}", "Config Location");
        }
    }

    private void Reload_Click(object sender, RoutedEventArgs e)
    {
        DisposeCurrentTerminals();
        _config = ConfigService.Load();
        BuildTabs();
        if (_config.Workspaces.Count > 0)
            SwitchWorkspace(0);
    }

    private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
    {
        DisposeCurrentTerminals();
    }
}
