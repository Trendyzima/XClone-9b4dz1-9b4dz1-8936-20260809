// Production-grade realtime monetization event system
// Enables wallet updates, feature usage tracking, and live UI sync

export type EventType =
  | "wallet.updated"
  | "wallet.debited"
  | "wallet.credited"
  | "payment.success"
  | "payment.failed"
  | "feature.used";

export type EventPayload = {
  userId: string;
  data: any;
  timestamp: number;
};

class RealtimeEventBus {
  private listeners: Map<EventType, Function[]> = new Map();

  on(event: EventType, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  emit(event: EventType, payload: EventPayload) {
    const handlers = this.listeners.get(event) || [];

    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error("Event handler error:", err);
      }
    }
  }

  off(event: EventType, callback: Function) {
    const handlers = this.listeners.get(event) || [];
    this.listeners.set(
      event,
      handlers.filter((h) => h !== callback)
    );
  }
}

export const realtime = new RealtimeEventBus();