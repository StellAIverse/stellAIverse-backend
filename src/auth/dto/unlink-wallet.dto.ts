import { IsUUID } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UnlinkWalletDto {
  @ApiProperty({
    description: "Wallet ID to unlink",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsUUID()
  walletId: string;
}
