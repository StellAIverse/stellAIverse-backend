# stellAIverse-backend

A robust NestJS-based off-chain services suite and API layer that powers the stellAIverse: secure, auditable, real-time backend services that complement on‑chain logic. Implemented with NestJS (Node.js + TypeScript) with optional Rust adapters for performance‑critical components.

Purpose
-------
Provide the off‑chain infrastructure required for agents, oracles, and operators to interact reliably with the stellAIverse blockchain ecosystem. This backend ensures off‑chain computation, telemetry, and decisioning are secure, verifiable, and low‑latency.

Core responsibilities
---------------------
- AI compute bridge  
  Orchestrate calls to external AI providers (OpenAI, Grok, Llama, etc.) when an agent "thinks". Validate and normalize results, produce auditable outcomes, and submit verifiable results on‑chain.

- Real‑time agent dashboard  
  WebSocket gateways and event streams for live agent status, progress updates, heartbeats, and telemetry used by dashboards and operator UIs.

- User authentication  
  Wallet signature authentication as the primary flow, with optional email linking and recovery. Implemented with Nest guards and strategies.

- Agent discovery & recommendation engine  
  Index agent metadata, capabilities, provenance, and historical performance. Provide discovery endpoints and personalized recommendation/ranking APIs.

- Price oracles & simulated environments  
  Provide price feeds and configurable simulation environments for safe, repeatable agent testing and rehearsal.

Design principles
------------------
- Clear guarantees — Strict boundaries between off‑chain computation and on‑chain commitments; critical outcomes are signed and auditable.
- Real‑time first — Low‑latency WebSocket and event‑driven interfaces for monitoring agents and operator feedback.
- Developer friendly — Modular NestJS architecture, typed APIs, clear contracts, and adapters for new AI providers or oracles.
- Secure by default — Wallet‑based auth flows, least privilege for service accounts, rigorous input validation, and rate limiting.
- Observable & auditable — Structured logs, metrics, traces, and persistent event history for debugging and compliance.

High‑level architecture (NestJS mapping)
---------------------------------------
- NestJS Modules — Logical separation: ComputeBridgeModule, DashboardModule, AuthModule, IndexerModule, OracleModule, SimulatorModule, SubmitterModule.
- Controllers (REST) — Management, configuration, and historical queries.
- WebSocket Gateways — Live events, heartbeats, push notifications to clients (NestJS Gateway).
- Services / Providers — Business logic, provider adapters (OpenAI/Grok/Llama), indexing, on‑chain submitter.
- Guards / Strategies — Wallet signature verification, session/role guards.
- Pipes / Interceptors — Validation, transformation, and observability (request timing, tracing).
- Repositories / Entities — DB models (TypeORM or Prisma) for events, indexes, and audit logs.
- Background workers — Queues (BullMQ / Redis) for batching, retrying, and scheduled tasks.
- Observability — Logging, metrics, and tracing (OpenTelemetry, Prometheus, Grafana).

Technical highlights
--------------------
- Primary stack: NestJS (Node.js + TypeScript). Optional Rust for compute‑intensive adapters.
- API patterns: REST controllers for management and history; WebSocket Gateways for live events.
- Provider adapters: Pluggable architecture for OpenAI / Grok / Llama and other LLM/agent providers.
- Security: Signed, auditable submissions; wallet auth flows; service account isolation.
- Dev ergonomics: Typed DTOs, validation (class‑validator), sample scripts, and a local simulation mode.

Quick start (developer)
-----------------------
1. Clone the repo  
   git clone https://github.com/StellAIverse/stellAIverse-backend.git

2. Install dependencies  
   npm install

3. Configure environment  
   Copy `.env.example` → `.env` and populate provider keys, wallet credentials, DB connection, and runtime flags.

   **⚠️ SECURITY:** Never commit `.env` files. Use `.env.example` for templates only.

4. Run locally (development)  
   npm run start:dev
   - Uses Nest's hot reload; gateways and controllers available at configured ports.

5. Build & run production  
   npm run build  
   npm run start:prod

6. Useful commands  
   - Nest CLI: `npx nest start` / `npx nest build`  
   - Lint: `npm run lint`  
   - Tests: `npm run test` / `npm run test:watch`  
   - Simulate: `npm run simulate` (local replay & sandbox mode)
   - Security audit: `npm audit`

Security
--------
**🔒 Security is a top priority for stellAIverse.**

### Security Features
- ✅ Helmet security headers
- ✅ Rate limiting (100 req/min per IP)
- ✅ JWT authentication with wallet signature verification
- ✅ Input validation on all endpoints
- ✅ CORS whitelist configuration

### For Production Deployments
1. Generate secrets: `npm run security:generate-secrets`
2. Complete audit: Review `SECURITY_AUDIT.md`
3. Enable monitoring and alerts

### Reporting Security Issues
**DO NOT** create public issues for vulnerabilities.  
Email: **security@stellaiverse.com**

See [SECURITY.md](SECURITY.md) for vulnerability reporting details.

### Security Documentation
- 🔐 [SECURITY.md](SECURITY.md) - Vulnerability reporting policy
- 📋 [SECURITY_AUDIT.md](SECURITY_AUDIT.md) - Pre-production checklist & threat model

Configuration & deployment
--------------------------
- Environment variables drive provider keys, DB endpoints, wallet signing keys, and feature flags.
- Use the simulator environment for safe, deterministic testing before enabling live on‑chain submission.
- Run behind an API gateway for rate limiting and authentication; use TLS for all external endpoints.
- Store signing keys in a KMS and follow key rotation practices.
- **Security:** Complete `SECURITY_AUDIT.md` before production deployment.

Operational notes
-----------------
- Run simulator and smoke tests after configuration changes.
- Monitor metrics and set alerts for submission failures, latency spikes, and abnormal agent activity.
- Ensure on‑chain submitter transactions are batched and retried safely.

Developer guidelines
--------------------
- Follow NestJS module boundaries and dependency injection best practices.
- Keep provider adapters small and testable; use interfaces to swap implementations.
- Write DTOs for all controller inputs and use class‑validation for strict contracts.
- Add unit and integration tests for service logic and gateway flows.

Contributing
------------
Contributions are welcome. Open issues for feature requests or bugs. Follow repository contribution guidelines and include tests for significant changes.

Support & contact
-----------------
For architecture or integration questions, open an issue in this repository or contact the maintainers via the repository's issue tracker.

License
-------
Specify the project license here.

Maintainers
-----------
- (Add maintainers here)
