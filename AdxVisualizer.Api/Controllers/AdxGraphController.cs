using AdxVisualizer.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace AdxVisualizer.Api.Controllers;

[ApiController, Route("api/[controller]")]
public class AdxGraphController : ControllerBase
{
    private readonly AdxMetadataService _metadataService;
    public AdxGraphController(AdxMetadataService metadataService) => _metadataService = metadataService;

    [HttpGet] public async Task<IActionResult> Get([FromQuery] bool refresh = false) => Ok(await _metadataService.GetRelationshipGraphAsync(refresh));
    [HttpGet("function/{name}")]
    public async Task<IActionResult> GetFunctionBody(string name)
    {
        var body = await _metadataService.GetFunctionBodyAsync(name);
        return body != null ? Ok(new { body }) : NotFound(new { error = "Function not found" });
    }

    [HttpGet("node/{id}/refresh")]
    public async Task<IActionResult> RefreshNode(string id, [FromQuery] string type = "Table")
    {
        var node = await _metadataService.GetNodeDetailsAsync(id, type);
        return node is null ? NotFound() : Ok(node);
    }
}