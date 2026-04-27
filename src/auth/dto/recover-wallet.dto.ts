import { IsEmail, IsString, Length } from "class-validator";

export class RecoverWalletDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(64, 64)
  recoveryToken: string;
}
