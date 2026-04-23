import {
  Controller,
  Post,
  Put,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  Query,
  ParseIntPipe,
} from "@nestjs/common";
import { WaitlistService } from "../waitlist/waitlist.service";
import { WaitlistStatus, WaitlistType } from "../waitlist/entities/waitlist.entity";
import { WaitlistEntryStatus } from "../waitlist/entities/waitlist-entry.entity";
// Assuming there is an AdminAuthGuard or similar
// import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';

@Controller("admin/waitlist")
//@UseGuards(AdminAuthGuard)
export class WaitlistAdminController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post("create")
  async createWaitlist(@Body() data: { name: string; type: WaitlistType }) {
    return this.waitlistService.createWaitlist(data);
  }

  @Put(":id/update")
  async updateWaitlist(@Param("id") id: string, @Body() data: any) {
    return this.waitlistService.updateWaitlist(id, data);
  }

  @Post(":id/advance")
  async advanceWaitlist(
    @Param("id") id: string,
    @Body("count", ParseIntPipe) count: number,
  ) {
    return this.waitlistService.advanceWaitlist(id, count);
  }

  @Delete(":id/entry/:userId")
  async removeEntry(
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return this.waitlistService.removeEntry(id, userId);
  }

  @Get(":id/analytics")
  async getAnalytics(@Param("id") id: string) {
    return this.waitlistService.getAnalytics(id);
  }

  @Post(":id/bulk-status")
  async bulkUpdateStatus(
    @Param("id") id: string,
    @Body() data: { userIds: string[]; status: WaitlistEntryStatus },
  ) {
    return this.waitlistService.bulkUpdateStatus(id, data.userIds, data.status);
  }
}
