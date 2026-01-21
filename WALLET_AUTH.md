# Wallet-Based Authentication

This document describes the wallet-based authentication system implemented using signed challenges and JWT tokens.

## Overview

The wallet authentication system allows users to authenticate using their Ethereum wallet by signing cryptographic challenges. This implementation includes:

- **Challenge Issuance**: Generate unique, time-limited challenges for each wallet address
- **Signature Verification**: Verify signed messages using ECDSA recovery
- **JWT Issuance**: Issue JWT tokens upon successful verification
- **Auth Guards**: Protect endpoints with JWT authentication

## Architecture

### Components

#### 1. **ChallengeService** (`src/auth/challenge.service.ts`)
Manages the lifecycle of authentication challenges:
- Issues unique challenges with 5-minute expiration
- Validates challenge existence and expiration
- Consumes challenges after use (one-time use only)

```typescript
// Issue a challenge for an address
const message = challengeService.issueChallengeForAddress(address);

// Get challenge details
const challenge = challengeService.getChallenge(challengeId);

// Consume challenge (removes it from the store)
const challenge = challengeService.consumeChallenge(challengeId);
```

#### 2. **WalletAuthService** (`src/auth/wallet-auth.service.ts`)
Handles signature verification and token issuance:
- Verifies ECDSA signatures using `ethers.verifyMessage()`
- Validates that the signature matches the challenge address
- Issues JWT tokens with user address payload

```typescript
// Verify signature and get JWT token
const { token, address } = await walletAuthService.verifySignatureAndIssueToken(
  message,
  signature
);

// Validate existing JWT token
const payload = walletAuthService.validateToken(token);
```

#### 3. **JwtStrategy** (`src/auth/jwt.strategy.ts`)
Passport strategy for JWT authentication:
- Extracts JWT from Authorization header (Bearer token)
- Validates token signature and expiration
- Provides user information to protected endpoints

#### 4. **JwtAuthGuard** (`src/auth/jwt.guard.ts`)
NestJS guard for protecting endpoints:
- Validates JWT tokens
- Returns 401 Unauthorized for invalid/missing tokens

```typescript
@UseGuards(JwtAuthGuard)
@Get('protected')
getProtected(@Request() req) {
  return { userAddress: req.user.address };
}
```

#### 5. **AuthController** (`src/auth/auth.controller.ts`)
Exposes authentication endpoints:
- `POST /auth/challenge` - Request challenge for an address
- `POST /auth/verify` - Verify signature and get JWT token

## Authentication Flow

```
┌─────────────┐
│   Wallet    │
│   (User)    │
└──────┬──────┘
       │
       │ 1. POST /auth/challenge { address }
       ▼
┌──────────────────────────┐
│  Request Challenge       │
│  - Generate unique ID    │
│  - Create message        │
│  - Store for 5 minutes   │
└──────┬───────────────────┘
       │
       │ 2. Return message
       ▼
┌─────────────────────────────────────┐
│ Sign Message with Wallet Private Key│
│ - User signs: "Sign this message..." │
│ - Produces: signature                │
└──────┬────────────────────────────────┘
       │
       │ 3. POST /auth/verify { message, signature }
       ▼
┌──────────────────────────┐
│  Verify Signature        │
│  - Recover address       │
│  - Match with challenge  │
│  - Consume challenge     │
│  - Issue JWT token       │
└──────┬───────────────────┘
       │
       │ 4. Return JWT token
       ▼
┌─────────────────────────┐
│ JWT Token (Bearer)      │
│ Valid for 24 hours      │
│ Contains: { address }   │
└─────────────────────────┘
       │
       │ 5. Use for protected endpoints
       │    Authorization: Bearer <token>
       ▼
┌──────────────────────────┐
│  Protected Endpoint      │
│  - Verify JWT           │
│  - Extract user address │
│  - Process request      │
└──────────────────────────┘
```

## API Endpoints

### Request Challenge

**Endpoint:** `POST /auth/challenge`

**Request Body:**
```json
{
  "address": "0x1234567890123456789012345678901234567890"
}
```

**Response:**
```json
{
  "message": "Sign this message to authenticate: a1b2c3d4e5f6...",
  "address": "0x1234567890123456789012345678901234567890"
}
```

### Verify Signature and Get Token

**Endpoint:** `POST /auth/verify`

**Request Body:**
```json
{
  "message": "Sign this message to authenticate: a1b2c3d4e5f6...",
  "signature": "0x..."
}
```

**Response (Success):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "address": "0x1234567890123456789012345678901234567890"
}
```

**Response (Error):**
```json
{
  "statusCode": 401,
  "message": "Invalid signature"
}
```

### Access Protected Endpoint

**Example:** `GET /protected`

**Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "message": "This is a protected endpoint",
  "userAddress": "0x1234567890123456789012345678901234567890"
}
```

## Security Features

### Challenge Security
- **Unique Challenges**: Generated using cryptographically secure random bytes
- **Short Expiration**: Challenges expire after 5 minutes
- **One-Time Use**: Each challenge can only be used once
- **Address Binding**: Each challenge is bound to a specific address

### Signature Verification
- **ECDSA Recovery**: Uses `ethers.verifyMessage()` to recover signer address
- **Address Matching**: Ensures signature matches the challenge address
- **Message Validation**: Validates message format and integrity

### Token Security
- **JWT Signing**: Uses HS256 algorithm with secret key
- **Expiration**: Tokens expire after 24 hours
- **Bearer Token**: Tokens are passed in Authorization header
- **Immutable Claims**: Token contains user address claim

## Environment Variables

The system requires the following environment variable (optional, with default):

```env
JWT_SECRET=your-secure-secret-key
```

If not set, defaults to `'your-secret-key'` (not recommended for production).

## Usage Examples

### Frontend (JavaScript/TypeScript)

```typescript
import { ethers } from 'ethers';

const address = '0x1234567890123456789012345678901234567890';

// 1. Request challenge
const challengeRes = await fetch('/auth/challenge', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address }),
});
const { message } = await challengeRes.json();

// 2. Sign message with MetaMask or other wallet
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const signature = await signer.signMessage(message);

// 3. Verify and get token
const verifyRes = await fetch('/auth/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, signature }),
});
const { token } = await verifyRes.json();

// 4. Use token for authenticated requests
const protectedRes = await fetch('/protected', {
  headers: { Authorization: `Bearer ${token}` },
});
```

## Testing

The implementation includes comprehensive tests for all components:

### Unit Tests: `test/wallet-auth.spec.ts`
- Challenge issuance and validation
- Signature verification
- JWT token validation
- Invalid signature rejection
- Challenge expiration
- Address mismatch detection
- End-to-end authentication flow

### E2E Tests: `test/jest-e2e.auth.json`
- Challenge request endpoint
- Valid signature verification
- Invalid signature rejection
- Signature from different address rejection
- Single-use challenge validation

**Run Tests:**
```bash
# Unit tests
npm test -- test/wallet-auth.spec.ts

# E2E tests
npm run test:e2e -- --config test/jest-e2e.auth.json
```

## Error Handling

| Error | Status | Description |
|-------|--------|-------------|
| Invalid signature | 401 | Signature verification failed |
| Challenge not found | 401 | Challenge expired or doesn't exist |
| Address mismatch | 401 | Signature doesn't match challenge address |
| Invalid token | 401 | JWT token is invalid or expired |
| Missing authorization | 401 | No Authorization header provided |
| Invalid message format | 401 | Message doesn't match expected format |

## Acceptance Criteria Met

✅ **Valid signatures authenticate users**
- Users can authenticate by signing challenges with their private key
- Valid signatures are verified using ECDSA recovery
- JWT tokens are issued upon successful authentication

✅ **Invalid signatures rejected**
- Invalid signatures throw UnauthorizedException
- Signatures from different addresses are rejected
- Tampered messages are rejected

✅ **JWT guard protects endpoints**
- `JwtAuthGuard` validates tokens on protected routes
- Invalid/expired tokens return 401 Unauthorized
- Authenticated requests receive user information

## Future Enhancements

- Rate limiting on challenge requests
- Challenge storage in database (currently in-memory)
- Support for multiple signature schemes (EIP-191, EIP-712)
- Refresh token mechanism
- Integration with Web3 libraries for enhanced security
