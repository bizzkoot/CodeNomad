import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createIpcBridge } from '../bridge/ipc.js'
import { PendingRequestManager } from '../pending.js'

describe('IPC bridge', () => {
  it('sends ask_user.asked to mainWindow.webContents', () => {
    const sent: any[] = []
    const fakeWindow: any = {
      webContents: {
        send: (channel: string, payload: any) => sent.push({ channel, payload })
      },
      on: (_ev: string, _cb: any) => {}
    }

    const pending = new PendingRequestManager()
    const bridge = createIpcBridge(fakeWindow as any, pending)

    bridge.sendQuestion('req-1', [{ id: 'q-1', question: 'x', type: 'text', required: true }], 'T')

    assert.equal(sent.length, 1)
    assert.equal(sent[0].channel, 'ask_user.asked')
    assert.equal(sent[0].payload.requestId, 'req-1')
    assert.equal(sent[0].payload.title, 'T')
  })
})
