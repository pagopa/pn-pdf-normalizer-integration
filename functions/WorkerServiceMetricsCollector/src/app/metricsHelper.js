// Helper functions for fetching, parsing, and publishing metrics
"use strict";
const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");

const cloudWatchClient = new CloudWatchClient({});
const HTTP_TIMEOUT_MS = process.env.HTTP_TIMEOUT_MS || 5000;

/**
 * Fetches metrics from the given URL using native fetch.
 * @param {string} url The URL to fetch metrics from.
 * @returns {Promise<string>} The response text.
 */
async function fetchMetrics(url) {
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(Number(HTTP_TIMEOUT_MS)),
    headers: {
      'Accept': 'text/plain',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Could not retrieve error body");
    throw new Error(`HTTP error! status: ${response.status} for URL: ${url}. Body: ${errorBody}`);
  }
  
  const responseText = await response.text();
  return responseText;
}

/**
 * Parses the response text to extract the worker_scale_requested value.
 * @param {string} responseText The text response from the metrics endpoint.
 * @returns {number} The parsed numeric value.
 */
function parseWorkerScaleRequested(responseText) {
  if (typeof responseText !== 'string' || responseText.trim() === '') {
    throw new Error("Metrics response text is empty or not a string.");
  }

  const lines = responseText.split('\n');
  const metricLine = lines.find(line => line.trim().startsWith("worker_scale_requested"));

  if (!metricLine) {
    throw new Error("'worker_scale_requested' metric not found in response.");
  }

  const parts = metricLine.trim().split(/\s+/);
  if (parts.length < 2) {
    throw new Error(`Invalid format for metric line: "${metricLine}"`);
  }

  const value = parseFloat(parts[1]);
  if (isNaN(value)) {
    throw new Error(`Failed to parse numeric value from metric line: "${metricLine}"`);
  }

  if (!isFinite(value)) {
    throw new Error(`Parsed value is not finite: ${value}`);
  }

  if (value < 0 || value > 100) {
    throw new Error(`Worker scale value ${value} is outside valid range 0-100`);
  }

  return value;
}

/**
 * Publishes a custom metric to CloudWatch.
 * @param {string} namespace The namespace for the metric.
 * @param {string} metricName The name of the metric.
 * @param {number} value The value of the metric.
 * @param {Array<{Name: string, Value: string}>} [dimensions] Optional dimensions for the metric.
 * @returns {Promise<void>}
 */
async function publishMetricToCloudWatch(namespace, metricName, value, dimensions) {
  const metricData = {
    MetricName: metricName,
    Value: value,
    Timestamp: new Date(),
    Unit: "None",
  };

  if (dimensions && dimensions.length > 0) {
    metricData.Dimensions = dimensions;
  }

  const params = {
    MetricData: [metricData],
    Namespace: namespace,
  };

  const command = new PutMetricDataCommand(params);
  await cloudWatchClient.send(command);
  console.log(`Successfully sent metric to CloudWatch: ${namespace}/${metricName}=${value}`);
}

module.exports = {
  fetchMetrics,
  parseWorkerScaleRequested,
  publishMetricToCloudWatch,
};