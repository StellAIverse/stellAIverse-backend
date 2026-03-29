import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { DeFiYieldRecord } from './defi-yield-record.entity';
import { DeFiTransaction } from './defi-transaction.entity';

export enum DeFiProtocol {
  AAVE = 'aave',
  COMPOUND = 'compound',
  YEARN = 'yearn',
  LIDO = 'lido',
  CURVE = 'curve',
  UNISWAP = 'uniswap',
  BALANCER = 'balancer',
  CONVEX = 'convex',
  MAKER = 'maker',
  ARBITRUM = 'arbitrum',
}

export enum PositionType {
  LENDING = 'lending',
  BORROWING = 'borrowing',
  LP = 'liquidity_provider',
  STAKING = 'staking',
  FARMING = 'farming',
  VAULT = 'vault',
  DERIVATIVE = 'derivative',
}

export enum PositionStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  LIQUIDATION_RISK = 'liquidation_risk',
  LIQUIDATED = 'liquidated',
  PAUSED = 'paused',
}

@Entity('defi_positions')
@Index(['user_id', 'protocol'])
@Index(['user_id', 'status'])
@Index(['created_at'])
export class DeFiPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column('uuid')
  user_id: string;

  @Column('enum', { enum: DeFiProtocol })
  protocol: DeFiProtocol;

  @Column('enum', { enum: PositionType })
  position_type: PositionType;

  @Column('enum', { enum: PositionStatus })
  status: PositionStatus;

  @Column('varchar', { length: 255 })
  contract_address: string;

  @Column('varchar', { length: 255 })
  wallet_address: string;

  @Column('varchar', { length: 100, nullable: true })
  token_symbol: string;

  @Column('varchar', { length: 100, nullable: true })
  pair_symbol: string;

  @Column('decimal', { precision: 36, scale: 18 })
  principal_amount: number;

  @Column('decimal', { precision: 36, scale: 18 })
  current_amount: number;

  @Column('decimal', { precision: 36, scale: 18, nullable: true })
  collateral_amount: number;

  @Column('decimal', { precision: 36, scale: 18, nullable: true })
  borrowed_amount: number;

  @Column('decimal', { precision: 36, scale: 18, default: 0 })
  accumulated_yield: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  apy: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  apy_estimated_annual: number;

  @Column('decimal', { precision: 36, scale: 18, nullable: true })
  collateral_value: number;

  @Column('decimal', { precision: 36, scale: 18, nullable: true })
  borrowed_value: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  ltv: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  max_ltv: number;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  liquidation_threshold: number;

  @Column('json', { nullable: true })
  reward_tokens: Array<{
    symbol: string;
    amount: number;
    value: number;
    apy: number;
  }>;

  @Column('json', { nullable: true })
  metadata: Record<string, any>;

  @Column('boolean', { default: false })
  auto_compound_enabled: boolean;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  risk_score: number;

  @OneToMany(() => DeFiYieldRecord, (record) => record.position, {
    cascade: true,
  })
  yield_records: DeFiYieldRecord[];

  @OneToMany(() => DeFiTransaction, (tx) => tx.position, { cascade: true })
  transactions: DeFiTransaction[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column('timestamp', { nullable: true })
  last_updated_on_chain: Date;
}
