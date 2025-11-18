const cacheStore = {};

function setCache(key, value, ttlMs) {
  cacheStore[key] = {
    value,
    expires: Date.now() + (ttlMs || 3600000),
  };
}

function getCache(key) {
  const entry = cacheStore[key];
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    delete cacheStore[key];
    return undefined;
  }
  return entry.value;
}

function deleteCache(key) {
  delete cacheStore[key];
}

function clearCache() {
  Object.keys(cacheStore).forEach(deleteCache);
}

module.exports = { setCache, getCache, deleteCache, clearCache };
