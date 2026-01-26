import { IsEmail } from 'class-validator';

export class LinkEmailDto {
  @IsEmail()
  email: string;
}
