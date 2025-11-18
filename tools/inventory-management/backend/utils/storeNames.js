/**
 * Shopify Store Display Name Utility
 * 
 * Maps store IDs (store1, store2, store3) to user-friendly display names
 * Reads from environment variables: SHOPIFY_STORE1_NAME, SHOPIFY_STORE2_NAME, SHOPIFY_STORE3_NAME
 */

/**
 * Get display name for a Shopify store
 * @param {string} storeId - Store identifier (store1, store2, store3, or numeric 1, 2, 3)
 * @returns {string} - Display name (e.g., "Medansh", "MeddeyGo", "Meddey") or fallback
 */
function getStoreDisplayName(storeId) {
  if (!storeId) {
    return 'Unknown Store';
  }

  // Normalize storeId (handle both "store1" and "1" formats)
  const normalized = String(storeId).toLowerCase().replace('store', '');
  const storeNumber = parseInt(normalized, 10);

  if (isNaN(storeNumber) || storeNumber < 1 || storeNumber > 3) {
    return `Store ${storeId}`;
  }

  // Read from environment variables
  const envKey = `SHOPIFY_STORE${storeNumber}_NAME`;
  const displayName = process.env[envKey];

  if (displayName) {
    return displayName;
  }

  // Fallback to default names if env not set
  const defaultNames = {
    1: 'Medansh',
    2: 'MeddeyGo',
    3: 'Meddey',
  };

  return defaultNames[storeNumber] || `Store ${storeNumber}`;
}

/**
 * Get all store display names as a mapping object
 * @returns {object} - Object with store1, store2, store3 as keys and display names as values
 */
function getAllStoreDisplayNames() {
  return {
    store1: getStoreDisplayName('store1'),
    store2: getStoreDisplayName('store2'),
    store3: getStoreDisplayName('store3'),
  };
}

/**
 * Get store display name by numeric index
 * @param {number} storeNumber - Store number (1, 2, or 3)
 * @returns {string} - Display name
 */
function getStoreDisplayNameByNumber(storeNumber) {
  return getStoreDisplayName(`store${storeNumber}`);
}

module.exports = {
  getStoreDisplayName,
  getAllStoreDisplayNames,
  getStoreDisplayNameByNumber,
};

