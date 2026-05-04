using AdxVisualizer.Api.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<AdxMetadataService>();

var app = builder.Build();

// 🔹 In sviluppo: solo API. In produzione: serve anche la SPA buildata
if (!app.Environment.IsDevelopment())
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.UseRouting();
app.UseAuthorization();
app.MapControllers();

if (!app.Environment.IsDevelopment())
{
    app.MapFallbackToFile("index.html");
}

app.Run();