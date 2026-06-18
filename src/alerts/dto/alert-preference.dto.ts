import {
  IsString,
  IsEnum,
  IsArray,
  IsOptional,
  IsObject,
  IsBoolean,
  ArrayNotEmpty,
} from "class-validator";
import { PartialType } from "@nestjs/mapped-types";
import { AlertChannel } from "../entities/alert.enums";
import { AlertType } from "../entities/alert.entity";

export class CreateAlertPreferenceDto {
  @IsString()
  userId: string;

  @IsEnum(AlertChannel)
  channel: AlertChannel;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(AlertType, { each: true })
  alertTypes?: AlertType[];

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateAlertPreferenceDto extends PartialType(
  CreateAlertPreferenceDto,
) {}
