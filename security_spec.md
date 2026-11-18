# Kakuso Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership**: Every document under `/users/{userId}` (profile, decks, cards, daily logs) is strictly private to the authenticated, email-verified user whose `request.auth.uid == userId`.
2. **PII Isolation**: User email (`users/{userId}.email`) is readable only via owner `get`; `list` on `/users` is denied.
3. **Referential Integrity**: Every `StudyCard` under `/users/{userId}/decks/{deckId}/cards/{cardId}` requires `uid == userId`, `deckId == deckId`, and `existsAfter(/databases/$(database)/documents/users/$(userId)/decks/$(deckId))`.
4. **Immutable Identity & Creation Timestamps**: `uid`, `id`, `deckId`, `date`, and `createdAt` cannot be mutated after creation; `createdAt` and `updatedAt` must equal `request.time` on creation, and `updatedAt` must equal `request.time` on update.
5. **Volumetric & Type Safety**: All strings, arrays, numeric counters, and document IDs have explicit type and upper-bound size checks to prevent resource exhaustion and shadow fields.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read/Write**: Unauthenticated user attempts `get` on `/users/u1` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts to create `/users/u1` -> `PERMISSION_DENIED`.
3. **Cross-User Read (PII Leak)**: User `u2` attempts `get` on `/users/u1` or `list` on `/users` -> `PERMISSION_DENIED`.
4. **Identity Spoofing on Create**: User `u1` attempts to create `/users/u1/decks/d1` with `uid: "u2"` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection**: User `u1` creates `/users/u1` with extra field `isAdmin: true` -> `PERMISSION_DENIED` (`hasOnly` check).
6. **ID Poisoning (1.5KB Document ID)**: User `u1` attempts to create deck with `deckId = "a".repeat(1500)` -> `PERMISSION_DENIED` (`isValidId` <= 128).
7. **Timestamp Forgery**: User `u1` creates deck with client-supplied past timestamp instead of `request.time` -> `PERMISSION_DENIED`.
8. **Immutable Field Mutation**: User `u1` updates card attempting to change `deckId` or `createdAt` -> `PERMISSION_DENIED`.
9. **Type / Value Poisoning on Update**: User `u1` updates card `interval` with a string `"999"` -> `PERMISSION_DENIED` (`isValidCard` enforces `number`).
10. **Orphaned Card Write**: User `u1` creates `/users/u1/decks/nonexistent/cards/c1` -> `PERMISSION_DENIED` (`existsAfter` fails).
11. **Unbounded Array Exhaustion**: User `u1` writes 5000 `meanings` into a card -> `PERMISSION_DENIED` (`size() <= 30`).
12. **Unscoped List Query**: User `u2` attempts `list` on `/users/u1/decks` -> `PERMISSION_DENIED` (`isOwner` + `resource.data.uid == request.auth.uid`).
