using System.Text.Json.Serialization;

namespace AdxVisualizer.Api.Models;

/// <summary>
/// Nodo del grafo (Table o MaterializedView)
/// </summary>
public record AdxNode(
    string Id,
    string Label,
    string Type,
    string Layer = "Unknown",
    string? DefinitionQuery = null,
    bool IsFunctionRef = false,
    string? DocString = null,
    long TotalRowCount = 0,
    long HotRowCount = 0,
    string? SoftDeletePeriod = null,
    string? HotCachePeriod = null,
    string? SourceTable = null)
{
    // 🔹 Helper per UI (non serializzati nel payload JSON)
    [JsonIgnore]
    public bool HasRetention => !string.IsNullOrWhiteSpace(SoftDeletePeriod) || !string.IsNullOrWhiteSpace(HotCachePeriod);

    [JsonIgnore]
    public double CachePercentage => TotalRowCount > 0 ? Math.Round((double)HotRowCount / TotalRowCount * 100, 1) : 0;
}

/// <summary>
/// Relazione tra nodi (UpdatePolicy o MVSource)
/// </summary>
public record AdxEdge(
    string Source,
    string Target,
    string RelationType,
    string? FunctionName = null);

/// <summary>
/// Response completa del grafo
/// </summary>
public record AdxGraphResponse(
    IReadOnlyList<AdxNode> Nodes,
    IReadOnlyList<AdxEdge> Edges);

/// <summary>
/// Regola di Update Policy deserializzata da ADX
/// </summary>
public class UpdatePolicyRule
{
    public string? Source { get; set; }
    public string? Query { get; set; }
    public bool IsEnabled { get; set; } = true;
}