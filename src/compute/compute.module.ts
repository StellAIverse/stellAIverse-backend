import { Module } from '@nestjs/common';
import { ComputeController } from './compute.controller';
import { ComputeService } from './compute.service';

@Module({
  controllers: [ComputeController],
  providers: [ComputeService],
  exports: [ComputeService], // Export the service in case other modules need to use it
})
export class ComputeModule {}