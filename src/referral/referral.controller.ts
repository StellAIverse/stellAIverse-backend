import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { ReferralService, AbuseFlag } from './referral.service';
import { CreateReferralDto, ClaimReferralDto, QueryReferralDto, UpdateReferralStatusDto } from './dto/referral.dto';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../common/guard/roles.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';

/**
 * Extract client information from request
 */
function getClientInfo(request: Request) {
  const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
    || request.socket.remoteAddress 
    || 'unknown';
  
  const userAgent = request.headers['user-agent'] || undefined;
  
  // Extract device fingerprint from headers (could be set by frontend)
  const deviceFingerprint = request.headers['x-device-fingerprint'] as string || undefined;
  
  return { ip, userAgent, deviceFingerprint };
}

@ApiTags('Referrals')
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  /**
   * Create a new referral code
   */
  @Post('codes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new referral code' })
  @ApiResponse({ status: 201, description: 'Referral code created successfully' })
  @ApiResponse({ status: 403, description: 'Rate limit exceeded or maximum codes reached' })
  async createReferralCode(
    @Req() request: Request,
    @Body() dto: CreateReferralDto,
  ) {
    const userId = (request.user as { id: string }).id;
    const clientInfo = getClientInfo(request);
    
    // Merge client info with DTO
    const enrichedDto: CreateReferralDto = {
      ...dto,
      ipAddress: dto.ipAddress || clientInfo.ip,
      deviceFingerprint: dto.deviceFingerprint || clientInfo.deviceFingerprint,
      userAgent: dto.userAgent || clientInfo.userAgent,
    };
    
    return this.referralService.createReferralCode(enrichedDto, userId);
  }

  /**
   * Claim a referral code
   */
  @Post('codes/claim')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Claim a referral code' })
  @ApiResponse({ status: 200, description: 'Referral code claimed successfully' })
  @ApiResponse({ status: 404, description: 'Invalid referral code' })
  @ApiResponse({ status: 403, description: 'Referral code expired or already claimed' })
  async claimReferralCode(
    @Req() request: Request,
    @Body() dto: ClaimReferralDto,
  ) {
    const userId = (request.user as { id: string }).id;
    const clientInfo = getClientInfo(request);
    
    // Merge client info with DTO
    const enrichedDto: ClaimReferralDto = {
      ...dto,
      ipAddress: dto.ipAddress || clientInfo.ip,
      deviceFingerprint: dto.deviceFingerprint || clientInfo.deviceFingerprint,
      userAgent: dto.userAgent || clientInfo.userAgent,
    };
    
    return this.referralService.claimReferralCode(enrichedDto, userId);
  }

  /**
   * Get user's referral codes
   */
  @Get('my-referrals')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user\'s referral codes' })
  @ApiResponse({ status: 200, description: 'List of user\'s referral codes' })
  async getMyReferrals(@Req() request: Request) {
    const userId = (request.user as { id: string }).id;
    return this.referralService.getUserReferrals(userId);
  }

  /**
   * Get referral by code
   */
  @Get('codes/:code')
  @ApiOperation({ summary: 'Get referral by code (public)' })
  @ApiResponse({ status: 200, description: 'Referral details' })
  @ApiResponse({ status: 404, description: 'Referral code not found' })
  async getReferralByCode(@Param('code') code: string) {
    return this.referralService.getReferralByCode(code);
  }

  /**
   * Get referral statistics (admin only)
   */
  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get referral statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Referral statistics' })
  async getReferralStats() {
    return this.referralService.getReferralStats();
  }

  /**
   * Get flagged referrals (admin only)
   */
  @Get('flagged')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get referrals with abuse flags (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of flagged referrals' })
  async getFlaggedReferrals(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.referralService.getFlaggedReferrals(page || 1, limit || 20);
  }

  /**
   * Suspend a referral (admin only)
   */
  @Put(':id/suspend')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend a referral (admin only)' })
  @ApiResponse({ status: 200, description: 'Referral suspended successfully' })
  @ApiResponse({ status: 404, description: 'Referral not found' })
  async suspendReferral(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReferralStatusDto,
    @Req() request: Request,
  ) {
    const adminUserId = (request.user as { id: string }).id;
    return this.referralService.suspendReferral(id, dto.reason || 'Administrative action', adminUserId);
  }

  /**
   * Reactivate a suspended referral (admin only)
   */
  @Put(':id/reactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reactivate a suspended referral (admin only)' })
  @ApiResponse({ status: 200, description: 'Referral reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Referral not found' })
  async reactivateReferral(@Param('id', ParseUUIDPipe) id: string) {
    return this.referralService.reactivateReferral(id);
  }

  /**
   * Get a specific referral by ID (admin only)
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get referral by ID (admin only)' })
  @ApiResponse({ status: 200, description: 'Referral details' })
  @ApiResponse({ status: 404, description: 'Referral not found' })
  async getReferralById(@Param('id', ParseUUIDPipe) id: string) {
    return this.referralService.getReferralById(id);
  }
}