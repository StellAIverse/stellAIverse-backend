import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { ReferralAuditService } from './referral-audit.service';
import { Referral } from './entities/referral.entity';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Referral]),
    UserModule,
  ],
  controllers: [ReferralController],
  providers: [ReferralService, ReferralAuditService],
  exports: [ReferralService, ReferralAuditService],
})
export class ReferralModule {}