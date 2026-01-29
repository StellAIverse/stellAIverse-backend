# Security Audit & Threat Model

Pre-production security checklist and threat analysis for stellAIverse-backend.

**Version:** 1.0 | **Last Updated:** January 27, 2026

---

## Quick Security Overview

### Implemented Security Features
- ✅ **Helmet** security headers (HSTS, CSP, X-Frame-Options, etc.)
- ✅ **Rate limiting** 100 req/min per IP
- ✅ **JWT authentication** with signature verification  
- ✅ **Input validation** on all endpoints (class-validator)
- ✅ **CORS** whitelist configuration
- ✅ **Parameterized queries** (SQL injection prevention)

### Known Vulnerabilities (9 total)
- **nodemailer ≤7.0.10**: 3 moderate DoS vulnerabilities → **Update to 7.0.12+**
- **glob 10.2.0-10.4.5**: High severity command injection (dev dependency only)
- **lodash 4.x**: Moderate prototype pollution (indirect dependency)

### Critical Gaps to Address Before Production
1. ⚠️ **Audit logging** - Authentication events not logged
2. ⚠️ **RBAC** - No role-based access control
3. ⚠️ **Database backup encryption** - Not enabled
4. ⚠️ **Update nodemailer** - Fix DoS vulnerabilities

---

## Key Threat Vectors

### 1. JWT Secret Compromise (MEDIUM Risk)
**Attack:** Attacker discovers JWT_SECRET and forges tokens  
**Mitigation:** ✅ No default secrets, environment validation  
**Action Needed:** Store in secrets manager (AWS Secrets Manager/Vault)

### 2. Signature Replay Attack (LOW Risk)
**Attack:** Captured wallet signature replayed for authentication  
**Mitigation:** ✅ One-time challenges, 5-min expiration, HTTPS  
**Residual Risk:** Minimal

### 3. Email Account Takeover (HIGH Risk)
**Attack:** Compromised email → account recovery → wallet unlinking  
**Mitigation:** ✅ Short-lived tokens (1 hour), email verification required  
**Action Needed:** Add 2FA for email changes (future enhancement)

### 4. Rate Limit Bypass (MEDIUM Risk)
**Attack:** IP rotation to bypass rate limits  
**Mitigation:** ✅ Per-IP limiting (100/min)  
**Action Needed:** Add per-wallet limiting, CAPTCHA for suspicious patterns

### 5. Supply Chain Attack (MEDIUM Risk)
**Attack:** Malicious npm package compromises system  
**Mitigation:** ✅ npm audit, Dependabot, package-lock.json  
**Action Needed:** Regular updates, automated scanning

### 6. Database Credential Leak (LOW Risk)
**Attack:** DATABASE_URL exposed in logs/errors  
**Mitigation:** ✅ Production logging excludes connection strings, network isolation  
**Residual Risk:** Minimal with current controls

---

## Pre-Production Checklist

**How to use:** Complete each section before production deployment. Get sign-offs from responsible teams.

**Legend:** ✅ = Complete | ⚠️ = Needs Work | ❌ = Not Done

---

### 1. Authentication & Authorization
- [ ] JWT_SECRET is strong (≥64 characters) and stored in secrets manager
- [ ] JWT expiration set to ≤24 hours
- [ ] No default/fallback secrets in code
- [ ] JWT algorithm explicitly set to HS256
- [ ] Wallet signature verification uses ethers.js
- [ ] Challenges are one-time use and expire in 5 minutes
- [ ] Email verification tokens expire in 24 hours
- [ ] Recovery tokens expire in 1 hour
- [ ] Users can only access their own resources (ownership validation)
- [ ] No privilege escalation possible

**Responsible:** Backend Lead  
**Sign-off:** ______________ Date: __________

---

### 2. Input Validation & Sanitization
- [ ] class-validator decorators on all DTOs
- [ ] ValidationPipe enabled globally with `whitelist: true`
- [ ] `forbidNonWhitelisted: true` enabled
- [ ] `forbidUnknownValues: true` enabled
- [ ] All queries use TypeORM parameterized queries (no raw SQL)
- [ ] CSP headers configured via Helmet
- [ ] Detailed validation errors disabled in production

**Responsible:** Backend Developer  
**Sign-off:** ______________ Date: __________

---

### 3. Network Security
- [ ] TLS 1.2+ enforced (HTTPS only)
- [ ] SSL certificate from trusted CA
- [ ] HSTS header enabled (max-age ≥ 31536000)
- [ ] HTTP redirects to HTTPS
- [ ] CORS origins explicitly whitelisted (no `*`)
- [ ] Production origins only (no localhost)
- [ ] Rate limiting tested (100 req/min per IP)
- [ ] CDN/WAF configured for DDoS protection (recommended)

**Responsible:** DevOps Engineer  
**Sign-off:** ______________ Date: __________

---

### 4. Security Headers (Helmet)
- [ ] Helmet middleware configured and enabled
- [ ] `X-Frame-Options: DENY`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Strict-Transport-Security` with includeSubDomains
- [ ] `Content-Security-Policy` configured
- [ ] `X-Powered-By` header removed
- [ ] Headers verified with securityheaders.com (Score: A or higher)

**Responsible:** Backend Lead  
**Sign-off:** ______________ Date: __________

---

### 5. Secrets Management
- [ ] No secrets in source code or git history
- [ ] `.env` files in .gitignore
- [ ] Production secrets stored in secrets manager (AWS Secrets Manager, Vault, etc.)
- [ ] JWT_SECRET generated with `./scripts/generate-secrets.sh`
- [ ] Database password is strong (≥32 characters)
- [ ] Secrets rotation policy defined (90 days recommended)
- [ ] Environment validation on application startup
- [ ] Pre-commit hook installed to prevent secret commits

**Responsible:** DevOps Engineer  
**Sign-off:** ______________ Date: __________

---

### 6. Database Security
- [ ] PostgreSQL version ≥14
- [ ] Database not publicly accessible (private subnet)
- [ ] TypeORM `synchronize: false` in production
- [ ] SSL/TLS enabled for database connections
- [ ] Connection pooling configured (max: 20)
- [ ] Database user has minimal privileges
- [ ] Automated backups configured
- [ ] Backup restoration tested (RTO < 1 hour)
- [ ] Backup encryption enabled

**Responsible:** DevOps Engineer  
**Sign-off:** ______________ Date: __________

---

### 7. Dependency Security
- [ ] `npm audit` run with no critical/high vulnerabilities in production deps
- [ ] Dependabot enabled for automated updates
- [ ] package-lock.json committed to version control
- [ ] Dependencies updated in last 30 days
- [ ] Known vulnerabilities documented and accepted/mitigated

**Current Known Issues:**
- nodemailer ≤7.0.10: 3 moderate DoS (needs update to 7.0.12+)
- glob: high (dev-only, acceptable)
- lodash: moderate (indirect, input validation mitigates)

**Responsible:** Backend Developer  
**Sign-off:** ______________ Date: __________

---

### 8. Logging & Monitoring
- [ ] Production log level set to 'error' and 'warn' only
- [ ] No sensitive data logged (passwords, tokens, full PII)
- [ ] Structured logging implemented (JSON format)
- [ ] Failed authentication attempts monitored and alerted
- [ ] Rate limit violations alerted
- [ ] Error rate threshold alerts configured
- [ ] Security alerts route to on-call engineer
- [ ] Audit logging implemented for auth events ⚠️ **(TODO)**

**Responsible:** DevOps Engineer  
**Sign-off:** ______________ Date: __________

---

### 9. Infrastructure Security
- [ ] Docker containers run as non-root user
- [ ] Security options configured (no-new-privileges: true)
- [ ] Read-only root filesystem where possible
- [ ] Database in private subnet (no public IP)
- [ ] Redis in private subnet
- [ ] Security groups restrict inbound traffic
- [ ] SSH access restricted (keys only, no passwords, or via bastion)
- [ ] MFA enabled for all cloud accounts (AWS/GCP/Azure)

**Responsible:** DevOps Engineer  
**Sign-off:** ______________ Date: __________

---

### 10. Testing & Verification
- [ ] Rate limiting tested under load
- [ ] Input validation tested with malicious payloads (XSS, SQL injection)
- [ ] Authentication flow tested end-to-end
- [ ] SAST scan completed (SonarQube, Semgrep)
- [ ] Dependency scan completed (npm audit, Snyk)
- [ ] Docker image scan completed (Trivy)
- [ ] Manual penetration test completed ⚠️ **(Recommended before production)**
- [ ] Load test passed (3× expected traffic)
- [ ] SSL Labs scan: A or higher

**Responsible:** QA Lead / Security Engineer  
**Sign-off:** ______________ Date: __________

---

## Final Production Go/No-Go Decision

### Prerequisites
- [ ] All critical items above marked complete
- [ ] No P0/P1 findings from penetration test
- [ ] Load test passed successfully
- [ ] Security monitoring and alerts tested
- [ ] Incident response team briefed
- [ ] Rollback plan documented and tested
- [ ] Database backup verified

### Known Acceptable Risks
- nodemailer DoS vulnerabilities (rate limiting mitigates, update planned)
- No audit logging (planned for next sprint)
- No RBAC (planned for next sprint)

### Decision
- [ ] **GO** - Proceed to production with documented acceptable risks
- [ ] **NO-GO** - Critical issues remain, delay deployment

---

**Security Lead Sign-off:** ______________ Date: __________  
**Engineering Manager Sign-off:** ______________ Date: __________  
**DevOps Lead Sign-off:** ______________ Date: __________

---

## Quick Commands

### Security Audit
```bash
npm run security:audit
```

### Generate Production Secrets
```bash
npm run security:generate-secrets
```

### Install Pre-commit Hook
```bash
ln -s ../../scripts/pre-commit-security.sh .git/hooks/pre-commit
```

### Test Security Headers
```bash
curl -I https://api.stellaiverse.com
# Or visit: https://securityheaders.com/
```

---

## Incident Response Quick Reference

### Severity Levels
- **P0 (Critical):** Active breach, JWT secret leaked → **Immediate action**
- **P1 (High):** Suspicious auth patterns, unpatched critical CVE → **< 4 hours**
- **P2 (Medium):** Rate limit abuse, missing security header → **< 24 hours**
- **P3 (Low):** Non-critical improvements → **< 7 days**

### Emergency Contacts
- **Security Team:** security@stellaiverse.com
- **Incident Response:** incident@stellaiverse.com (monitored 24/7)

### JWT Secret Compromise Response
1. **Immediate:** Rotate JWT_SECRET in secrets manager
2. Invalidate all existing tokens (force re-auth)
3. Review recent auth logs for anomalies
4. Notify security team and affected users
5. Conduct post-incident review

---

## Appendix: Useful Tools

### Security Testing
- **SAST:** SonarQube, Semgrep
- **Dependency Scan:** npm audit, Snyk, Dependabot
- **Container Scan:** Trivy, Aqua Security
- **SSL Test:** SSL Labs (ssllabs.com), testssl.sh
- **Header Test:** securityheaders.com

### Secrets Management
- **Cloud:** AWS Secrets Manager, GCP Secret Manager, Azure Key Vault
- **Self-hosted:** HashiCorp Vault

### Monitoring
- **APM:** Datadog, New Relic, Sentry
- **Logs:** CloudWatch, ELK Stack

---

**Document Version:** 1.0  
**Next Review:** April 27, 2026 (Quarterly)  
**Maintained by:** Security Team
