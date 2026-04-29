import { MigrationInterface, QueryRunner } from "typeorm";

export class AddKycAndAuthEntities1712000000000 implements MigrationInterface {
  name = "AddKycAndAuthEntities1712000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create refresh_tokens table
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "token" varchar NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "revoked" boolean NOT NULL DEFAULT false,
        "revokedAt" TIMESTAMP,
        "replacedByToken" varchar,
        "ipAddress" varchar NOT NULL,
        "userAgent" varchar,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id")
      )
    `);

    // Create two_factor_auth table
    await queryRunner.query(`
      CREATE TABLE "two_factor_auth" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "type" varchar NOT NULL DEFAULT 'totp',
        "status" varchar NOT NULL DEFAULT 'pending',
        "secret" varchar,
        "backupCodes" text,
        "phoneNumber" varchar,
        "isEnabled" boolean NOT NULL DEFAULT false,
        "verifiedAt" TIMESTAMP,
        "lastUsedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_two_factor_auth" PRIMARY KEY ("id")
      )
    `);

    // Create kyc_profiles table
    await queryRunner.query(`
      CREATE TABLE "kyc_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "status" varchar NOT NULL DEFAULT 'unverified',
        "fullName" varchar,
        "dateOfBirth" date,
        "country" varchar,
        "address" varchar,
        "city" varchar,
        "postalCode" varchar,
        "phoneNumber" varchar,
        "occupation" varchar,
        "sourceOfFunds" varchar,
        "annualIncome" decimal(15,2),
        "taxId" varchar,
        "nationality" varchar,
        "notes" text,
        "reviewedBy" varchar,
        "reviewedAt" TIMESTAMP,
        "submittedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc_profiles" PRIMARY KEY ("id")
      )
    `);

    // Create kyc_documents table
    await queryRunner.query(`
      CREATE TABLE "kyc_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "kycProfileId" uuid NOT NULL,
        "documentType" varchar NOT NULL,
        "fileName" varchar NOT NULL,
        "originalFileName" varchar NOT NULL,
        "mimeType" varchar NOT NULL,
        "fileSize" bigint NOT NULL,
        "encryptedFilePath" text NOT NULL,
        "encryptionKey" text,
        "encryptionIv" text,
        "verified" boolean NOT NULL DEFAULT false,
        "verifiedBy" varchar,
        "verifiedAt" TIMESTAMP,
        "verificationNotes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc_documents" PRIMARY KEY ("id")
      )
    `);

    // Create kyc_status_history table
    await queryRunner.query(`
      CREATE TABLE "kyc_status_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "kycProfileId" uuid NOT NULL,
        "previousStatus" varchar NOT NULL,
        "newStatus" varchar NOT NULL,
        "changedBy" varchar,
        "reason" text,
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc_status_history" PRIMARY KEY ("id")
      )
    `);

    // Add indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_token" ON "refresh_tokens" ("token")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_two_factor_auth_userId" ON "two_factor_auth" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_kyc_profiles_userId" ON "kyc_profiles" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_kyc_documents_kycProfileId" ON "kyc_documents" ("kycProfileId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_kyc_status_history_kycProfileId" ON "kyc_status_history" ("kycProfileId")
    `);

    // Add unique constraint for refresh token
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens" ADD CONSTRAINT "UQ_refresh_tokens_token" UNIQUE ("token")
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_refresh_tokens_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "two_factor_auth" ADD CONSTRAINT "FK_two_factor_auth_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "kyc_profiles" ADD CONSTRAINT "FK_kyc_profiles_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "kyc_documents" ADD CONSTRAINT "FK_kyc_documents_kycProfileId" FOREIGN KEY ("kycProfileId") REFERENCES "kyc_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "kyc_status_history" ADD CONSTRAINT "FK_kyc_status_history_kycProfileId" FOREIGN KEY ("kycProfileId") REFERENCES "kyc_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Update users table to add kycStatus and isActive columns
    await queryRunner.query(`
      ALTER TABLE "users" ADD "kycStatus" varchar NOT NULL DEFAULT 'unverified'
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "isActive" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD "lastLoginAt" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove added columns from users table
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastLoginAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isActive"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "kycStatus"`);

    // Drop tables in reverse order
    await queryRunner.query(`DROP TABLE "kyc_status_history"`);
    await queryRunner.query(`DROP TABLE "kyc_documents"`);
    await queryRunner.query(`DROP TABLE "kyc_profiles"`);
    await queryRunner.query(`DROP TABLE "two_factor_auth"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}</content>
<parameter name="filePath">/workspaces/stellAIverse-backend/src/migrations/1712000000000-AddKycAndAuthEntities.ts