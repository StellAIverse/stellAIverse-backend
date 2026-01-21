# Wallet-Based Authentication - Quick Start Guide

## Overview

The wallet-based authentication system is now fully implemented and integrated into your NestJS backend. This guide will help you get started with the authentication flow.

## ✅ What's Been Implemented

### Core Components
- **Challenge Service**: Issues time-limited cryptographic challenges
- **Wallet Auth Service**: Verifies signatures and issues JWT tokens
- **Auth Controller**: Exposes `/auth/challenge` and `/auth/verify` endpoints
- **JWT Auth Guard**: Protects endpoints with `@UseGuards(JwtAuthGuard)`
- **JWT Strategy**: Extracts and validates tokens from Authorization headers

### Key Features
- ✅ Valid signatures authenticate users
- ✅ Invalid signatures are rejected with 401 Unauthorized
- ✅ JWT guard protects endpoints
- ✅ One-time-use challenges (prevents replay attacks)
- ✅ 5-minute challenge expiration
- ✅ 24-hour JWT token validity
- ✅ Address binding (challenges tied to specific wallet addresses)

## 🚀 Getting Started

### Step 1: Set Up Environment Variables

Create a `.env` file in the project root:

```env
JWT_SECRET=your-super-secret-key-here
```

> **Security**: Use a strong, random secret in production!

### Step 2: Start the Server

```bash
npm install --legacy-peer-deps
npm run build
npm run start:dev
```

The server will start on `http://localhost:3000`

## 📡 API Usage

### Endpoint 1: Request Challenge

**Request:**
```bash
curl -X POST http://localhost:3000/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"address": "0x1234567890123456789012345678901234567890"}'
```

**Response:**
```json
{
  "message": "Sign this message to authenticate: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "address": "0x1234567890123456789012345678901234567890"
}
```

### Endpoint 2: Verify Signature and Get Token

After signing the message with your wallet:

```bash
curl -X POST http://localhost:3000/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Sign this message to authenticate: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "signature": "0x..."
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "address": "0x1234567890123456789012345678901234567890"
}
```

### Endpoint 3: Access Protected Endpoint

Use the JWT token for authenticated requests:

```bash
curl http://localhost:3000/protected \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response:**
```json
{
  "message": "This is a protected endpoint",
  "userAddress": "0x1234567890123456789012345678901234567890"
}
```

## 💻 Frontend Integration Example

```typescript
import { ethers } from 'ethers';

async function authenticateWithWallet() {
  // 1. Get user's wallet address
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  // 2. Request challenge
  const challengeRes = await fetch('/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const { message } = await challengeRes.json();

  // 3. Sign message with wallet
  const signature = await signer.signMessage(message);

  // 4. Verify signature and get JWT
  const tokenRes = await fetch('/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  const { token } = await tokenRes.json();

  // 5. Use token for authenticated requests
  const protectedRes = await fetch('/protected', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await protectedRes.json();
  
  console.log('Authenticated as:', data.userAddress);
  return token;
}
```

## 🛡️ Security Best Practices

1. **Environment Variables**: Always store `JWT_SECRET` in environment variables, never in code
2. **HTTPS Only**: In production, always use HTTPS to transmit tokens
3. **Token Storage**: Store JWT tokens securely (httpOnly cookies recommended)
4. **Challenge Expiration**: Challenges expire after 5 minutes to prevent abuse
5. **One-Time Use**: Each challenge can only be used once (prevents replay attacks)

## 🧪 Running Tests

### Unit Tests
```bash
npm test -- test/wallet-auth.spec.ts
```

### E2E Tests
```bash
npm run test:e2e -- --config test/jest-e2e.auth.json
```

Tests cover:
- ✅ Challenge issuance and validation
- ✅ Signature verification (valid and invalid)
- ✅ JWT token validation
- ✅ Challenge expiration
- ✅ Address mismatch detection
- ✅ Single-use challenge validation

## 📝 Example: Protecting Your Endpoints

You can now protect any endpoint with the `@UseGuards(JwtAuthGuard)` decorator:

```typescript
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from './auth/jwt.guard';

@Controller('api')
export class MyController {
  @UseGuards(JwtAuthGuard)
  @Get('my-protected-endpoint')
  getProtectedData(@Request() req) {
    const userAddress = req.user.address;
    return {
      message: 'This data is for authenticated users only',
      userAddress,
    };
  }
}
```

## ⚠️ Common Issues

### Issue: "Challenge not found or expired"
- Challenge expired (5 minute limit)
- Challenge already used
- **Solution**: Request a new challenge with `/auth/challenge`

### Issue: "Invalid signature"
- Signature doesn't match the message
- Wrong wallet used to sign
- **Solution**: Verify you're signing the exact message returned by `/auth/challenge`

### Issue: "Signature does not match challenge address"
- Signed with a different wallet than requested
- **Solution**: Ensure the address passed to `/auth/challenge` matches the signing wallet

## 📚 Documentation

For detailed documentation, see [WALLET_AUTH.md](./WALLET_AUTH.md)

## 🤝 Next Steps

1. Integrate the frontend with your wallet connection (MetaMask, WalletConnect, etc.)
2. Store JWT tokens securely in your frontend
3. Add more protected endpoints as needed
4. Consider adding rate limiting to prevent brute force attacks
5. Set up monitoring/logging for authentication events

## 📞 Support

All files are located in:
- Core auth logic: `src/auth/`
- Tests: `test/wallet-auth.spec.ts` and `test/jest-e2e.auth.json`
- Documentation: `WALLET_AUTH.md`
