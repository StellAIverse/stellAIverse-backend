export interface AgentStatusEvent {
  agentId: string;
  status: "idle" | "running" | "paused" | "error" | "offline";
  timestamp: string;
  metadata?: any;
}

export interface AgentHeartbeatEvent {
  agentId: string;
  timestamp: string;
  data: any;
}

export interface SystemMessageEvent {
  message: string;
  level: "info" | "warning" | "error";
  timestamp: string;
}

export interface SubscriptionResponse {
  success: boolean;
  message: string;
  currentStatus?: any;
}

export interface HeartbeatResponse {
  success: boolean;
  interval?: number;
  message: string;
}