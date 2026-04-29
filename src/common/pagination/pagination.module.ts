import { Module } from '@nestjs/common';
import { CursorPaginationService } from './cursor-pagination.service';

@Module({
  providers: [CursorPaginationService],
  exports: [CursorPaginationService],
})
export class PaginationModule {}
