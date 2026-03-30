import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class AddReferralAndNotificationTables1709100000000 implements MigrationInterface {
  name = "AddReferralAndNotificationTables1709100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create referrals table
    await queryRunner.createTable(
      new Table({
        name: "referrals",
        columns: [
          {
            name: "id",
            type: "uuid",
            generationStrategy: "uuid",
            default: "gen_random_uuid()",
            isPrimary: true,
          },
          {
            name: "referrerId",
            type: "uuid",
          },
          {
            name: "refereeId",
            type: "uuid",
            isNullable: true,
          },
          {
            name: "refereeEmail",
            type: "varchar",
          },
          {
            name: "referralCode",
            type: "varchar",
            isUnique: true,
          },
          {
            name: "status",
            type: "enum",
            enum: ["pending", "registered", "active", "rewarded"],
            default: "'pending'",
          },
          {
            name: "message",
            type: "text",
            isNullable: true,
          },
          {
            name: "metadata",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "registeredAt",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "rewardedAt",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    // Create indexes for referrals
    await queryRunner.createIndices("referrals", [
      new TableIndex({
        name: "IDX_REFERRALS_REFERRER_REFEREE",
        columnNames: ["referrerId", "refereeId"],
        isUnique: true,
      }),
      new TableIndex({
        name: "IDX_REFERRALS_REFEREE_EMAIL",
        columnNames: ["refereeEmail"],
      }),
      new TableIndex({
        name: "IDX_REFERRALS_STATUS",
        columnNames: ["status"],
      }),
      new TableIndex({
        name: "IDX_REFERRALS_CREATED_AT",
        columnNames: ["createdAt"],
      }),
      new TableIndex({
        name: "IDX_REFERRALS_CODE",
        columnNames: ["referralCode"],
      }),
    ]);

    // Create referral_events table
    await queryRunner.createTable(
      new Table({
        name: "referral_events",
        columns: [
          {
            name: "id",
            type: "uuid",
            generationStrategy: "uuid",
            default: "gen_random_uuid()",
            isPrimary: true,
          },
          {
            name: "referralId",
            type: "uuid",
          },
          {
            name: "eventType",
            type: "enum",
            enum: [
              "invite_sent",
              "invite_opened",
              "registration_completed",
              "first_login",
              "milestone_reached",
              "reward_earned",
              "reward_distributed",
              "notification_sent",
            ],
          },
          {
            name: "data",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    // Create indexes for referral_events
    await queryRunner.createIndices("referral_events", [
      new TableIndex({
        name: "IDX_REFERRAL_EVENTS_REFERRAL",
        columnNames: ["referralId"],
      }),
      new TableIndex({
        name: "IDX_REFERRAL_EVENTS_TYPE",
        columnNames: ["eventType"],
      }),
      new TableIndex({
        name: "IDX_REFERRAL_EVENTS_CREATED",
        columnNames: ["createdAt"],
      }),
    ]);

    // Create notifications table
    await queryRunner.createTable(
      new Table({
        name: "notifications",
        columns: [
          {
            name: "id",
            type: "uuid",
            generationStrategy: "uuid",
            default: "gen_random_uuid()",
            isPrimary: true,
          },
          {
            name: "userId",
            type: "uuid",
          },
          {
            name: "type",
            type: "varchar",
          },
          {
            name: "title",
            type: "varchar",
          },
          {
            name: "message",
            type: "text",
          },
          {
            name: "data",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "isRead",
            type: "boolean",
            default: false,
          },
          {
            name: "readAt",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "priority",
            type: "enum",
            enum: ["low", "medium", "high", "urgent"],
            default: "'medium'",
          },
          {
            name: "channel",
            type: "enum",
            enum: ["in_app", "email", "both"],
            default: "'in_app'",
          },
          {
            name: "actionUrl",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    // Create indexes for notifications
    await queryRunner.createIndices("notifications", [
      new TableIndex({
        name: "IDX_NOTIFICATIONS_USER",
        columnNames: ["userId"],
      }),
      new TableIndex({
        name: "IDX_NOTIFICATIONS_TYPE",
        columnNames: ["type"],
      }),
      new TableIndex({
        name: "IDX_NOTIFICATIONS_READ",
        columnNames: ["isRead"],
      }),
      new TableIndex({
        name: "IDX_NOTIFICATIONS_CREATED",
        columnNames: ["createdAt"],
      }),
    ]);

    // Create notification_preferences table
    await queryRunner.createTable(
      new Table({
        name: "notification_preferences",
        columns: [
          {
            name: "id",
            type: "uuid",
            generationStrategy: "uuid",
            default: "gen_random_uuid()",
            isPrimary: true,
          },
          {
            name: "userId",
            type: "uuid",
            isUnique: true,
          },
          {
            name: "emailEnabled",
            type: "boolean",
            default: true,
          },
          {
            name: "inAppEnabled",
            type: "boolean",
            default: true,
          },
          {
            name: "emailNotificationTypes",
            type: "varchar",
            isArray: true,
            default: "'{}'",
          },
          {
            name: "inAppNotificationTypes",
            type: "varchar",
            isArray: true,
            default: "'{}'",
          },
          {
            name: "referralNotificationsEnabled",
            type: "boolean",
            default: true,
          },
          {
            name: "marketingNotificationsEnabled",
            type: "boolean",
            default: false,
          },
          {
            name: "systemNotificationsEnabled",
            type: "boolean",
            default: true,
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    // Create index for notification_preferences
    await queryRunner.createIndex(
      "notification_preferences",
      new TableIndex({
        name: "IDX_NOTIFICATION_PREFERENCES_USER",
        columnNames: ["userId"],
        isUnique: true,
      }),
    );

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE referrals
      ADD CONSTRAINT "FK_REFERRALS_REFERRER"
      FOREIGN KEY ("referrerId") REFERENCES users("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE referrals
      ADD CONSTRAINT "FK_REFERRALS_REFEREE"
      FOREIGN KEY ("refereeId") REFERENCES users("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE referral_events
      ADD CONSTRAINT "FK_REFERRAL_EVENTS_REFERRAL"
      FOREIGN KEY ("referralId") REFERENCES referrals("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE notifications
      ADD CONSTRAINT "FK_NOTIFICATIONS_USER"
      FOREIGN KEY ("userId") REFERENCES users("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE notification_preferences
      ADD CONSTRAINT "FK_NOTIFICATION_PREFERENCES_USER"
      FOREIGN KEY ("userId") REFERENCES users("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.query(
      `ALTER TABLE notification_preferences DROP CONSTRAINT "FK_NOTIFICATION_PREFERENCES_USER"`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications DROP CONSTRAINT "FK_NOTIFICATIONS_USER"`,
    );
    await queryRunner.query(
      `ALTER TABLE referral_events DROP CONSTRAINT "FK_REFERRAL_EVENTS_REFERRAL"`,
    );
    await queryRunner.query(
      `ALTER TABLE referrals DROP CONSTRAINT "FK_REFERRALS_REFEREE"`,
    );
    await queryRunner.query(
      `ALTER TABLE referrals DROP CONSTRAINT "FK_REFERRALS_REFERRER"`,
    );

    // Drop tables
    await queryRunner.dropTable("notification_preferences");
    await queryRunner.dropTable("notifications");
    await queryRunner.dropTable("referral_events");
    await queryRunner.dropTable("referrals");
  }
}
