import { describe, it } from 'node:test'
import assert from 'node:assert'
import type { CnAskUserInput } from '../tools/schemas.js'
import { askUser } from '../tools/askUser.js'
import { PendingRequestManager } from '../pending.js'

// Minimal fake bridge to capture sendQuestion calls
const makeBridge = () => {
  let last: any = null
  return {
    sendQuestion: (requestId: string, questions: any[], title?: string) => {
      last = { requestId, questions, title }
    },
    getLast: () => last,
    onAnswer: (_cb: any) => {},
    onCancel: (_cb: any) => {},
    onRenderConfirmed: (_cb: any) => {}
  }
}

describe('askUser tool', () => {
  it('sends a question via bridge and resolves when pending manager is answered', async () => {
    const pending = new PendingRequestManager()
    const bridge = makeBridge()

    const input: CnAskUserInput = {
      questions: [{ question: 'What is your name?', type: 'text', required: true }],
      title: 'Test',
      maxRetries: 3,
      renderTimeout: 30000
    }

    const p = askUser(input, bridge as any, pending)

    // Bridge should have received a sendQuestion call
    const sent = bridge.getLast()
    assert.ok(sent)
    assert.ok(sent.requestId)
    assert.equal(sent.title, 'Test')

    // Simulate UI confirming render
    const confirmed = pending.confirmRender(sent.requestId)
    assert.equal(confirmed, true)

    // Simulate UI answering the question
    const answers = [{ questionId: (sent.questions[0].id), values: ['copilot'] }]

    const resolved = pending.resolve(sent.requestId, answers)
    assert.equal(resolved, true)

    const result = await p
    assert.equal(result.answered, true)
    assert.equal(result.shouldRetry, false)
    assert.equal(result.renderConfirmed, true)
    assert.equal(result.answers[0].values[0], 'copilot')
  })
})
