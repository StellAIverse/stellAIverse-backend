// src/plugins/plugin.interface.ts

export type PluginStatus = "pending" | "approved" | "active" | "inactive";

export interface PluginMetadata {
  name: string;
  version: string;
  author: string;
  description: string;
  capabilities: string[]; // e.g. ["ai", "oracle"]
}

export interface PluginContext {
  emitEvent: (event: string, payload: any) => void;
  log: (message: string) => void;
}

export interface Plugin {
  metadata: PluginMetadata;

  onInit?(ctx: PluginContext): Promise<void>;
  onExecute?(input: any): Promise<any>;
  onShutdown?(): Promise<void>;
}
