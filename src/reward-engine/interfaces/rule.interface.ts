export interface RuleCondition {
  field: string; // Dot notation path (e.g., "user.level", "transaction.amount")
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'greater_equal' | 'less_equal' | 'contains' | 'in' | 'regex';
  value: any;
  type?: 'string' | 'number' | 'date' | 'boolean';
}

export interface RuleAction {
  type: 'credit_reward' | 'token_reward' | 'feature_unlock' | 'badge_award' | 'multiplier_bonus';
  amount?: number | string; // Can be fixed number or expression
  currency?: string;
  featureId?: string;
  badgeId?: string;
  multiplier?: number;
  duration?: number; // In seconds for temporary bonuses
  metadata?: Record<string, any>;
}

export interface RuleEvaluationContext {
  userId: string;
  eventType: string;
  timestamp: Date;
  user?: {
    level: number;
    registrationDate: Date;
    totalTransactions: number;
    referralCount: number;
    riskScore: number;
  };
  transaction?: {
    amount: number;
    currency: string;
    type: string;
    riskScore: number;
  };
  referral?: {
    refereeId: string;
    referrerId: string;
    level: number;
  };
  campaign?: {
    id: string;
    type: string;
    isActive: boolean;
  };
  [key: string]: any; // Allow additional context fields
}

export interface RewardCalculationResult {
  ruleId: string;
  actions: RuleAction[];
  totalReward: number;
  appliedMultipliers: number[];
}