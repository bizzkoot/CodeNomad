# Reference Code: Key Implementation Patterns

**Version:** 1.0  
**Date:** 2026-01-18  

---

## Overview

This document provides reference code snippets from seamless-agent that should guide the implementation. These are NOT the final code but serve as templates and patterns to follow.

---

## 1. MCP Server Setup

### Reference: seamless-agent/src/mcp/mcpServer.ts

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as http from 'http';
import * as crypto from 'crypto';
import { z } from 'zod';

export class McpServerManager {
    private server: http.Server | undefined;
    private mcpServer: McpServer | undefined;
    private port: number | undefined;
    private transport: StreamableHTTPServerTransport | undefined;

    async start() {
        // Find available port
        this.port = await this.findAvailablePort();
        
        // Create MCP server
        this.mcpServer = new McpServer({
            name: "CodeNomad Ask User",
            version: "1.0.0"
        });
        
        // Register tools
        this.registerTools();
        
        // Create transport
        this.transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => `sess_${crypto.randomUUID()}`
        });
        
        // Connect server to transport
        await this.mcpServer.connect(this.transport);
        
        // Create HTTP server
        this.server = http.createServer(async (req, res) => {
            const url = req.url || '/';
            
            // Handle SSE/MCP endpoints
            if (url === '/sse' || url.startsWith('/sse')) {
                await this.transport?.handleRequest(req, res);
                return;
            }
            
            // Handle message endpoints
            if (url.startsWith('/message')) {
                await this.transport?.handleRequest(req, res);
                return;
            }
            
            res.writeHead(404);
            res.end();
        });
        
        // Start listening
        await new Promise<void>((resolve) => {
            this.server?.listen(this.port, '127.0.0.1', () => resolve());
        });
    }
    
    private async findAvailablePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = http.createServer();
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                if (address && typeof address !== 'string') {
                    const port = address.port;
                    server.close(() => resolve(port));
                } else {
                    reject(new Error('Failed to get port'));
                }
            });
            server.on('error', reject);
        });
    }
}
```

---

## 2. Tool Registration Pattern

### Reference: seamless-agent/src/tools/index.ts

```typescript
import * as vscode from 'vscode';  // Not needed for CodeNomad
import { z } from 'zod';

// For VSCode extension (seamless-agent):
const confirmationTool = vscode.lm.registerTool('ask_user', {
    async invoke(options, token) {
        // Validate input with Zod
        let params;
        try {
            params = parseAskUserInput(options.input);
        } catch (error) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify({
                    responded: false,
                    response: `Validation error: ${error.message}`,
                    attachments: []
                }))
            ]);
        }
        
        // Execute the tool (blocks until user responds)
        const result = await askUser(params, provider, token);
        
        // Return result - stays in same LLM stream!
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(result))
        ]);
    }
});

// For MCP Server (what CodeNomad should use):
this.mcpServer.registerTool(
    "ask_user",
    {
        inputSchema: z.object({
            questions: z.array(z.object({
                question: z.string(),
                type: z.enum(['text', 'select', 'multi-select', 'confirm']).optional(),
                options: z.array(z.string()).optional(),
            })),
            title: z.string().optional(),
            timeout: z.number().optional(),
        })
    },
    async (args) => {
        // Execute tool (blocks until user responds)
        const result = await this.askUser(args);
        
        // Return MCP result format
        return {
            content: [{
                type: "text",
                text: JSON.stringify(result)
            }]
        };
    }
);
```

---

## 3. Blocking Until User Responds

### Reference: seamless-agent/src/tools/askUser.ts

```typescript
export async function askUser(
    params: AskUserInput,
    provider: AgentInteractionProvider,
    token: CancellationToken
): Promise<AskUserToolResult> {
    const question = params.question;
    const title = params.title || 'Confirmation Required';
    
    // Generate unique request ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    // Register cancellation handler
    const cancellationDisposable = token.onCancellationRequested(() => {
        provider.cancelRequest(requestId, 'Cancelled');
    });
    
    try {
        // This BLOCKS until user responds!
        const result = await provider.waitForUserResponse(
            question, 
            title, 
            params.agentName,
            requestId
        );
        
        return {
            responded: result.responded,
            response: result.responded ? result.response : 'Cancelled',
            attachments: result.attachments.map(att => att.uri)
        };
    } finally {
        cancellationDisposable.dispose();
    }
}
```

---

## 4. Promise-Based Wait for User

### Reference: seamless-agent/src/webview/webviewProvider.ts

```typescript
/**
 * Wait for a user response to a question.
 * Returns a Promise that resolves when user responds or rejects on cancel/timeout.
 */
public async waitForUserResponse(
    question: string, 
    title?: string, 
    agentName?: string, 
    requestId?: string
): Promise<UserResponseResult> {
    
    return new Promise<UserResponseResult>((resolve) => {
        // Store the pending request with resolve callback
        this._pendingRequests.set(requestId, {
            item: {
                id: requestId,
                question,
                title,
                agentName,
            },
            resolve,  // <-- This gets called when user answers
        });
        
        // Send question to UI
        this._showQuestion({
            id: requestId,
            question,
            title,
        });
    });
}

// Called when user submits answer
private handleUserSubmit(requestId: string, response: string, attachments: any[]) {
    const pending = this._pendingRequests.get(requestId);
    if (pending) {
        this._pendingRequests.delete(requestId);
        
        // Resolve the Promise with user's answer
        pending.resolve({
            responded: true,
            response,
            attachments
        });
    }
}

// Called when user cancels
private handleUserCancel(requestId: string) {
    const pending = this._pendingRequests.get(requestId);
    if (pending) {
        this._pendingRequests.delete(requestId);
        
        pending.resolve({
            responded: false,
            response: 'Cancelled',
            attachments: []
        });
    }
}
```

---

## 5. Auto-Registration with Antigravity

### Reference: seamless-agent/src/mcp/apiService.ts

```typescript
private async registerWithAntigravity() {
    if (!this.port || !this.authToken) return;
    
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    
    const mcpConfigPath = path.join(
        os.homedir(), 
        '.gemini', 
        'antigravity', 
        'mcp_config.json'
    );
    
    // Get path to our MCP script
    const cliScriptPath = path.join(
        this.context.extensionPath, 
        'dist', 
        'seamless-agent-mcp.js'
    );
    
    try {
        // Ensure directory exists
        const configDir = path.dirname(mcpConfigPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Read existing config
        let config: any = { mcpServers: {} };
        if (fs.existsSync(mcpConfigPath)) {
            try {
                const content = fs.readFileSync(mcpConfigPath, 'utf8');
                config = JSON.parse(content);
            } catch (e) {
                console.warn('Failed to parse existing config', e);
            }
        }
        
        if (!config.mcpServers) {
            config.mcpServers = {};
        }
        
        // Register our server
        config.mcpServers['codenomad-ask-user'] = {
            command: 'node',
            args: [
                cliScriptPath, 
                '--port', String(this.port), 
                '--token', this.authToken
            ]
        };
        
        // Write updated config
        fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2));
        console.log(`Registered with Antigravity on port ${this.port}`);
        
    } catch (error) {
        console.error('Failed to register with Antigravity:', error);
    }
}

private async unregisterFromAntigravity() {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    
    const mcpConfigPath = path.join(
        os.homedir(), 
        '.gemini', 
        'antigravity', 
        'mcp_config.json'
    );
    
    try {
        if (fs.existsSync(mcpConfigPath)) {
            const content = fs.readFileSync(mcpConfigPath, 'utf8');
            const config = JSON.parse(content);
            
            if (config.mcpServers && config.mcpServers['codenomad-ask-user']) {
                delete config.mcpServers['codenomad-ask-user'];
                fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2));
            }
        }
    } catch (error) {
        console.error('Failed to unregister:', error);
    }
}
```

---

## 6. Existing CodeNomad Question Infrastructure

### Reference: packages/ui/src/stores/questions.ts

```typescript
// Existing CodeNomad code to REUSE

export function addQuestionToQueue(instanceId: string, question: QuestionRequest): void {
    setQuestionQueues(prev => {
        const next = new Map(prev);
        const queue = next.get(instanceId) ?? [];
        
        // Don't add duplicate questions
        if (queue.some(q => q.id === question.id)) {
            return next;
        }
        
        next.set(instanceId, [...queue, question]);
        return next;
    });
}

export function removeQuestionFromQueue(instanceId: string, questionId: string): void {
    setQuestionQueues(prev => {
        const next = new Map(prev);
        const queue = next.get(instanceId) ?? [];
        const filtered = queue.filter(q => q.id !== questionId);
        
        if (filtered.length > 0) {
            next.set(instanceId, filtered);
        } else {
            next.delete(instanceId);
        }
        
        return next;
    });
}

export function getPendingQuestion(instanceId: string): QuestionRequest | undefined {
    const queue = questionQueues().get(instanceId);
    return queue?.[0];
}
```

### Reference: packages/ui/src/components/instance/instance-shell2.tsx

```typescript
// Existing handler to MODIFY

const handleQuestionSubmit = async (answers: QuestionAnswer[]) => {
    const question = getPendingQuestion(props.instance.id);
    if (!question || !props.instance.client) {
        return;
    }
    
    try {
        const sdkAnswers = answers.map(answer => {
            const custom = answer.customText?.trim();
            if (custom) return [custom];
            return answer.values;
        });
        
        // EXISTING: OpenCode path
        await requestData(
            props.instance.client.question.reply({
                requestID: question.id,
                answers: sdkAnswers
            }),
            "question.reply"
        );
        
        setQuestionWizardOpen(false);
    } catch (error) {
        console.error("Failed to submit question answers", error);
    }
};

// MODIFIED version for MCP support:
const handleQuestionSubmit = async (answers: QuestionAnswer[]) => {
    const question = getPendingQuestion(props.instance.id);
    if (!question) return;
    
    const sdkAnswers = answers.map(answer => {
        const custom = answer.customText?.trim();
        if (custom) return [custom];
        return answer.values;
    });
    
    try {
        if (question.source === 'mcp') {
            // NEW: MCP path
            sendMcpAnswer(question.id, sdkAnswers);
            removeQuestionFromQueue(props.instance.id, question.id);
        } else {
            // EXISTING: OpenCode path
            if (!props.instance.client) return;
            await requestData(
                props.instance.client.question.reply({
                    requestID: question.id,
                    answers: sdkAnswers
                }),
                "question.reply"
            );
        }
        
        setQuestionWizardOpen(false);
    } catch (error) {
        console.error("Failed to submit question answers", error);
    }
};
```

---

## 7. Electron IPC Pattern

### Main Process Side

```typescript
// packages/electron-app/electron/main/mcp-bridge.ts

import { ipcMain, BrowserWindow } from 'electron';

// Map of pending requests
const pendingRequests = new Map<string, {
    resolve: (answer: any) => void;
    reject: (error: Error) => void;
}>();

export function setupMcpBridge(mainWindow: BrowserWindow) {
    // MCP Server calls this to send question to UI
    ipcMain.handle('mcp:send-question', async (event, payload) => {
        const { requestId, questions, title } = payload;
        
        // Send to renderer
        mainWindow.webContents.send('ask_user.asked', {
            requestId,
            questions,
            title,
            source: 'mcp'
        });
        
        // Wait for answer
        return new Promise((resolve, reject) => {
            pendingRequests.set(requestId, { resolve, reject });
            
            // Timeout cleanup
            setTimeout(() => {
                if (pendingRequests.has(requestId)) {
                    pendingRequests.delete(requestId);
                    resolve({
                        answered: false,
                        cancelled: false,
                        timedOut: true,
                        answers: []
                    });
                }
            }, payload.timeout || 300000);
        });
    });
    
    // UI calls this when user answers
    ipcMain.on('mcp:answer', (event, { requestId, answers }) => {
        const pending = pendingRequests.get(requestId);
        if (pending) {
            pendingRequests.delete(requestId);
            pending.resolve({
                answered: true,
                cancelled: false,
                timedOut: false,
                answers
            });
        }
    });
    
    // UI calls this when user cancels
    ipcMain.on('mcp:cancel', (event, { requestId }) => {
        const pending = pendingRequests.get(requestId);
        if (pending) {
            pendingRequests.delete(requestId);
            pending.resolve({
                answered: false,
                cancelled: true,
                timedOut: false,
                answers: []
            });
        }
    });
}
```

### Renderer Side

```typescript
// packages/ui/src/lib/mcp-bridge.ts

const { ipcRenderer } = window.require('electron');
import { addQuestionToQueue, removeQuestionFromQueue } from '../stores/questions';

export function initMcpBridge() {
    // Listen for questions from MCP server
    ipcRenderer.on('ask_user.asked', (event, payload) => {
        console.log('[MCP Bridge] Received question:', payload);
        
        // Add to existing question queue with 'mcp' source
        addQuestionToQueue(getCurrentInstanceId(), {
            id: payload.requestId,
            questions: payload.questions,
            title: payload.title,
            source: 'mcp',  // NEW: Track source
            tool: undefined,
            sessionID: undefined,
        });
    });
}

export function sendMcpAnswer(requestId: string, answers: string[][]) {
    console.log('[MCP Bridge] Sending answer:', { requestId, answers });
    ipcRenderer.send('mcp:answer', { requestId, answers });
}

export function sendMcpCancel(requestId: string) {
    console.log('[MCP Bridge] Sending cancel:', { requestId });
    ipcRenderer.send('mcp:cancel', { requestId });
}
```

---

## Key Patterns Summary

| Pattern                | Purpose                            | Where Used       |
| ---------------------- | ---------------------------------- | ---------------- |
| Promise-based blocking | Wait for user response             | askUser function |
| Pending request map    | Track multiple concurrent requests | webviewProvider  |
| Tool registration      | Register with MCP SDK              | mcpServer        |
| Auto-registration      | Register with Antigravity config   | apiService       |
| IPC bridge             | Communicate Main ↔ Renderer        | Electron app     |
| Source tracking        | Route answers to correct handler   | Question store   |
