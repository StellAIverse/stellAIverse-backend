import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
} from "class-validator";

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional() // Optional for backward compatibility with wallet auth
  username?: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsOptional()
  referralCode?: string;
}

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class AuthStatusDto {
  isAuthenticated: boolean;
  user?: {
    id: string;
    email: string;
    username?: string;
    role: string;
  };
}
