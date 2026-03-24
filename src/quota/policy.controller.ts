import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { PolicyEntity } from './policy.entity';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard'; 
import { Roles } from '../auth/roles.decorator';



@Controller('quota/policies')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class PolicyController {
  constructor(private readonly policyService: PolicyService) {}

  @Post()
  create(@Body() dto: Omit<PolicyEntity, 'id' | 'createdAt' | 'updatedAt'>) {
    return this.policyService.createPolicy(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Partial<PolicyEntity>) {
    return this.policyService.updatePolicy(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.policyService.deletePolicy(id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.policyService.getPolicy(id);
  }

  @Get()
  list() {
    return this.policyService.listPolicies();
  }

  @Post('preview')
  preview(@Body() dto: Omit<PolicyEntity, 'id' | 'createdAt' | 'updatedAt'>) {
    // Dry-run: return what enforcement would look like
    return { preview: dto, allowed: true, remaining: dto.limit };
  }
}
