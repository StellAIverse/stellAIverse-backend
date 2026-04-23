import { io, Socket } from "socket.io-client";

export enum WaitlistEvent {
  POSITION_UPDATED = "waitlist:position_updated",
  MILESTONE_REACHED = "waitlist:milestone_reached",
  ACCESS_GRANTED = "waitlist:access_granted",
  STATUS_CHANGED = "waitlist:status_changed",
  PRIORITY_BOOSTED = "waitlist:priority_boosted",
}

export interface WaitlistNotification {
  message: string;
  waitlistId: string;
  timestamp: string;
  data?: any;
}

export class WaitlistClient {
  private socket: Socket;

  constructor(baseUrl: string, token: string) {
    this.socket = io(`${baseUrl}/waitlist`, {
      auth: { token },
      transports: ["websocket"],
    });

    this.socket.on("connect", () => {
      console.log("Connected to waitlist gateway");
      this.subscribe();
    });

    this.socket.on("disconnect", (reason) => {
      console.warn("Disconnected from waitlist gateway:", reason);
    });

    this.socket.on("connect_error", (error) => {
      console.error("Waitlist connection error:", error);
    });
  }

  private subscribe() {
    this.socket.emit("waitlist:subscribe", (response: any) => {
      if (response.success) {
        console.log("Subscribed to waitlist notifications");
      } else {
        console.error("Failed to subscribe:", response.message);
      }
    });
  }

  public onPositionUpdated(callback: (data: WaitlistNotification) => void) {
    this.socket.on(WaitlistEvent.POSITION_UPDATED, callback);
  }

  public onMilestoneReached(callback: (data: WaitlistNotification) => void) {
    this.socket.on(WaitlistEvent.MILESTONE_REACHED, callback);
  }

  public onAccessGranted(callback: (data: WaitlistNotification) => void) {
    this.socket.on(WaitlistEvent.ACCESS_GRANTED, callback);
  }

  public onStatusChanged(callback: (data: WaitlistNotification) => void) {
    this.socket.on(WaitlistEvent.STATUS_CHANGED, callback);
  }

  public onPriorityBoosted(callback: (data: WaitlistNotification) => void) {
    this.socket.on(WaitlistEvent.PRIORITY_BOOSTED, callback);
  }

  public disconnect() {
    this.socket.disconnect();
  }
}
