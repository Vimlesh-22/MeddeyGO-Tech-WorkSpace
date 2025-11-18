const ExcelJS = require('exceljs');

/**
 * Enhanced Excel Export Service
 * Creates Excel workbooks with pivot tables, charts, and advanced formatting
 */

/**
 * Export inventory data to enhanced Excel format
 * @param {Array} transactions - Transaction data
 * @param {Object} analytics - Analytics data
 * @param {Object} forecasts - Forecasting data
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function exportToExcel(transactions, analytics = null, forecasts = null) {
  const workbook = new ExcelJS.Workbook();
  
  // Create Summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  
  // Add headers
  summarySheet.columns = [
    { header: 'SKU', key: 'sku', width: 20 },
    { header: 'Product Name', key: 'productName', width: 30 },
    { header: 'Total Sales', key: 'totalSales', width: 15 },
    { header: 'Current Stock', key: 'currentStock', width: 15 },
    { header: 'Safety Stock', key: 'safetyStock', width: 15 },
    { header: 'Status', key: 'status', width: 15 }
  ];
  
  // Add conditional formatting
  summarySheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.font = { bold: true };
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      row.font = { ...row.font, color: { argb: 'FFFFFFFF' } };
    }
  });
  
  // Add Analytics sheet if provided
  if (analytics && analytics.topItems) {
    const analyticsSheet = workbook.addWorksheet('Top Items');
    analyticsSheet.columns = [
      { header: 'Rank', key: 'rank', width: 10 },
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Product Name', key: 'productName', width: 30 },
      { header: 'Total Quantity', key: 'totalQuantity', width: 15 },
      { header: 'Transaction Count', key: 'transactionCount', width: 15 }
    ];
    
    analytics.topItems.forEach((item, index) => {
      analyticsSheet.addRow({
        rank: index + 1,
        sku: item.sku,
        productName: item.productName,
        totalQuantity: item.totalQuantity,
        transactionCount: item.transactionCount
      });
    });
    
    // Add chart for top items
    analyticsSheet.addChart({
      type: 'bar',
      name: 'Top Items Chart',
      categories: `Top Items!A2:A${Math.min(analytics.topItems.length + 1, 11)}`,
      values: `Top Items!D2:D${Math.min(analytics.topItems.length + 1, 11)}`
    });
  }
  
  // Add Forecasts sheet if provided
  if (forecasts) {
    const forecastSheet = workbook.addWorksheet('Forecasts');
    forecastSheet.columns = [
      { header: 'Method', key: 'method', width: 25 },
      { header: '7-Day Forecast', key: 'forecast7', width: 15 },
      { header: '14-Day Forecast', key: 'forecast14', width: 15 },
      { header: '30-Day Forecast', key: 'forecast30', width: 15 },
      { header: 'Confidence', key: 'confidence', width: 15 }
    ];
    
    if (forecasts.movingAverage) {
      forecastSheet.addRow({
        method: 'Moving Average',
        forecast7: forecasts.movingAverage.forecast7,
        forecast14: forecasts.movingAverage.forecast14,
        forecast30: forecasts.movingAverage.forecast30,
        confidence: forecasts.movingAverage.confidence
      });
    }
    
    if (forecasts.weightedMovingAverage) {
      forecastSheet.addRow({
        method: 'Weighted Moving Average',
        forecast7: forecasts.weightedMovingAverage.forecast7,
        forecast14: forecasts.weightedMovingAverage.forecast14,
        forecast30: forecasts.weightedMovingAverage.forecast30,
        confidence: forecasts.weightedMovingAverage.confidence
      });
    }
    
    if (forecasts.exponentialSmoothing) {
      forecastSheet.addRow({
        method: 'Exponential Smoothing',
        forecast7: forecasts.exponentialSmoothing.forecast7,
        forecast14: forecasts.exponentialSmoothing.forecast14,
        forecast30: forecasts.exponentialSmoothing.forecast30,
        confidence: forecasts.exponentialSmoothing.confidence
      });
    }
    
    if (forecasts.linearRegression) {
      forecastSheet.addRow({
        method: 'Linear Regression',
        forecast7: forecasts.linearRegression.forecast7,
        forecast14: forecasts.linearRegression.forecast14,
        forecast30: forecasts.linearRegression.forecast30,
        confidence: forecasts.linearRegression.confidence
      });
    }
  }
  
  // Add detailed transactions sheet
  const transactionsSheet = workbook.addWorksheet('Transactions');
  transactionsSheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Type', key: 'type', width: 15 },
    { header: 'Location', key: 'location', width: 15 },
    { header: 'SKU', key: 'sku', width: 20 },
    { header: 'Product Name', key: 'productName', width: 30 },
    { header: 'Quantity', key: 'quantity', width: 15 },
    { header: 'Order', key: 'orderName', width: 20 },
    { header: 'Vendor', key: 'vendorName', width: 20 }
  ];
  
  transactions.forEach(trans => {
    trans.items?.forEach(item => {
      transactionsSheet.addRow({
        date: trans.transactionDate,
        type: trans.transactionType,
        location: trans.location,
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        orderName: item.orderName,
        vendorName: item.vendorName
      });
    });
  });
  
  // Generate Excel file
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Export forecast data for a specific SKU
 * @param {Object} forecastData - Forecast data
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function exportForecastData(forecastData) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Forecast');
  
  sheet.columns = [
    { header: 'Method', key: 'method', width: 25 },
    { header: '7-Day', key: 'day7', width: 12 },
    { header: '14-Day', key: 'day14', width: 12 },
    { header: '30-Day', key: 'day30', width: 12 },
    { header: 'Confidence', key: 'confidence', width: 12 }
  ];
  
  // Add forecast methods
  const methods = ['movingAverage', 'weightedMovingAverage', 'exponentialSmoothing', 'linearRegression'];
  methods.forEach(method => {
    if (forecastData[method]) {
      sheet.addRow({
        method: method.replace(/([A-Z])/g, ' $1').trim(),
        day7: forecastData[method].forecast7,
        day14: forecastData[method].forecast14,
        day30: forecastData[method].forecast30,
        confidence: forecastData[method].confidence
      });
    }
  });
  
  // Auto-size columns
  sheet.columns.forEach(column => {
    column.width = column.width || 15;
  });
  
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Export analytics dashboard data
 * @param {Object} analytics - Analytics data
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function exportAnalyticsData(analytics) {
  const workbook = new ExcelJS.Workbook();
  
  // Top Items sheet
  if (analytics.topItems) {
    const topSheet = workbook.addWorksheet('Top Items');
    topSheet.columns = [
      { header: 'Rank', key: 'rank', width: 10 },
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Product Name', key: 'productName', width: 40 },
      { header: 'Total Quantity', key: 'totalQuantity', width: 15 },
      { header: 'Transactions', key: 'transactionCount', width: 15 },
      { header: 'Locations', key: 'locations', width: 20 }
    ];
    
    analytics.topItems.forEach((item, index) => {
      topSheet.addRow({
        rank: index + 1,
        sku: item.sku,
        productName: item.productName || 'N/A',
        totalQuantity: item.totalQuantity,
        transactionCount: item.transactionCount,
        locations: item.locations?.join(', ') || ''
      });
    });
  }
  
  // Data Quality sheet
  if (analytics.dataQuality) {
    const qualitySheet = workbook.addWorksheet('Data Quality');
    qualitySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Count', key: 'count', width: 15 }
    ];
    
    const summary = analytics.dataQuality.summary || {};
    qualitySheet.addRow({ metric: 'Missing Product Names', count: summary.missingProductName || 0 });
    qualitySheet.addRow({ metric: 'Missing Safety Stock', count: summary.missingSafetyStock || 0 });
    qualitySheet.addRow({ metric: 'Missing Available Qty', count: summary.missingAvailable || 0 });
    qualitySheet.addRow({ metric: 'Zero Quantity Items', count: summary.zeroQuantity || 0 });
  }
  
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Export processed orders to Excel format
 * @param {Array} orders - Array of processed orders
 * @param {Object} options - Optional parameters (startDate, endDate, startTime, endTime)
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function exportProcessedOrdersToExcel(orders, options = {}) {
  const { startDate, endDate, startTime, endTime } = options;
  const workbook = new ExcelJS.Workbook();
  
  // Add metadata sheet with date range information
  const metadataSheet = workbook.addWorksheet('Export Info');
  metadataSheet.columns = [
    { header: 'Field', key: 'field', width: 25 },
    { header: 'Value', key: 'value', width: 40 }
  ];
  
  const metadataRows = [
    { field: 'Export Date', value: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) },
    { field: 'Total Orders', value: orders.length },
    { field: 'Total Items', value: orders.reduce((sum, order) => sum + (order.items?.length || 0), 0) }
  ];
  
  if (startDate || endDate) {
    const dateRange = startDate === endDate 
      ? startDate 
      : `${startDate || 'N/A'} to ${endDate || 'N/A'}`;
    metadataRows.push({ field: 'Date Range', value: dateRange });
    
    if (startTime || endTime) {
      const timeRange = startTime === endTime
        ? startTime
        : `${startTime || '00:00'} to ${endTime || '23:59'}`;
      metadataRows.push({ field: 'Time Range', value: timeRange });
    }
  }
  
  metadataSheet.addRows(metadataRows);
  
  // Style metadata header row
  metadataSheet.getRow(1).font = { bold: true };
  metadataSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  metadataSheet.getRow(1).font = { ...metadataSheet.getRow(1).font, color: { argb: 'FFFFFFFF' } };
  
  // Main data sheet
  const worksheet = workbook.addWorksheet('Processed Orders');
  
  // Define columns
  worksheet.columns = [
    { header: 'Order Name', key: 'orderName', width: 25 },
    { header: 'Shopify Order ID', key: 'shopifyOrderId', width: 20 },
    { header: 'Customer Name', key: 'customerName', width: 25 },
    { header: 'SKU', key: 'sku', width: 20 },
    { header: 'Product Name', key: 'productName', width: 40 },
    { header: 'Variant', key: 'variantName', width: 25 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'Price', key: 'price', width: 15 },
    { header: 'Vendor', key: 'vendorName', width: 25 },
    { header: 'Warehouse', key: 'warehouse', width: 15 },
    { header: 'Order Date', key: 'orderDate', width: 20 },
    { header: 'Created At', key: 'createdAt', width: 20 },
    { header: 'Processed At', key: 'processedAt', width: 20 }
  ];
  
  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  worksheet.getRow(1).font = { ...worksheet.getRow(1).font, color: { argb: 'FFFFFFFF' } };
  
  // Flatten orders into rows (one row per item)
  const rows = [];
  for (const order of orders) {
    const orderDate = order.createdAt ? new Date(order.createdAt) : null;
    const orderDateStr = orderDate ? orderDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata'
    }) : '';
    
    for (const item of order.items || []) {
      rows.push({
        orderName: order.orderName || order.shopifyOrderName || 'N/A',
        shopifyOrderId: order.shopifyOrderId || '',
        customerName: order.customerName || '',
        sku: item.sku || '',
        productName: item.productName || '',
        variantName: item.variantName || '',
        quantity: item.quantity || 0,
        price: typeof item.price === 'number' ? item.price : (item.costPrice || ''),
        vendorName: (item.vendorName && String(item.vendorName).trim()) || item.vendor?.name || 'Not Mapped',
        warehouse: item.warehouse || 'Okhla',
        orderDate: orderDateStr,
        createdAt: order.createdAt ? new Date(order.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) : '',
        processedAt: order.updatedAt ? new Date(order.updatedAt).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) : ''
      });
    }
  }
  
  // Add rows to worksheet
  worksheet.addRows(rows);
  
  // Generate Excel buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

module.exports = {
  exportToExcel,
  exportForecastData,
  exportAnalyticsData,
  exportProcessedOrdersToExcel
};

