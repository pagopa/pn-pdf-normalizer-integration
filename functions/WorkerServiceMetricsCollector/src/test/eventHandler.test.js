// Unit tests for the main Lambda event handler
"use strict";
const { expect } = require("chai");
const sinon = require("sinon");
const proxyquire = require("proxyquire").noCallThru();

function loadHandler(metricsHelperMock) {
  delete require.cache[require.resolve("../app/eventHandler.js")];
  return proxyquire("../app/eventHandler.js", {
    "./metricsHelper.js": metricsHelperMock,
  });
}

let metricsHelperMock;

describe("BeyondocWorkerMetricsCollector - EventHandler", () => {
  beforeEach(() => {
    metricsHelperMock = {
      fetchMetrics: sinon.stub(),
      parseWorkerScaleRequested: sinon.stub(),
      publishMetricToCloudWatch: sinon.stub(),
    };

    process.env.METRICS_ENDPOINT_URL = "http://fake-metrics.internal/metrics";
    process.env.CLOUDWATCH_NAMESPACE = "Test/WorkerNamespace";
    process.env.CLOUDWATCH_METRIC_NAME = "TestWorkerLoadPercentage";
  });

  afterEach(() => {
    sinon.restore();
    delete process.env.METRICS_ENDPOINT_URL;
    delete process.env.CLOUDWATCH_NAMESPACE;
    delete process.env.CLOUDWATCH_METRIC_NAME;
    delete process.env.DIMENSION_VALUE_SERVICE;
    delete process.env.DIMENSION_VALUE_CLUSTER;
    delete process.env.DIMENSION_NAME_SERVICE;
    delete process.env.DIMENSION_NAME_CLUSTER;
  });

  it("should successfully fetch, parse, and publish metrics with all dimensions", async () => {
    process.env.DIMENSION_VALUE_SERVICE = "test-worker-service";
    process.env.DIMENSION_VALUE_CLUSTER = "test-ecs-cluster";
    const eventHandler = loadHandler(metricsHelperMock);

    const mockMetricsResponse = "worker_scale_requested 75\nother_data";
    const parsedValue = 75;

    metricsHelperMock.fetchMetrics.resolves(mockMetricsResponse);
    metricsHelperMock.parseWorkerScaleRequested.returns(parsedValue);
    metricsHelperMock.publishMetricToCloudWatch.resolves();

    const result = await eventHandler.handleEvent({}, {});

    expect(metricsHelperMock.fetchMetrics.calledOnceWith(process.env.METRICS_ENDPOINT_URL)).to.be.true;
    expect(metricsHelperMock.parseWorkerScaleRequested.calledOnceWith(mockMetricsResponse)).to.be.true;
    const expectedDimensions = [
      { Name: "ServiceName", Value: "test-worker-service" },
      { Name: "ClusterName", Value: "test-ecs-cluster" },
    ];
    expect(metricsHelperMock.publishMetricToCloudWatch.calledOnceWith(
      process.env.CLOUDWATCH_NAMESPACE,
      process.env.CLOUDWATCH_METRIC_NAME,
      parsedValue,
      expectedDimensions
    )).to.be.true;

    expect(result).to.deep.equal({
      message: `Successfully published metric ${process.env.CLOUDWATCH_METRIC_NAME}=${parsedValue} to namespace ${process.env.CLOUDWATCH_NAMESPACE}`,
      publishedValue: parsedValue,
    });
  });

  it("should publish metrics without dimensions if DIMENSION_VALUEs are not set", async () => {
    const eventHandler = loadHandler(metricsHelperMock);

    const mockMetricsResponse = "worker_scale_requested 50";
    const parsedValue = 50;

    metricsHelperMock.fetchMetrics.resolves(mockMetricsResponse);
    metricsHelperMock.parseWorkerScaleRequested.returns(parsedValue);
    metricsHelperMock.publishMetricToCloudWatch.resolves();

    await eventHandler.handleEvent({}, {});

    expect(metricsHelperMock.publishMetricToCloudWatch.calledOnceWith(
      process.env.CLOUDWATCH_NAMESPACE,
      process.env.CLOUDWATCH_METRIC_NAME,
      parsedValue,
      undefined
    )).to.be.true;
  });

  it("should throw an error if METRICS_ENDPOINT_URL environment variable is missing", async () => {
    delete process.env.METRICS_ENDPOINT_URL;
    const eventHandler = loadHandler(metricsHelperMock);

    try {
      await eventHandler.handleEvent({}, {});
      expect.fail("handleEvent should have thrown an error");
    } catch (error) {
      expect(error.message).to.include("Missing required environment variables");
    }
  });

  it("should throw an error if CLOUDWATCH_NAMESPACE environment variable is missing", async () => {
    delete process.env.CLOUDWATCH_NAMESPACE;
    const eventHandler = loadHandler(metricsHelperMock);

    try {
      await eventHandler.handleEvent({}, {});
      expect.fail("handleEvent should have thrown an error");
    } catch (error) {
      expect(error.message).to.include("Missing required environment variables");
    }
  });

  it("should throw an error if CLOUDWATCH_METRIC_NAME environment variable is missing", async () => {
    delete process.env.CLOUDWATCH_METRIC_NAME;
    const eventHandler = loadHandler(metricsHelperMock);

    try {
      await eventHandler.handleEvent({}, {});
      expect.fail("handleEvent should have thrown an error");
    } catch (error) {
      expect(error.message).to.include("Missing required environment variables");
    }
  });

  it("should propagate error if fetchMetrics helper fails", async () => {
    const eventHandler = loadHandler(metricsHelperMock);
    const fetchError = new Error("Network connection failed");
    metricsHelperMock.fetchMetrics.rejects(fetchError);

    try {
      await eventHandler.handleEvent({}, {});
      expect.fail("handleEvent should have propagated the error");
    } catch (error) {
      expect(error).to.equal(fetchError);
    }
  });

  it("should propagate error if parseWorkerScaleRequested helper fails", async () => {
    const eventHandler = loadHandler(metricsHelperMock);
    metricsHelperMock.fetchMetrics.resolves("some response");
    const parseError = new Error("Invalid metric format");
    metricsHelperMock.parseWorkerScaleRequested.throws(parseError);

    try {
      await eventHandler.handleEvent({}, {});
      expect.fail("handleEvent should have propagated the error");
    } catch (error) {
      expect(error).to.equal(parseError);
    }
  });

  it("should propagate error if publishMetricToCloudWatch helper fails", async () => {
    const eventHandler = loadHandler(metricsHelperMock);
    metricsHelperMock.fetchMetrics.resolves("worker_scale_requested 10");
    metricsHelperMock.parseWorkerScaleRequested.returns(10);
    const publishError = new Error("CloudWatch API error");
    metricsHelperMock.publishMetricToCloudWatch.rejects(publishError);

    try {
      await eventHandler.handleEvent({}, {});
      expect.fail("handleEvent should have propagated the error");
    } catch (error) {
      expect(error).to.equal(publishError);
    }
  });
});