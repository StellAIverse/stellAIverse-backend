import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IndexedEvent } from "./entities/indexed-event.entity";
import { ethers } from "ethers";

@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private provider: ethers.Provider;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(IndexedEvent)
    private readonly indexedRepo: Repository<IndexedEvent>,
  ) {}

  async onModuleInit() {
    const rpc =
      this.config.get<string>("INDEXER_RPC_URL") ||
      this.config.get<string>("RPC_URL") ||
      "http://localhost:8545";
    this.provider = new ethers.JsonRpcProvider(rpc);
    await this.runOnce();
    const interval = Number(
      this.config.get<number>("INDEXER_POLL_INTERVAL_MS") || 10_000,
    );
    this.timer = setInterval(
      () => this.runOnce().catch(console.error),
      interval,
    );
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async getLastIndexedBlock(): Promise<number | null> {
    const row = await this.indexedRepo
      .createQueryBuilder("e")
      .select("MAX(CAST(e.blockNumber AS bigint))", "max")
      .getRawOne();
    if (!row || !row.max) return null;
    return Number(row.max);
  }

  private async handleReorgIfAny(
    lastBlock: number | null,
    startBlock: number,
  ): Promise<number> {
    if (lastBlock === null) return startBlock - 1;
    let b = lastBlock;
    while (b >= startBlock) {
      const event = await this.indexedRepo.findOne({
        where: { blockNumber: String(b) },
      });
      if (!event) {
        b = b - 1;
        continue;
      }
      const onchain = await this.provider.getBlock(Number(b));
      if (!onchain) {
        b = b - 1;
        continue;
      }
      if (onchain.hash === event.blockHash) {
        return b;
      }
      // reorg detected at block b, remove events >= b
      await this.indexedRepo
        .createQueryBuilder()
        .delete()
        .from(IndexedEvent)
        .where("CAST(blockNumber AS bigint) >= :b", { b })
        .execute();
      b = b - 1;
    }
    return startBlock - 1;
  }

  private async runOnce() {
    const confirmations = Number(
      this.config.get<number>("INDEXER_CONFIRMATIONS") || 6,
    );
    const startBlockCfg = Number(
      this.config.get<number>("INDEXER_START_BLOCK") || 0,
    );
    const contractAddr =
      this.config.get<string>("INDEXER_CONTRACT_ADDRESS") || undefined;
    const topic0 = this.config.get<string>("INDEXER_TOPIC0") || undefined;

    const latest = await this.provider.getBlockNumber();
    const safeTo = latest - confirmations;
    if (safeTo < 0) return;

    const lastIndexed = await this.getLastIndexedBlock();
    const lastSafe = await this.handleReorgIfAny(lastIndexed, startBlockCfg);
    let from = lastSafe + 1;
    if (from < startBlockCfg) from = startBlockCfg;
    if (from > safeTo) return; // nothing to do

    const batchSize = Number(
      this.config.get<number>("INDEXER_BATCH_BLOCKS") || 5000,
    );
    while (from <= safeTo) {
      const to = Math.min(from + batchSize - 1, safeTo);
      const filter: any = { fromBlock: from, toBlock: to };
      if (contractAddr) filter.address = contractAddr;
      if (topic0) filter.topics = [topic0];

      const logs = await this.provider.getLogs(filter);
      for (const l of logs) {
        try {
          const txHash = (l as any).transactionHash;
          const logIndex = Number((l as any).logIndex ?? (l as any).index ?? 0);
          const address = l.address;
          const t0 =
            l.topics && l.topics.length > 0 ? String(l.topics[0]) : null;
          const blockNumber = String(Number(l.blockNumber));
          const block = await this.provider.getBlock(Number(l.blockNumber));
          const blockHash = block ? block.hash : l.blockHash;

          const ev = this.indexedRepo.create({
            txHash,
            logIndex,
            address,
            topic0: t0,
            blockNumber,
            blockHash,
            data: l.data,
            topics: l.topics,
          } as any);
          try {
            await this.indexedRepo.insert(ev);
          } catch (e) {
            // duplicate or constraint violation — ignore
          }
        } catch (e) {
          console.error("Failed processing log", e);
        }
      }

      from = to + 1;
    }
  }
}
