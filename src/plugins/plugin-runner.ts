// src/plugins/plugin-runner.ts

import { Plugin } from "./plugin.interface";

let plugin: Plugin;

process.on("message", async (msg: any) => {
  try {
    if (msg.type === "load") {
      plugin = require(msg.path).default;

      await plugin.onInit?.({
        emitEvent: (e, p) => process.send?.({ type: "event", e, p }),
        log: (m) => process.send?.({ type: "log", m }),
      });

      process.send?.({ type: "ready" });
    }

    if (msg.type === "execute") {
      const result = await plugin.onExecute?.(msg.payload);
      process.send?.({ type: "result", result });
    }

    if (msg.type === "shutdown") {
      await plugin.onShutdown?.();
      process.exit(0);
    }
  } catch (err: any) {
    process.send?.({ type: "error", error: err.message });
  }
});
