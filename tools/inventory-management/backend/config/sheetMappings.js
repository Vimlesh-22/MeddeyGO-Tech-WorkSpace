const DEFAULT_SHEET_TABS = {
  masterNeeds: 'Master Needs',
  packProducts: 'Pack Products',
  comboProducts: 'Combo products'
};

const DEFAULT_SHEET_COLUMNS = {
  masterNeeds: {
    sku: 'SKU',
    quantity: 'Quantity',
    title: 'Title',
    size: 'Size',
    vendorName: 'Vendor Name',
    gst: 'GST %',
    priceBeforeGst: 'Price Before GST',
    totalPrice: 'Total Price'
  },
  packProducts: {
    packSku: 'Pack sku',
    packQuantity: 'Pack Quantity',
    singleSku: 'Correct Puchase SKU'
  },
  comboProducts: {
    newSku: 'New sku',
    singleSku: 'Correct Puchase SKU'
  }
};

module.exports = {
  DEFAULT_SHEET_TABS,
  DEFAULT_SHEET_COLUMNS
};
