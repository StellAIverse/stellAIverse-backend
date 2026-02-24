import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAuditEntities1708700000000 implements MigrationInterface {
  name = 'CreateAuditEntities1708700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create agent_events table
    await queryRunner.createTable(
      new Table({
        name: 'agent_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'agentId',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'eventType',
            type: 'varchar',
            enum: ['created', 'updated', 'deleted', 'executed', 'failed', 'paused', 'resumed'],
            isNullable: false,
          },
          {
            name: 'eventData',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'clientIp',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'userAgent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'NOW()',
            isNullable: false,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );

    // Create indexes for agent_events
    await queryRunner.createIndex(
      'agent_events',
      new TableIndex({
        name: 'IDX_AGENT_EVENTS_AGENT_ID_EVENT_TYPE',
        columnNames: ['agentId', 'eventType'],
      }),
    );

    await queryRunner.createIndex(
      'agent_events',
      new TableIndex({
        name: 'IDX_AGENT_EVENTS_AGENT_ID_CREATED_AT',
        columnNames: ['agentId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'agent_events',
      new TableIndex({
        name: 'IDX_AGENT_EVENTS_EVENT_TYPE_CREATED_AT',
        columnNames: ['eventType', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'agent_events',
      new TableIndex({
        name: 'IDX_AGENT_EVENTS_USER_ID_CREATED_AT',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    // Create oracle_submissions table
    await queryRunner.createTable(
      new Table({
        name: 'oracle_submissions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'oracleId',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'data',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'dataHash',
            type: 'varchar',
            length: '66',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'signature',
            type: 'varchar',
            length: '132',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            enum: ['pending', 'submitted', 'confirmed', 'failed', 'expired'],
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'submittedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'confirmedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'transactionHash',
            type: 'varchar',
            length: '66',
            isNullable: true,
          },
          {
            name: 'blockNumber',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'retryAttempts',
            type: 'integer',
            default: '0',
            isNullable: false,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
          },
        ],
      }),
      true,
    );

    // Create indexes for oracle_submissions
    await queryRunner.createIndex(
      'oracle_submissions',
      new TableIndex({
        name: 'IDX_ORACLE_SUBMISSIONS_ORACLE_ID_STATUS',
        columnNames: ['oracleId', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'oracle_submissions',
      new TableIndex({
        name: 'IDX_ORACLE_SUBMISSIONS_ORACLE_ID_SUBMITTED_AT',
        columnNames: ['oracleId', 'submittedAt'],
      }),
    );

    await queryRunner.createIndex(
      'oracle_submissions',
      new TableIndex({
        name: 'IDX_ORACLE_SUBMISSIONS_STATUS_CREATED_AT',
        columnNames: ['status', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'oracle_submissions',
      new TableIndex({
        name: 'IDX_ORACLE_SUBMISSIONS_USER_ID_CREATED_AT',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'oracle_submissions',
      new TableIndex({
        name: 'IDX_ORACLE_SUBMISSIONS_DATA_HASH',
        columnNames: ['dataHash'],
        isUnique: true,
      }),
    );

    // Create compute_results table
    await queryRunner.createTable(
      new Table({
        name: 'compute_results',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'jobId',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'resultData',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'resultHash',
            type: 'varchar',
            length: '66',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'status',
            type: 'varchar',
            enum: ['pending', 'processing', 'completed', 'failed', 'timeout'],
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'startedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'completedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'processingDurationMs',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'costWei',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
          },
        ],
      }),
      true,
    );

    // Create indexes for compute_results
    await queryRunner.createIndex(
      'compute_results',
      new TableIndex({
        name: 'IDX_COMPUTE_RESULTS_JOB_ID_STATUS',
        columnNames: ['jobId', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'compute_results',
      new TableIndex({
        name: 'IDX_COMPUTE_RESULTS_JOB_ID_CREATED_AT',
        columnNames: ['jobId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'compute_results',
      new TableIndex({
        name: 'IDX_COMPUTE_RESULTS_STATUS_CREATED_AT',
        columnNames: ['status', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'compute_results',
      new TableIndex({
        name: 'IDX_COMPUTE_RESULTS_USER_ID_CREATED_AT',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'compute_results',
      new TableIndex({
        name: 'IDX_COMPUTE_RESULTS_RESULT_HASH',
        columnNames: ['resultHash'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes and tables in reverse order
    await queryRunner.dropIndex('compute_results', 'IDX_COMPUTE_RESULTS_RESULT_HASH');
    await queryRunner.dropIndex('compute_results', 'IDX_COMPUTE_RESULTS_USER_ID_CREATED_AT');
    await queryRunner.dropIndex('compute_results', 'IDX_COMPUTE_RESULTS_STATUS_CREATED_AT');
    await queryRunner.dropIndex('compute_results', 'IDX_COMPUTE_RESULTS_JOB_ID_CREATED_AT');
    await queryRunner.dropIndex('compute_results', 'IDX_COMPUTE_RESULTS_JOB_ID_STATUS');
    await queryRunner.dropTable('compute_results', true);

    await queryRunner.dropIndex('oracle_submissions', 'IDX_ORACLE_SUBMISSIONS_DATA_HASH');
    await queryRunner.dropIndex('oracle_submissions', 'IDX_ORACLE_SUBMISSIONS_USER_ID_CREATED_AT');
    await queryRunner.dropIndex('oracle_submissions', 'IDX_ORACLE_SUBMISSIONS_STATUS_CREATED_AT');
    await queryRunner.dropIndex('oracle_submissions', 'IDX_ORACLE_SUBMISSIONS_ORACLE_ID_SUBMITTED_AT');
    await queryRunner.dropIndex('oracle_submissions', 'IDX_ORACLE_SUBMISSIONS_ORACLE_ID_STATUS');
    await queryRunner.dropTable('oracle_submissions', true);

    await queryRunner.dropIndex('agent_events', 'IDX_AGENT_EVENTS_USER_ID_CREATED_AT');
    await queryRunner.dropIndex('agent_events', 'IDX_AGENT_EVENTS_EVENT_TYPE_CREATED_AT');
    await queryRunner.dropIndex('agent_events', 'IDX_AGENT_EVENTS_AGENT_ID_CREATED_AT');
    await queryRunner.dropIndex('agent_events', 'IDX_AGENT_EVENTS_AGENT_ID_EVENT_TYPE');
    await queryRunner.dropTable('agent_events', true);
  }
}