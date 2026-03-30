// src/plugins/plugins.module.ts

import { Module } from "@nestjs/common";
import { PluginManagerService } from "./plugin-manager.service";
import { PluginController } from "./plugin.controller";

@Module({
  providers: [PluginManagerService],
  controllers: [PluginController],
  exports: [PluginManagerService],
})
export class PluginsModule {}
