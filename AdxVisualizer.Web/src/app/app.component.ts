import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdxGraphService, AdxNode } from './services/adx-graph.service';
import { HeaderComponent } from './components/header.component';
import { TableSelectorComponent } from './components/table-selector.component';
import { AdxGraphComponent } from './components/adx-graph.component';

interface GraphData {
  nodes: AdxNode[];
  edges: any[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HeaderComponent, TableSelectorComponent, AdxGraphComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private readonly svc = inject(AdxGraphService);
  
  readonly nodes = signal<AdxNode[]>([]);
  readonly edges = signal<any[]>([]);
  readonly layers = signal<string[]>(['Bronze', 'Silver', 'Gold', 'Unknown']);
  readonly selectedIds = signal<string[]>([]);
  readonly selectedLayers = signal<string[]>([]);
  readonly loaded = signal(false);
  readonly loadingMessage = signal('Caricamento metadati ADX...');
  readonly sidebarOpen = signal(true);

  async ngOnInit(): Promise<void> {
    await this.fetchData(false);
  }

  async fetchData(refresh: boolean): Promise<void> {
    this.loaded.set(false);
    this.loadingMessage.set(refresh ? '⟳ Aggiornamento...' : 'Caricamento metadati ADX...');

    // Reset selections to prevent orphan IDs after refresh
    this.selectedIds.set([]);
    this.selectedLayers.set([]);

    try {
      const data: GraphData = await this.svc.fetch(refresh);
      this.nodes.set(data.nodes);
      this.edges.set(data.edges);
      
      const actualLayers = [...new Set(data.nodes.map(n => n.layer || 'Unknown'))];
      this.layers.set(actualLayers.length > 0 ? actualLayers : ['Unknown']);
    } catch (error) {
      console.error('Failed to fetch graph data:', error);
    } finally {
      this.loaded.set(true);
    }
  }

  refreshData(): void {
    this.fetchData(true);
  }

  handleNodeClick(nodeId: string): void {
    // Toggle selection: deselect if already selected, otherwise select
    this.selectedIds.set(this.selectedIds()[0] === nodeId ? [] : [nodeId]);
  }

  handleNodeUpdated(updatedNode: AdxNode): void {
    this.nodes.update(nodes =>
      nodes.map(n => 
        n.id.toLowerCase() === updatedNode.id.toLowerCase()
          ? { ...n, ...updatedNode }
          : n
      )
    );
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }
}
