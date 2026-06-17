import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class TwoFactorSetupDto {
  @IsString()
  @IsNotEmpty()
  type: "totp" | "sms" | "email";
}

export class TwoFactorVerifyDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @IsString()
  backupCode?: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
