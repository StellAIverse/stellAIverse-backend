// src/plugins/plugin.controller.ts

import { Controller, Post, Body, Get, Param } from "@nestjs/common";
import { PluginManagerService } from "./plugin-manager.service";

@Controller("plugins")
export class PluginController {
  constructor(private manager: PluginManagerService) {}

  @Post("register")
  register(@Body() body: { id: string; path: string }) {
    return this.manager.registerPlugin(body.id, body.path);
  }

  @Post(":id/approve")
  approve(@Param("id") id: string) {
    return this.manager.approvePlugin(id);
  }

  @Post(":id/activate")
  activate(@Param("id") id: string) {
    return this.manager.activatePlugin(id);
  }

  @Post(":id/deactivate")
  deactivate(@Param("id") id: string) {
    return this.manager.deactivatePlugin(id);
  }

  @Get()
  list() {
    return this.manager.listPlugins();
  }
}
