# Enhanced Authentication & KYC System

This document describes the secure authentication system with JWT, role-based access control, and complete KYC workflow implementation.

## Features

### Authentication
- **Traditional Email/Password Registration & Login**
- **JWT Access Tokens** with 15-minute expiration
- **Refresh Tokens** with 7-day expiration for seamless authentication
- **Two-Factor Authentication (2FA)** with TOTP support
- **Backup Codes** for 2FA recovery

### Role-Based Access Control (RBAC)
- **User**: Standard user role
- **KYC Operator**: Can review and manage KYC applications
- **Admin**: Full system access

### KYC Workflow
- **State Machine**: Unverified → Pending → InReview → Verified/Rejected
- **Document Upload** with AES-256 encryption
- **Email Notifications** for status changes
- **GDPR Compliance** with data encryption and right to deletion

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "username": "optional_username",
  "referralCode": "optional_referral_code"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "refresh_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "username": "optional_username",
    "role": "user",
    "kycStatus": "unverified"
  },
  "requiresTwoFactor": false
}
```

#### POST /api/auth/login
Authenticate user with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

#### POST /api/auth/refresh
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "your_refresh_token"
}
```

### Two-Factor Authentication

#### POST /api/auth/2fa/setup
Initialize 2FA setup (requires authentication).

**Request Body:**
```json
{
  "type": "totp"
}
```

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCodeUrl": "data:image/png;base64,...",
  "backupCodes": ["12345678", "87654321", ...]
}
```

#### POST /api/auth/2fa/verify-setup
Complete 2FA setup by verifying TOTP code.

**Request Body:**
```json
{
  "code": "123456"
}
```

#### POST /api/auth/2fa/verify
Verify 2FA code during login (when 2FA is enabled).

**Request Body:**
```json
{
  "userId": "user_id",
  "code": "123456"
}
```

#### POST /api/auth/2fa/disable
Disable 2FA for the account.

**Request Body:**
```json
{
  "password": "current_password"
}
```

### KYC Endpoints

#### POST /api/kyc/submit
Submit KYC application (requires authentication).

**Request Body:**
```json
{
  "fullName": "John Doe",
  "dateOfBirth": "1990-01-01",
  "country": "US",
  "address": "123 Main Street",
  "city": "New York",
  "postalCode": "10001",
  "phoneNumber": "+1234567890",
  "occupation": "Software Engineer",
  "sourceOfFunds": "Employment",
  "annualIncome": 75000,
  "taxId": "123-45-6789",
  "nationality": "American"
}
```

#### POST /api/kyc/document
Upload KYC document (requires authentication, multipart/form-data).

**Form Data:**
- `documentType`: "passport" | "drivers_license" | "national_id" | "utility_bill" | "bank_statement" | "selfie"
- `file`: Document file (JPEG, PNG, PDF, max 10MB)

#### GET /api/kyc/status
Get current KYC status (requires authentication).

**Response:**
```json
{
  "userId": "user_id",
  "status": "pending",
  "fullName": "John Doe",
  "dateOfBirth": "1990-01-01",
  "country": "US",
  "submittedAt": "2024-01-01T00:00:00.000Z",
  "documents": [
    {
      "id": "doc_id",
      "documentType": "passport",
      "fileName": "encrypted_filename.jpg",
      "mimeType": "image/jpeg",
      "fileSize": 1024000,
      "verified": false
    }
  ]
}
```

#### GET /api/kyc/download/:documentId
Download a KYC document (requires authentication).

### KYC Operator Endpoints (Require KYC_OPERATOR or ADMIN role)

#### GET /api/kyc/pending
Get all pending KYC applications.

#### POST /api/kyc/:profileId/move-to-review
Move KYC application to review status.

#### POST /api/kyc/:profileId/review
Review and approve/reject KYC application.

**Request Body:**
```json
{
  "status": "verified" | "rejected",
  "notes": "Optional review notes"
}
```

### GDPR Compliance

#### DELETE /api/kyc/user-data
Delete all user data including KYC information (GDPR right to deletion).

## Security Features

### Data Encryption
- KYC documents are encrypted using AES-256-CBC before storage
- Encryption keys are securely managed and not stored with files
- Sensitive PII data is masked in logs and responses

### Authentication Security
- Passwords hashed with bcrypt (12 rounds)
- JWT tokens with short expiration (15 minutes)
- Refresh tokens with secure storage and rotation
- Rate limiting on authentication endpoints
- IP and User-Agent tracking for security monitoring

### Access Control
- Role-based permissions for different user types
- JWT-based authentication with proper validation
- Guards for protecting sensitive endpoints
- Audit logging for all security events

## Database Schema

### New Tables
- `refresh_tokens`: Stores refresh tokens with expiration
- `two_factor_auth`: Manages 2FA settings and secrets
- `kyc_profiles`: Stores KYC application data
- `kyc_documents`: Stores encrypted document metadata
- `kyc_status_history`: Audit trail of KYC status changes

### Updated Tables
- `users`: Added `kycStatus`, `isActive`, `lastLoginAt` columns

## Testing

Run the test suite:
```bash
npm run test
```

Run specific test files:
```bash
npm run test enhanced-auth.service.spec.ts
npm run test kyc.service.spec.ts
npm run test enhanced-auth.e2e-spec.ts
```

## Environment Variables

Add these to your `.env` file:
```env
JWT_SECRET=your_jwt_secret_key
KYC_ENCRYPTION_KEY=your_encryption_key_for_kyc_documents
```

## Migration

Run database migrations:
```bash
npm run migration:run
```

## Usage Examples

### User Registration and Login
```typescript
// Register
const registerResponse = await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securepassword123',
    username: 'johndoe'
  })
});

// Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securepassword123'
  })
});

const { accessToken, refreshToken } = await loginResponse.json();
```

### KYC Submission
```typescript
const kycResponse = await fetch('/api/kyc/submit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    fullName: 'John Doe',
    dateOfBirth: '1990-01-01',
    country: 'US',
    address: '123 Main St',
    city: 'New York',
    postalCode: '10001'
  })
});
```

### Document Upload
```typescript
const formData = new FormData();
formData.append('documentType', 'passport');
formData.append('file', fileInput.files[0]);

const uploadResponse = await fetch('/api/kyc/document', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});
```

This implementation provides a complete, secure authentication and KYC system suitable for production use with proper security measures, compliance features, and comprehensive testing.</content>
<parameter name="filePath">/workspaces/stellAIverse-backend/ENHANCED_AUTH_KYC_README.md