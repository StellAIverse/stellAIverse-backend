import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateAgentEventAndComputeResultTables1708700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "agent_events",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "uuid",
          },
          { name: "agentId", type: "varchar", length: "42", isNullable: false },
          {
            name: "eventType",
            type: "varchar",
            length: "128",
            isNullable: false,
          },
          { name: "payload", type: "jsonb", isNullable: true },
          { name: "txHash", type: "varchar", length: "66", isNullable: true },
          { name: "metadata", type: "jsonb", isNullable: true },
          { name: "createdAt", type: "timestamptz", default: "now()" },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "compute_results",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "uuid",
          },
          { name: "originalResult", type: "text", isNullable: false },
          { name: "normalizedResult", type: "text", isNullable: true },
          { name: "hash", type: "varchar", length: "66", isNullable: false },
          { name: "metadata", type: "jsonb", isNullable: true },
          { name: "createdAt", type: "timestamptz", default: "now()" },
          { name: "updatedAt", type: "timestamptz", default: "now()" },
        ],
        uniques: [
          {
            name: "UQ_compute_results_hash",
            columnNames: ["hash"],
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("compute_results");
    await queryRunner.dropTable("agent_events");
  }
}
