import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CnAskUserInputSchema, CnAskUserOutputSchema } from '../tools/schemas.js';

describe('CnAskUserInputSchema', () => {
  it('should accept valid input with default maxRetries', () => {
    const result = CnAskUserInputSchema.safeParse({
      questions: [{ question: 'Test?' }]
    });
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.maxRetries, 3);
      assert.strictEqual(result.data.renderTimeout, 30000);
    }
  });

  it('should accept custom maxRetries and renderTimeout', () => {
    const result = CnAskUserInputSchema.safeParse({
      questions: [{ question: 'Test?' }],
      maxRetries: 5,
      renderTimeout: 15000
    });
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.maxRetries, 5);
      assert.strictEqual(result.data.renderTimeout, 15000);
    }
  });

  it('should reject maxRetries > 5', () => {
    const result = CnAskUserInputSchema.safeParse({
      questions: [{ question: 'Test?' }],
      maxRetries: 10
    });
    assert.strictEqual(result.success, false);
  });

  it('should reject renderTimeout < 10000', () => {
    const result = CnAskUserInputSchema.safeParse({
      questions: [{ question: 'Test?' }],
      renderTimeout: 5000
    });
    assert.strictEqual(result.success, false);
  });

  it('should reject renderTimeout > 60000', () => {
    const result = CnAskUserInputSchema.safeParse({
      questions: [{ question: 'Test?' }],
      renderTimeout: 70000
    });
    assert.strictEqual(result.success, false);
  });
});

describe('CnAskUserOutputSchema', () => {
  it('should validate output with retry fields', () => {
    const result = CnAskUserOutputSchema.safeParse({
      answered: false,
      cancelled: false,
      timedOut: false,
      shouldRetry: true,
      retryReason: "UI render timeout",
      renderConfirmed: false,
      answers: []
    });
    assert.strictEqual(result.success, true);
  });

  it('should validate successful response', () => {
    const result = CnAskUserOutputSchema.safeParse({
      answered: true,
      cancelled: false,
      timedOut: false,
      shouldRetry: false,
      retryReason: null,
      renderConfirmed: true,
      answers: [{ questionId: 'q1', values: ['answer'], customText: '' }]
    });
    assert.strictEqual(result.success, true);
  });

  it('should require all retry-related fields', () => {
    const result = CnAskUserOutputSchema.safeParse({
      answered: false,
      cancelled: false,
      timedOut: false,
      answers: []
    });
    assert.strictEqual(result.success, false);
  });
});
