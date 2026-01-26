import { Injectable, Logger } from "@nestjs/common";

interface HeartbeatMonitor {
  clientId: string;
  interval: number;
  timer: NodeJS.Timeout;
  callback: (status: any) => void;
}

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private monitors: Map<string, HeartbeatMonitor> = new Map();

  startMonitoring(
    clientId: string,
    interval: number,
    callback: (status: any) => void,
  ) {
    // Stop existing monitor if any
    this.stopMonitoring(clientId);

    const timer = setInterval(() => {
      const status = {
        clientId,
        timestamp: new Date().toISOString(),
        status: "alive",
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      };
      callback(status);
    }, interval);

    this.monitors.set(clientId, {
      clientId,
      interval,
      timer,
      callback,
    });

    this.logger.log(
      `Started heartbeat monitoring for client ${clientId} (interval: ${interval}ms)`,
    );
  }

  stopMonitoring(clientId: string) {
    const monitor = this.monitors.get(clientId);
    if (monitor) {
      clearInterval(monitor.timer);
      this.monitors.delete(clientId);
      this.logger.log(`Stopped heartbeat monitoring for client ${clientId}`);
    }
  }

  stopAll() {
    this.monitors.forEach((monitor) => {
      clearInterval(monitor.timer);
    });
    this.monitors.clear();
    this.logger.log("Stopped all heartbeat monitors");
  }
}
