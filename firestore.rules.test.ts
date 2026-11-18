/**
 * Phase 0: Dirty Dozen Adversarial Security Payloads & Expected Outcomes
 * Verifies invariants enforced by firestore.rules.
 */

export interface SecurityTestCase {
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; emailVerified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: SecurityTestCase[] = [
  {
    name: '1. Unauthenticated profile read',
    operation: 'get',
    path: '/users/user_1',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Unverified email user profile write',
    operation: 'create',
    path: '/users/user_1',
    auth: { uid: 'user_1', emailVerified: false },
    payload: {
      uid: 'user_1',
      email: 'spoof@example.com',
      settings: {
        theme: 'light',
        dailyGoalType: 'minutes',
        dailyGoalTarget: 15,
        showTracingGuideByDefault: false,
      },
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Cross-user PII profile read',
    operation: 'get',
    path: '/users/user_1',
    auth: { uid: 'user_2', emailVerified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Identity spoofing on deck create',
    operation: 'create',
    path: '/users/user_1/decks/deck_1',
    auth: { uid: 'user_1', emailVerified: true },
    payload: {
      id: 'deck_1',
      uid: 'user_2',
      title: 'Spoofed',
      description: '',
      type: 'kanji',
      category: 'JLPT N5',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Shadow field injection (isAdmin: true)',
    operation: 'create',
    path: '/users/user_1',
    auth: { uid: 'user_1', emailVerified: true },
    payload: {
      uid: 'user_1',
      email: 'user1@example.com',
      isAdmin: true,
      settings: {
        theme: 'light',
        dailyGoalType: 'minutes',
        dailyGoalTarget: 15,
        showTracingGuideByDefault: false,
      },
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. ID poisoning (1.5KB document ID)',
    operation: 'create',
    path: `/users/user_1/decks/${'x'.repeat(1500)}`,
    auth: { uid: 'user_1', emailVerified: true },
    payload: { id: 'x'.repeat(1500), uid: 'user_1', title: 'Bad' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Client timestamp forgery on create',
    operation: 'create',
    path: '/users/user_1/decks/deck_1',
    auth: { uid: 'user_1', emailVerified: true },
    payload: {
      id: 'deck_1',
      uid: 'user_1',
      title: 'Forged Time',
      description: 'desc',
      type: 'kanji',
      category: 'N5',
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Immutable field mutation on card update',
    operation: 'update',
    path: '/users/user_1/decks/deck_1/cards/card_1',
    auth: { uid: 'user_1', emailVerified: true },
    payload: { deckId: 'deck_other' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Type poisoning on card SRS update',
    operation: 'update',
    path: '/users/user_1/decks/deck_1/cards/card_1',
    auth: { uid: 'user_1', emailVerified: true },
    payload: { interval: 'invalid-string' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Orphaned card write under nonexistent deck',
    operation: 'create',
    path: '/users/user_1/decks/missing_deck/cards/card_1',
    auth: { uid: 'user_1', emailVerified: true },
    payload: { id: 'card_1', uid: 'user_1', deckId: 'missing_deck' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Unbounded array exhaustion on meanings',
    operation: 'create',
    path: '/users/user_1/decks/deck_1/cards/card_1',
    auth: { uid: 'user_1', emailVerified: true },
    payload: {
      id: 'card_1',
      uid: 'user_1',
      deckId: 'deck_1',
      meanings: Array.from({ length: 100 }, (_, i) => `m${i}`),
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Cross-user list query on decks',
    operation: 'list',
    path: '/users/user_1/decks',
    auth: { uid: 'user_2', emailVerified: true },
    expected: 'PERMISSION_DENIED',
  },
];
