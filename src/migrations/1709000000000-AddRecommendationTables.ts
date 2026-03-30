import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class AddRecommendationTables1709000000000 implements MigrationInterface {
  name = "AddRecommendationTables1709000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create recommendation_feedback table
    await queryRunner.createTable(
      new Table({
        name: "recommendation_feedback",
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
            isNullable: true,
          },
          {
            name: "agentId",
            type: "varchar",
          },
          {
            name: "feedbackType",
            type: "enum",
            enum: ["explicit_rating", "click", "dismiss", "usage"],
          },
          {
            name: "rating",
            type: "int",
            isNullable: true,
          },
          {
            name: "metadata",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "sessionId",
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

    // Create indexes for recommendation_feedback
    await queryRunner.createIndices("recommendation_feedback", [
      new TableIndex({
        name: "IDX_RECOMMENDATION_FEEDBACK_USER_AGENT",
        columnNames: ["userId", "agentId"],
      }),
      new TableIndex({
        name: "IDX_RECOMMENDATION_FEEDBACK_CREATED_AT",
        columnNames: ["createdAt"],
      }),
    ]);

    // Create recommendation_interactions table
    await queryRunner.createTable(
      new Table({
        name: "recommendation_interactions",
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
            isNullable: true,
          },
          {
            name: "agentId",
            type: "varchar",
          },
          {
            name: "interactionType",
            type: "enum",
            enum: ["impression", "click", "dismiss", "conversion"],
          },
          {
            name: "position",
            type: "int",
            isNullable: true,
          },
          {
            name: "sessionId",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "context",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "viewDurationMs",
            type: "bigint",
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

    // Create indexes for recommendation_interactions
    await queryRunner.createIndices("recommendation_interactions", [
      new TableIndex({
        name: "IDX_RECOMMENDATION_INTERACTIONS_USER_AGENT",
        columnNames: ["userId", "agentId"],
      }),
      new TableIndex({
        name: "IDX_RECOMMENDATION_INTERACTIONS_SESSION",
        columnNames: ["sessionId"],
      }),
      new TableIndex({
        name: "IDX_RECOMMENDATION_INTERACTIONS_CREATED_AT",
        columnNames: ["createdAt"],
      }),
    ]);

    // Add foreign key constraint for recommendation_feedback.userId
    await queryRunner.query(`
      ALTER TABLE recommendation_feedback
      ADD CONSTRAINT "FK_RECOMMENDATION_FEEDBACK_USER"
      FOREIGN KEY ("userId") REFERENCES users("id") ON DELETE CASCADE
    `);

    // Add foreign key constraint for recommendation_interactions.userId
    await queryRunner.query(`
      ALTER TABLE recommendation_interactions
      ADD CONSTRAINT "FK_RECOMMENDATION_INTERACTIONS_USER"
      FOREIGN KEY ("userId") REFERENCES users("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.query(`
      ALTER TABLE recommendation_interactions
      DROP CONSTRAINT "FK_RECOMMENDATION_INTERACTIONS_USER"
    `);

    await queryRunner.query(`
      ALTER TABLE recommendation_feedback
      DROP CONSTRAINT "FK_RECOMMENDATION_FEEDBACK_USER"
    `);

    // Drop tables
    await queryRunner.dropTable("recommendation_interactions");
    await queryRunner.dropTable("recommendation_feedback");
  }
}
