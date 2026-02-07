import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface McpServerConfig {
    command: string;
    args: string[];
}

export interface McpInstanceConfigFile {
    instanceId: string;
    pid: number;
    port: number;
    /**
     * Deprecated: Token is intentionally not persisted to disk.
     * This remains optional to tolerate older config files.
     */
    token?: string;
    /**
     * Deprecated: Server path is intentionally not persisted to disk.
     * This remains optional to tolerate older config files.
     */
    serverPath?: string;
    startedAt: string;
}

export interface McpRegistrationConfig {
    instanceId: string;
    port: number;
    token: string;
    serverPath?: string;
}

const CODENOMAD_HOME_DIRNAME = '.codenomad';
const CODENOMAD_INSTANCES_DIRNAME = 'instances';

function getCodeNomadBaseDir(): string {
    return path.join(os.homedir(), CODENOMAD_HOME_DIRNAME);
}

function getInstancesDir(): string {
    return path.join(getCodeNomadBaseDir(), CODENOMAD_INSTANCES_DIRNAME);
}

function getLegacyAntigravityConfigPath(): string {
    return path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');
}

function safeUnlink(filePath: string): void {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch {
        // ignore
    }
}

function safeRmDir(dirPath: string): void {
    try {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    } catch {
        // ignore
    }
}

function isPidAlive(pid: number | undefined): boolean {
    if (!pid || !Number.isFinite(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM means it exists but we can't signal it.
        if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'EPERM') {
            return true;
        }
        return false;
    }
}

function probeHealth(port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        if (!Number.isFinite(port) || port <= 0) {
            resolve(false);
            return;
        }

        const req = http.get(
            {
                hostname: '127.0.0.1',
                port,
                path: '/health',
                timeout: timeoutMs,
            },
            (res) => {
                res.resume();
                resolve(res.statusCode === 200);
            },
        );

        req.on('timeout', () => {
            req.destroy(new Error('timeout'));
            resolve(false);
        });

        req.on('error', () => resolve(false));
    });
}

/**
 * Get MCP config file path
 */
export function getMcpConfigPath(): string {
    return path.join(getCodeNomadBaseDir(), 'mcp_config.json');
}

export function getMcpInstanceConfigPath(instanceId: string): string {
    return path.join(getInstancesDir(), instanceId, 'config.json');
}

/**
 * Read existing MCP config
 */
export function readMcpConfig(): { mcpServers: Record<string, McpServerConfig> } {
    const configPath = getMcpConfigPath();

    if (!fs.existsSync(configPath)) {
        return { mcpServers: {} };
    }

    try {
        const content = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.warn('[MCP Config] Failed to read existing config:', error);
        return { mcpServers: {} };
    }
}

/**
 * Best-effort cleanup for legacy Antigravity registration.
 * This intentionally does not create the legacy file; it only removes the `ask-user` entry if present.
 */
export function cleanupLegacyAntigravityRegistration(): void {
    const legacyPath = getLegacyAntigravityConfigPath();
    if (!fs.existsSync(legacyPath)) return;

    try {
        const content = fs.readFileSync(legacyPath, 'utf8');
        const parsed = JSON.parse(content) as any;
        const mcpServers = parsed?.mcpServers;
        if (!mcpServers || typeof mcpServers !== 'object' || !mcpServers['ask-user']) {
            return;
        }

        delete mcpServers['ask-user'];
        const updated = { ...parsed, mcpServers };

        const tempPath = `${legacyPath}.tmp.${process.pid}.${randomBytes(8).toString('hex')}`;
        fs.writeFileSync(tempPath, JSON.stringify(updated, null, 2) + '\n');
        fs.renameSync(tempPath, legacyPath);
        safeUnlink(tempPath);

        console.log('[MCP Config] Removed legacy Antigravity ask-user registration');
    } catch (error) {
        console.warn('[MCP Config] Failed to clean up legacy Antigravity registration:', error);
    }
}

export function readMcpInstanceConfig(instanceId: string): McpInstanceConfigFile | null {
    const configPath = getMcpInstanceConfigPath(instanceId);

    if (!fs.existsSync(configPath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(content) as McpInstanceConfigFile;
    } catch (error) {
        console.warn('[MCP Config] Failed to read instance config:', error);
        return null;
    }
}

/**
 * Write MCP config with CodeNomad entry
 * 
 * @param port - MCP server port
 * @param token - MCP server auth token  
 * @param serverPath - Absolute path to the MCP server entry point (server.js)
 */
export function writeMcpConfig(config: McpRegistrationConfig): void;
/**
 * @deprecated Prefer passing an object with a stable instanceId.
 */
export function writeMcpConfig(port: number, token: string, serverPath?: string): void;
export function writeMcpConfig(
    configOrPort: McpRegistrationConfig | number,
    legacyToken?: string,
    legacyServerPath?: string,
): void {
    try {
        const config: McpRegistrationConfig =
            typeof configOrPort === 'number'
                ? {
                    instanceId: `pid-${process.pid}`,
                    port: configOrPort,
                    token: legacyToken ?? '',
                    serverPath: legacyServerPath,
                }
                : configOrPort;

        if (!config.instanceId || config.instanceId.trim().length === 0) {
            throw new Error('instanceId is required');
        }

        if (!config.port || !Number.isFinite(config.port)) {
            throw new Error('port is required');
        }

        if (!config.token || config.token.trim().length === 0) {
            throw new Error('token is required');
        }

        const instanceConfig: McpInstanceConfigFile = {
            instanceId: config.instanceId,
            pid: process.pid,
            port: config.port,
            startedAt: new Date().toISOString(),
        };

        const configPath = getMcpInstanceConfigPath(config.instanceId);
        const configDir = path.dirname(configPath);
        fs.mkdirSync(configDir, { recursive: true });

        const tempPath = `${configPath}.tmp.${process.pid}.${randomBytes(8).toString('hex')}`;
        const payload = JSON.stringify(instanceConfig, null, 2) + '\n';
        fs.writeFileSync(tempPath, payload, { mode: 0o600 });
        fs.renameSync(tempPath, configPath);
        safeUnlink(tempPath);

        console.log(`[MCP Config] Registered CodeNomad instance ${config.instanceId} on port ${config.port}`);
    } catch (error) {
        console.error('[MCP Config] Failed to write instance config:', error);
    }
}

/**
 * Remove CodeNomad entry from MCP config
 */
export function unregisterFromMcpConfig(instanceId?: string): void {
    const resolvedInstanceId = instanceId && instanceId.trim().length > 0 ? instanceId : `pid-${process.pid}`;
    const configPath = getMcpInstanceConfigPath(resolvedInstanceId);
    const instanceDir = path.dirname(configPath);

    try {
        if (!fs.existsSync(configPath) && !fs.existsSync(instanceDir)) {
            console.log('[MCP Config] No instance config found, nothing to unregister');
            return;
        }

        safeUnlink(configPath);
        safeRmDir(instanceDir);
        console.log(`[MCP Config] Unregistered CodeNomad instance ${resolvedInstanceId}`);
    } catch (error) {
        console.error('[MCP Config] Failed to unregister instance config:', error);
    }
}

export async function cleanupStaleInstances(options?: { healthTimeoutMs?: number }): Promise<void> {
    const instancesDir = getInstancesDir();
    const timeoutMs = options?.healthTimeoutMs ?? 800;

    try {
        if (!fs.existsSync(instancesDir)) return;
        const instanceIds = fs.readdirSync(instancesDir);

        for (const instanceId of instanceIds) {
            const instanceDir = path.join(instancesDir, instanceId);
            const configPath = path.join(instanceDir, 'config.json');

            try {
                if (!fs.existsSync(configPath)) {
                    safeRmDir(instanceDir);
                    continue;
                }

                const content = fs.readFileSync(configPath, 'utf8');
                const parsed = JSON.parse(content) as Partial<McpInstanceConfigFile>;

                const pid = typeof parsed.pid === 'number' ? parsed.pid : undefined;
                const port = typeof parsed.port === 'number' ? parsed.port : undefined;

                if (isPidAlive(pid)) {
                    continue;
                }

                const healthy = port ? await probeHealth(port, timeoutMs) : false;
                if (healthy) {
                    // Something is listening, but the stored PID is gone.
                    // Keep the file to avoid accidental cleanup during PID reuse / permission edge-cases.
                    continue;
                }

                safeRmDir(instanceDir);
                console.log(`[MCP Config] Cleaned up stale instance ${instanceId}`);
            } catch {
                // Invalid config or unreadable dir: remove.
                safeRmDir(instanceDir);
            }
        }
    } catch (error) {
        console.warn('[MCP Config] Failed during stale instance cleanup:', error);
    }
}
