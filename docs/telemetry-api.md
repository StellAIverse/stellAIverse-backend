# Real-Time Agent Telemetry API Documentation

The Agent Telemetry API provides a WebSocket interface for streaming real-time status, heartbeats, and errors from agents.

## Connection

**Namespace:** `/agent-telemetry`
**Authentication:** JWT Token required in `auth.token` or `Authorization` header.

```javascript
const socket = io('http://localhost:3000/agent-telemetry', {
  auth: { token: 'YOUR_JWT_TOKEN' }
});
```

## Subscriptions

### Subscribe to Telemetry
Subscribe to events with optional filtering.

**Message:** `telemetry:subscribe`
**Payload:**
```json
{
  "agentId": "string (optional)",
  "types": ["heartbeat", "status_update", "error", "disconnect"], // optional
  "severities": ["info", "warning", "error", "critical"] // optional
}
```

### Unsubscribe from Telemetry
**Message:** `telemetry:unsubscribe`
**Payload:**
```json
{
  "agentId": "string (optional)"
}
```

## Incoming Events

### Telemetry Event
**Event:** `telemetry:event`
**Payload:**
```json
{
  "agentId": "string",
  "type": "heartbeat | status_update | error | disconnect",
  "severity": "info | warning | error | critical",
  "data": {},
  "timestamp": "ISO8601 string"
}
```

## RBAC Rules
- **ADMIN**: Can subscribe to all agent telemetry.
- **OPERATOR**: Can subscribe to all agent telemetry.
- **USER**: Unauthorized for telemetry access (Dashboard restricted).

## Security
- All payloads are sanitized to remove sensitive information (API keys, secrets, etc.).
- Role-based access control is enforced on all subscriptions.
