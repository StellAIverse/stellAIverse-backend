import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class OptimizeDatabaseIndexes1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Users table indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_wallet_address_created_at 
      ON users(wallet_address, created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_verified_created_at 
      ON users(email_verified, created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role_created_at 
      ON users(role, created_at DESC);
    `);

    // Agent events table indexes for time-series queries
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_events_composite 
      ON agent_events(agent_id, event_type, created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_events_user_time 
      ON agent_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_events_type_time 
      ON agent_events(event_type, created_at DESC);
    `);

    // Oracle submissions indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oracle_submissions_composite 
      ON oracle_submissions(oracle_id, status, created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oracle_submissions_status_time 
      ON oracle_submissions(status, created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oracle_submissions_user_time 
      ON oracle_submissions(user_id, created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oracle_submissions_tx_hash 
      ON oracle_submissions(transaction_hash) WHERE transaction_hash IS NOT NULL;
    `);

    // Compute results indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_compute_results_job_time 
      ON compute_results(compute_job_id, created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_compute_results_status_time 
      ON compute_results(status, created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_compute_results_user_time 
      ON compute_results(user_id, created_at DESC) WHERE user_id IS NOT NULL;
    `);

    // Notifications indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_status_time 
      ON notifications(user_id, is_read, created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_type_time 
      ON notifications(type, created_at DESC);
    `);

    // Referral indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_referrals_code 
      ON referrals(referral_code) WHERE referral_code IS NOT NULL;
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_referrals_hierarchy 
      ON referrals(referred_by_id, created_at DESC) WHERE referred_by_id IS NOT NULL;
    `);

    // Recommendations indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recommendations_user_agent 
      ON recommendation_interactions(user_id, agent_id, created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recommendations_feedback_time 
      ON recommendation_feedback(user_id, created_at DESC);
    `);

    // Portfolio indexes
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolios_user_time 
      ON portfolios(user_id, created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_assets_portfolio 
      ON portfolio_assets(portfolio_id, asset_type);
    `);

    // Partial indexes for better performance on common queries
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_events_recent 
      ON agent_events(created_at DESC) WHERE created_at > NOW() - INTERVAL '30 days';
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oracle_submissions_pending 
      ON oracle_submissions(created_at DESC) WHERE status = 'pending';
    `);
    
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread 
      ON notifications(user_id, created_at DESC) WHERE is_read = false;
    `);

    // Create statistics for better query planning
    await queryRunner.query(`
      CREATE STATISTICS IF NOT EXISTS users_wallet_stats ON users(wallet_address, created_at);
    `);
    
    await queryRunner.query(`
      CREATE STATISTICS IF NOT EXISTS agent_events_composite_stats ON agent_events(agent_id, event_type, created_at);
    `);
    
    await queryRunner.query(`
      CREATE STATISTICS IF NOT EXISTS oracle_submissions_composite_stats ON oracle_submissions(oracle_id, status, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes in reverse order
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_users_wallet_address_created_at;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_users_email_verified_created_at;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_users_role_created_at;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_agent_events_composite;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_agent_events_user_time;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_agent_events_type_time;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_oracle_submissions_composite;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_oracle_submissions_status_time;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_oracle_submissions_user_time;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_oracle_submissions_tx_hash;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_compute_results_job_time;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_compute_results_status_time;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_compute_results_user_time;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_notifications_user_status_time;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_notifications_type_time;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_referrals_code;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_referrals_hierarchy;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_recommendations_user_agent;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_recommendations_feedback_time;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_portfolios_user_time;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_portfolio_assets_portfolio;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_agent_events_recent;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_oracle_submissions_pending;`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_notifications_unread;`);
    await queryRunner.query(`DROP STATISTICS IF EXISTS users_wallet_stats;`);
    await queryRunner.query(`DROP STATISTICS IF EXISTS agent_events_composite_stats;`);
    await queryRunner.query(`DROP STATISTICS IF EXISTS oracle_submissions_composite_stats;`);
  }
}
