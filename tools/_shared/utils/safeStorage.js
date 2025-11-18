/**
 * Safe localStorage/sessionStorage wrapper with error handling
 * Prevents crashes from invalid JSON or storage quota exceeded
 */

const logger = require('./logger');

class SafeStorage {
  constructor(storage = localStorage) {
    this.storage = storage;
  }

  /**
   * Safely get and parse item from storage
   * @param {string} key - Storage key
   * @param {*} defaultValue - Default value if key doesn't exist or parse fails
   * @returns {*} Parsed value or default
   */
  getItem(key, defaultValue = null) {
    try {
      const item = this.storage.getItem(key);
      
      if (item === null || item === undefined) {
        return defaultValue;
      }

      // Try to parse as JSON
      try {
        return JSON.parse(item);
      } catch {
        // Return as string if not valid JSON
        return item;
      }
    } catch (error) {
      logger.warn('Failed to get item from storage', { key, error: error.message });
      return defaultValue;
    }
  }

  /**
   * Safely set item in storage
   * @param {string} key - Storage key
   * @param {*} value - Value to store (will be JSON stringified)
   * @returns {boolean} Success status
   */
  setItem(key, value) {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      this.storage.setItem(key, stringValue);
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        logger.error('Storage quota exceeded', { key });
        // Try to clear old data
        this.clearOldest();
      } else {
        logger.error('Failed to set item in storage', { key, error: error.message });
      }
      return false;
    }
  }

  /**
   * Safely remove item from storage
   * @param {string} key - Storage key
   * @returns {boolean} Success status
   */
  removeItem(key) {
    try {
      this.storage.removeItem(key);
      return true;
    } catch (error) {
      logger.warn('Failed to remove item from storage', { key, error: error.message });
      return false;
    }
  }

  /**
   * Clear all items from storage
   * @returns {boolean} Success status
   */
  clear() {
    try {
      this.storage.clear();
      return true;
    } catch (error) {
      logger.error('Failed to clear storage', { error: error.message });
      return false;
    }
  }

  /**
   * Get user object with validation
   * @returns {Object|null} User object or null
   */
  getUser() {
    const user = this.getItem('user');
    
    if (!user || typeof user !== 'object') {
      return null;
    }

    // Validate user object structure
    if (!user.token || !user.id) {
      logger.warn('Invalid user object in storage, removing');
      this.removeItem('user');
      return null;
    }

    // Check token expiration if present
    if (user.expiresAt) {
      const expirationDate = new Date(user.expiresAt);
      if (expirationDate < new Date()) {
        logger.info('User token expired, removing');
        this.removeItem('user');
        return null;
      }
    }

    return user;
  }

  /**
   * Set user object
   * @param {Object} user - User object with at least { id, token }
   * @returns {boolean} Success status
   */
  setUser(user) {
    if (!user || !user.token || !user.id) {
      logger.error('Invalid user object provided');
      return false;
    }

    return this.setItem('user', user);
  }

  /**
   * Remove user object
   * @returns {boolean} Success status
   */
  removeUser() {
    return this.removeItem('user');
  }

  /**
   * Get all keys in storage
   * @returns {string[]} Array of keys
   */
  keys() {
    try {
      return Object.keys(this.storage);
    } catch (error) {
      logger.warn('Failed to get storage keys', { error: error.message });
      return [];
    }
  }

  /**
   * Get storage size (approximate)
   * @returns {number} Size in bytes
   */
  getSize() {
    try {
      let size = 0;
      for (let key in this.storage) {
        if (this.storage.hasOwnProperty(key)) {
          size += this.storage[key].length + key.length;
        }
      }
      return size;
    } catch (error) {
      logger.warn('Failed to calculate storage size', { error: error.message });
      return 0;
    }
  }

  /**
   * Clear oldest items when quota exceeded
   * Uses a simple timestamp-based approach
   */
  clearOldest() {
    try {
      const items = [];
      
      for (let key in this.storage) {
        if (this.storage.hasOwnProperty(key)) {
          try {
            const value = JSON.parse(this.storage[key]);
            if (value && value.timestamp) {
              items.push({ key, timestamp: value.timestamp });
            }
          } catch {
            // Skip non-JSON items
          }
        }
      }

      // Sort by timestamp and remove oldest 25%
      items.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = Math.ceil(items.length * 0.25);
      
      for (let i = 0; i < toRemove; i++) {
        this.storage.removeItem(items[i].key);
      }

      logger.info('Cleared oldest storage items', { count: toRemove });
    } catch (error) {
      logger.error('Failed to clear oldest items', { error: error.message });
    }
  }
}

// Create singleton instances
const safeLocalStorage = new SafeStorage(typeof window !== 'undefined' ? window.localStorage : null);
const safeSessionStorage = new SafeStorage(typeof window !== 'undefined' ? window.sessionStorage : null);

module.exports = {
  SafeStorage,
  safeLocalStorage,
  safeSessionStorage
};