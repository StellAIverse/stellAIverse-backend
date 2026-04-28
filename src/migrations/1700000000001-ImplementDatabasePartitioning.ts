import { MigrationInterface, QueryRunner } from 'typeorm';

export class ImplementDatabasePartitioning1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable partitioning extension if not already enabled
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_partman;`);

    // 1. Partition agent_events table by date (monthly partitions)
    await queryRunner.query(`
      -- Create partitioned table for agent_events
      CREATE TABLE IF NOT EXISTS agent_events_partitioned (
        LIKE agent_events INCLUDING ALL
      ) PARTITION BY RANGE (created_at);
    `);

    // Create initial partitions (current month and next 2 months)
    const currentDate = new Date();
    for (let i = 0; i < 3; i++) {
      const partitionDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const nextMonth = new Date(partitionDate.getFullYear(), partitionDate.getMonth() + 1, 1);
      const partitionName = `agent_events_${partitionDate.getFullYear()}_${String(partitionDate.getMonth() + 1).padStart(2, '0')}`;
      
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${partitionName} 
        PARTITION OF agent_events_partitioned
        FOR VALUES FROM ('${partitionDate.toISOString()}') TO ('${nextMonth.toISOString()}');
      `);
    }

    // 2. Partition oracle_submissions table by date (monthly partitions)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle_submissions_partitioned (
        LIKE oracle_submissions INCLUDING ALL
      ) PARTITION BY RANGE (created_at);
    `);

    for (let i = 0; i < 3; i++) {
      const partitionDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const nextMonth = new Date(partitionDate.getFullYear(), partitionDate.getMonth() + 1, 1);
      const partitionName = `oracle_submissions_${partitionDate.getFullYear()}_${String(partitionDate.getMonth() + 1).padStart(2, '0')}`;
      
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${partitionName} 
        PARTITION OF oracle_submissions_partitioned
        FOR VALUES FROM ('${partitionDate.toISOString()}') TO ('${nextMonth.toISOString()}');
      `);
    }

    // 3. Partition compute_results table by date (monthly partitions)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS compute_results_partitioned (
        LIKE compute_results INCLUDING ALL
      ) PARTITION BY RANGE (created_at);
    `);

    for (let i = 0; i < 3; i++) {
      const partitionDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const nextMonth = new Date(partitionDate.getFullYear(), partitionDate.getMonth() + 1, 1);
      const partitionName = `compute_results_${partitionDate.getFullYear()}_${String(partitionDate.getMonth() + 1).padStart(2, '0')}`;
      
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${partitionName} 
        PARTITION OF compute_results_partitioned
        FOR VALUES FROM ('${partitionDate.toISOString()}') TO ('${nextMonth.toISOString()}');
      `);
    }

    // 4. Partition notifications table by date and status (composite partitioning)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications_partitioned (
        LIKE notifications INCLUDING ALL
      ) PARTITION BY LIST (is_read);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications_unread 
      PARTITION OF notifications_partitioned
      FOR VALUES IN (false);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications_read 
      PARTITION OF notifications_partitioned
      FOR VALUES IN (true);
    `);

    // 5. Create analytics table for performance metrics (time-series data)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        metric_name VARCHAR(100) NOT NULL,
        metric_value DECIMAL(15,4) NOT NULL,
        tags JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      ) PARTITION BY RANGE (timestamp);
    `);

    // Create partitions for performance_metrics (daily partitions for last 30 days)
    for (let i = 0; i < 30; i++) {
      const partitionDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + i);
      const nextDay = new Date(partitionDate.getFullYear(), partitionDate.getMonth(), partitionDate.getDate() + 1);
      const partitionName = `performance_metrics_${partitionDate.getFullYear()}_${String(partitionDate.getMonth() + 1).padStart(2, '0')}_${String(partitionDate.getDate()).padStart(2, '0')}`;
      
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${partitionName} 
        PARTITION OF performance_metrics
        FOR VALUES FROM ('${partitionDate.toISOString()}') TO ('${nextDay.toISOString()}');
      `);
    }

    // 6. Create audit logs table with partitioning
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID NOT NULL,
        action VARCHAR(50) NOT NULL,
        old_values JSONB,
        new_values JSONB,
        user_id UUID,
        ip_address INET,
        user_agent TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      ) PARTITION BY RANGE (timestamp);
    `);

    // Create monthly partitions for audit logs
    for (let i = 0; i < 12; i++) {
      const partitionDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      const nextMonth = new Date(partitionDate.getFullYear(), partitionDate.getMonth() + 1, 1);
      const partitionName = `audit_logs_${partitionDate.getFullYear()}_${String(partitionDate.getMonth() + 1).padStart(2, '0')}`;
      
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${partitionName} 
        PARTITION OF audit_logs
        FOR VALUES FROM ('${partitionDate.toISOString()}') TO ('${nextMonth.toISOString()}');
      `);
    }

    // 7. Create indexes on partitioned tables
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_events_partitioned_agent_time 
      ON agent_events_partitioned(agent_id, created_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_oracle_submissions_partitioned_status_time 
      ON oracle_submissions_partitioned(status, created_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_compute_results_partitioned_job_time 
      ON compute_results_partitioned(compute_job_id, created_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_performance_metrics_name_time 
      ON performance_metrics(metric_name, timestamp DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_time 
      ON audit_logs(entity_type, entity_id, timestamp DESC);
    `);

    // 8. Create partition maintenance function
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION create_monthly_partitions(table_name text, start_date date, end_date date)
      RETURNS void AS $$
      DECLARE
        current_date date := start_date;
        partition_name text;
        next_month date;
      BEGIN
        WHILE current_date < end_date LOOP
          partition_name := table_name || '_' || to_char(current_date, 'YYYY_MM');
          next_month := current_date + interval '1 month';
          
          EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                        partition_name, table_name, current_date, next_month);
          
          current_date := next_month;
        END LOOP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 9. Create partition cleanup function for old data
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION cleanup_old_partitions(table_name text, retention_months integer)
      RETURNS void AS $$
      DECLARE
        cutoff_date date := CURRENT_DATE - (retention_months || ' months')::interval;
        partition_name text;
      BEGIN
        FOR partition_name IN 
          SELECT inhrelid::regclass::text 
          FROM pg_inherits 
          WHERE inhparent = table_name::regclass 
            AND inhrelid::regclass::text < table_name || '_' || to_char(cutoff_date, 'YYYY_MM')
        LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || partition_name;
        END LOOP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 10. Create automated partition management job
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION maintain_partitions()
      RETURNS void AS $$
      BEGIN
        -- Create future partitions for agent_events
        PERFORM create_monthly_partitions('agent_events_partitioned', CURRENT_DATE, CURRENT_DATE + interval '3 months');
        
        -- Create future partitions for oracle_submissions
        PERFORM create_monthly_partitions('oracle_submissions_partitioned', CURRENT_DATE, CURRENT_DATE + interval '3 months');
        
        -- Create future partitions for compute_results
        PERFORM create_monthly_partitions('compute_results_partitioned', CURRENT_DATE, CURRENT_DATE + interval '3 months');
        
        -- Create future partitions for audit_logs
        PERFORM create_monthly_partitions('audit_logs', CURRENT_DATE, CURRENT_DATE + interval '6 months');
        
        -- Clean up old partitions (keep 12 months for audit logs, 6 months for others)
        PERFORM cleanup_old_partitions('agent_events_partitioned', 6);
        PERFORM cleanup_old_partitions('oracle_submissions_partitioned', 6);
        PERFORM cleanup_old_partitions('compute_results_partitioned', 6);
        PERFORM cleanup_old_partitions('audit_logs', 12);
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 11. Set up automatic partition maintenance (requires pg_cron extension)
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_cron;`);
      await queryRunner.query(`
        SELECT cron.schedule('maintain-partitions', '0 2 * * *', 'SELECT maintain_partitions();');
      `);
    } catch (error) {
      console.warn('Could not set up automatic partition maintenance with pg_cron:', error);
    }

    // 12. Create views for easier access to partitioned data
    await queryRunner.query(`
      CREATE OR REPLACE VIEW agent_events_view AS
      SELECT * FROM agent_events_partitioned
      UNION ALL
      SELECT * FROM agent_events
      WHERE created_at < (SELECT MIN(created_at) FROM agent_events_partitioned);
    `);

    await queryRunner.query(`
      CREATE OR REPLACE VIEW oracle_submissions_view AS
      SELECT * FROM oracle_submissions_partitioned
      UNION ALL
      SELECT * FROM oracle_submissions
      WHERE created_at < (SELECT MIN(created_at) FROM oracle_submissions_partitioned);
    `);

    await queryRunner.query(`
      CREATE OR REPLACE VIEW compute_results_view AS
      SELECT * FROM compute_results_partitioned
      UNION ALL
      SELECT * FROM compute_results
      WHERE created_at < (SELECT MIN(created_at) FROM compute_results_partitioned);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop views
    await queryRunner.query(`DROP VIEW IF EXISTS agent_events_view;`);
    await queryRunner.query(`DROP VIEW IF EXISTS oracle_submissions_view;`);
    await queryRunner.query(`DROP VIEW IF EXISTS compute_results_view;`);

    // Drop partition maintenance functions
    await queryRunner.query(`DROP FUNCTION IF EXISTS maintain_partitions();`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS cleanup_old_partitions(text, integer);`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS create_monthly_partitions(text, date, date);`);

    // Drop partitioned tables
    await queryRunner.query(`DROP TABLE IF EXISTS agent_events_partitioned CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS oracle_submissions_partitioned CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS compute_results_partitioned CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications_partitioned CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS performance_metrics CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs CASCADE;`);

    // Try to remove cron job
    try {
      await queryRunner.query(`SELECT cron.unschedule('maintain-partitions');`);
    } catch (error) {
      console.warn('Could not remove cron job:', error);
    }
  }
}
