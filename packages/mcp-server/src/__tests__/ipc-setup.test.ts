import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupMcpBridge } from '../bridge/ipc.js'

describe('setupMcpBridge', () => {
  it('resolves without throwing when Electron is not present', async () => {
    const fakeWindow: any = {
      webContents: { send: () => {} },
      on: () => {}
    }

    await setupMcpBridge(fakeWindow)
    // No exceptions = pass
    assert.ok(true)
  })
})
