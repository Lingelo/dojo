#!/usr/bin/env node

/**
 * Circuit Breaker — Reusable utility module
 * Simplified Netflix Hystrix pattern for a CLI context.
 *
 * Usage:
 *   const { CircuitBreaker } = require('./circuit-breaker');
 *   const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 10000 });
 *   const result = await breaker.exec(asyncFn, fallbackFn);
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 * - CLOSED: normal operation. Failures increment counter. At threshold → OPEN.
 * - OPEN: reject immediately. After cooldown → HALF_OPEN.
 * - HALF_OPEN: allow 1 probe call. Success → CLOSED. Failure → OPEN.
 *
 * Per-session state (resets on process start, no persistence).
 */

const STATES = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker {
  constructor({ threshold = 3, cooldownMs = 10000 } = {}) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.nextAttempt = 0;
  }

  async exec(fn, fallback) {
    if (this.state === STATES.OPEN) {
      if (Date.now() < this.nextAttempt) {
        if (fallback) return fallback(new Error('Circuit breaker is OPEN'));
        throw new Error('Circuit breaker is OPEN — call rejected');
      }
      this.state = STATES.HALF_OPEN;
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      if (fallback) return fallback(err);
      throw err;
    }
  }

  _onSuccess() {
    this.failures = 0;
    this.state = STATES.CLOSED;
  }

  _onFailure() {
    this.failures++;
    if (this.failures >= this.threshold || this.state === STATES.HALF_OPEN) {
      this.state = STATES.OPEN;
      this.nextAttempt = Date.now() + this.cooldownMs;
    }
  }

  getState() {
    return this.state;
  }

  reset() {
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.nextAttempt = 0;
  }
}

module.exports = { CircuitBreaker, STATES };
