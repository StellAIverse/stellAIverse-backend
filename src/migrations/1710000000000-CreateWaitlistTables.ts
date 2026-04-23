import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from "typeorm";

export class CreateWaitlistTables1710000000000 implements MigrationInterface {
  name = "CreateWaitlistTables1710000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // waitlists
    await queryRunner.createTable(
      new Table({
        name: "waitlists",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "name", type: "varchar", length: "150", isNullable: false },
          { name: "type", type: "varchar", isNullable: false },
          { name: "status", type: "varchar", isNullable: false, default: "'active'" },
          { name: "createdAt", type: "timestamp", default: "NOW()" },
          { name: "updatedAt", type: "timestamp", default: "NOW()" },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "waitlists",
      new TableIndex({ name: "IDX_WAITLISTS_TYPE", columnNames: ["type"] }),
    );

    await queryRunner.createIndex(
      "waitlists",
      new TableIndex({ name: "IDX_WAITLISTS_STATUS", columnNames: ["status"] }),
    );

    // waitlist_entries
    await queryRunner.createTable(
      new Table({
        name: "waitlist_entries",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "waitlistId", type: "uuid", isNullable: false },
          { name: "userId", type: "uuid", isNullable: false },
          { name: "position", type: "bigint", isNullable: false },
          { name: "referralId", type: "uuid", isNullable: true },
          { name: "priorityScore", type: "double precision", default: "0" },
          { name: "joinedAt", type: "timestamp", default: "NOW()" },
          { name: "status", type: "varchar", isNullable: false, default: "'active'" },
          { name: "createdAt", type: "timestamp", default: "NOW()" },
          { name: "updatedAt", type: "timestamp", default: "NOW()" },
          { name: "isDeleted", type: "boolean", default: "false" },
        ],
        foreignKeys: [
          { columnNames: ["waitlistId"], referencedTableName: "waitlists", referencedColumnNames: ["id"], onDelete: "CASCADE" },
          { columnNames: ["userId"], referencedTableName: "users", referencedColumnNames: ["id"], onDelete: "CASCADE" },
          { columnNames: ["referralId"], referencedTableName: "referrals", referencedColumnNames: ["id"], onDelete: "SET NULL" },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "waitlist_entries",
      new TableIndex({ name: "IDX_WAITLIST_ENTRIES_WAITLIST_POSITION", columnNames: ["waitlistId", "position"] }),
    );

    await queryRunner.createIndex(
      "waitlist_entries",
      new TableIndex({ name: "IDX_WAITLIST_ENTRIES_USER_ID", columnNames: ["userId"] }),
    );

    await queryRunner.createIndex(
      "waitlist_entries",
      new TableIndex({ name: "IDX_WAITLIST_ENTRIES_REFERRAL_ID", columnNames: ["referralId"] }),
    );

    await queryRunner.createIndex(
      "waitlist_entries",
      new TableIndex({ name: "IDX_WAITLIST_ENTRIES_STATUS", columnNames: ["status"] }),
    );

    await queryRunner.createIndex(
      "waitlist_entries",
      new TableIndex({ name: "IDX_WAITLIST_ENTRIES_WAITLIST_PRIORITY", columnNames: ["waitlistId", "priorityScore"] }),
    );

    // waitlist_events
    await queryRunner.createTable(
      new Table({
        name: "waitlist_events",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "entryId", type: "uuid", isNullable: false },
          { name: "eventType", type: "varchar", isNullable: false },
          { name: "oldValue", type: "jsonb", isNullable: true },
          { name: "newValue", type: "jsonb", isNullable: true },
          { name: "metadata", type: "jsonb", isNullable: true },
          { name: "createdAt", type: "timestamp", default: "NOW()" },
        ],
        foreignKeys: [
          { columnNames: ["entryId"], referencedTableName: "waitlist_entries", referencedColumnNames: ["id"], onDelete: "CASCADE" },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "waitlist_events",
      new TableIndex({ name: "IDX_WAITLIST_EVENTS_ENTRY_ID", columnNames: ["entryId"] }),
    );

    await queryRunner.createIndex(
      "waitlist_events",
      new TableIndex({ name: "IDX_WAITLIST_EVENTS_EVENT_TYPE_CREATED_AT", columnNames: ["eventType", "createdAt"] }),
    );

    // Seed initial waitlist types
    await queryRunner.query(`INSERT INTO waitlists (id, name, type, status, "createdAt", "updatedAt") VALUES
      (gen_random_uuid(), 'General Access', 'general', 'active', NOW(), NOW()),
      (gen_random_uuid(), 'Beta Features', 'beta', 'active', NOW(), NOW()),
      (gen_random_uuid(), 'Premium Early Access', 'premium', 'active', NOW(), NOW())
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("waitlist_events");
    await queryRunner.dropTable("waitlist_entries");
    await queryRunner.dropTable("waitlists");
  }
}
