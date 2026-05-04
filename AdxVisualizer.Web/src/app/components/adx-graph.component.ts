import {
  Component,
  input,
  signal,
  effect,
  ViewChild,
  ViewEncapsulation,
  HostListener,
  inject,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GraphModule } from '@swimlane/ngx-graph';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AdxGraphService } from '../services/adx-graph.service';
import { APP_CONFIG } from '../config';
import { computed } from '@angular/core';
import { MiniMapPosition } from '@swimlane/ngx-graph'; // 🔑 Import enum nativo
import { LAYER_THEME } from '../shared/layer-theme';

@Component({
  selector: 'app-adx-graph',
  standalone: true,
  imports: [CommonModule, GraphModule],
  templateUrl: './adx-graph.component.html',
  styleUrl: './adx-graph.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class AdxGraphComponent {
  @ViewChild('graph', { static: false }) graph: any;
  private graphSvc = inject(AdxGraphService);
  private sanitizer = inject(DomSanitizer);
  readonly MiniMapPosition = MiniMapPosition;

  // Inputs
  allNodes = input.required<any[]>();
  allEdges = input.required<any[]>();
  selIds = input.required<string[]>();
  selLays = input.required<string[]>();

  // Signals
  visN = signal<any[]>([]);
  visL = signal<any[]>([]);
  selId = signal<string | null>(null);
  selNode = signal<any>(null);
  expanded = signal(false);
  layoutMode = signal<string>('dagre');
  viewSize = signal<[number, number]>([window.innerWidth - 280, window.innerHeight]);
  funcBodyLoaded = signal(false);
  currentFuncName = signal<string | null>(null);
  rawCode = signal<string>('');
  highlightedCode = signal<SafeHtml>('');
  hasUpdatePolicy = signal(false);
  highlightedNodes = signal<Set<string>>(new Set());
  highlightedEdges = signal<Set<string>>(new Set());
  isRefreshing = signal(false);
  nodeUpdated = output<any>();
  toastMessage = signal<string | null>(null);
  private toastTimeout: any;
  // 🌊 Impact Analysis
  highlightMode = signal<'all' | 'upstream' | 'downstream'>('all');

  @HostListener('window:resize') onResize() {
    this.viewSize.set([window.innerWidth - 280, window.innerHeight]);
  }

  // ⌨️ Keyboard Shortcuts
  @HostListener('window:keydown', ['$event'])
  handleKeys(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.zoomIn(e as any);
    } else if (e.key === '-') {
      e.preventDefault();
      this.zoomOut(e as any);
    } else if (e.key === '0' || e.key.toLowerCase() === 'f') {
      e.preventDefault();
      this.center();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.closePanel();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('.search-wrap input') as HTMLInputElement;
      searchInput?.focus();
    }
  }

  nodeClicked = output<string>();
  panelClosed = output<void>();

  private lastSidebarId: string | null = null;

  constructor() {
    effect(() => this.applyFilter());

    effect(() => {
      const ids = this.selIds();
      const sidebarId = ids.length === 1 ? ids[0] : null;

      // 🛡️ Guardie anti-loop e anti-sovrascrittura
      if (sidebarId === this.selId()) return; // Ignora se il cambio arriva dal click sul grafo
      if (sidebarId === this.lastSidebarId) return;

      this.lastSidebarId = sidebarId;

      if (sidebarId) {
        this.focusNodeFromSidebar(sidebarId);
      } else {
        // Deselezione sidebar → pulisci highlight, ma NON chiudere il pannello
        this.highlightedNodes.set(new Set());
        this.highlightedEdges.set(new Set());
      }
    });
  }

  focusNodeFromSidebar(nodeId: string) {
    // 1️⃣ Highlight immediato
    this.highlightSingleNode(nodeId);

    // 2️⃣ Retry veloce e sicuro: attende solo che Dagre scriva x/y
    let attempts = 0;
    const tryPan = () => {
      const g = this.graph as any;
      if (!g) return;

      const target = g.nodes?.find((n: any) => n.id === nodeId);
      if (!target?.position || target.position.x == null || target.position.y == null) {
        if (attempts++ < 5) setTimeout(tryPan, 50);
        return;
      }

      const nodeW = target.dimension?.width || 220;
      const nodeH = target.dimension?.height || 70;
      const centerX = target.position.x + nodeW / 2;
      const centerY = target.position.y + nodeH / 2;

      // 🔑 API ufficiale: istantanea, stabile, zero conflitti interni
      if (typeof g.panTo === 'function') {
        g.panTo(centerX, centerY);
      }
    };

    // Parte dopo 1 frame (~16ms). Nessuna animazione custom, nessun hack.
    setTimeout(tryPan, 16);
  }

  applyFilter() {
    const nodes = this.allNodes();
    const edges = this.allEdges();
    if (!nodes.length) return;

    const activeLayers = new Set(this.selLays());
    const activeIds = new Set(this.selIds().map((id) => id.toLowerCase()));
    const showAllLayers = activeLayers.size === 0;

    const caseMap = new Map<string, string>();
    nodes.forEach((n) => caseMap.set(n.id.toLowerCase(), n.id));

    const visibleIds = new Set<string>();
    nodes.forEach((n) => {
      const idLow = n.id.toLowerCase();
      const layerOk = showAllLayers || activeLayers.has(n.layer || 'Unknown');
      const idOk = activeIds.size === 0 || activeIds.has(idLow);
      if (layerOk && idOk) visibleIds.add(idLow);
    });

    if (activeIds.size > 0) {
      edges.forEach((e) => {
        const s = e.source.toLowerCase(),
          t = e.target.toLowerCase();
        if (activeIds.has(s) || activeIds.has(t)) {
          visibleIds.add(s);
          visibleIds.add(t);
        }
      });
    }

    // 🔑 Semplificazione: dimmed rimosso. Solo highlight positivo.
    this.visN.set(
      nodes.map((n) => ({
        id: n.id,
        label: n.label,
        data: { ...n, layer: n.layer || 'Unknown' },
        class: n.type === 'Table' ? 'node-table' : n.type === 'MaterializedView' ? 'node-mv' : '', // 🔑 Classi native per ngx-graph
        dimmed: false,
        highlighted: this.highlightedNodes().has(n.id),
      })),
    );

    this.visL.set(
      edges.map((e, i) => {
        const sLow = e.source.toLowerCase(),
          tLow = e.target.toLowerCase();
        const sExact = caseMap.get(sLow) || e.source;
        const tExact = caseMap.get(tLow) || e.target;
        const isActive = visibleIds.has(sLow) && visibleIds.has(tLow);
        return {
          id: `e${i}`,
          source: sExact,
          target: tExact,
          label: e.relationType,
          data: e,
          dimmed: false,
          highlighted: this.highlightedEdges().has(`e${i}`),
        };
      }),
    );
  }

  onSelect(e: any) {
    if (!e?.id) return;

    // 🔑 Click sul grafo: gestisce direttamente l'apertura del pannello
    this.selectNodeById(e.id);

    // 🔔 Notifica il padre per allineare la sidebar (senza innescare l'effect grazie alla guardia sopra)
    this.nodeClicked.emit(e.id);
  }

  selectNodeById(id: string) {
    const n =
      this.visN().find((x) => x.id.toLowerCase() === id.toLowerCase()) ||
      this.allNodes().find((x) => x.id.toLowerCase() === id.toLowerCase());
    if (!n) return;

    // 🔑 Aggiornamento stato sincrono → il pannello appare in 1 frame
    this.selId.set(n.id);
    this.selNode.set(n);
    this.expanded.set(false);
    this.funcBodyLoaded.set(false);
    this.currentFuncName.set(null);
    this.rawCode.set('');
    this.highlightedCode.set(this.sanitizer.bypassSecurityTrustHtml(''));
    this.hasUpdatePolicy.set(false);
    this.highlightedNodes.set(new Set());
    this.highlightedEdges.set(new Set());

    this.highlightSingleNode(n.id);

    if (n.data?.type?.toLowerCase() === 'table') {
      const edge = this.allEdges().find(
        (e) => e.relationType === 'UpdatePolicy' && e.target.toLowerCase() === n.id.toLowerCase(),
      );
      if (edge) {
        this.hasUpdatePolicy.set(true);
        if (edge.functionName) this.currentFuncName.set(edge.functionName);
      }
    }
    if (n.data?.type?.toLowerCase() === 'materializedview' && n.data.definitionQuery) {
      this.rawCode.set(n.data.definitionQuery);
      this.highlightedCode.set(
        this.sanitizer.bypassSecurityTrustHtml(this.highlightKql(n.data.definitionQuery)),
      );
      this.funcBodyLoaded.set(true);
    }
  }

  closePanel(emitClear: boolean = true) {
    this.selId.set(null);
    this.selNode.set(null);
    this.expanded.set(false);
    this.funcBodyLoaded.set(false);
    this.currentFuncName.set(null);
    this.rawCode.set('');
    this.highlightedCode.set(this.sanitizer.bypassSecurityTrustHtml(''));
    this.hasUpdatePolicy.set(false);
    this.highlightedNodes.set(new Set());
    this.highlightedEdges.set(new Set());

    if (emitClear) {
      this.panelClosed.emit(); // 🔑 Notifica il padre di pulire selIds
    }
  }
  // 🌊 Impact Analysis: Upstream / Downstream / All
  setHighlightMode(mode: 'all' | 'upstream' | 'downstream') {
    this.highlightMode.set(mode);
    if (this.selId()) this.highlightSingleNode(this.selId()!);
  }

  highlightSingleNode(nodeId: string) {
    this.highlightedNodes.set(new Set([nodeId]));
    this.highlightedEdges.set(new Set()); // Zero highlight su edge o nodi correlati
  }


  openInAdx() {
    const query = this.rawCode();
    if (!query) return;
    const cluster = APP_CONFIG.clusterUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const db = APP_CONFIG.database;
    const url = `https://dataexplorer.azure.com/clusters/${cluster}/databases/${db}?query=${encodeURIComponent(query)}`;
    window.open(url, '_blank');
  }

  exportSVG() {
    const svgEl = document.querySelector('ngx-graph svg') as SVGElement;
    if (!svgEl) {
      console.warn('[Export] SVG non trovato');
      return;
    }
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgEl);
    if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'adx-lineage.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  exportPNG() {
    const svgEl = document.querySelector('ngx-graph svg') as SVGElement;
    if (!svgEl) {
      console.warn('[Export] SVG non trovato');
      return;
    }
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgEl);
    if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const styles = `<style>.node rect{fill:#1C2433;stroke:#5A6B80}.node.selected rect{stroke:#FBBF24;stroke-width:2.5}.edge-path{stroke:#475569;stroke-width:2;fill:none}.edge-path[stroke="#3B82F6"]{stroke:#3B82F6}.edge-path[stroke="#F97316"]{stroke:#F97316}text{font-family:Inter,system-ui,sans-serif}</style>`;
    svgString = svgString.replace('</svg>', `${styles}</svg>`);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const scale = 2;
    canvas.width = svgEl.clientWidth * scale;
    canvas.height = svgEl.clientHeight * scale;
    img.onload = () => {
      if (!ctx) return;
      ctx.fillStyle = '#0B0F19';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'adx-lineage.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  }

  toggleExpand() {
    this.expanded.update((v) => !v);
  }

  async loadFunctionBody() {
    const node = this.selNode();
    if (!node || node.data.type?.toLowerCase() !== 'table') return;
    const edge = this.allEdges().find(
      (e) => e.relationType === 'UpdatePolicy' && e.target.toLowerCase() === node.id.toLowerCase(),
    );
    if (!edge) {
      this.rawCode.set('');
      this.highlightedCode.set(
        this.sanitizer.bypassSecurityTrustHtml('⚠️ Nessuna Update Policy configurata.'),
      );
      this.funcBodyLoaded.set(true);
      return;
    }
    if (!edge.functionName) {
      this.rawCode.set('');
      this.highlightedCode.set(
        this.sanitizer.bypassSecurityTrustHtml('📝 Policy inline (query diretta).'),
      );
      this.funcBodyLoaded.set(true);
      return;
    }
    this.currentFuncName.set(edge.functionName);
    this.highlightedCode.set(
      this.sanitizer.bypassSecurityTrustHtml(
        `⏳ Caricamento <strong>${edge.functionName}</strong>...`,
      ),
    );
    this.funcBodyLoaded.set(false);
    try {
      const res = await this.graphSvc.getFunctionBody(edge.functionName);
      const body = res.body || '-- Corpo funzione vuoto --';
      this.rawCode.set(body);
      this.highlightedCode.set(this.sanitizer.bypassSecurityTrustHtml(this.highlightKql(body)));
      this.funcBodyLoaded.set(true);
    } catch (err: any) {
      this.rawCode.set('');
      this.highlightedCode.set(
        this.sanitizer.bypassSecurityTrustHtml(
          `❌ Errore: ${err.status === 404 ? 'Funzione non trovata' : 'Errore di rete'}`,
        ),
      );
      this.funcBodyLoaded.set(true);
    }
  }

  highlightKql(code: string): string {
    if (!code) return '';
    let html = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/(\/\/.*$)/gm, '<span class="kql-comment">$1</span>');
    html = html.replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="kql-string">$1</span>');
    const kw =
      /\b(let|where|project|summarize|by|join|union|extend|order|sort|take|limit|count|distinct|render|datatable|externaldata|materialized-view|create|function|table|policy|update|on|kind|hint|lookup|evaluate|partition|invoke|serialize|mv-expand|mv-apply|facet|sample|top|getschema|make-series|range|print|assert|trace|set|show|alter|drop|enable|disable|clear|execute|ingest|into|from|as|with|schema|data|cluster|database|view|cache|hot|cold|total|row|datetime|timespan|guid|bool|int|long|real|string|dynamic|decimal)\b/gi;
    html = html.replace(kw, '<span class="kql-keyword">$1</span>');
    html = html.replace(
      /\b([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/g,
      '<span class="kql-function">$1</span>',
    );
    html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="kql-number">$1</span>');
    html = html.replace(/(\|)/g, '<span class="kql-pipe">$1</span>');
    return html;
  }

  formatCount(n?: number): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }

  copyQuery() {
    const txt = this.rawCode();
    if (txt) navigator.clipboard.writeText(txt);
  }

  zoomIn(e: MouseEvent) {
    this.graph.zoom(1.2);
  }

  zoomOut(e: MouseEvent) {
    if (this.graph?.zoom) this.graph.zoom(0.8);
  }

  center() {
    const api = this.graph?.chart ?? this.graph;
    if (api?.center) api.center();
    else if (api?.panZoomService?.center) api.panZoomService.center();
  }

  toggleLayout() {
    this.layoutMode.set(this.layoutMode() === 'dagre' ? 'd3ForceDirected' : 'dagre');
  }

  midPoint(points?: any[]) {
    if (!points || points.length < 2) return { x: 0, y: 0 };
    const mid = Math.floor(points.length / 2);
    return { x: points[mid].x, y: points[mid].y - 8 };
  }

  truncate(text: string, max: number) {
    return text && text.length > max ? text.slice(0, max - 1) + '…' : text || '';
  }

col(layer: string | undefined, type: string): string {
  const safe = (layer || 'Unknown') as keyof typeof LAYER_THEME;
  const theme = LAYER_THEME[safe];
  // Mappa le chiavi storiche (bdr/acc/txt) alle nuove (border/accent/text)
  const key = type === 'bdr' ? 'border' : type === 'acc' ? 'accent' : type === 'txt' ? 'text' : type;
  return theme?.[key as keyof typeof theme] || LAYER_THEME.Unknown[key as keyof typeof LAYER_THEME['Unknown']];
}



  isDimmed(nodeId: string): boolean {
    return this.visN().find((n) => n.id === nodeId)?.dimmed || false;
  }

  upstreamCount = computed(() => {
    const id = this.selId();
    if (!id) return 0;
    return this.visL().filter((l) => l.target === id).length;
  });
  downstreamCount = computed(() => {
    const id = this.selId();
    if (!id) return 0;
    return this.visL().filter((l) => l.source === id).length;
  });

  async refreshSingleNode() {
    const node = this.selNode();
    if (!node || this.isRefreshing()) return;

    this.isRefreshing.set(true);
    try {
      const updated = await this.graphSvc.refreshNode(node.id, node.data.type);
      if (updated) {
        this.selNode.set({ ...node, data: { ...node.data, ...updated } });
        this.nodeUpdated.emit({ id: node.id, ...updated });
        this.showToast('✅ Metadati aggiornati'); // 🔑 Trigger toast
      }
    } catch (err) {
      console.error('[Refresh] Errore aggiornamento nodo:', err);
      this.showToast('❌ Aggiornamento fallito');
    } finally {
      this.isRefreshing.set(false);
    }
  }

  private showToast(msg: string) {
    this.toastMessage.set(msg);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastMessage.set(null), 3000);
  }
  formatDuration(raw?: string): string {
    if (!raw) return 'Default';
    const val = raw.trim().toLowerCase();

    if (val.includes('infinite') || val === '∞') return '∞';

    // ADX restituisce "7.00:00:00" o "30.00:00:00"
    const daysMatch = val.match(/^(\d+)\./);
    if (daysMatch) return `${daysMatch[1]}d`;

    // Già formattato (es. "7d", "24h", "1y")
    if (/^\d+[dyhm]$/.test(val)) return val;

    // Fallback sicuro
    return val.replace('.00:00:00', 'd');
  }
}
