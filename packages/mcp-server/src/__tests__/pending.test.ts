import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PendingRequestManager } from '../pending.js'

describe('PendingRequestManager', () => {
  it('adds and resolves a pending request', async () => {
    const mgr = new PendingRequestManager()

    let resolvedResult: any = null

    mgr.add({
      id: 'test-1',
      questions: [],
      resolve: (r) => { resolvedResult = r },
      reject: (_e) => { /* not used */ },
      createdAt: Date.now(),
      timeout: null,
      renderTimeout: null,
      renderConfirmed: false,
      maxRetries: 3,
      retryCount: 0
    })

    const ok = mgr.resolve('test-1', [{ questionId: 'q1', values: ['a'] }])
    assert.equal(ok, true)
    assert.ok(resolvedResult)
    assert.equal(resolvedResult.answered, true)
    assert.equal(resolvedResult.shouldRetry, false)
    assert.equal(resolvedResult.renderConfirmed, false)
    assert.equal(mgr.count(), 0)
  })

  it('rejects a missing request gracefully', () => {
    const mgr = new PendingRequestManager()
    const ok = mgr.resolve('does-not-exist', [])
    assert.equal(ok, false)
  })
})
