# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

**DO NOT** create public GitHub issues for security vulnerabilities.

### How to Report

Please report security vulnerabilities to: **security@stellaiverse.com**

Include the following information:
- Type of vulnerability
- Full paths of source files related to the vulnerability
- Location of affected source code (tag/branch/commit/direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment (what can an attacker do?)

### What to Expect

- **Initial Response:** Within 48 hours
- **Status Update:** Within 7 days
- **Fix Timeline:** Critical issues within 7 days, others within 30 days

### Bug Bounty

We currently do not have a bug bounty program, but we deeply appreciate responsible disclosure and will:
- Acknowledge your contribution in our security advisories
- Provide attribution in release notes (unless you prefer anonymity)
- Send you swag/merch for significant findings

### Disclosure Policy

- Report security issues privately first
- Allow us reasonable time to fix (90 days recommended)
- Coordinate public disclosure timing
- We will credit you in our security advisory

## Known Vulnerabilities

### Current Issues (as of January 27, 2026)

| Severity | Package | CVE | Status |
|----------|---------|-----|--------|
| Moderate | nodemailer | GHSA-mm7p-fcc7-pg87 | Reviewing update |
| Moderate | nodemailer | GHSA-rcmh-qjqh-p98v | Reviewing update |
| Moderate | nodemailer | GHSA-46j5-6fg5-4gv3 | Reviewing update |
| Moderate | lodash | GHSA-xxjr-mmjv-4gpg | Indirect dependency |
| High | glob | GHSA-5j98-mcp5-4vw2 | Dev dependency only |

**Note:** These vulnerabilities are tracked in our issue tracker. None are currently exploitable in production due to usage context.

## Security Best Practices for Contributors

### Code Review Guidelines

1. **Authentication/Authorization Changes**
   - Must be reviewed by security team
   - Require 2+ approvals
   - Include security test cases

2. **Dependency Updates**
   - Check `npm audit` before merging
   - Review CHANGELOG for security fixes
   - Test thoroughly in staging

3. **Environment Variables**
   - Never commit secrets
   - Use `.env.example` for templates
   - Document all required variables

4. **Input Validation**
   - Validate all user input
   - Use class-validator decorators
   - Test with malicious payloads

5. **Database Queries**
   - Use TypeORM parameterized queries
   - Never concatenate user input into SQL
   - Review raw queries carefully

### Security Headers

All responses include:
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy`

### Rate Limiting

- Global: 100 requests/minute per IP
- Authentication: 10 requests/minute per IP
- Email sending: 3 requests/hour per wallet

### Cryptography

- **JWT:** HS256 algorithm (no 'none' algorithm allowed)
- **Signatures:** ethers.js `verifyMessage()` for wallet signatures
- **Secrets:** Minimum 64 bytes entropy for JWT_SECRET

## Security Updates

Security updates are announced via:
- GitHub Security Advisories
- Email to registered users (for critical issues)
- Release notes

Subscribe to notifications: Watch → Custom → Security alerts

## Contact

- **Security Team:** security@stellaiverse.com
- **Incident Response:** incident@stellaiverse.com
- **General Support:** support@stellaiverse.com

## Attribution

We thank the following security researchers:
- (Your name could be here!)

---

**Last Updated:** January 27, 2026
