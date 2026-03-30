import { MigrationInterface, QueryRunner, TableColumn, Index } from "typeorm";

export class AddUsernameAndPasswordFields1708600000001 implements MigrationInterface {
  name = "AddUsernameAndPasswordFields1708600000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add username column
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "username",
        type: "varchar",
        isUnique: true,
        isNullable: true,
      }),
    );

    // Add password column
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "password",
        type: "varchar",
        isNullable: true,
      }),
    );

    // Create index on username
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_USER_USERNAME" ON "users" ("username") WHERE "username" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`DROP INDEX "IDX_USER_USERNAME"`);

    // Drop columns
    await queryRunner.dropColumn("users", "password");
    await queryRunner.dropColumn("users", "username");
  }
}
