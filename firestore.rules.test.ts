import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { describe, it, beforeAll, afterAll, beforeEach } from '@jest/globals';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'test-project',
    firestore: {
      rules: readFileSync('DRAFT_firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore Rules Security Tests', () => {
  it('should deny unauthorized reads to ledgers', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(unauthed.firestore().collection('ledgers').doc('ledger1').get());
  });
  
  it('should allow batch creating a ledger if owner member is added', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const batch = alice.firestore().batch();
    
    const ledgerRef = alice.firestore().collection('ledgers').doc('ledger1');
    const memberRef = ledgerRef.collection('members').doc('alice');
    
    batch.set(ledgerRef, {
      name: 'Keluarga',
      ownerId: 'alice',
      monthlyBudget: 5000000,
      createdAt: alice.firestore().constructor.FieldValue.serverTimestamp() // Mocked for simplicity
    });
    
    batch.set(memberRef, {
      uid: 'alice',
      role: 'owner',
      addedAt: alice.firestore().constructor.FieldValue.serverTimestamp()
    });
    
    await assertSucceeds(batch.commit());
  });
});
