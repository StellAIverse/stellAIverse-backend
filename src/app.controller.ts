import { Controller, Get, UseGuards, Request } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from "@nestjs/swagger";
import { AppService } from "./app.service";
import { JwtAuthGuard } from "./auth/jwt.guard";
import { RateLimit } from "./common/decorators/rate-limit.decorator";

@ApiTags("Health")
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("health")
  @RateLimit({ level: "free", limit: 2, windowMs: 60000 }) // Max 2 requests per minute for health
  @ApiOperation({
    summary: "Health Check",
    description: "Check if the API is running and healthy",
    operationId: "getHealth",
  })
  @ApiResponse({
    status: 200,
    description: "Service is healthy",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "OK" },
        timestamp: { type: "string", example: "2024-02-25T05:30:00.000Z" },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: "Too many requests",
  })
  getHealth(): { status: string; timestamp: string } {
    return this.appService.getHealth();
  }

  @Get("info")
  @RateLimit({ level: "standard" }) // Default standard level
  @ApiOperation({
    summary: "API Information",
    description: "Get information about the API and its modules",
    operationId: "getInfo",
  })
  @ApiResponse({
    status: 200,
    description: "API information retrieved successfully",
    schema: {
      type: "object",
      properties: {
        name: { type: "string", example: "StellAIverse Backend" },
        version: { type: "string", example: "1.0.0" },
        description: {
          type: "string",
          example: "Comprehensive API for StellAIverse services",
        },
        modules: {
          type: "array",
          items: { type: "string" },
          example: ["Auth", "Users", "Agents", "Oracle", "Compute", "Audit"],
        },
      },
    },
  })
  getInfo(): {
    name: string;
    version: string;
    description: string;
    modules: string[];
  } {
    return this.appService.getInfo();
  }

  @UseGuards(JwtAuthGuard)
  @Get("protected")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Protected Endpoint",
    description:
      "Example of a protected endpoint that requires JWT authentication",
    operationId: "getProtected",
  })
  @ApiResponse({
    status: 200,
    description: "Protected data accessed successfully",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", example: "This is a protected endpoint" },
        userAddress: {
          type: "string",
          example: "0x1234567890abcdef1234567890abcdef1234567890",
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Insufficient permissions",
  })
  getProtected(@Request() req: any): {
    message: string;
    userAddress: string;
  } {
    return {
      message: "This is a protected endpoint",
      userAddress: req.user.address,
    };
  }
}
