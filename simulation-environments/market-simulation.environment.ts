/**
 * Market Simulation Environment
 * 
 * A trading market simulation where agents (traders) buy and sell assets,
 * react to market conditions, and compete for profit.
 * 
 * @version 1.0.0
 */

import {
  ISimulationEnvironment,
  EnvironmentMetadata,
  EnvironmentInitConfig,
  EnvironmentRunConfig,
  EnvironmentInitResult,
  EnvironmentRunResult,
  EnvironmentTeardownResult,
  SimulationEvent,
} from '../src/simulator/environment.interface';

interface Asset {
  id: string;
  name: string;
  basePrice: number;
  volatility: number;
  currentPrice: number;
  supply: number;
}

interface Trader {
  id: string;
  cash: number;
  portfolio: Map<string, number>; // assetId -> quantity
  strategy: 'aggressive' | 'conservative' | 'random';
  totalValue: number;
}

interface MarketState {
  assets: Map<string, Asset>;
  traders: Map<string, Trader>;
  orderBook: Order[];
  trades: Trade[];
  day: number;
  marketSentiment: number; // -1 to 1
}

interface Order {
  id: string;
  traderId: string;
  assetId: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: number;
}

interface Trade {
  buyerId: string;
  sellerId: string;
  assetId: string;
  quantity: number;
  price: number;
  timestamp: number;
}

export class MarketSimulationEnvironment implements ISimulationEnvironment {
  private state: MarketState | null = null;
  private config: EnvironmentInitConfig | null = null;
  private events: SimulationEvent[] = [];
  private isRunning = false;
  private isPaused = false;

  getMetadata(): EnvironmentMetadata {
    return {
      id: 'market-simulation',
      name: 'Market Simulation',
      version: '1.0.0',
      description: 'A trading market simulation where agents buy, sell, and trade assets',
      author: 'stellAIverse',
      tags: ['trading', 'market', 'economics', 'multi-agent'],
    };
  }

  async init(config: EnvironmentInitConfig): Promise<EnvironmentInitResult> {
    try {
      this.config = config;
      const seed = config.seed || Math.floor(Math.random() * 10000);
      const params = config.parameters || {};

      const numAssets = params.numAssets || 3;
      const numTraders = params.numTraders || 5;
      const initialCash = params.initialCash || 10000;

      // Initialize assets
      const assets = new Map<string, Asset>();
      const assetNames = ['TechCorp', 'EnergyPlus', 'HealthFirst', 'FinanceHub', 'RetailMax'];

      for (let i = 0; i < numAssets; i++) {
        const assetId = `asset-${i}`;
        const random = this.seededRandom(seed + i);
        
        assets.set(assetId, {
          id: assetId,
          name: assetNames[i % assetNames.length],
          basePrice: 50 + Math.floor(random * 150),
          volatility: 0.05 + random * 0.15,
          currentPrice: 50 + Math.floor(random * 150),
          supply: 10000,
        });
      }

      // Initialize traders
      const traders = new Map<string, Trader>();
      const strategies: Trader['strategy'][] = ['aggressive', 'conservative', 'random'];

      for (let i = 0; i < numTraders; i++) {
        const traderId = `trader-${i}`;
        const random = this.seededRandom(seed + 1000 + i);
        
        traders.set(traderId, {
          id: traderId,
          cash: initialCash,
          portfolio: new Map(),
          strategy: strategies[Math.floor(random * strategies.length)],
          totalValue: initialCash,
        });

        // Give initial portfolio
        for (const [assetId, asset] of assets) {
          if (this.seededRandom(seed + 2000 + i) > 0.5) {
            const quantity = Math.floor(this.seededRandom(seed + 3000 + i) * 100);
            traders.get(traderId)!.portfolio.set(assetId, quantity);
          }
        }
      }

      this.state = {
        assets,
        traders,
        orderBook: [],
        trades: [],
        day: 0,
        marketSentiment: 0,
      };

      // Initialize agents if provided
      if (config.parameters?.agents) {
        for (const agentConfig of config.parameters.agents) {
          this.addTrader(agentConfig.id, agentConfig.parameters);
        }
      }

      return {
        success: true,
        state: this.getState(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async run(config: EnvironmentRunConfig): Promise<EnvironmentRunResult> {
    if (!this.state) {
      return {
        success: false,
        steps: 0,
        durationMs: 0,
        error: 'Environment not initialized',
      };
    }

    const startTime = Date.now();
    const maxSteps = config.maxSteps || 100;
    this.isRunning = true;
    this.isPaused = false;

    try {
      while (this.state.day < maxSteps && this.isRunning && !this.isPaused) {
        const result = await this.step();
        
        if (config.onStep) {
          await config.onStep(this.state.day, this.getState());
        }

        if (!result.continue) {
          break;
        }

        // Check time limit
        if (config.timeLimitMs && Date.now() - startTime > config.timeLimitMs) {
          break;
        }
      }

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        steps: this.state.day,
        durationMs,
        finalState: this.getState(),
        agentStates: this.getTraderStates(),
        events: this.events,
        metrics: {
          totalTrades: this.state.trades.length,
          totalVolume: this.state.trades.reduce((sum, t) => sum + t.quantity * t.price, 0),
          traderCount: this.state.traders.size,
          assetCount: this.state.assets.size,
        },
        terminated: !this.isRunning,
        terminationReason: this.isRunning ? 'max-steps-reached' : 'completed',
      };
    } catch (error: any) {
      return {
        success: false,
        steps: this.state.day,
        durationMs: Date.now() - startTime,
        error: error.message,
        finalState: this.getState(),
      };
    } finally {
      this.isRunning = false;
    }
  }

  async step(): Promise<{ continue: boolean; state: any }> {
    if (!this.state) {
      throw new Error('Environment not initialized');
    }

    this.state.day++;

    // Update market sentiment
    this.state.marketSentiment = Math.sin(this.state.day * 0.1) * 0.5 + (Math.random() - 0.5) * 0.5;

    // Update asset prices based on sentiment
    for (const asset of this.state.assets.values()) {
      const change = (Math.random() - 0.5) * 2 * asset.volatility + this.state.marketSentiment * 0.01;
      asset.currentPrice = Math.max(1, asset.currentPrice * (1 + change));
    }

    // Each trader makes decisions
    for (const [traderId, trader] of this.state.traders) {
      if (this.isPaused) break;

      this.executeTraderStrategy(trader);

      // Log event
      this.events.push({
        step: this.state.day,
        timestamp: Date.now(),
        type: 'trader-action',
        agentId: traderId,
        data: { cash: trader.cash, portfolioSize: trader.portfolio.size },
      });
    }

    // Process orders and execute trades
    this.processOrders();

    // Update trader total values
    for (const trader of this.state.traders.values()) {
      trader.totalValue = this.calculateTraderValue(trader);
    }

    return {
      continue: this.state.day < 365,
      state: this.getState(),
    };
  }

  async pause(): Promise<void> {
    this.isPaused = true;
  }

  async resume(): Promise<void> {
    this.isPaused = false;
  }

  getState(): any {
    if (!this.state) return null;

    return {
      day: this.state.day,
      marketSentiment: this.state.marketSentiment,
      assets: Array.from(this.state.assets.values()).map(a => ({
        id: a.id,
        name: a.name,
        currentPrice: Math.round(a.currentPrice * 100) / 100,
        supply: a.supply,
      })),
      traders: Array.from(this.state.traders.values()).map(t => ({
        id: t.id,
        cash: Math.round(t.cash * 100) / 100,
        totalValue: Math.round(t.totalValue * 100) / 100,
        strategy: t.strategy,
      })),
      totalTrades: this.state.trades.length,
      recentTrades: this.state.trades.slice(-5),
    };
  }

  async teardown(): Promise<EnvironmentTeardownResult> {
    this.isRunning = false;
    this.state = null;
    this.config = null;
    this.events = [];

    return {
      success: true,
    };
  }

  validateConfig(config: EnvironmentInitConfig): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const params = config.parameters || {};

    if (params.numAssets !== undefined && (params.numAssets < 1 || params.numAssets > 10)) {
      errors.push('Number of assets must be between 1 and 10');
    }
    if (params.numTraders !== undefined && (params.numTraders < 2 || params.numTraders > 20)) {
      errors.push('Number of traders must be between 2 and 20');
    }
    if (params.initialCash !== undefined && params.initialCash < 1000) {
      errors.push('Initial cash must be at least 1000');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  getParameterSchema(): Record<string, any> {
    return {
      numAssets: {
        type: 'number',
        default: 3,
        min: 1,
        max: 10,
        description: 'Number of assets in the market',
      },
      numTraders: {
        type: 'number',
        default: 5,
        min: 2,
        max: 20,
        description: 'Number of traders in the market',
      },
      initialCash: {
        type: 'number',
        default: 10000,
        min: 1000,
        description: 'Initial cash for each trader',
      },
    };
  }

  // Helper methods
  private addTrader(id: string, parameters?: Record<string, any>): void {
    if (!this.state) return;

    const strategies: Trader['strategy'][] = ['aggressive', 'conservative', 'random'];
    
    const trader: Trader = {
      id,
      cash: parameters?.initialCash || 10000,
      portfolio: new Map(),
      strategy: parameters?.strategy || strategies[Math.floor(Math.random() * strategies.length)],
      totalValue: parameters?.initialCash || 10000,
    };

    this.state.traders.set(id, trader);
  }

  private executeTraderStrategy(trader: Trader): void {
    if (!this.state) return;

    const assets = Array.from(this.state.assets.values());
    if (assets.length === 0) return;

    const asset = assets[Math.floor(Math.random() * assets.length)];
    const quantity = Math.floor(Math.random() * 10) + 1;

    switch (trader.strategy) {
      case 'aggressive':
        // Buy/sell large quantities
        if (Math.random() > 0.5 && trader.cash >= asset.currentPrice * quantity) {
          this.placeOrder(trader.id, asset.id, 'buy', quantity * 2, asset.currentPrice);
        } else if (trader.portfolio.get(asset.id) || 0 >= quantity) {
          this.placeOrder(trader.id, asset.id, 'sell', quantity, asset.currentPrice * 1.05);
        }
        break;

      case 'conservative':
        // Only buy low, sell high
        if (asset.currentPrice < asset.basePrice && trader.cash >= asset.currentPrice * quantity) {
          this.placeOrder(trader.id, asset.id, 'buy', quantity, asset.currentPrice);
        } else if (asset.currentPrice > asset.basePrice * 1.1 && (trader.portfolio.get(asset.id) || 0) >= quantity) {
          this.placeOrder(trader.id, asset.id, 'sell', quantity, asset.currentPrice);
        }
        break;

      case 'random':
      default:
        // Random actions
        if (Math.random() > 0.5 && trader.cash >= asset.currentPrice * quantity) {
          this.placeOrder(trader.id, asset.id, 'buy', quantity, asset.currentPrice);
        } else if ((trader.portfolio.get(asset.id) || 0) >= quantity) {
          this.placeOrder(trader.id, asset.id, 'sell', quantity, asset.currentPrice);
        }
        break;
    }
  }

  private placeOrder(traderId: string, assetId: string, type: 'buy' | 'sell', quantity: number, price: number): void {
    if (!this.state) return;

    const order: Order = {
      id: `order-${Date.now()}-${Math.random()}`,
      traderId,
      assetId,
      type,
      quantity,
      price,
      timestamp: Date.now(),
    };

    this.state.orderBook.push(order);
  }

  private processOrders(): void {
    if (!this.state) return;

    const buyOrders = this.state.orderBook.filter(o => o.type === 'buy').sort((a, b) => b.price - a.price);
    const sellOrders = this.state.orderBook.filter(o => o.type === 'sell').sort((a, b) => a.price - b.price);

    for (const buyOrder of buyOrders) {
      const matchingSell = sellOrders.find(s => 
        s.assetId === buyOrder.assetId && 
        s.price <= buyOrder.price &&
        s.traderId !== buyOrder.traderId
      );

      if (matchingSell) {
        this.executeTrade(buyOrder, matchingSell);
        
        // Remove matched orders
        const sellIndex = sellOrders.indexOf(matchingSell);
        sellOrders.splice(sellIndex, 1);
      }
    }

    // Clear processed orders
    this.state.orderBook = [];
  }

  private executeTrade(buyOrder: Order, sellOrder: Order): void {
    if (!this.state) return;

    const buyer = this.state.traders.get(buyOrder.traderId);
    const seller = this.state.traders.get(sellOrder.traderId);
    const asset = this.state.assets.get(buyOrder.assetId);

    if (!buyer || !seller || !asset) return;

    const quantity = Math.min(buyOrder.quantity, sellOrder.quantity);
    const price = (buyOrder.price + sellOrder.price) / 2;
    const totalCost = quantity * price;

    // Update buyer
    buyer.cash -= totalCost;
    const buyerHoldings = buyer.portfolio.get(asset.id) || 0;
    buyer.portfolio.set(asset.id, buyerHoldings + quantity);

    // Update seller
    seller.cash += totalCost;
    const sellerHoldings = seller.portfolio.get(asset.id) || 0;
    seller.portfolio.set(asset.id, sellerHoldings - quantity);

    // Record trade
    const trade: Trade = {
      buyerId: buyer.id,
      sellerId: seller.id,
      assetId: asset.id,
      quantity,
      price,
      timestamp: Date.now(),
    };

    this.state.trades.push(trade);
  }

  private calculateTraderValue(trader: Trader): number {
    if (!this.state) return trader.cash;

    let portfolioValue = 0;
    for (const [assetId, quantity] of trader.portfolio) {
      const asset = this.state.assets.get(assetId);
      if (asset) {
        portfolioValue += quantity * asset.currentPrice;
      }
    }

    return trader.cash + portfolioValue;
  }

  private getTraderStates(): Record<string, any> {
    if (!this.state) return {};

    const states: Record<string, any> = {};
    for (const [id, trader] of this.state.traders) {
      states[id] = {
        id: trader.id,
        cash: Math.round(trader.cash * 100) / 100,
        totalValue: Math.round(trader.totalValue * 100) / 100,
        strategy: trader.strategy,
        portfolio: Object.fromEntries(trader.portfolio),
      };
    }
    return states;
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
}

// Export factory function
export default function createEnvironment(): ISimulationEnvironment {
  return new MarketSimulationEnvironment();
}
