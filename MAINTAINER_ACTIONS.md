# Maintainer Actions — Docker multi-stage & build fixes

This file lists suggested steps for the maintainer to finish the remaining work after the automated Docker optimizations and initial fixes applied on branch `docker/multi-stage-opt`.

1) Reproduce locally
   - Install dependencies and run the TypeScript build to see current errors:
     ```bash
     npm ci
     npm run build
     ```

2) What's already changed (branch: `docker/multi-stage-opt`)
   - `Dockerfile` replaced with a multi-stage build (deps, builder, runner).
   - `docker-compose.yml`: added `app_prod` service targeting final `runner` image.
   - `README.md`: added Docker build/run instructions.
   - Fixed a number of simulator import issues and added missing mock providers/types to unblock compilation in those areas.

3) Remaining issues observed during `npm run build`
   - Validation/config type mismatches: `src/validation/configuration.ts` uses properties (e.g. `apiPrefix`, `poolMin`, `ttl`, `cors`, `smtp`, `fileEnabled`, `sentry`, `stripe`, `defaultPageSize`) that are not present in `src/validation/config.interface.ts`. Align the interface or update `configuration.ts`.
   - `FeatureFlags` referenced in `configuration.ts` is missing from `config.interface.ts`.
   - Re-run the build after aligning types to surface any remaining domain errors.

4) Suggested fixes (high level)
   - Update `src/validation/config.interface.ts` to include the fields expected by `configuration.ts`, or modify `configuration.ts` to conform to the current interfaces.
   - Prefer conservative interface changes (add optional properties) to avoid cascading refactors.
   - After config/interface alignment, run `npm run build` and fix any remaining compile errors (likely smaller import/type issues revealed afterwards).

5) Docker / CI recommendations
   - Enable Docker BuildKit in CI to leverage layer caching and mount caches: set `DOCKER_BUILDKIT=1`.
   - Cache node_modules between builds when possible (use actions/cache or registry layer cache) and build the `runner` target in CI for minimal artifacts.
   - Use the `app_prod` compose service for local smoke tests (no source mounts):
     ```bash
     docker compose up --build app_prod
     ```

6) If you want me to continue
   - I can push the `docker/multi-stage-opt` branch to the remote and/or open a PR with the existing changes for maintainer review.
   - Or I can stop here and leave the rest to maintainers.

Commit notes: changes are committed locally on branch `docker/multi-stage-opt`.

Contact: open an issue or tag me in a review if you want me to iterate further.
