// src/plugins/plugin-manager.service.ts

import { Injectable, ForbiddenException } from "@nestjs/common";
import { fork, ChildProcess } from "child_process";
import * as path from "path";
import { PluginStatus } from "./plugin.interface";

interface ManagedPlugin {
  id: string;
  path: string;
  status: PluginStatus;
  process?: ChildProcess;
  metadata?: any;
}

@Injectable()
export class PluginManagerService {
  private plugins = new Map<string, ManagedPlugin>();

  // -------------------------------------
  // REGISTER
  // -------------------------------------
  registerPlugin(id: string, pluginPath: string) {
    this.plugins.set(id, {
      id,
      path: pluginPath,
      status: "pending",
    });

    return { message: "Plugin registered", id };
  }

  // -------------------------------------
  // APPROVE
  // -------------------------------------
  approvePlugin(id: string) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error("Plugin not found");

    plugin.status = "approved";
    return { message: "Plugin approved" };
  }

  // -------------------------------------
  // ACTIVATE (SANDBOXED)
  // -------------------------------------
  async activatePlugin(id: string) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error("Plugin not found");

    if (plugin.status !== "approved") {
      throw new ForbiddenException("Plugin not approved");
    }

    const runnerPath = path.join(__dirname, "plugin-runner.js");

    const child = fork(runnerPath);

    child.send({
      type: "load",
      path: path.resolve(plugin.path),
    });

    plugin.process = child;
    plugin.status = "active";

    return { message: "Plugin activated" };
  }

  // -------------------------------------
  // EXECUTE
  // -------------------------------------
  async executePlugin(id: string, payload: any) {
    const plugin = this.plugins.get(id);
    if (!plugin || plugin.status !== "active") {
      throw new Error("Plugin not active");
    }

    return new Promise((resolve, reject) => {
      plugin.process?.once("message", (msg: any) => {
        if (msg.type === "result") return resolve(msg.result);
        if (msg.type === "error") return reject(msg.error);
      });

      plugin.process?.send({
        type: "execute",
        payload,
      });
    });
  }

  // -------------------------------------
  // DEACTIVATE
  // -------------------------------------
  deactivatePlugin(id: string) {
    const plugin = this.plugins.get(id);
    if (!plugin || !plugin.process) return;

    plugin.process.send({ type: "shutdown" });
    plugin.status = "inactive";

    return { message: "Plugin deactivated" };
  }

  // -------------------------------------
  // LIST
  // -------------------------------------
  listPlugins() {
    return Array.from(this.plugins.values());
  }
}
