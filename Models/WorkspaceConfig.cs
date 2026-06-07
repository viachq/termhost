using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TerminalHub.Models;

public class AppConfig
{
    [JsonPropertyName("terminalPath")]
    public string TerminalPath { get; set; } = "alacritty";

    [JsonPropertyName("workspaces")]
    public List<Workspace> Workspaces { get; set; } = new();
}

public class Workspace
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("terminals")]
    public List<TerminalConfig> Terminals { get; set; } = new();
}

public class TerminalConfig
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("command")]
    public string Command { get; set; } = "";

    [JsonPropertyName("title")]
    public string Title { get; set; } = "";
}
