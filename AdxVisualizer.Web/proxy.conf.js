const { env } = require('process');

// 🔑 Adatta il nome alla tua risorsa AppHost (es. "api" o "webapi")
const target = env["services__api__https__0"] || env["services__api__http__0"];

if (!target) {
  console.warn("⚠️ [Proxy] Variabile services__api__http__0 non trovata. Verifica .WithReference(api) nell'AppHost.");
}

module.exports = {
  "/api": {
    target: target || "http://localhost:5000", // fallback sicuro per dev fuori Aspire
    secure: false,
    changeOrigin: true,
    logLevel: "warn"
  }
};