import { Component, input, model, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import Fuse from 'fuse.js';
import { AdxNode } from '../services/adx-graph.service';

@Component({
  selector: 'app-table-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './table-selector.component.html',
  styleUrl: './table-selector.component.scss'
})
export class TableSelectorComponent {
  nodes = input.required<AdxNode[]>();
  layers = input.required<string[]>();
  sel = model<string[]>([]);
  selLayers = model<string[]>([]);
  q = signal('');

  // 🔑 Signal per la modalità di visualizzazione
  groupByLayer = signal(true);

  private sanitizer = inject(DomSanitizer);

  private fuseIndex = computed(() => {
    const nodes = this.nodes();
    if (!nodes.length) return null;
    return new Fuse(nodes, {
      keys: ['label'],
      threshold: 0.4,
      includeMatches: true,
      ignoreLocation: true
    });
  });

  filteredNodes = computed(() => {
    const query = this.q().trim();
    const layerActive = this.selLayers().length > 0;
    const fuse = this.fuseIndex();
    const allNodes = this.nodes();
    let results = allNodes;

    if (query && fuse) {
      results = fuse.search(query).map(r => r.item);
    } else if (query && !fuse) {
      results = allNodes.filter(n => n.label.toLowerCase().includes(query.toLowerCase()));
    }

    if (layerActive) {
      results = results.filter(n => this.selLayers().includes(n.layer || 'Unknown'));
    }

    const groupBy = this.groupByLayer();
    const layerOrder: Record<string, number> = { Bronze: 0, Silver: 1, Gold: 2, Unknown: 3 };

    return [...results].sort((a, b) => {
      if (groupBy) {
        const layerDiff = (layerOrder[a.layer || 'Unknown'] ?? 3) - (layerOrder[b.layer || 'Unknown'] ?? 3);
        return layerDiff !== 0 ? layerDiff : a.label.localeCompare(b.label);
      } else {
        const rowsA = a.totalRowCount ?? a.totalRowCount ?? 0;
        const rowsB = b.totalRowCount ?? b.totalRowCount ?? 0;
        return rowsB - rowsA || a.label.localeCompare(b.label);
      }
    });
  });

  toggle(id: string) {
    this.sel.set(this.sel().includes(id) ? [] : [id]);
  }

  toggleLayer(l: string) {
    const c = this.selLayers();
    this.selLayers.set(c.includes(l) ? c.filter(x => x !== l) : [...c, l]);
  }

  getHighlightedLabel(node: AdxNode): SafeHtml {
    const query = this.q().trim();
    if (!query) return node.label;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const html = node.label.replace(regex, '<mark class="search-match">$1</mark>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  formatCount(n?: number): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }

  getLayerAccent(layer?: string): string {
    const map: Record<string, string> = {
      Bronze: '#D4A373', Silver: '#8B9DB5', Gold: '#F5D03B', Unknown: '#718096'
    };
    return map[layer || 'Unknown'] || map['Unknown'];
  }
}