const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(repoRoot, "src");
const appModulePath = path.join(srcRoot, "app.module.ts");

const allowedSkipKyc = new Set([
  "src/compliance/compliance.controller.ts:submitKyc",
  "src/compliance/compliance.controller.ts:getKycStatus",
]);

function walkControllers(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkControllers(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizeRel(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isAuthGuardExpression(guardExpression) {
  return (
    guardExpression.includes("JwtAuthGuard") ||
    guardExpression.includes("StrategyAuthGuard") ||
    /AuthGuard\(("|')jwt\1\)/.test(guardExpression)
  );
}

function main() {
  const appModule = fs.readFileSync(appModulePath, "utf8");

  const hasGlobalKycGuard =
    /provide:\s*APP_GUARD[\s\S]*?useClass:\s*KycGuard/.test(appModule);

  if (!hasGlobalKycGuard) {
    console.error("KYC coverage check failed: KycGuard is not registered globally.");
    process.exit(1);
  }

  const controllerFiles = walkControllers(srcRoot);
  let authGuardedUseGuardsCount = 0;
  const violations = [];

  for (const filePath of controllerFiles) {
    const relPath = normalizeRel(filePath);
    const content = fs.readFileSync(filePath, "utf8");

    const useGuardsMatches = [...content.matchAll(/@UseGuards\(([^)]*)\)/g)];
    for (const match of useGuardsMatches) {
      if (isAuthGuardExpression(match[1])) {
        authGuardedUseGuardsCount += 1;
      }
    }

    const classSkipKyc = /@SkipKyc\(\)\s*\r?\n\s*@Controller\(/.test(content);
    if (classSkipKyc) {
      violations.push(
        `${relPath}: class-level @SkipKyc() is not allowed for controllers.`,
      );
    }

    const skipKycMethodMatches = [
      ...content.matchAll(
        /@SkipKyc\(\)\s*(?:@[\s\S]*?\r?\n\s*)*([A-Za-z0-9_]+)\s*\(/g,
      ),
    ];

    for (const methodMatch of skipKycMethodMatches) {
      const methodName = methodMatch[1];
      const key = `${relPath}:${methodName}`;
      if (!allowedSkipKyc.has(key)) {
        violations.push(
          `${relPath}: method ${methodName} uses @SkipKyc() but is not in allowlist.`,
        );
      }
    }
  }

  if (authGuardedUseGuardsCount === 0) {
    violations.push(
      "No auth-guarded routes found during scan. Coverage check cannot be trusted.",
    );
  }

  if (violations.length > 0) {
    console.error("KYC coverage check failed:");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log(
    `KYC coverage check passed. Auth-guarded @UseGuards occurrences scanned: ${authGuardedUseGuardsCount}.`,
  );
}

main();
