import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

export interface IndexAnalysis {
  tableName: string;
  indexName: string;
  columns: string[];
  isUsed: boolean;
  size: string;
  scanCount: number;
  tupleCount: number;
  recommendation: string;
}

export interface QueryPerformanceMetrics {
  query: string;
  executionTime: number;
  rowsExamined: number;
  indexesUsed: string[];
  recommendations: string[];
}

@Injectable()
export class DatabaseIndexService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Analyze database indexes and provide optimization recommendations
   */
  async analyzeIndexes(): Promise<IndexAnalysis[]> {
    const query = `
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef,
        idx_scan as scan_count,
        idx_tup_read as tuple_count,
        idx_tup_fetch as tuple_fetch,
        pg_size_pretty(pg_relation_size(indexrelid)) as size,
        CASE 
          WHEN idx_scan = 0 THEN 'UNUSED'
          WHEN idx_scan < 10 THEN 'LOW_USAGE'
          WHEN idx_scan < 100 THEN 'MEDIUM_USAGE'
          ELSE 'HIGH_USAGE'
        END as usage_category
      FROM pg_stat_user_indexes 
      JOIN pg_indexes ON pg_stat_user_indexes.schemaname = pg_indexes.schemaname 
        AND pg_stat_user_indexes.tablename = pg_indexes.tablename 
        AND pg_stat_user_indexes.indexname = pg_indexes.indexname
      ORDER BY tablename, indexname;
    `;

    const results = await this.dataSource.query(query);
    
    return results.map((row: any) => ({
      tableName: row.tablename,
      indexName: row.indexname,
      columns: this.extractColumnsFromDefinition(row.indexdef),
      isUsed: row.scan_count > 0,
      size: row.size,
      scanCount: parseInt(row.scan_count),
      tupleCount: parseInt(row.tuple_count),
      recommendation: this.generateIndexRecommendation(row),
    }));
  }

  /**
   * Find missing indexes based on query patterns
   */
  async findMissingIndexes(): Promise<QueryPerformanceMetrics[]> {
    // Enable pg_stat_statements if not already enabled
    await this.ensurePgStatStatements();
    
    const query = `
      SELECT 
        query,
        calls,
        total_exec_time,
        rows,
        100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent,
        mean_exec_time,
        stddev_exec_time
      FROM pg_stat_statements 
      WHERE calls > 10 
        AND mean_exec_time > 100 
        AND query NOT LIKE '%pg_stat_statements%'
        AND query NOT LIKE '%information_schema%'
      ORDER BY mean_exec_time DESC
      LIMIT 20;
    `;

    const results = await this.dataSource.query(query);
    
    return results.map((row: any) => ({
      query: row.query,
      executionTime: parseFloat(row.mean_exec_time),
      rowsExamined: parseInt(row.rows),
      indexesUsed: [], // Would need EXPLAIN ANALYZE to determine this
      recommendations: this.generateQueryRecommendations(row),
    }));
  }

  /**
   * Create recommended indexes based on analysis
   */
  async createRecommendedIndexes(): Promise<void> {
    const recommendations = await this.generateIndexRecommendations();
    
    for (const recommendation of recommendations) {
      if (recommendation.priority === 'HIGH') {
        try {
          await this.dataSource.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${recommendation.indexName} ON ${recommendation.tableName} (${recommendation.columns.join(', ')});`);
          console.log(`Created index: ${recommendation.indexName}`);
        } catch (error) {
          console.error(`Failed to create index ${recommendation.indexName}:`, error);
        }
      }
    }
  }

  /**
   * Get table statistics for optimization
   */
  async getTableStatistics(): Promise<any[]> {
    const query = `
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
      FROM pg_stats 
      WHERE schemaname = 'public'
      ORDER BY tablename, attname;
    `;

    return await this.dataSource.query(query);
  }

  /**
   * Analyze slow queries
   */
  async analyzeSlowQueries(): Promise<QueryPerformanceMetrics[]> {
    const query = `
      SELECT 
        query,
        calls,
        total_exec_time,
        mean_exec_time,
        rows,
        shared_blks_hit,
        shared_blks_read
      FROM pg_stat_statements 
      WHERE mean_exec_time > 1000 
        AND calls > 5
      ORDER BY mean_exec_time DESC
      LIMIT 10;
    `;

    const results = await this.dataSource.query(query);
    
    return results.map((row: any) => ({
      query: row.query,
      executionTime: parseFloat(row.mean_exec_time),
      rowsExamined: parseInt(row.rows),
      indexesUsed: [],
      recommendations: this.generateSlowQueryRecommendations(row),
    }));
  }

  private extractColumnsFromDefinition(indexDef: string): string[] {
    const match = indexDef.match(/\(([^)]+)\)/);
    if (!match) return [];
    
    return match[1].split(',').map(col => col.trim().replace(/"/g, ''));
  }

  private generateIndexRecommendation(indexStats: any): string {
    if (indexStats.scan_count === 0) {
      return 'UNUSED - Consider dropping this index to save space and improve write performance';
    }
    
    if (indexStats.scan_count < 10) {
      return 'LOW_USAGE - Consider if this index is necessary for your workload';
    }
    
    if (indexStats.scan_count > 1000) {
      return 'HIGH_USAGE - This index is well utilized';
    }
    
    return 'OK - Index is being used moderately';
  }

  private generateQueryRecommendations(queryStats: any): string[] {
    const recommendations: string[] = [];
    
    if (queryStats.mean_exec_time > 1000) {
      recommendations.push('Consider adding indexes for columns in WHERE clauses');
    }
    
    if (queryStats.rows > 10000) {
      recommendations.push('Consider pagination to reduce result set size');
    }
    
    if (queryStats.hit_percent < 90) {
      recommendations.push('Low buffer cache hit rate - consider increasing shared_buffers or optimizing queries');
    }
    
    return recommendations;
  }

  private generateSlowQueryRecommendations(queryStats: any): string[] {
    const recommendations: string[] = [];
    
    if (queryStats.mean_exec_time > 5000) {
      recommendations.push('CRITICAL: This query is very slow and needs immediate optimization');
    }
    
    if (queryStats.shared_blks_read > queryStats.shared_blks_hit) {
      recommendations.push('High disk I/O - consider adding indexes or increasing memory');
    }
    
    recommendations.push('Run EXPLAIN ANALYZE on this query to identify bottlenecks');
    
    return recommendations;
  }

  private async generateIndexRecommendations(): Promise<any[]> {
    // This would analyze query patterns and suggest new indexes
    // For now, return some common recommendations based on the schema
    return [
      {
        tableName: 'users',
        columns: ['wallet_address', 'created_at'],
        indexName: 'idx_users_wallet_created_composite',
        priority: 'HIGH',
        reason: 'Frequent queries filter by wallet address and order by creation time'
      },
      {
        tableName: 'agent_events',
        columns: ['agent_id', 'event_type', 'created_at'],
        indexName: 'idx_agent_events_composite_optimized',
        priority: 'HIGH',
        reason: 'Common query pattern for agent event filtering and pagination'
      },
      {
        tableName: 'oracle_submissions',
        columns: ['status', 'created_at'],
        indexName: 'idx_oracle_submissions_status_time',
        priority: 'MEDIUM',
        reason: 'Queries often filter by submission status and time'
      }
    ];
  }

  private async ensurePgStatStatements(): Promise<void> {
    try {
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');
    } catch (error) {
      console.warn('Could not enable pg_stat_statements extension:', error);
    }
  }
}
