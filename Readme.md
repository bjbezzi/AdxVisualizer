\# 📊 ADX Lineage Explorer



> A read-only, enterprise-grade data lineage catalog for Azure Data Explorer (ADX). Visualize table dependencies, materialized views, update policies, and layer semantics with a modern, shareable UI.



!\[Angular](https://img.shields.io/badge/Angular-21-DD0031?logo=angular)

!\[.NET](https://img.shields.io/badge/.NET-9-512BD4?logo=dotnet)

!\[Aspire](https://img.shields.io/badge/.NET%20Aspire-9-0078D4?logo=dotnet)

!\[License](https://img.shields.io/badge/License-MIT-green)



\## ✨ Key Features

\- 🌐 \*\*Interactive Lineage Graph\*\*: DAG layout with semantic coloring (Layer fill, Type border), smooth pan/zoom, and minimap.

\- 🔍 \*\*Fuzzy Search \& Highlighting\*\*: Typo-tolerant sidebar search with real-time match highlighting (`fuse.js`).

\- 🔗 \*\*Deep Linking\*\*: Share exact views via URL (`?node=SalesFact\&layers=Gold,Silver`). State syncs automatically.

\- 🪟 \*\*Contextual Detail Panel\*\*: Modal inspection with metrics, retention badges, KQL syntax highlighting, and direct ADX deep links.

\- 🎨 \*\*Enterprise Dark UI\*\*: WCAG-compliant contrasts, GPU-accelerated SVG, zero visual clutter, aligned with Purview/Atlan standards.

\- ⚡ \*\*Read-Only Optimized\*\*: No mutations, no locks, no audit overhead. Built for discovery, navigation, and observability.



\## 🛠️ Tech Stack

| Layer | Technology |

|-------|------------|

| Frontend | Angular 21 (Standalone, Signals, OnPush) |

| Graph | `@swimlane/ngx-graph` (Dagre layout, SVG native) |

| Search | `fuse.js` (Lightweight fuzzy matching) |

| Backend | .NET 9 (Minimal APIs, Kusto SDK, MemoryCache) |

| Orchestration | .NET Aspire 9 (Dev proxy, health checks, unified logs) |

| Styling | SCSS, CSS Variables, ViewEncapsulation.None |



\## 🚀 Quick Start



\### Prerequisites

\- \[.NET 9 SDK](https://dotnet.microsoft.com/download)

\- \[Node.js 22/24 LTS](https://nodejs.org/)

\- Angular CLI: `npm i -g @angular/cli`



\### Setup \& Run

```bash

\# 1. Clone \& restore

git clone <your-repo-url>

cd AdxVisualizer

dotnet restore



\# 2. Install frontend dependencies

cd AdxVisualizer.UI

npm install

cd ..



\# 3. Run everything with Aspire (API + UI + Dashboard)

dotnet run --project AdxVisualizer.AppHost

