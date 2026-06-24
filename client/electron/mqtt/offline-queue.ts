// --- Types ---

export interface QueuedMessage {
  timestamp: number;
  topic: string;
  payload: string;
}

// --- Constants ---

const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

// --- OfflineQueue ---

/**
 * In-memory buffer for MQTT messages published while the transport is
 * disconnected. Messages older than 48h are pruned on every mutation.
 */
export class OfflineQueue {
  private messages: QueuedMessage[] = [];

  enqueue(topic: string, payload: string): void {
    this.messages.push({ timestamp: Date.now(), topic, payload });
    this.prune();
  }

  /** Remove and return all non-expired messages, leaving the queue empty. */
  drain(): QueuedMessage[] {
    this.prune();
    const drained = this.messages;
    this.messages = [];
    return drained;
  }

  get length(): number {
    return this.messages.length;
  }

  private prune(): void {
    const cutoff = Date.now() - MAX_AGE_MS;
    this.messages = this.messages.filter((msg) => msg.timestamp > cutoff);
  }
}
