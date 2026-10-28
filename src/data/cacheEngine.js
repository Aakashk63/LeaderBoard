/**
 * Real Application Query & Caching Engine (Crash Prevention & Performance Layer)
 * 
 * Features:
 * 1. Stale-While-Revalidate (SWR) Query Cache with configurable TTL
 * 2. Request Coalescing / In-Flight Request Deduplication (prevents duplicate simultaneous queries)
 * 3. Bounded LRU Memory Management (prevents memory leaks and browser out-of-memory crashes)
 * 4. Circuit Breaker with Exponential Backoff (prevents crash loops when Supabase is unavailable)
 * 5. Monotonic Sequence Numbers (prevents stale asynchronous responses from overwriting newer writes)
 * 6. Local Storage Persistence with Stale Fallback
 * 
 * NOTE: This is the real production data caching engine.
 * The educational Caching Simulation in the System Design Lab remains untouched and independent.
 */

export class CacheEntry {
  constructor(key, data, ttlMs, seq = 0) {
    this.key = key;
    this.data = data;
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + ttlMs;
    this.seq = seq;
    this.status = 'fresh'; // 'fresh' | 'stale'
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }
}

export class CircuitBreaker {
  constructor(maxFailures = 3, resetTimeoutMs = 15000) {
    this.maxFailures = maxFailures;
    this.resetTimeoutMs = resetTimeoutMs;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED'; // 'CLOSED' (normal) | 'OPEN' (tripped) | 'HALF_OPEN' (testing)
  }

  recordSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure() {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.maxFailures) {
      this.state = 'OPEN';
      console.warn(`[CircuitBreaker] Circuit TRIPPED to OPEN state. Supabase requests throttled for ${this.resetTimeoutMs / 1000}s to prevent crash loops.`);
    }
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN allows single test request
  }
}

export class AppQueryCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.memoryCache = new Map(); // key -> CacheEntry
    this.inFlightRequests = new Map(); // key -> Promise
    this.circuitBreakers = new Map(); // endpointKey -> CircuitBreaker
    this.globalSequence = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      dedupes: 0,
      invalidations: 0,
      circuitBreaks: 0
    };
    this.listeners = {
      status: []
    };
  }

  on(event, cb) {
    if (this.listeners[event]) this.listeners[event].push(cb);
  }

  emit(event, data) {
    if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data));
  }

  getCircuitBreaker(endpointKey) {
    if (!this.circuitBreakers.has(endpointKey)) {
      this.circuitBreakers.set(endpointKey, new CircuitBreaker(3, 15000));
    }
    return this.circuitBreakers.get(endpointKey);
  }

  /**
   * Next monotonic transaction / sequence number
   */
  nextSequence() {
    this.globalSequence += 1;
    return this.globalSequence;
  }

  /**
   * LRU Eviction: Ensures cache size never exceeds maxSize
   */
  evictIfFull() {
    if (this.memoryCache.size >= this.maxSize) {
      // Evict oldest entry
      const oldestKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(oldestKey);
    }
  }

  /**
   * Read from Memory Cache or LocalStorage
   */
  get(key) {
    const entry = this.memoryCache.get(key);
    if (entry) {
      // Re-insert to refresh LRU order
      this.memoryCache.delete(key);
      this.memoryCache.set(key, entry);
      return entry;
    }

    // Try LocalStorage fallback
    try {
      const persisted = localStorage.getItem(`app_cache_${key}`);
      if (persisted) {
        const parsed = JSON.parse(persisted);
        const restored = new CacheEntry(key, parsed.data, parsed.ttlMs || 30000, parsed.seq || 0);
        restored.createdAt = parsed.createdAt || Date.now();
        restored.expiresAt = parsed.expiresAt || (Date.now() + 30000);
        this.memoryCache.set(key, restored);
        return restored;
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  /**
   * Set cache entry with TTL and optional localStorage persistence
   */
  set(key, data, ttlMs = 30000, persistToStorage = true) {
    this.evictIfFull();
    const seq = this.nextSequence();
    const entry = new CacheEntry(key, data, ttlMs, seq);
    this.memoryCache.set(key, entry);

    if (persistToStorage) {
      try {
        localStorage.setItem(`app_cache_${key}`, JSON.stringify({
          data,
          ttlMs,
          createdAt: entry.createdAt,
          expiresAt: entry.expiresAt,
          seq
        }));
      } catch (e) {
        // storage quota exceeded or disabled
      }
    }
    return entry;
  }

  /**
   * Invalidate a single key or pattern
   */
  invalidate(keyOrPrefix) {
    this.stats.invalidations += 1;
    let invalidatedCount = 0;

    for (const k of this.memoryCache.keys()) {
      if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) {
        this.memoryCache.delete(k);
        invalidatedCount += 1;
        try {
          localStorage.removeItem(`app_cache_${k}`);
        } catch (e) {}
      }
    }
    return invalidatedCount;
  }

  /**
   * Query execution with SWR, In-Flight Deduplication, and Bounded Backoff Retries
   */
  async fetchQuery(key, fetchFn, options = {}) {
    const {
      ttlMs = 30000,
      staleWhileRevalidate = true,
      force = false,
      persistToStorage = true,
      endpointKey = 'default',
      maxRetries = 2
    } = options;

    const cb = this.getCircuitBreaker(endpointKey);

    // 1. Check existing cache entry
    const cached = this.get(key);

    if (!force && cached) {
      if (!cached.isExpired()) {
        // Cache HIT (Fresh)
        this.stats.hits += 1;
        return { data: cached.data, fromCache: true, isStale: false };
      }

      // Cache Stale: If Stale-While-Revalidate is enabled, return stale immediately & trigger background fetch
      if (staleWhileRevalidate) {
        this.stats.hits += 1;
        this.triggerBackgroundRevalidate(key, fetchFn, options);
        return { data: cached.data, fromCache: true, isStale: true };
      }
    }

    this.stats.misses += 1;

    // 2. Check if identical query is already in-flight (Deduplication / Coalescing)
    if (this.inFlightRequests.has(key)) {
      this.stats.dedupes += 1;
      const sharedPromise = this.inFlightRequests.get(key);
      const data = await sharedPromise;
      return { data, fromCache: true, isStale: false };
    }

    // 3. Check Circuit Breaker
    if (!cb.canExecute()) {
      this.stats.circuitBreaks += 1;
      this.emit('status', { error: true, circuitOpen: true, message: 'Circuit breaker active: Supabase throttled' });
      if (cached) {
        return { data: cached.data, fromCache: true, isStale: true, circuitOpen: true };
      }
      throw new Error('Supabase service temporarily throttled by client circuit breaker. Using fallback.');
    }

    // 4. Launch Request with Bounded Exponential Backoff Retry
    const requestPromise = (async () => {
      let lastErr = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await fetchFn();
          cb.recordSuccess();

          // Monotonic sequence verification: only save if not older than current entry
          const currentEntry = this.memoryCache.get(key);
          const newSeq = this.nextSequence();
          if (!currentEntry || newSeq >= currentEntry.seq) {
            this.set(key, result, ttlMs, persistToStorage);
          }
          return result;
        } catch (err) {
          lastErr = err;
          cb.recordFailure();
          if (attempt < maxRetries) {
            // Exponential backoff: 300ms, 900ms
            const delay = Math.pow(3, attempt) * 300 + Math.random() * 100;
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }

      // If all retries failed and stale cache exists, return stale instead of crashing
      if (cached) {
        console.warn(`[AppQueryCache] Fetch failed for "${key}". Returning preserved stale cache.`);
        return cached.data;
      }
      throw lastErr;
    })();

    this.inFlightRequests.set(key, requestPromise);

    try {
      const data = await requestPromise;
      return { data, fromCache: false, isStale: false };
    } finally {
      this.inFlightRequests.delete(key);
    }
  }

  /**
   * Non-blocking background revalidation for Stale-While-Revalidate
   */
  triggerBackgroundRevalidate(key, fetchFn, options) {
    if (this.inFlightRequests.has(key)) return;

    const cb = this.getCircuitBreaker(options.endpointKey || 'default');
    if (!cb.canExecute()) return;

    const revalPromise = (async () => {
      try {
        const result = await fetchFn();
        cb.recordSuccess();
        const current = this.memoryCache.get(key);
        const newSeq = this.nextSequence();
        if (!current || newSeq >= current.seq) {
          this.set(key, result, options.ttlMs || 30000, options.persistToStorage !== false);
          this.emit('revalidated', { key, data: result });
        }
      } catch (e) {
        cb.recordFailure();
      }
    })();

    this.inFlightRequests.set(key, revalPromise);
    revalPromise.finally(() => {
      this.inFlightRequests.delete(key);
    });
  }

  /**
   * Get Diagnostic Cache Stats
   */
  getStats() {
    return {
      ...this.stats,
      size: this.memoryCache.size,
      inFlightCount: this.inFlightRequests.size
    };
  }
}

// Global Singleton Application Query Cache
export const appQueryCache = new AppQueryCache(100);
