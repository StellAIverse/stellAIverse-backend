import { Injectable, Logger } from '@nestjs/common';
import { ProtocolAdapter } from './protocol-adapter.interface';
import { AaveAdapter } from './aave.adapter';
import { CompoundAdapter } from './compound.adapter';
import { DeFiProtocol } from '../entities/defi-position.entity';

@Injectable()
export class ProtocolRegistry {
  private logger = new Logger('ProtocolRegistry');
  private adapters: Map<DeFiProtocol, ProtocolAdapter> = new Map();

  constructor(
    private aaveAdapter: AaveAdapter,
    private compoundAdapter: CompoundAdapter,
  ) {
    this.registerAdapters();
  }

  private registerAdapters() {
    this.adapters.set(DeFiProtocol.AAVE, this.aaveAdapter);
    this.adapters.set(DeFiProtocol.COMPOUND, this.compoundAdapter);
    // Additional adapters would be registered here
    // this.adapters.set(DeFiProtocol.YEARN, new YearnAdapter());
    // this.adapters.set(DeFiProtocol.LIDO, new LidoAdapter());
  }

  getAdapter(protocol: DeFiProtocol): ProtocolAdapter {
    const adapter = this.adapters.get(protocol);
    if (!adapter) {
      throw new Error(`Protocol adapter not found: ${protocol}`);
    }
    return adapter;
  }

  getAllAdapters(): ProtocolAdapter[] {
    return Array.from(this.adapters.values());
  }

  isProtocolSupported(protocol: DeFiProtocol): boolean {
    return this.adapters.has(protocol);
  }

  getSupportedProtocols(): string[] {
    return Array.from(this.adapters.keys());
  }

  getProtocolsByChain(chain: string): ProtocolAdapter[] {
    const supportingAdapters: ProtocolAdapter[] = [];

    for (const adapter of this.adapters.values()) {
      if (adapter.supportedChains.includes(chain)) {
        supportingAdapters.push(adapter);
      }
    }

    return supportingAdapters;
  }

  registerAdapter(protocol: DeFiProtocol, adapter: ProtocolAdapter) {
    this.logger.log(`Registering adapter for protocol: ${protocol}`);
    this.adapters.set(protocol, adapter);
  }
}
