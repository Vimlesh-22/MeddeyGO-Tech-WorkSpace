/**
 * Forecasting Service for Inventory Management
 * Implements 4 forecasting methods: Moving Average, Weighted Moving Average, Exponential Smoothing, Linear Regression
 */

/**
 * Calculate simple moving average forecast
 * @param {Array} historicalData - Array of {date, quantity}
 * @param {Number} period - Number of days for moving average (default: 7)
 * @returns {Object} Forecast for next 7, 14, 30 days
 */
function movingAverage(historicalData, period = 7) {
  if (!historicalData || historicalData.length === 0) {
    return { forecast7: 0, forecast14: 0, forecast30: 0, confidence: 0 };
  }

  // Get quantities from recent period
  const recentData = historicalData.slice(-period);
  const avgQuantity = recentData.reduce((sum, data) => sum + (data.quantity || 0), 0) / recentData.length;

  // Calculate confidence based on data consistency
  const variance = recentData.reduce((sum, data) => {
    const diff = (data.quantity || 0) - avgQuantity;
    return sum + (diff * diff);
  }, 0) / recentData.length;
  const stdDev = Math.sqrt(variance);
  const confidence = Math.max(0, Math.min(1, 1 - (stdDev / (avgQuantity || 1))));

  return {
    forecast7: Math.round(avgQuantity),
    forecast14: Math.round(avgQuantity * 2),
    forecast30: Math.round(avgQuantity * 4),
    confidence: confidence.toFixed(2),
    method: 'Moving Average',
    period: period,
    avgQuantity: avgQuantity.toFixed(2)
  };
}

/**
 * Calculate weighted moving average forecast
 * Recent data points have higher weight
 * @param {Array} historicalData - Array of {date, quantity}
 * @param {Array} weights - Array of weights (default: [0.5, 0.3, 0.2])
 * @returns {Object} Forecast for next 7, 14, 30 days
 */
function weightedMovingAverage(historicalData, weights = [0.5, 0.3, 0.2]) {
  if (!historicalData || historicalData.length === 0) {
    return { forecast7: 0, forecast14: 0, forecast30: 0, confidence: 0 };
  }

  const numPoints = Math.min(weights.length, historicalData.length);
  const recentData = historicalData.slice(-numPoints);
  const normalizedWeights = weights.slice(0, numPoints);

  // Normalize weights
  const sumWeights = normalizedWeights.reduce((sum, w) => sum + w, 0);
  const adjustedWeights = normalizedWeights.map(w => w / sumWeights);

  // Calculate weighted average
  const weightedSum = recentData.reduce((sum, data, index) => {
    const quantity = data.quantity || 0;
    const weight = adjustedWeights[index] || 0;
    return sum + (quantity * weight);
  }, 0);

  const avgQuantity = weightedSum;

  return {
    forecast7: Math.round(avgQuantity),
    forecast14: Math.round(avgQuantity * 2),
    forecast30: Math.round(avgQuantity * 4),
    confidence: 0.75, // Weighted methods tend to have moderate confidence
    method: 'Weighted Moving Average',
    weights: normalizedWeights,
    avgQuantity: avgQuantity.toFixed(2)
  };
}

/**
 * Calculate exponential smoothing forecast (Simple Exponential Smoothing)
 * @param {Array} historicalData - Array of {date, quantity}
 * @param {Number} alpha - Smoothing factor (0.1 to 1, default: 0.3)
 * @returns {Object} Forecast for next 7, 14, 30 days
 */
function exponentialSmoothing(historicalData, alpha = 0.3) {
  if (!historicalData || historicalData.length === 0) {
    return { forecast7: 0, forecast14: 0, forecast30: 0, confidence: 0 };
  }

  // Initialize with first value
  let smoothed = historicalData[0].quantity || 0;

  // Apply exponential smoothing to all data points
  for (let i = 1; i < historicalData.length; i++) {
    const currentValue = historicalData[i].quantity || 0;
    smoothed = alpha * currentValue + (1 - alpha) * smoothed;
  }

  // Confidence based on alpha value (higher alpha = less smoothing = higher variance)
  const confidence = Math.max(0, Math.min(1, 1 - alpha));

  return {
    forecast7: Math.round(smoothed),
    forecast14: Math.round(smoothed * 2),
    forecast30: Math.round(smoothed * 4),
    confidence: confidence.toFixed(2),
    method: 'Exponential Smoothing',
    alpha: alpha,
    smoothedValue: smoothed.toFixed(2)
  };
}

/**
 * Calculate linear regression forecast
 * Fits a linear trend line to historical data
 * @param {Array} historicalData - Array of {date, quantity}
 * @returns {Object} Forecast for next 7, 14, 30 days
 */
function linearRegression(historicalData) {
  if (!historicalData || historicalData.length < 2) {
    return { forecast7: 0, forecast14: 0, forecast30: 0, confidence: 0 };
  }

  const n = historicalData.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  // Convert dates to numeric values (days since first date)
  const firstDate = new Date(historicalData[0].date);
  
  historicalData.forEach((data, index) => {
    const x = index; // Day number
    const y = data.quantity || 0;
    
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });

  // Calculate slope (b) and intercept (a)
  // y = ax + b
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Current forecast (next day is day n)
  const nextValue = slope * n + intercept;
  
  // Calculate R² for confidence
  const meanY = sumY / n;
  let totalSumSquares = 0;
  let residualSumSquares = 0;
  
  historicalData.forEach((data, index) => {
    const y = data.quantity || 0;
    const predicted = slope * index + intercept;
    
    totalSumSquares += Math.pow(y - meanY, 2);
    residualSumSquares += Math.pow(y - predicted, 2);
  });

  const rSquared = 1 - (residualSumSquares / totalSumSquares);
  const confidence = Math.max(0, Math.min(1, rSquared));

  return {
    forecast7: Math.max(0, Math.round(nextValue)),
    forecast14: Math.max(0, Math.round(nextValue * 2)),
    forecast30: Math.max(0, Math.round(nextValue * 4)),
    confidence: confidence.toFixed(2),
    method: 'Linear Regression',
    slope: slope.toFixed(2),
    intercept: intercept.toFixed(2),
    rSquared: rSquared.toFixed(2)
  };
}

/**
 * Get forecast using all 4 methods for comparison
 * @param {Array} historicalData - Array of {date, quantity}
 * @returns {Object} Forecasts from all methods
 */
function getAllForecasts(historicalData) {
  const maForecast = movingAverage(historicalData, 7);
  const wmaForecast = weightedMovingAverage(historicalData, [0.5, 0.3, 0.2]);
  const esForecast = exponentialSmoothing(historicalData, 0.3);
  const lrForecast = linearRegression(historicalData);

  return {
    movingAverage: maForecast,
    weightedMovingAverage: wmaForecast,
    exponentialSmoothing: esForecast,
    linearRegression: lrForecast,
    comparison: {
      avgForecast7: Math.round((maForecast.forecast7 + wmaForecast.forecast7 + esForecast.forecast7 + lrForecast.forecast7) / 4),
      avgForecast14: Math.round((maForecast.forecast14 + wmaForecast.forecast14 + esForecast.forecast14 + lrForecast.forecast14) / 4),
      avgForecast30: Math.round((maForecast.forecast30 + wmaForecast.forecast30 + esForecast.forecast30 + lrForecast.forecast30) / 4),
      maxForecast7: Math.max(maForecast.forecast7, wmaForecast.forecast7, esForecast.forecast7, lrForecast.forecast7),
      minForecast7: Math.min(maForecast.forecast7, wmaForecast.forecast7, esForecast.forecast7, lrForecast.forecast7)
    }
  };
}

module.exports = {
  movingAverage,
  weightedMovingAverage,
  exponentialSmoothing,
  linearRegression,
  getAllForecasts
};

