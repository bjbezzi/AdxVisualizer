import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AdxNode {
  id: string;
  label: string;
  type: string;
  layer: string;
  definitionQuery?: string;
  isFunctionRef?: boolean;
  docString?: string;
  totalRowCount?: number;
  hotRowCount?: number;
  softDeletePeriod?: string;
  hotCachePeriod?: string;
}

export interface AdxEdge {
  source: string;
  target: string;
  relationType: string;
  functionName?: string;
  query?: string;
}

export interface AdxGraph {
  nodes: AdxNode[];
  edges: AdxEdge[];
}

@Injectable({ providedIn: 'root' })
export class AdxGraphService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/adxgraph';

  fetch(refresh = false): Promise<AdxGraph> {
    return firstValueFrom(this.http.get<AdxGraph>(`${this.baseUrl}?refresh=${refresh}`));
  }

  getFunctionBody(name: string): Promise<{ body: string }> {
    return firstValueFrom(this.http.get<{ body: string }>(`${this.baseUrl}/function/${encodeURIComponent(name)}`));
  }

  async refreshNode(nodeId: string, nodeType: string): Promise<any> {
    const url = `${this.baseUrl}/node/${encodeURIComponent(nodeId)}/refresh?type=${encodeURIComponent(nodeType)}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`[Refresh] HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }
}
