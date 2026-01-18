import { createServer as createHttpServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'http';
import * as crypto from 'crypto';
import type { CnAskUserInput, CnAskUserOutput } from './tools/schemas.js';
import { askUser, type QuestionBridge } from './tools/askUser.js';
import { PendingRequestManager } from './pending.js';

export interface ServerConfig {
    port?: number;
    host?: string;
}

export class CodeNomadMcpServer {
    private httpServer: HttpServer | null = null;
    private port: number | undefined;
    private authToken: string | undefined = undefined;
    private pendingManager: PendingRequestManager;
    private bridge: QuestionBridge;

    constructor(config: ServerConfig = {}) {
        this.pendingManager = new PendingRequestManager();
        this.bridge = {
            sendQuestion: (requestId, questions, title) => {
                console.log(`[MCP] Sending question to UI: ${requestId}`);
                // TODO: Will be connected to Electron IPC bridge
            },
            onAnswer: (callback) => {
                console.log('[MCP] Answer handler registered');
                // TODO: Will be connected to Electron IPC bridge
            },
            onCancel: (callback) => {
                console.log('[MCP] Cancel handler registered');
                // TODO: Will be connected to Electron IPC bridge
            }
        };
    }

    /**
     * Start the MCP server
     */
    async start(): Promise<void> {
        console.log('[MCP] Starting CodeNomad MCP Server (Raw JSON-RPC mode)...');

        // Find available port
        this.port = await this.findAvailablePort();
        console.log(`[MCP] Using port: ${this.port}`);

        // Generate auth token
        this.authToken = crypto.randomBytes(32).toString('hex');
        console.log(`[MCP] Generated auth token: ${this.authToken.substring(0, 8)}...`);

        // Create HTTP server
        this.httpServer = createHttpServer(async (req, res) => {
            await this.handleHttpRequest(req, res);
        });

        // Start listening
        await new Promise<void>((resolve) => {
            this.httpServer!.listen(this.port!, '127.0.0.1', () => {
                console.log(`[MCP] HTTP server listening on http://127.0.0.1:${this.port}`);
                resolve();
            });
        });
    }

    /**
     * Stop the MCP server
     */
    async stop(): Promise<void> {
        console.log('[MCP] Stopping CodeNomad MCP Server...');

        // Cleanup pending requests
        for (const req of this.pendingManager.getAll()) {
            this.pendingManager.reject(req.id, new Error('Server shutting down'));
        }

        // Close HTTP server
        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
        }

        console.log('[MCP] Server stopped');
    }

    /**
     * Get server port
     */
    getPort(): number | undefined {
        return this.port;
    }

    /**
     * Get auth token
     */
    getAuthToken(): string | undefined {
        return this.authToken;
    }

    /**
     * Check if server is running
     */
    isRunning(): boolean {
        return this.httpServer !== null;
    }

    /**
     * Connect an external IPC bridge to handle questions
     * This allows the main process to provide IPC communication
     */
    connectBridge(bridge: QuestionBridge): void {
        console.log('[MCP] Connecting external IPC bridge');
        this.bridge = bridge;
    }

    /**
     * Get the pending request manager for external use
     */
    getPendingManager(): PendingRequestManager {
        return this.pendingManager;
    }

    /**
     * Get tool schema for ask_user
     */
    private getAskUserToolSchema() {
        return {
            name: "ask_user",
            description: "Ask the user questions through CodeNomad's interface. Use this tool when you need user input, clarification, or confirmation before proceeding. The tool blocks until the user responds.",
            inputSchema: {
                type: "object",
                properties: {
                    questions: {
                        type: "array",
                        description: "Array of questions to ask user",
                        items: {
                            type: "object",
                            properties: {
                                question: { type: "string" },
                                type: { type: "string", enum: ["text", "select", "multi-select", "confirm"] },
                                options: { type: "array", items: { type: "string" } },
                                required: { type: "boolean" },
                                placeholder: { type: "string" }
                            },
                            required: ["question"]
                        },
                        minItems: 1,
                        maxItems: 10
                    },
                    title: {
                        type: "string",
                        description: "Optional title for question dialog",
                        maxLength: 100
                    },
                    timeout: {
                        type: "number",
                        description: "Timeout in milliseconds (default: 300000 = 5 minutes)",
                        minimum: 10000,
                        maximum: 1800000
                    }
                },
                required: ["questions"]
            }
        };
    }

    /**
     * Handle HTTP requests with raw JSON-RPC
     */
    private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = req.url || '/';
        const method = req.method || 'GET';

        console.log(`[MCP] Request: ${method} ${url}`);
        console.log(`[MCP] Headers:`, {
            'content-type': req.headers['content-type'],
            'content-length': req.headers['content-length'],
            'transfer-encoding': req.headers['transfer-encoding']
        });

        // Health check endpoint
        if (url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'running',
                port: this.port,
                pendingRequests: this.pendingManager.count()
            }));
            return;
        }

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
                'Access-Control-Max-Age': '86400'
            });
            res.end();
            return;
        }

        // Add CORS headers to all responses
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

        // Handle POST requests for JSON-RPC
        if (method === 'POST') {
            try {
                const body = await this.readJsonBody(req);
                console.log(`[MCP] Parsed body:`, body ? JSON.stringify(body).substring(0, 200) : 'null');

                // Handle JSON-RPC requests
                if (body && typeof body === 'object') {
                    const jsonrpc = await this.handleJsonRpc(body);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(jsonrpc));
                    return;
                } else {
                    console.log(`[MCP] Body is not an object:`, typeof body);
                }
            } catch (error) {
                console.error(`[MCP] Error handling request:`, error);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        jsonrpc: '2.0',
                        id: null,
                        error: {
                            code: -32603,
                            message: 'Internal error',
                            data: error instanceof Error ? error.message : String(error)
                        }
                    }));
                }
                return;
            }
        }

        // 404 for other requests
        if (!res.headersSent) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    }

    /**
     * Read JSON body from request
     */
    private async readJsonBody(req: IncomingMessage): Promise<any> {
        return new Promise((resolve, reject) => {
            let data = '';
            let dataReceived = false;

            const timeout = setTimeout(() => {
                console.error(`[MCP] readJsonBody timeout: received=${dataReceived}, data length=${data.length}`);
                reject(new Error('Request body read timeout'));
            }, 5000);

            req.on('data', chunk => {
                dataReceived = true;
                data += chunk;
            });

            req.on('end', () => {
                clearTimeout(timeout);
                console.log(`[MCP] Request body read complete: ${data.length} bytes`);
                try {
                    const parsed = data ? JSON.parse(data) : null;
                    console.log(`[MCP] JSON parsed successfully:`, parsed ? 'object present' : 'null');
                    resolve(parsed);
                } catch (error) {
                    console.error(`[MCP] JSON parse error:`, error);
                    reject(error);
                }
            });

            req.on('error', error => {
                clearTimeout(timeout);
                console.error(`[MCP] Request stream error:`, error);
                reject(error);
            });
        });
    }

    /**
     * Handle JSON-RPC requests
     */
    private async handleJsonRpc(request: any): Promise<any> {
        const { jsonrpc, id, method, params } = request;

        // Validate JSON-RPC 2.0 basic structure
        if (jsonrpc !== '2.0') {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32600,
                    message: 'Invalid Request'
                }
            };
        }

        try {
            switch (method) {
                case 'tools/list':
                    return this.handleToolsList(id);

                case 'tools/call':
                    return this.handleToolsCall(id, params);

                case 'initialize':
                    return this.handleInitialize(id);

                default:
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -32601,
                            message: 'Method not found',
                            data: method
                        }
                    };
            }
        } catch (error) {
            console.error(`[MCP] Error handling ${method}:`, error);
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: 'Internal error',
                    data: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }

    /**
     * Handle initialize method
     */
    private handleInitialize(id: string | number | undefined): any {
        console.log('[MCP] Handling initialize');
        return {
            jsonrpc: '2.0',
            id,
            result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {}
                },
                serverInfo: {
                    name: 'CodeNomad Ask User',
                    version: '1.0.0'
                }
            }
        };
    }

    /**
     * Handle tools/list method
     */
    private handleToolsList(id: string | number | undefined): any {
        console.log('[MCP] Handling tools/list');
        return {
            jsonrpc: '2.0',
            id,
            result: {
                tools: [this.getAskUserToolSchema()]
            }
        };
    }

    /**
     * Handle tools/call method
     */
    private async handleToolsCall(id: string | number | undefined, params: any): Promise<any> {
        const { name, arguments: args } = params;

        console.log(`[MCP] Handling tools/call: ${name}`);

        if (name !== 'ask_user') {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32602,
                    message: 'Invalid params',
                    data: `Unknown tool: ${name}`
                }
            };
        }

        try {
            console.log(`[MCP] Tool invoked: ask_user`, JSON.stringify(args, null, 2));

            // Validate input manually
            const input = args as CnAskUserInput;

            const result = await askUser(input, this.bridge, this.pendingManager);

            return {
                jsonrpc: '2.0',
                id,
                result: {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(result)
                    }]
                }
            };
        } catch (error) {
            console.error(`[MCP] Tool error:`, error);
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            answered: false,
                            cancelled: false,
                            timedOut: false,
                            answers: [],
                            error: error instanceof Error ? error.message : String(error)
                        })
                    }],
                    isError: true
                }
            };
        }
    }

    /**
     * Find an available port
     */
    private async findAvailablePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = createHttpServer();
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
