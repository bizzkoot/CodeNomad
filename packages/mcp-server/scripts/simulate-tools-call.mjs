import { CodeNomadMcpServer } from '../dist/index.js';

async function simulate() {
  const server = new CodeNomadMcpServer();
  console.log('[SIM] Server instance created');

  const payload = {
    jsonrpc: '2.0',
    id: 'sim-1',
    method: 'tools/call',
    params: {
      name: 'ask_user',
      arguments: {
        questions: [{ question: 'Is this a test?', type: 'text', required: true }],
        title: 'SimTest'
      }
    }
  };

  // Invoke private handler directly
  const resPromise = server['handleJsonRpc'](payload);

  // Allow microtask queue to process
  await new Promise((r) => setTimeout(r, 10));

  const pending = server.getPendingManager().getAll();
  console.log('[SIM] Pending count after call:', server.getPendingManager().count());
  console.log('[SIM] Pending IDs:', pending.map(p => p.id));

  if (pending.length === 0) {
    console.error('[SIM] No pending request was created');
    const res = await resPromise;
    console.log('[SIM] Response (no pending):', JSON.stringify(res, null, 2));
    return;
  }

  const reqId = pending[0].id;
  const q = pending[0].questions[0];

  // Simulate UI answering
  const answers = [{ questionId: q.id, values: ['yes'] }];
  const ok = server.getPendingManager().resolve(reqId, answers);
  console.log('[SIM] Resolve returned:', ok);

  const res = await resPromise;
  console.log('[SIM] Tool response:', JSON.stringify(res, null, 2));
  console.log('[SIM] Pending count after resolve:', server.getPendingManager().count());
}

simulate().catch((err) => {
  console.error('[SIM] Error during simulation:', err);
  process.exit(1);
});
