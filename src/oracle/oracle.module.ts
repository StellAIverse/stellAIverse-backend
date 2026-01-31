import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { OracleController } from './oracle.controller';
import { OracleService } from './services/oracle.service';
import { PayloadSigningService } from './services/payload-signing.service';
import { NonceManagementService } from './services/nonce-management.service';
import { SubmitterService } from './services/submitter.service';
import { SubmissionBatchService } from './services/submission-batch.service';
import { SignedPayload } from './entities/signed-payload.entity';
import { SubmissionNonce } from './entities/submission-nonce.entity';

/**
 * Oracle Module
 * Provides services for signing and submitting verified payloads on-chain
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SignedPayload, SubmissionNonce]),
    ConfigModule,
  ],
  controllers: [OracleController],
  providers: [
    OracleService,
    PayloadSigningService,
    NonceManagementService,
    SubmitterService,
    SubmissionBatchService,
  ],
  exports: [
    OracleService,
    PayloadSigningService,
    NonceManagementService,
    SubmitterService,
    SubmissionBatchService,
  ],
})
export class OracleModule {}
