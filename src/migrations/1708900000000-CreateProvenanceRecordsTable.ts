import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateProvenanceRecordsTable1708900000000 implements MigrationInterface {
  name = 'CreateProvenanceRecordsTable1708900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create provenance_records table
    await queryRunner.createTable(
      new Table({
        name: 'provenance_records',
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
            name: 'userId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'action',
            type: 'varchar',
            enum: ['request_received', 'provider_call', 'result_normalization', 'submission', 'error'],
            isNullable: false,
          },
          {
            name: 'input',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'output',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'providerModel',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            enum: ['pending', 'success', 'failed'],
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'onChainTxHash',
            type: 'varchar',
            length: '66',
            isNullable: true,
          },
          {
            name: 'signature',
            type: 'varchar',
            length: '132',
            isNullable: false,
          },
          {
            name: 'recordHash',
            type: 'varchar',
            length: '66',
            isNullable: false,
          },
          {
            name: 'processingDurationMs',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'NOW()',
            isNullable: false,
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

    // Create indexes for provenance_records
    await queryRunner.createIndex(
      'provenance_records',
      new TableIndex({
        name: 'IDX_PROVENANCE_AGENT_ID_CREATED_AT',
        columnNames: ['agentId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'provenance_records',
      new TableIndex({
        name: 'IDX_PROVENANCE_USER_ID_CREATED_AT',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'provenance_records',
      new TableIndex({
        name: 'IDX_PROVENANCE_STATUS_CREATED_AT',
        columnNames: ['status', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'provenance_records',
      new TableIndex({
        name: 'IDX_PROVENANCE_ACTION_CREATED_AT',
        columnNames: ['action', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'provenance_records',
      new TableIndex({
        name: 'IDX_PROVENANCE_ON_CHAIN_TX_HASH',
        columnNames: ['onChainTxHash'],
      }),
    );

    await queryRunner.createIndex(
      'provenance_records',
      new TableIndex({
        name: 'IDX_PROVENANCE_AGENT_ID',
        columnNames: ['agentId'],
      }),
    );

    await queryRunner.createIndex(
      'provenance_records',
      new TableIndex({
        name: 'IDX_PROVENANCE_USER_ID',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'provenance_records',
      new TableIndex({
        name: 'IDX_PROVENANCE_CREATED_AT',
        columnNames: ['createdAt'],
      }),
    );

    // Create a function to prevent updates to provenance_records (append-only)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_provenance_update()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only allow updates to specific fields: output, status, error, onChainTxHash, processingDurationMs
        IF OLD.id IS DISTINCT FROM NEW.id OR
           OLD.agentId IS DISTINCT FROM NEW.agentId OR
           OLD.userId IS DISTINCT FROM NEW.userId OR
           OLD.action IS DISTINCT FROM NEW.action OR
           OLD.input IS DISTINCT FROM NEW.input OR
           OLD.provider IS DISTINCT FROM NEW.provider OR
           OLD.providerModel IS DISTINCT FROM NEW.providerModel OR
           OLD.signature IS DISTINCT FROM NEW.signature OR
           OLD.recordHash IS DISTINCT FROM NEW.recordHash OR
           OLD.createdAt IS DISTINCT FROM NEW.createdAt OR
           OLD.clientIp IS DISTINCT FROM NEW.clientIp OR
           OLD.userAgent IS DISTINCT FROM NEW.userAgent THEN
          RAISE EXCEPTION 'Provenance records are immutable. Only output, status, error, onChainTxHash, and processingDurationMs can be updated.';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to enforce append-only behavior
    await queryRunner.query(`
      CREATE TRIGGER enforce_provenance_immutable
      BEFORE UPDATE ON provenance_records
      FOR EACH ROW
      EXECUTE FUNCTION prevent_provenance_update();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop trigger and function
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS enforce_provenance_immutable ON provenance_records;
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS prevent_provenance_update();
    `);

    // Drop indexes
    await queryRunner.dropIndex('provenance_records', 'IDX_PROVENANCE_CREATED_AT');
    await queryRunner.dropIndex('provenance_records', 'IDX_PROVENANCE_USER_ID');
    await queryRunner.dropIndex('provenance_records', 'IDX_PROVENANCE_AGENT_ID');
    await queryRunner.dropIndex('provenance_records', 'IDX_PROVENANCE_ON_CHAIN_TX_HASH');
    await queryRunner.dropIndex('provenance_records', 'IDX_PROVENANCE_ACTION_CREATED_AT');
    await queryRunner.dropIndex('provenance_records', 'IDX_PROVENANCE_STATUS_CREATED_AT');
    await queryRunner.dropIndex('provenance_records', 'IDX_PROVENANCE_USER_ID_CREATED_AT');
    await queryRunner.dropIndex('provenance_records', 'IDX_PROVENANCE_AGENT_ID_CREATED_AT');

    // Drop table
    await queryRunner.dropTable('provenance_records', true);
  }
}
