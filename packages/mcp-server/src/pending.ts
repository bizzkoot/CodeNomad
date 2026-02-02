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
    // NEW FIELDS
    renderTimeout: NodeJS.Timeout | null;  // Timer for UI render confirmation
    renderConfirmed: boolean;               // Whether UI confirmed display
    maxRetries: number;                     // Max retry attempts allowed
    retryCount: number;                     // Current retry attempt number
}

export interface PendingRequestResult {
    answered: boolean;
    cancelled: boolean;
    timedOut: boolean;
    // NEW FIELDS
    shouldRetry: boolean;
    retryReason: string | null;
    renderConfirmed: boolean;
    answers: QuestionAnswer[];
}

/**
 * Manages pending question requests with Promise-based resolution
 */
export class PendingRequestManager {
    private pending = new Map<string, PendingRequest>();

    /**
     * Add a pending request
     */
    add(request: PendingRequest): void {
        this.pending.set(request.id, request);
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
        if (request.renderTimeout) {
            clearTimeout(request.renderTimeout);
        }

        // Resolve promise
        request.resolve({
            answered: true,
            cancelled: false,
            timedOut: false,
            shouldRetry: false,
            retryReason: null,
            renderConfirmed: request.renderConfirmed,
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
        if (request.renderTimeout) {
            clearTimeout(request.renderTimeout);
        }

        const isCancelled = error.message === 'cancelled';
        const isTimedOut = error.message === 'Question timeout';
        const isRenderTimeout = error.message === 'Render timeout';
        
        // Determine if we should retry
        const shouldRetry = isRenderTimeout && request.retryCount < request.maxRetries;
        const retryReason = shouldRetry 
            ? `UI failed to render question (attempt ${request.retryCount + 1}/${request.maxRetries})`
            : isRenderTimeout 
                ? `Max retries (${request.maxRetries}) exceeded`
                : null;

        // Reject promise
        request.resolve({
            answered: false,
            cancelled: isCancelled,
            timedOut: isTimedOut,
            shouldRetry,
            retryReason,
            renderConfirmed: request.renderConfirmed,
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

    /**
     * Mark request as having confirmed render
     */
    confirmRender(id: string): boolean {
        const request = this.pending.get(id);
        if (!request) {
            return false;
        }
        
        // Clear render timeout
        if (request.renderTimeout) {
            clearTimeout(request.renderTimeout);
            request.renderTimeout = null;
        }
        
        request.renderConfirmed = true;
        return true;
    }

    /**
     * Check if request can be retried
     */
    canRetry(id: string): boolean {
        const request = this.pending.get(id);
        if (!request) {
            return false;
        }
        return request.retryCount < request.maxRetries;
    }

    /**
     * Increment retry count for a request
     */
    incrementRetry(id: string): boolean {
        const request = this.pending.get(id);
        if (!request) {
            return false;
        }
        request.retryCount += 1;
        return true;
    }
}
