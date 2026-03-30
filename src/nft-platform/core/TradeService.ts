import { Trade } from "../models/Trade";

export class TradeService {
  private trades: Trade[] = [];

  executeTrade(trade: Trade) {
    this.trades.push(trade);
    return trade;
  }

  getTrades() {
    return this.trades;
  }
}
