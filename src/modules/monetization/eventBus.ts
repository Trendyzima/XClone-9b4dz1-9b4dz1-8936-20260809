/**
 * Event Bus for monetization system
 * Used to trigger wallet + feature updates across system
 */

export type EventType =
  | "wallet.updated"
  | "feature.used"
  | "payment.success"
  | "payment.failed"
  | "subscription.updated";

export interface Event {
  type: EventType;
  payload: any;
  timestamp: number;
}

export class EventBus {
  private listeners: { [key: string]: Function[] } = {};

  emit(type: EventType, payload: any) {
    const event: Event = {
      type,
      payload,
      timestamp: Date.now(),
    };

    (this.listeners[type] || []).forEach(fn => fn(event));
  }

  on(type: EventType, fn: Function) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }
}
