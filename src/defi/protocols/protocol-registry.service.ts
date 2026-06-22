import { Injectable, Logger } from "@nestjs/common";
import { ProtocolAdapter, ProtocolAdapterMetadata } from "./protocol-adapter.interface";

@Injectable()
export class ProtocolRegistry {
  private readonly logger = new Logger(ProtocolRegistry.name);
  private readonly adapters = new Map<string, ProtocolAdapter>();

  register(adapter: ProtocolAdapter): void {
    const key = adapter.name.toLowerCase();
    this.logger.log(`Registering protocol adapter: ${adapter.name}`);
    this.adapters.set(key, adapter);
  }

  getAdapter(protocolName: string): ProtocolAdapter {
    const adapter = this.adapters.get(protocolName.toLowerCase());
    if (!adapter) {
      throw new Error(`Protocol adapter not found: ${protocolName}`);
    }
    return adapter;
  }

  listProtocols(): ProtocolAdapterMetadata[] {
    return Array.from(this.adapters.values()).map((a) => a.metadata);
  }

  isSupported(protocolName: string): boolean {
    return this.adapters.has(protocolName.toLowerCase());
  }

  getAllAdapters(): ProtocolAdapter[] {
    return Array.from(this.adapters.values());
  }
}
