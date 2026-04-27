import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddUserRoleColumn1708600000000 implements MigrationInterface {
  name = "AddUserRoleColumn1708600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "role",
        type: "varchar",
        default: "'user'",
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "role");
  }
}
