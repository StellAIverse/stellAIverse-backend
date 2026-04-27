import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigParam } from './entities/config-param.entity';
import { ConfigParamsService } from './config-params.service';
import { ConfigParamsController } from './config-params.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ConfigParam])],
  providers: [ConfigParamsService],
  controllers: [ConfigParamsController],
  exports: [ConfigParamsService],
})
export class ConfigParamsModule {}
