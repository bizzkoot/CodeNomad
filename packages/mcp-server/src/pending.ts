// TypeScript workaround - define types inline to avoid import issues

export interface QuestionAnswer {
    questionId: string;
    values: string[];
    customText?: string;
}

/**
 * Pending request waiting for user response
 */
export interface PendingRequest {
    id: string;
    questions: any[];
    resolve: (result: PendingRequestResult) => void;
    reject: (error: Error) => void;
    createdAt: number;
    timeout: NodeJS.Timeout | null;
}

export interface PendingRequestResult {
    answered: boolean;
    cancelled: boolean;
    timedOut: boolean;
    answers: QuestionAnswer[];
}

/**
 * Manages pending question requests with Promise-based resolution
 */
export class PendingRequestManager {
    private pending = new Map<string, PendingRequest>();
    private readonly DEFAULT_TIMEOUT = 300000; // 5 minutes

    /**
     * Add a pending request
     */
    add(request: PendingRequest): void {
        this.pending.set(request.id, request);

        // Set timeout if not explicitly provided
        if (!request.timeout) {
            request.timeout = setTimeout(() => {
                this.reject(request.id, new Error('Question timeout'));
            }, this.DEFAULT_TIMEOUT);
        }
    }

    /**
     * Resolve a request with user answers
     */
    resolve(id: string, answers: QuestionAnswer[]): boolean {
        const request = this.pending.get(id);
        if (!request) {
            return false;
        }

        // Clear timeout if set
        if (request.timeout) {
            clearTimeout(request.timeout);
        }

        // Resolve promise
        request.resolve({
            answered: true,
            cancelled: false,
            timedOut: false,
            answers
        });

        // Remove from pending map
        this.pending.delete(id);
        return true;
    }

    /**
     * Reject a request with error
     */
    reject(id: string, error: Error): boolean {
        const request = this.pending.get(id);
        if (!request) {
            return false;
        }

        // Clear timeout if set
        if (request.timeout) {
            clearTimeout(request.timeout);
        }

        // Reject promise
        request.resolve({
            answered: false,
            cancelled: error.message === 'cancelled',
            timedOut: error.message === 'Question timeout',
            answers: []
        });

        // Remove from pending map
        this.pending.delete(id);
        return true;
    }

    /**
     * Get a pending request by ID
     */
    get(id: string): PendingRequest | undefined {
        return this.pending.get(id);
    }

    /**
     * Get all pending requests
     */
    getAll(): PendingRequest[] {
        return Array.from(this.pending.values());
    }

    /**
     * Cleanup old requests (older than specified age in ms)
     */
    cleanup(maxAgeMs: number): void {
        const now = Date.now();
        for (const [id, request] of Array.from(this.pending.entries())) {
            if (now - request.createdAt > maxAgeMs) {
                this.reject(id, new Error('Request expired'));
            }
        }
    }

    /**
     * Get pending request count
     */
    count(): number {
        return this.pending.size;
    }
}
