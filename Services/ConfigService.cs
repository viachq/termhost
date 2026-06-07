using System;
using System.IO;
using System.Text.Json;
using TerminalHub.Models;

namespace TerminalHub.Services;

public static class ConfigService
{
    private static readonly string ConfigDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "TerminalHub");

    private static readonly string ConfigPath = Path.Combine(ConfigDir, "config.json");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    public static AppConfig Load()
    {
        if (!File.Exists(ConfigPath))
        {
            var config = CreateDefault();
            Save(config);
            return config;
        }

        var json = File.ReadAllText(ConfigPath);
        return JsonSerializer.Deserialize<AppConfig>(json, JsonOptions) ?? CreateDefault();
    }

    public static void Save(AppConfig config)
    {
        Directory.CreateDirectory(ConfigDir);
        var json = JsonSerializer.Serialize(config, JsonOptions);
        File.WriteAllText(ConfigPath, json);
    }

    public static string GetConfigPath() => ConfigPath;

    private static AppConfig CreateDefault()
    {
        return new AppConfig
        {
            TerminalPath = "alacritty",
            Workspaces = new()
            {
                new Workspace
                {
                    Name = "Example",
                    Terminals = new()
                    {
                        new TerminalConfig
                        {
                            Path = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                            Command = "",
                            Title = "Terminal 1"
                        }
                    }
                }
            }
        };
    }
}
