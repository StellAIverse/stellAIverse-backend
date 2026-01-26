import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ComputeService } from "./compute.service";
import { CreateComputeResultDto } from "./dto/create-compute-result.dto";
import { ComputeResultResponseDto } from "./dto/compute-result-response.dto";

@Controller("compute")
export class ComputeController {
  constructor(private readonly computeService: ComputeService) {}

  @Post("result")
  @HttpCode(HttpStatus.CREATED)
  createComputeResult(
    @Body() createComputeResultDto: CreateComputeResultDto,
  ): ComputeResultResponseDto {
    const result = this.computeService.createComputeResult(
      createComputeResultDto,
    );

    // Convert to response DTO
    const responseDto = new ComputeResultResponseDto();
    responseDto.id = result.id;
    responseDto.originalResult = result.originalResult;
    responseDto.normalizedResult = result.normalizedResult;
    responseDto.hash = result.hash;
    responseDto.metadata = result.metadata;
    responseDto.createdAt = result.createdAt;
    responseDto.updatedAt = result.updatedAt;

    return responseDto;
  }

  @Get("result/:id")
  getComputeResult(
    @Param("id") id: string,
  ): ComputeResultResponseDto | undefined {
    const result = this.computeService.getComputeResultById(id);

    if (result) {
      const responseDto = new ComputeResultResponseDto();
      responseDto.id = result.id;
      responseDto.originalResult = result.originalResult;
      responseDto.normalizedResult = result.normalizedResult;
      responseDto.hash = result.hash;
      responseDto.metadata = result.metadata;
      responseDto.createdAt = result.createdAt;
      responseDto.updatedAt = result.updatedAt;

      return responseDto;
    }

    return undefined;
  }

  @Post("result/:id/verify")
  @HttpCode(HttpStatus.OK)
  verifyComputeResult(
    @Param("id") id: string,
    @Body() body: { result: string },
  ): { isValid: boolean } {
    const isValid = this.computeService.verifyResult(id, body.result);
    return { isValid };
  }

  @Get("results")
  getAllComputeResults(): ComputeResultResponseDto[] {
    const results = this.computeService.getAllComputeResults();

    return results.map((result) => {
      const responseDto = new ComputeResultResponseDto();
      responseDto.id = result.id;
      responseDto.originalResult = result.originalResult;
      responseDto.normalizedResult = result.normalizedResult;
      responseDto.hash = result.hash;
      responseDto.metadata = result.metadata;
      responseDto.createdAt = result.createdAt;
      responseDto.updatedAt = result.updatedAt;

      return responseDto;
    });
  }
}
