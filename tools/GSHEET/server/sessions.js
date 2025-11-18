const { v4: uuidv4 } = require('uuid');

class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 1000 * 60 * 30);
  }

  create(initial = {}) {
    const id = uuidv4();
    this.sessions.set(id, { id, createdAt: Date.now(), ...initial });
    return this.sessions.get(id);
  }

  get(id) {
    return this.sessions.get(id) || null;
  }

  update(id, payload) {
    if (!this.sessions.has(id)) return null;
    const existing = this.sessions.get(id);
    const next = { ...existing, ...payload, updatedAt: Date.now() };
    this.sessions.set(id, next);
    return next;
  }

  cleanup() {
    const cutoff = Date.now() - 1000 * 60 * 60; // 1 hour
    for (const [id, session] of this.sessions.entries()) {
      if ((session.updatedAt || session.createdAt) < cutoff) {
        this.sessions.delete(id);
      }
    }
  }
}

module.exports = new SessionStore();
