import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Waitlist } from "./entities/waitlist.entity";
import { WaitlistEntry } from "./entities/waitlist-entry.entity";
import { WaitlistEvent } from "./entities/waitlist-event.entity";
import { WaitlistService } from "./waitlist.service";
import { WebSocketModule } from "../websocket/websocket.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Waitlist, WaitlistEntry, WaitlistEvent]),
    WebSocketModule,
  ],
  providers: [WaitlistService],
  exports: [TypeOrmModule, WaitlistService],
})
export class WaitlistModule {}
