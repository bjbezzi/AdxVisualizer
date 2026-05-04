IDistributedApplicationBuilder builder = DistributedApplication.CreateBuilder(args);

IResourceBuilder<ProjectResource> api = builder.AddProject<Projects.AdxVisualizer_Api>("api");

if (builder.ExecutionContext.IsRunMode)
{
    builder.AddJavaScriptApp("web", "../AdxVisualizer.Web")
        .WithRunScript("start")
        .WithReference(api)
        .WaitFor(api)
        .WithHttpEndpoint(env: "PORT")
        .WithExternalHttpEndpoints();
}

builder.Build().Run();