// Helper functions for fetching, parsing, and publishing metrics
"use strict";
const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");

const cloudWatchClient = new CloudWatchClient({});
const HTTP_TIMEOUT_MS = process.env.HTTP_TIMEOUT_MS || 5000; // HTTP request timeout in milliseconds

/**
 * Fetches metrics from the given URL using native fetch.
 * @param {string} url The URL to fetch metrics from.
 * @returns {Promise<string>} The response text.
 * @throws {Error} If the fetch operation fails or the response is not ok.
 */
async function fetchMetrics(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.warn(`Request to ${url} aborted after ${HTTP_TIMEOUT_MS}ms`);
    controller.abort();
  }, Number(HTTP_TIMEOUT_MS));

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'text/plain',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Could not retrieve error body");
      const errMsg = `HTTP error! status: ${response.status} for URL: ${url}. Body: ${errorBody}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }
    const responseText = await response.text();
    return responseText;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${HTTP_TIMEOUT_MS}ms`);
    }
    console.error(`Error fetching metrics from ${url}:`, error.message, error.stack);
    throw error;
  }
}

/**
 * Parses the response text to extract the worker_scale_requested value.
 * Expects a line in the format: "worker_scale_requested N"
 * @param {string} responseText The text response from the metrics endpoint.
 * @returns {number} The parsed numeric value.
 * @throws {Error} If parsing fails.
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
 * @throws {Error} If publishing fails.
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

  try {
    const command = new PutMetricDataCommand(params);
    await cloudWatchClient.send(command);
    console.log(`Successfully sent metric to CloudWatch: ${namespace}/${metricName}=${value}`);
  } catch (error) {
    console.error("Error sending metric data to CloudWatch:", error.message, error.stack);
    throw error;
  }
}

module.exports = {
  fetchMetrics,
  parseWorkerScaleRequested,
  publishMetricToCloudWatch,
};