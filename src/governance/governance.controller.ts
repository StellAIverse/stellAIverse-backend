import { Controller, Post, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { GovernanceService } from './governance.service';
import { QueueProposalDto, CancelProposalDto } from './dto/queue-proposal.dto';
import { ProposalStatus } from './entities/governance-proposal.entity';

@Controller('governance')
export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}

  @Post('proposals')
  queue(@Body() dto: QueueProposalDto) {
    return this.service.queueProposal(dto);
  }

  @Get('proposals')
  findAll(@Query('status') status?: ProposalStatus) {
    return this.service.findAll(status);
  }

  @Get('proposals/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('proposals/:id/execute')
  execute(@Param('id') id: string) {
    return this.service.executeProposal(id);
  }

  @Patch('proposals/:id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelProposalDto) {
    return this.service.cancelProposal(id, dto);
  }
}
