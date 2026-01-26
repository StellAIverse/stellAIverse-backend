import { IsEmail } from 'class-validator';

export class RequestRecoveryDto {
  @IsEmail()
  email: string;
}
