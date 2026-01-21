# Authentication Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (Web3)                             │
│                    (MetaMask, WalletConnect, etc)                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │     1. Request Challenge                │
        │  POST /auth/challenge { address }       │
        └────────────────────┬───────────────────┘
                             │
                             ▼
    ┌────────────────────────────────────────────────────┐
    │  Challenge Service                                 │
    │  ├─ issueChallengeForAddress()                    │
    │  ├─ Generate random challenge ID                 │
    │  ├─ Create message: "Sign this message..."       │
    │  └─ Store with 5-min expiration                  │
    └────────────────────┬───────────────────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────────┐
        │  2. Return Challenge Message         │
        │     { message, address }             │
        └──────────────────┬───────────────────┘
                           │
                           ▼
    ┌────────────────────────────────────────────────────┐
    │  Frontend (User's Wallet)                          │
    │  └─ User signs message with private key           │
    │     ethers.signMessage(message)                   │
    └────────────────────┬───────────────────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────────┐
        │  3. Submit Signature                 │
        │  POST /auth/verify                   │
        │  { message, signature }              │
        └──────────────────┬───────────────────┘
                           │
                           ▼
    ┌────────────────────────────────────────────────────┐
    │  Wallet Auth Service                               │
    │  ├─ extractChallengeId(message)                   │
    │  ├─ getChallengeAndValidate()                    │
    │  ├─ verifyMessage(message, signature)            │
    │  ├─ ✓ Check signature valid                       │
    │  ├─ ✓ Check recovered address matches challenge  │
    │  ├─ ✓ Consume challenge (one-time use)          │
    │  └─ Generate JWT token                           │
    └────────────────────┬───────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼ (Valid)                    ▼ (Invalid)
    ┌─────────────────┐          ┌──────────────────┐
    │ 4. Return JWT   │          │ Return 401       │
    │ { token, addr } │          │ Unauthorized     │
    └────────┬────────┘          └──────────────────┘
             │
             ▼
    ┌─────────────────────────────────────────────┐
    │  Frontend (Store JWT)                       │
    │  - LocalStorage / SessionStorage (not rec.) │
    │  - HttpOnly Cookie (recommended)            │
    └────────────────┬────────────────────────────┘
                     │
                     ▼
    ┌────────────────────────────────────────────┐
    │  5. Access Protected Endpoint              │
    │  Header: Authorization: Bearer <jwt>       │
    │  GET /protected                            │
    └────────────────┬───────────────────────────┘
                     │
                     ▼
    ┌────────────────────────────────────────────┐
    │  JWT Auth Guard                            │
    │  ├─ Extract token from header              │
    │  ├─ Validate signature                     │
    │  ├─ Check expiration (24h)                │
    │  └─ Inject user to request                │
    └────────────────┬───────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼ (Valid)           ▼ (Invalid)
    ┌──────────────────┐  ┌────────────────┐
    │ Process Request  │  │ Return 401     │
    │ req.user.address │  │ Unauthorized   │
    └──────────────────┘  └────────────────┘
```

## Module Dependency Diagram

```
┌─────────────────────────────────┐
│        App Module               │
│  (app.module.ts)                │
└──────────────┬──────────────────┘
               │
               ├─────────────────────────────┐
               │                             │
               ▼                             ▼
        ┌────────────────┐          ┌──────────────────┐
        │ ConfigModule   │          │  AuthModule      │
        └────────────────┘          └────────┬─────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
            ┌──────────────┐         ┌────────────────┐      ┌──────────────┐
            │ PassportModule   │         │ JwtModule  │      │ Controllers  │
            └──────────────┘         └────────────────┘      └──────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
            ┌─────────────────┐      ┌────────────────┐      ┌──────────────┐
            │ ChallengeService│      │ JwtStrategy    │      │ AuthController
            └─────────────────┘      └────────────────┘      └──────────────┘
                    │                        │
                    │                        ▼
                    │               ┌────────────────┐
                    │               │ JwtAuthGuard   │
                    │               └────────────────┘
                    │
                    ▼
            ┌──────────────────────┐
            │ WalletAuthService    │
            │ (uses both)          │
            └──────────────────────┘
```

## Data Flow - Complete Authentication Cycle

```
User's Browser/Wallet          →  Backend Server              →  NestJS Application
────────────────────────────────────────────────────────────────────────────────

1. GET /auth/challenge
   { "address": "0x123..." }   →                             →  [AuthController]
                                                                     ↓
                                                                [ChallengeService]
                                                                     ↓
                                                              Generate Challenge
                                                              Store: { id, msg,
                                                                     exp, addr }

                               ←  200 OK                       ←  Return Challenge
                               ←  { message, address }

2. User Signs Message
   ethers.signMessage(msg)     →  (happens locally)

3. POST /auth/verify
   { message, signature }      →                             →  [AuthController]
                                                                     ↓
                                                            [WalletAuthService]
                                                                     ↓
                                                            Extract Challenge ID
                                                                     ↓
                                                            [ChallengeService]
                                                            Get & Consume Challenge
                                                                     ↓
                                                            verifyMessage() ECDSA
                                                                     ↓
                                                            Compare Addresses
                                                                     ↓
                                                            ✓ All Valid
                                                                     ↓
                                                            [JwtService]
                                                            Issue JWT Token
                               ←  201 Created                  ←  { token, address }
                               ←  { token, address }

4. GET /protected
   Header: Authorization:      →                             →  [JwtAuthGuard]
           Bearer <token>                                            ↓
                                                            [JwtStrategy]
                                                            Extract Token
                                                                     ↓
                                                            Verify Signature
                                                                     ↓
                                                            Check Expiration
                                                                     ✓ Valid
                                                                     ↓
                                                            Inject req.user
                                                                     ↓
                                                            [ProtectedController]
                                                            Process Request

                               ←  200 OK                       ←  Return Data
                               ←  { data, userAddress }
```

## Security Flow - Attack Prevention

```
Attack Scenario 1: Invalid Signature
────────────────────────────────────
Attacker                        Backend
    │
    ├─→ POST /auth/challenge                             → [Controller]
    │   { address: attacker }                           → [ChallengeService]
    │                                          ← 200 { message }
    │
    ├─→ POST /auth/verify                                → [Controller]
    │   { message: <correct>,                           → [WalletAuthService]
    │     signature: <forged> }                         → ethers.verifyMessage()
    │                                          ✗ FAILS - invalid ECDSA
    │                                          ← 401 Unauthorized

Attack Scenario 2: Cross-Wallet Signature
──────────────────────────────────────────
Attacker (wallet B)             Backend
    │
    ├─→ POST /auth/challenge                             → [Controller]
    │   { address: "0x111..." }                         → [ChallengeService]
    │                                          ← 200 { message }
    │
    ├─→ Signs with wallet B                             (local operation)
    │   signature = wallet_B.sign(message)
    │
    ├─→ POST /auth/verify                                → [Controller]
    │   { message: <correct>,                           → [WalletAuthService]
    │     signature: <signed_by_B> }                   → ethers.verifyMessage()
    │                                          ✓ Valid Signature, but...
    │                                          → Get Challenge
    │                                          ✗ FAILS - address mismatch
    │                                             (wallet_B != challenge.address)
    │                                          ← 401 Unauthorized

Attack Scenario 3: Replay Attack (Same Challenge)
──────────────────────────────────────────────────
Attacker                        Backend
    │
    ├─→ POST /auth/verify                                → [Controller]
    │   { message: <msg1>,                              → [WalletAuthService]
    │     signature: <sig1> }                          → [ChallengeService]
    │                                          ✓ Valid → Consume Challenge
    │                                          ← 200 { token }
    │
    ├─→ POST /auth/verify (REPLAY)                      → [Controller]
    │   { message: <msg1>,                              → [WalletAuthService]
    │     signature: <sig1> }                          → [ChallengeService]
    │                                          ✗ FAILS - Challenge already used
    │                                          ← 401 Challenge not found/expired

Attack Scenario 4: Expired Challenge
────────────────────────────────────
User (after 5+ minutes)         Backend
    │
    ├─→ POST /auth/challenge                             → [Controller]
    │   { address: "0x111..." }                         → [ChallengeService]
    │                                          ← 200 { message }
    │
    │  (User delays signing for 6 minutes)
    │
    ├─→ POST /auth/verify                                → [Controller]
    │   { message: <msg>,                                → [WalletAuthService]
    │     signature: <sig> }                           → [ChallengeService]
    │                                          ✗ FAILS - Challenge expired
    │                                          ← 401 Challenge not found/expired
```

## Component Interaction Matrix

```
                          ┌─────────────────────────────────────────┐
                          │       Components & Interactions          │
                          └─────────────────────────────────────────┘

                    AuthController  ChallengeService  WalletAuthService  JwtService
                          │                │                 │                 │
Challenge Issuance        │                │                 │                 │
  /auth/challenge ────→   ├──────────→     │                 │                 │
                          │           issueChallengeForAddress()             │
                          │                │                 │                 │
                          │           ← Generate & Store     │                 │
                          │                │                 │                 │
Signature Verification              │                 │                 │
  /auth/verify ────→      ├──────────────────────→   │                 │
                          │                │ Extract Challenge ID          │
                          │                │         ├──→ Verify Message    │
                          │                │         │    (ethers)          │
                          │                │         │                 │
                          │         ← consumeChallenge()                │
                          │                │         │                 │
                          │                │         ├──────────────→ sign()
                          │                │         │            Generate JWT
                          │                │         │         ← { token }
                          │                │         │                 │
Protected Endpoint                        │                 │
  GET /protected ────→    (with guard)     │                 │
   (Bearer token)          ├──────────────────────────→ validateToken()
                          │                │         ✓ Valid
                          │                │         ←─────────────────→
                          │                │              verify()
                          │                │         ← Payload

Environment Setup
JWT_SECRET ────────────────────────────────────────────────────────→ JwtService
                                                                   (sign/verify)
```

This architecture ensures:
- ✅ Each challenge is unique and time-bound
- ✅ Signatures are cryptographically verified
- ✅ Addresses are recovered and matched
- ✅ Challenges are one-time use only
- ✅ Tokens are securely signed and validated
- ✅ Protected endpoints require valid tokens
