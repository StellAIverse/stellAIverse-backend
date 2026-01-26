import { Controller, Get, UseGuards, Request } from "@nestjs/common";
import { AppService } from "./app.service";
import { JwtAuthGuard } from "./auth/jwt.guard";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("health")
  getHealth() {
    return this.appService.getHealth();
  }

  @Get("info")
  getInfo() {
    return this.appService.getInfo();
  }

  @UseGuards(JwtAuthGuard)
  @Get("protected")
  getProtected(@Request() req): any {
    return {
      message: "This is a protected endpoint",
      userAddress: req.user.address,
    };
  }
}
