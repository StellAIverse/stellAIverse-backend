import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { OracleService } from './services/oracle.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CreatePayloadDto } from './dto/create-payload.dto';
import { SignPayloadDto } from './dto/sign-payload.dto';
import { SubmitPayloadDto } from './dto/submit-payload.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';
import { PayloadResponseDto } from './dto/payload-response.dto';
import { PayloadStatus } from './entities/signed-payload.entity';

/**
 * Controller for Oracle service endpoints
 * Handles payload creation, signing, and submission
 */
@Controller('oracle')
export class OracleController {
  private readonly logger = new Logger(OracleController.name);

  constructor(private readonly oracleService: OracleService) {}

  /**
   * Create a new payload to be signed
   * Requires authentication
   */
  @Post('payloads')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createPayload(
    @Request() req,
    @Body() createPayloadDto: CreatePayloadDto,
  ): Promise<PayloadResponseDto> {
    const signerAddress = req.user.address;
    this.logger.log(
      `Creating payload for ${signerAddress}, type: ${createPayloadDto.payloadType}`,
    );

    return this.oracleService.createPayload(signerAddress, createPayloadDto);
  }

  /**
   * Sign a payload with a private key
   * Note: In production, this should be done client-side for security
   * This endpoint is provided for convenience during development/testing
   */
  @Post('payloads/:id/sign')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async signPayload(
    @Param('id') id: string,
    @Body() signPayloadDto: SignPayloadDto,
  ): Promise<PayloadResponseDto> {
    this.logger.log(`Signing payload ${id}`);

    return this.oracleService.signPayload(id, signPayloadDto.privateKey);
  }

  /**
   * Submit a signed payload on-chain
   * Requires authentication
   */
  @Post('payloads/:id/submit')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async submitPayload(
    @Param('id') id: string,
  ): Promise<{ transactionHash: string; payload: PayloadResponseDto }> {
    this.logger.log(`Submitting payload ${id} on-chain`);

    return this.oracleService.submitPayload(id);
  }

  /**
   * Retry a failed submission
   */
  @Post('payloads/:id/retry')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async retrySubmission(
    @Param('id') id: string,
  ): Promise<{ transactionHash: string; payload: PayloadResponseDto }> {
    this.logger.log(`Retrying submission for payload ${id}`);

    return this.oracleService.retrySubmission(id);
  }

  /**
   * Verify a signature off-chain
   */
  @Post('verify-signature')
  @HttpCode(HttpStatus.OK)
  async verifySignature(
    @Body() verifySignatureDto: VerifySignatureDto,
  ): Promise<{ valid: boolean; message: string }> {
    // For this endpoint, we would need to compute the payload hash and verify
    // This is a simplified version - in production, you'd pass the payload ID
    return {
      valid: false,
      message: 'Use /payloads/:id/verify endpoint instead',
    };
  }

  /**
   * Verify a payload's signature
   */
  @Get('payloads/:id/verify')
  @HttpCode(HttpStatus.OK)
  async verifyPayloadSignature(
    @Param('id') id: string,
    @Query('expectedSigner') expectedSigner: string,
  ): Promise<{ valid: boolean; payloadId: string }> {
    this.logger.log(`Verifying signature for payload ${id}`);

    const valid = await this.oracleService.verifySignature(id, expectedSigner);

    return {
      valid,
      payloadId: id,
    };
  }

  /**
   * Get a specific payload
   */
  @Get('payloads/:id')
  @UseGuards(JwtAuthGuard)
  async getPayload(@Param('id') id: string): Promise<PayloadResponseDto> {
    return this.oracleService.getPayload(id);
  }

  /**
   * Get payloads for the authenticated user
   */
  @Get('my-payloads')
  @UseGuards(JwtAuthGuard)
  async getMyPayloads(
    @Request() req,
    @Query('status') status?: PayloadStatus,
    @Query('limit') limit?: number,
  ): Promise<PayloadResponseDto[]> {
    const address = req.user.address;
    const limitValue = limit ? parseInt(limit.toString()) : 50;

    this.logger.log(
      `Fetching payloads for ${address}, status: ${status || 'all'}, limit: ${limitValue}`,
    );

    return this.oracleService.getPayloadsForAddress(
      address,
      status,
      limitValue,
    );
  }

  /**
   * Get payloads for a specific address (public endpoint)
   */
  @Get('payloads/address/:address')
  async getPayloadsForAddress(
    @Param('address') address: string,
    @Query('status') status?: PayloadStatus,
    @Query('limit') limit?: number,
  ): Promise<PayloadResponseDto[]> {
    const limitValue = limit ? parseInt(limit.toString()) : 50;

    return this.oracleService.getPayloadsForAddress(
      address,
      status,
      limitValue,
    );
  }

  /**
   * Get pending payloads ready for submission
   */
  @Get('payloads/pending/ready')
  @UseGuards(JwtAuthGuard)
  async getPendingPayloads(
    @Query('limit') limit?: number,
  ): Promise<PayloadResponseDto[]> {
    const limitValue = limit ? parseInt(limit.toString()) : 100;

    return this.oracleService.getPendingPayloads(limitValue);
  }

  /**
   * Get current nonce for an address
   */
  @Get('nonce/:address')
  async getCurrentNonce(@Param('address') address: string): Promise<{
    address: string;
    nonce: string;
  }> {
    const nonce = await this.oracleService.getCurrentNonce(address);

    return {
      address,
      nonce,
    };
  }

  /**
   * Get current nonce for authenticated user
   */
  @Get('my-nonce')
  @UseGuards(JwtAuthGuard)
  async getMyNonce(@Request() req): Promise<{
    address: string;
    nonce: string;
  }> {
    const address = req.user.address;
    const nonce = await this.oracleService.getCurrentNonce(address);

    return {
      address,
      nonce,
    };
  }

  /**
   * Get Oracle service statistics
   */
  @Get('stats')
  async getStatistics(): Promise<any> {
    return this.oracleService.getStatistics();
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  async healthCheck(): Promise<{
    status: string;
    timestamp: string;
    service: string;
  }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'oracle',
    };
  }
}
