import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Waitlist } from "./entities/waitlist.entity";
import { WaitlistEntry } from "./entities/waitlist-entry.entity";
import { WaitlistEvent } from "./entities/waitlist-event.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Waitlist, WaitlistEntry, WaitlistEvent])],
  providers: [],
  exports: [TypeOrmModule],
})
export class WaitlistModule {}
