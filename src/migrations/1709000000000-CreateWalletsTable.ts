import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateWalletsTable1709000000000 implements MigrationInterface {
  name = "CreateWalletsTable1709000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create wallets table
    await queryRunner.createTable(
      new Table({
        name: "wallets",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "uuid",
          },
          {
            name: "address",
            type: "varchar",
            length: "42",
            isNullable: false,
            isUnique: true,
          },
          {
            name: "userId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "type",
            type: "varchar",
            enum: ["primary", "secondary", "delegated", "hardware"],
            default: "'secondary'",
            isNullable: false,
          },
          {
            name: "status",
            type: "varchar",
            enum: ["active", "pending", "revoked", "unlinked"],
            default: "'pending'",
            isNullable: false,
          },
          {
            name: "isPrimary",
            type: "boolean",
            default: false,
            isNullable: false,
          },
          {
            name: "name",
            type: "varchar",
            length: "100",
            isNullable: true,
          },
          {
            name: "verificationSignature",
            type: "text",
            isNullable: true,
          },
          {
            name: "verificationChallenge",
            type: "text",
            isNullable: true,
          },
          {
            name: "verifiedAt",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "linkedIp",
            type: "varchar",
            length: "45",
            isNullable: true,
          },
          {
            name: "linkedUserAgent",
            type: "text",
            isNullable: true,
          },
          {
            name: "delegatedById",
            type: "uuid",
            isNullable: true,
          },
          {
            name: "delegationExpiresAt",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "delegationPermissions",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "lastUsedAt",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "recoveryCodeHash",
            type: "varchar",
            length: "64",
            isNullable: true,
          },
          {
            name: "recoveryEnabled",
            type: "boolean",
            default: false,
            isNullable: false,
          },
          {
            name: "nonce",
            type: "bigint",
            default: "0",
            isNullable: false,
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "NOW()",
            isNullable: false,
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "NOW()",
            isNullable: false,
          },
        ],
        foreignKeys: [
          {
            columnNames: ["userId"],
            referencedTableName: "users",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
        ],
      }),
      true,
    );

    // Create indexes for wallets
    await queryRunner.createIndex(
      "wallets",
      new TableIndex({
        name: "IDX_WALLETS_ADDRESS",
        columnNames: ["address"],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      "wallets",
      new TableIndex({
        name: "IDX_WALLETS_USER_ID_STATUS",
        columnNames: ["userId", "status"],
      }),
    );

    await queryRunner.createIndex(
      "wallets",
      new TableIndex({
        name: "IDX_WALLETS_USER_ID_TYPE",
        columnNames: ["userId", "type"],
      }),
    );

    await queryRunner.createIndex(
      "wallets",
      new TableIndex({
        name: "IDX_WALLETS_DELEGATED_BY_ID",
        columnNames: ["delegatedById"],
      }),
    );

    await queryRunner.createIndex(
      "wallets",
      new TableIndex({
        name: "IDX_WALLETS_STATUS",
        columnNames: ["status"],
      }),
    );

    await queryRunner.createIndex(
      "wallets",
      new TableIndex({
        name: "IDX_WALLETS_IS_PRIMARY",
        columnNames: ["isPrimary"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex("wallets", "IDX_WALLETS_IS_PRIMARY");
    await queryRunner.dropIndex("wallets", "IDX_WALLETS_STATUS");
    await queryRunner.dropIndex("wallets", "IDX_WALLETS_DELEGATED_BY_ID");
    await queryRunner.dropIndex("wallets", "IDX_WALLETS_USER_ID_TYPE");
    await queryRunner.dropIndex("wallets", "IDX_WALLETS_USER_ID_STATUS");
    await queryRunner.dropIndex("wallets", "IDX_WALLETS_ADDRESS");

    // Drop table
    await queryRunner.dropTable("wallets", true);
  }
}
