import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdxGraphService } from './services/adx-graph.service';
import { HeaderComponent } from './components/header.component';
import { TableSelectorComponent } from './components/table-selector.component';
import { AdxGraphComponent } from './components/adx-graph.component';

@Component({
  selector: 'app-root', standalone: true,
  imports: [CommonModule, HeaderComponent, TableSelectorComponent, AdxGraphComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  svc = inject(AdxGraphService);
  nodes = signal<any[]>([]); edges = signal<any[]>([]);
  layers = signal<string[]>(['Bronze', 'Silver', 'Gold', 'Unknown']);
  selIds = signal<string[]>([]); selLays = signal<string[]>([]);
  loaded = signal(false); loadingMsg = signal('Caricamento metadati ADX...');
  sidebarOpen = signal(true);
  async ngOnInit() { await this.fetchData(false); }
  async fetchData(refresh: boolean) {
    this.loaded.set(false);
    this.loadingMsg.set(refresh ? '⟳ Aggiornamento...' : 'Caricamento metadati ADX...');

    // 🔑 Reset selezioni: previene ID orfani dopo il refresh
    this.selIds.set([]);
    this.selLays.set([]);

    try {
      const d = await this.svc.fetch(refresh);
      this.nodes.set(d.nodes);
      this.edges.set(d.edges);
      const actualLayers = [...new Set(d.nodes.map((n: any) => n.layer || 'Unknown'))];
      this.layers.set(actualLayers.length ? actualLayers : ['Unknown']);
    } catch (e) {
      console.error(e);
    } finally {
      this.loaded.set(true);
    }
  }
  refreshData() { this.fetchData(true); }

  handleNodeClick(id: string) {
    // Toggle sicuro: se già selezionato → deseleziona, altrimenti seleziona
    this.selIds.set(this.selIds()[0] === id ? [] : [id]);
  }

  handleNodeUpdated(updatedNode: any) {
    this.nodes.update(nodes =>
      nodes.map(n => n.id.toLowerCase() === updatedNode.id.toLowerCase()
        ? { ...n, ...updatedNode }
        : n)
    );
  }

toggleSidebar() { this.sidebarOpen.update(v => !v); }
}
