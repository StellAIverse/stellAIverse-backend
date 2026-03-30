# PR: Referral Analytics and Admin Dashboard implementation

## 🎯 Objective
Implementing a localized, secure, and robust referral tracking system with a comprehensive admin analytics dashboard. This allows for performance tracking, reward distribution analysis, and automated abuse detection.

## 🚀 Key Features
- **Core Entities**: Established `ReferralCode`, `Referral`, and `ReferralAbuseEvent` schemas for persistent tracking.
- **Referral Service**: Centralized logic for automatic code generation during user registration and secure referral tracking.
- **Analytics Service**: Real-time aggregation of key performance metrics, including total referrals, conversion rates, and reward distribution.
- **Abuse Monitoring**: Proactive logging of suspicious activities (e.g., self-referrals or rapid same-IP signups) with detailed reasoning.
- **Admin Dashboard API**: Secure, RBAC-protected endpoints in [AnalyticsController](file:///c:/Users/hp/Downloads/stellAIverse-backend/src/referral/analytics.controller.ts) for dashboard data access.
- **Reporting & Export**: Built-in support for exporting detailed referral and abuse data as **CSV** or **JSON** for external analysis.

## 🛠️ Technical Implementation
- **Architecture**: Modular design via the new `ReferralModule`, ensuring separation of concerns from core auth logic.
- **Security**: Strictly enforced `JwtAuthGuard` and `RolesGuard` to restrict analytics access to authorized admins only.
- **Integration**: Minimal footprint integration into the [AuthService](file:///c:/Users/hp/Downloads/stellAIverse-backend/src/auth/auth.service.ts) registration flow.

## 🧪 Verification
- **E2E Tests**: Comprehensive test suite implemented in [analytics.e2e-spec.ts](file:///c:/Users/hp/Downloads/stellAIverse-backend/test/referral/analytics.e2e-spec.ts).
- **Manual QA**: Verified API responses, data export formatting, and abuse detection triggers.

#142
