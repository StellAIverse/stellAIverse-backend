import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { ConfigParamsService } from './config-params.service';
import { UpdateParamDto, CreateParamDto } from './dto/update-param.dto';

@Controller('config-params')
export class ConfigParamsController {
  constructor(private readonly service: ConfigParamsService) {}

  @Post()
  create(@Body() dto: CreateParamDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.service.findOne(key);
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body() dto: UpdateParamDto) {
    return this.service.safeUpdate(key, dto);
  }
}
