import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AdxNode {
  id: string; label: string; type: string; layer: string;
  definitionQuery?: string; isFunctionRef?: boolean; docString?: string;
  totalRowCount?: number; hotRowCount?: number;
}
export interface AdxEdge { source: string; target: string; relationType: string; functionName?: string; query?: string; }
export interface AdxGraph { nodes: AdxNode[]; edges: AdxEdge[]; }

@Injectable({ providedIn: 'root' })
export class AdxGraphService {
  private http = inject(HttpClient);
  private readonly baseUrl = '/api/adxgraph';
  fetch(refresh = false) { return firstValueFrom(this.http.get<AdxGraph>(`${this.baseUrl}?refresh=${refresh}`)); }
  getFunctionBody(name: string) { return firstValueFrom(this.http.get<{ body: string }>(`${this.baseUrl}/function/${encodeURIComponent(name)}`)); }

async refreshNode(nodeId: string, nodeType: string): Promise<any> {
  // 🔑 Cambia 'adx' in 'metadata' se il tuo controller si chiama MetadataController
  const controllerPrefix = 'adx'; 
  const url = `${this.baseUrl}/node/${encodeURIComponent(nodeId)}/refresh?type=${encodeURIComponent(nodeType)}`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[Refresh] HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}
}
