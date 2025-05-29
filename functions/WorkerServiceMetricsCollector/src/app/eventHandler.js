// Main handler logic for the Lambda function
"use strict";
const metricsHelper = require("./metricsHelper.js");

// Expected environment variables
const METRICS_ENDPOINT_URL = process.env.METRICS_ENDPOINT_URL;
const CLOUDWATCH_NAMESPACE = process.env.CLOUDWATCH_NAMESPACE;
const CLOUDWATCH_METRIC_NAME = process.env.CLOUDWATCH_METRIC_NAME;
const DIMENSION_NAME_SERVICE = process.env.DIMENSION_NAME_SERVICE || "ServiceName";
const DIMENSION_VALUE_SERVICE = process.env.DIMENSION_VALUE_SERVICE;
const DIMENSION_NAME_CLUSTER = process.env.DIMENSION_NAME_CLUSTER || "ClusterName";
const DIMENSION_VALUE_CLUSTER = process.env.DIMENSION_VALUE_CLUSTER;

/**
 * Handles the scheduled event to collect and publish metrics.
 * @async
 * @param {object} event - The event payload (unused in this specific logic).
 * @param {object} context - The Lambda context (unused in this specific logic).
 * @returns {Promise<object>} An object indicating the outcome.
 * @throws {Error} If any critical step fails, causing the Lambda invocation to fail.
 */
async function handleEvent(event, context) {
  if (!METRICS_ENDPOINT_URL || !CLOUDWATCH_NAMESPACE || !CLOUDWATCH_METRIC_NAME) {
    const errorMessage = "Missing required environment variables: METRICS_ENDPOINT_URL, CLOUDWATCH_NAMESPACE, or CLOUDWATCH_METRIC_NAME";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  let responseText;
  try {
    console.log(`Fetching metrics from: ${METRICS_ENDPOINT_URL}`);
    responseText = await metricsHelper.fetchMetrics(METRICS_ENDPOINT_URL);
    console.log("Successfully fetched metrics response.");
  } catch (error) {
    console.error(`Failed to fetch metrics from ${METRICS_ENDPOINT_URL}:`, error.message);
    throw new Error(`Failed to fetch metrics: ${error.message}`);
  }

  let workerScaleRequestedValue;
  try {
    workerScaleRequestedValue = metricsHelper.parseWorkerScaleRequested(responseText);
    console.log(`Parsed worker_scale_requested value: ${workerScaleRequestedValue}`);
  } catch (error) {
    console.error("Failed to parse metrics response:", error.message);
    throw new Error(`Failed to parse metrics: ${error.message}`);
  }

  const dimensions = [];
  if (DIMENSION_VALUE_SERVICE) {
    dimensions.push({ Name: DIMENSION_NAME_SERVICE, Value: DIMENSION_VALUE_SERVICE });
  }
  if (DIMENSION_VALUE_CLUSTER) {
    dimensions.push({ Name: DIMENSION_NAME_CLUSTER, Value: DIMENSION_VALUE_CLUSTER });
  }

  try {
    await metricsHelper.publishMetricToCloudWatch(
      CLOUDWATCH_NAMESPACE,
      CLOUDWATCH_METRIC_NAME,
      workerScaleRequestedValue,
      dimensions.length > 0 ? dimensions : undefined
    );
    const successMsg = `Successfully published metric ${CLOUDWATCH_METRIC_NAME}=${workerScaleRequestedValue} to namespace ${CLOUDWATCH_NAMESPACE}`;
    console.log(successMsg);
    return {
      message: successMsg,
      publishedValue: workerScaleRequestedValue,
    };
  } catch (error) {
    console.error("Failed to publish metric to CloudWatch:", error.message);
    throw new Error(`Failed to publish metric: ${error.message}`);
  }
}

module.exports = {
  handleEvent,
};