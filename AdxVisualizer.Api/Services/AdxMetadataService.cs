using AdxVisualizer.Api.Models;
using Kusto.Data;
using Kusto.Data.Common;
using Kusto.Data.Net.Client;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace AdxVisualizer.Api.Services;

public class AdxMetadataService
{
    private readonly string _clusterUrl;
    private readonly string _database;
    private readonly IMemoryCache _cache;
    private readonly JsonSerializerOptions _jsonOpts;
    private readonly ILogger<AdxMetadataService> _logger;

    public AdxMetadataService(IConfiguration config, IMemoryCache cache, ILogger<AdxMetadataService> logger)
    {
        _clusterUrl = config["Adx:ClusterUrl"] ?? throw new ArgumentNullException(nameof(config), "Adx:ClusterUrl missing");
        _database = config["Adx:Database"] ?? throw new ArgumentNullException(nameof(config), "Adx:Database missing");
        _cache = cache;
        _logger = logger;
        _jsonOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
    }

    private ICslAdminProvider CreateAdminClient()
    {
        KustoConnectionStringBuilder? kcsb = new KustoConnectionStringBuilder(_clusterUrl, _database).WithAadAzCliAuthentication();
        return KustoClientFactory.CreateCslAdminProvider(kcsb);
    }

    private static string ParseLayer(string? folder)
    {
        if (string.IsNullOrWhiteSpace(folder)) return "Bronze";
        string txt = folder.ToLowerInvariant();
        return txt.Contains("bronze") ? "Bronze" :
               txt.Contains("silver") ? "Silver" :
               txt.Contains("gold") ? "Gold" : "Unknown";
    }

    #region 🌐 Full Graph

    public async Task<AdxGraphResponse?> GetRelationshipGraphAsync(bool refresh = false)
    {
        if (refresh) _cache.Remove("adx_graph");

        return await _cache.GetOrCreateAsync("adx_graph", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15);
            using ICslAdminProvider client = CreateAdminClient();

            List<AdxNode> tables = await FetchTablesAsync(client);
            List<string> tableNames = tables.Select(t => t.Id).ToList();
            List<AdxEdge> policyEdges = await FetchUpdatePoliciesAsync(client, tableNames);
            List<AdxNode> mvs = await FetchMaterializedViewsAsync(client);

            List<AdxNode> nodes = tables.Concat(mvs).DistinctBy(n => n.Id).ToList();
            List<AdxEdge> edges = policyEdges.Concat(mvs.SelectMany(mv =>
            {
                string? src = mv.SourceTable;
                return !string.IsNullOrWhiteSpace(src) ? new[] { new AdxEdge(src, mv.Id, "MVSource") } : Array.Empty<AdxEdge>();
            })).ToList();

            _logger.LogInformation("Graph cached: {Nodes} nodes, {Edges} edges", nodes.Count, edges.Count);
            return new AdxGraphResponse(nodes, edges);
        });
    }

    #endregion

    #region 🔍 Single Node Refresh

    /// <summary>
    /// Recupera metadati aggiornati per un singolo nodo (Table o MaterializedView).
    /// Non usa cache: ideale per refresh on-demand da UI.
    /// </summary>
    public async Task<AdxNode?> GetNodeDetailsAsync(string nodeId, string nodeType)
    {
        try
        {
            using ICslAdminProvider client = CreateAdminClient();

            if (nodeType.Equals("Table", StringComparison.OrdinalIgnoreCase))
                return await FetchSingleTableAsync(client, nodeId);

            if (nodeType.Equals("MaterializedView", StringComparison.OrdinalIgnoreCase))
                return await FetchSingleMaterializedViewAsync(client, nodeId);

            _logger.LogWarning("Unknown node type '{Type}' for refresh", nodeType);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to refresh node '{NodeId}'", nodeId);
            return null;
        }
    }

    #endregion

    #region 📜 Function Body

    public async Task<string?> GetFunctionBodyAsync(string functionName)
    {
        try
        {
            using ICslAdminProvider client = CreateAdminClient();
            using IDataReader? reader = await client.ExecuteControlCommandAsync(_database, $".show function {functionName}");
            return reader.Read() ? reader["Body"]?.ToString() : null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Function '{Name}' not found or unreachable", functionName);
            return null;
        }
    }

    #endregion

    #region 🔧 Private Fetchers

    private async Task<List<AdxNode>> FetchTablesAsync(ICslAdminProvider client)
    {
        List<AdxNode> nodes = new List<AdxNode>();
        using IDataReader? reader = await client.ExecuteControlCommandAsync(
            _database, ".show tables details | project TableName, Folder, DocString, TotalRowCount, HotRowCount, SoftDeletePeriod = todynamic(RetentionPolicy).SoftDeletePeriod,HotCachePeriod = todynamic(CachingPolicy).DataHotSpan");

        while (reader.Read())
        {
            string? name = reader["TableName"]?.ToString();
            if (string.IsNullOrWhiteSpace(name)) continue;

            nodes.Add(new AdxNode(
                name, name, "Table", ParseLayer(reader["Folder"]?.ToString()),
                DefinitionQuery: null, IsFunctionRef: false,
                DocString: reader["DocString"]?.ToString(),
                TotalRowCount: ParseLong(reader["TotalRowCount"]),
                HotRowCount: ParseLong(reader["HotRowCount"]),
                SoftDeletePeriod: reader["SoftDeletePeriod"]?.ToString(),
                HotCachePeriod: reader["HotCachePeriod"]?.ToString()));
        }
        return nodes;
    }

    private async Task<List<AdxEdge>> FetchUpdatePoliciesAsync(ICslAdminProvider client, IEnumerable<string> tableNames)
    {
        List<AdxEdge> edges = new List<AdxEdge>();
        foreach (string t in tableNames)
        {
            try
            {
                using IDataReader? reader = await client.ExecuteControlCommandAsync(_database, $".show table {t} policy update");
                if (!reader.Read()) continue;

                string? json = reader["Policy"]?.ToString();
                if (string.IsNullOrWhiteSpace(json)) continue;

                List<UpdatePolicyRule>? rules = JsonSerializer.Deserialize<List<UpdatePolicyRule>>(json, _jsonOpts);
                if (rules == null) continue;

                foreach (UpdatePolicyRule rule in rules.Where(r => !string.IsNullOrWhiteSpace(r.Source)))
                {
                    string src = rule.Source!.Trim();
                    if (src.Contains('.')) src = src.Split('.').Last();

                    string? funcName = null;
                    string? q = rule.Query?.Trim();
                    if (!string.IsNullOrWhiteSpace(q))
                    {
                        string cleanQ = Regex.Replace(q, @"\s*\(\s*\)\s*$", "", RegexOptions.IgnoreCase);
                        if (Regex.IsMatch(cleanQ, @"^[a-zA-Z_][a-zA-Z0-9_]*$"))
                            funcName = cleanQ;
                    }

                    edges.Add(new AdxEdge(src, t, "UpdatePolicy", funcName));
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Update policy fetch failed for table '{Table}'", t);
            }
        }
        return edges;
    }

    private async Task<List<AdxNode>> FetchMaterializedViewsAsync(ICslAdminProvider client)
    {
        List<AdxNode> nodes = new List<AdxNode>();
        Dictionary<string, (long Total, long Hot, string? SoftDel, string? HotCache)> detailsMap = new Dictionary<string, (long Total, long Hot, string? SoftDel, string? HotCache)>(StringComparer.OrdinalIgnoreCase);

        try
        {
            using IDataReader? detReader = await client.ExecuteControlCommandAsync(
                _database, ".show materialized-views details | project MaterializedViewName, TotalRowCount, HotRowCount, SoftDeletePeriod = todynamic(RetentionPolicy).SoftDeletePeriod,HotCachePeriod = todynamic(CachingPolicy).DataHotSpan");

            while (detReader.Read())
            {
                string? mv = detReader["MaterializedViewName"]?.ToString();
                if (!string.IsNullOrWhiteSpace(mv))
                {
                    detailsMap[mv] = (
                        ParseLong(detReader["TotalRowCount"]),
                        ParseLong(detReader["HotRowCount"]),
                        detReader["SoftDeletePeriod"]?.ToString(),
                        detReader["HotCachePeriod"]?.ToString());
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "MV details fetch failed");
        }

        using IDataReader? mvReader = await client.ExecuteControlCommandAsync(
            _database, ".show materialized-views | project Name, SourceTable, Folder, Query, IsEnabled, DocString");

        while (mvReader.Read())
        {
            string? name = mvReader["Name"]?.ToString();
            if (string.IsNullOrWhiteSpace(name)) continue;

            string? src = mvReader["SourceTable"]?.ToString();
            string? query = mvReader["Query"]?.ToString();
            bool enabled = mvReader["IsEnabled"]?.ToString()?.ToLowerInvariant() is "1" or "true";
            string? def = enabled ? query : $"-- DISABLED\n{query}";

            detailsMap.TryGetValue(name, out (long Total, long Hot, string? SoftDel, string? HotCache) counts);

            // Fallback source resolution
            if (string.IsNullOrWhiteSpace(src) && !string.IsNullOrWhiteSpace(query))
            {
                Match m = Regex.Match(query, @"(?:from|join\s*\(|union\s*\()\s*`?([a-zA-Z0-9_\.]+)`?", RegexOptions.IgnoreCase);
                if (m.Success) src = m.Groups[1].Value;
            }

            nodes.Add(new AdxNode(
                name, name, "MaterializedView", ParseLayer(mvReader["Folder"]?.ToString()),
                def, false, mvReader["DocString"]?.ToString(),
                counts.Total, counts.Hot, counts.SoftDel, counts.HotCache)
            {
                SourceTable = src // 🔑 Allego source per edge generation
            });
        }

        return nodes;
    }

    private async Task<AdxNode?> FetchSingleTableAsync(ICslAdminProvider client, string tableName)
    {
        using IDataReader? reader = await client.ExecuteControlCommandAsync(
            _database, $".show table {tableName} details | project TableName, Folder, DocString, TotalRowCount, HotRowCount, SoftDeletePeriod = todynamic(RetentionPolicy).SoftDeletePeriod,HotCachePeriod = todynamic(CachingPolicy).DataHotSpan");

        if (!reader.Read()) return null;

        return new AdxNode(
            tableName, tableName, "Table", ParseLayer(reader["Folder"]?.ToString()),
            null, false, reader["DocString"]?.ToString(),
            ParseLong(reader["TotalRowCount"]), ParseLong(reader["HotRowCount"]),
            reader["SoftDeletePeriod"]?.ToString(), reader["HotCachePeriod"]?.ToString());
    }

    private async Task<AdxNode?> FetchSingleMaterializedViewAsync(ICslAdminProvider client, string mvName)
    {
        using IDataReader? detReader = await client.ExecuteControlCommandAsync(
            _database, $".show materialized-view {mvName} details | project MaterializedViewName, TotalRowCount, HotRowCount, SoftDeletePeriod = todynamic(RetentionPolicy).SoftDeletePeriod,HotCachePeriod = todynamic(CachingPolicy).DataHotSpan");

        long total = 0, hot = 0;
        string? softDel = null, hotCache = null;
        if (detReader.Read())
        {
            total = ParseLong(detReader["TotalRowCount"]);
            hot = ParseLong(detReader["HotRowCount"]);
            softDel = detReader["SoftDeletePeriod"]?.ToString();
            hotCache = detReader["HotCachePeriod"]?.ToString();
        }

        using IDataReader? mvReader = await client.ExecuteControlCommandAsync(
            _database, $".show materialized-view {mvName} | project Name, SourceTable, Folder, Query, IsEnabled, DocString");

        if (!mvReader.Read()) return null;

        string? query = mvReader["Query"]?.ToString();
        bool enabled = mvReader["IsEnabled"]?.ToString()?.ToLowerInvariant() is "1" or "true";
        string? def = enabled ? query : $"-- DISABLED\n{query}";
        string? src = mvReader["SourceTable"]?.ToString();

        if (string.IsNullOrWhiteSpace(src) && !string.IsNullOrWhiteSpace(query))
        {
            Match m = Regex.Match(query, @"(?:from|join\s*\(|union\s*\()\s*`?([a-zA-Z0-9_\.]+)`?", RegexOptions.IgnoreCase);
            if (m.Success) src = m.Groups[1].Value;
        }

        return new AdxNode(
            mvName, mvName, "MaterializedView", ParseLayer(mvReader["Folder"]?.ToString()),
            def, false, mvReader["DocString"]?.ToString(),
            total, hot, softDel, hotCache)
        {
            SourceTable = src
        };
    }

    private static long ParseLong(object? val) =>
        long.TryParse(val?.ToString(), out long n) ? n : 0;

    #endregion
}