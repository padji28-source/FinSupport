# Security Spec

## 1. Data Invariants
- A ledger must have a valid ownerId matching the creator.
- A member document ID must match the added user's UID.
- A user can only read ledgers if they are a member of that ledger.
- A user can only create a transaction if they are a member of the parent ledger.
- A user can only delete a transaction if they are a member (owner/editor) of the parent ledger.
- Transactions must have valid fields, non-negative amounts, and correct bounded string sizes.
- Members list logic: The creator of a ledger must atomically create themselves as a member. 

## 2. The "Dirty Dozen" Payloads
1. Create ledger as another user (ownerId spoofing).
2. Create ledger without creating membership. (Atomicity check) -> It's a bit hard to enforce atomicity from just Firestore rules without a backend, but we can check if `getAfter` works, but actually it's easier to verify that the creator is making themselves owner.
3. Access/Read a ledger as a non-member.
4. Add a member to a ledger you are not an owner of.
5. Create a transaction with `amt` as a string. (Type attack)
6. Update a transaction changing its `createdBy` field. (Ghost update)
7. Create a transaction in a ledger you don't belong to.
8. Delete a ledger as a non-owner.
9. Inject huge strings into `desc` or `cat`.
10. Update ledger `ownerId` to someone else.
11. Query transactions without specifying `ledgerId` (Collection group attack).
12. Create a ledger with missing `monthlyBudget`.

## 3. The Test Runner
```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

// All the tests will execute these dirty dozen rules and assert failure.
```
