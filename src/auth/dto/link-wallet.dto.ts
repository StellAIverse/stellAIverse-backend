import { IsString, IsEthereumAddress, Length, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LinkWalletDto {
  @ApiProperty({
    description: "Ethereum wallet address to link",
    example: "0x1234567890abcdef1234567890abcdef12345678",
  })
  @IsEthereumAddress()
  walletAddress: string;

  @ApiProperty({
    description: "Challenge message that was signed",
    example: "Sign this message to authenticate: abc123...",
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: "ECDSA signature of the challenge message",
    example: "0x1234567890abcdef...",
  })
  @IsString()
  @Length(132, 132) // Ethereum signature length
  signature: string;

  @ApiPropertyOptional({
    description: "Optional name/label for the wallet",
    example: "My Hardware Wallet",
  })
  @IsOptional()
  @IsString()
  walletName?: string;
}
