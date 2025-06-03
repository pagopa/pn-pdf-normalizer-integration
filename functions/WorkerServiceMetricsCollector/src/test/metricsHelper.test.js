// Unit tests for metrics helper functions

// set http call timeout to 50 ms 
process.env.HTTP_TIMEOUT_MS = "50";

"use strict";
const { expect } = require("chai");
const sinon = require("sinon");
const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");
const { mockClient } = require("aws-sdk-client-mock");

const metricsHelper = require("../app/metricsHelper.js");

describe("BeyondocWorkerMetricsCollector - MetricsHelper", () => {
  const testUrl = "http://metrics.example.com/metrics";
  const originalHttpTimeoutMs = process.env.HTTP_TIMEOUT_MS;
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, "fetch");
  });

  afterEach(() => {
    fetchStub.restore();
    if (originalHttpTimeoutMs === undefined) {
      delete process.env.HTTP_TIMEOUT_MS;
    } else {
      process.env.HTTP_TIMEOUT_MS = originalHttpTimeoutMs;
    }
  });

  describe("fetchMetrics", () => {
    it("should return response text on successful GET request", async () => {
      const mockResponse = "worker_scale_requested 50\nother_metric 10";
      fetchStub.resolves({
        ok: true,
        status: 200,
        text: async () => mockResponse,
      });

      const response = await metricsHelper.fetchMetrics(testUrl);

      expect(response).to.equal(mockResponse);
      expect(fetchStub.calledOnce).to.be.true;
      
      // Verify AbortSignal.timeout was used
      const fetchCall = fetchStub.getCall(0);
      expect(fetchCall.args[1].signal).to.be.instanceOf(AbortSignal);
    });

    it("should throw an error if HTTP response status is not ok", async () => {
      fetchStub.resolves({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      });

      try {
        await metricsHelper.fetchMetrics(testUrl);
        expect.fail("Expected fetchMetrics to throw for non-OK HTTP status");
      } catch (err) {
        expect(err.message).to.include("HTTP error! status: 503");
      }
    });

    it("should throw an error if the request times out", async () => {
      fetchStub.callsFake((url, opts) => {
        return new Promise((resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            const abortErr = new Error("This operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        });
      });

      try {
        await metricsHelper.fetchMetrics(testUrl); // attende ~50 ms reali
        expect.fail("Expected timeout error");
      } catch (err) {
        expect(err.name).to.equal("AbortError");
      }
    });

    it("should throw an error on network failure during fetch", async () => {
      fetchStub.rejects(new Error("Network connection refused"));

      try {
        await metricsHelper.fetchMetrics(testUrl);
        expect.fail("Expected network error");
      } catch (err) {
        expect(err.message).to.include("Network connection refused");
      }
    });
  });

  describe("parseWorkerScaleRequested", () => {
    it("should correctly parse 'worker_scale_requested N' from multi-line string", () => {
      const responseText = "metric_a 10\nworker_scale_requested 75\nmetric_b 20";
      expect(metricsHelper.parseWorkerScaleRequested(responseText)).to.equal(75);
    });

    it("should correctly parse when it is the only line", () => {
      const responseText = "worker_scale_requested 5";
      expect(metricsHelper.parseWorkerScaleRequested(responseText)).to.equal(5);
    });

    it("should handle extra spaces around the value", () => {
      const responseText = "worker_scale_requested    33   ";
      expect(metricsHelper.parseWorkerScaleRequested(responseText)).to.equal(33);
    });

    it("should handle floating point numbers", () => {
      const responseText = "worker_scale_requested 25.5";
      expect(metricsHelper.parseWorkerScaleRequested(responseText)).to.equal(25.5);
    });

    it("should throw error if 'worker_scale_requested' line is not found", () => {
      const responseText = "another_metric 100\nno_scale_here 0";
      expect(() => metricsHelper.parseWorkerScaleRequested(responseText))
        .to.throw("'worker_scale_requested' metric not found in response.");
    });

    it("should throw error if the line format is invalid (missing value)", () => {
      const responseText = "worker_scale_requested";
      expect(() => metricsHelper.parseWorkerScaleRequested(responseText))
        .to.throw('Invalid format for metric line: "worker_scale_requested"');
    });

    it("should throw error if the value is not a number", () => {
      const responseText = "worker_scale_requested abc";
      expect(() => metricsHelper.parseWorkerScaleRequested(responseText))
        .to.throw('Failed to parse numeric value from metric line: "worker_scale_requested abc"');
    });

    it("should throw error for empty input string", () => {
      expect(() => metricsHelper.parseWorkerScaleRequested(""))
        .to.throw("Metrics response text is empty or not a string.");
    });

    it("should throw error for null input", () => {
      expect(() => metricsHelper.parseWorkerScaleRequested(null))
        .to.throw("Metrics response text is empty or not a string.");
    });

    it("should throw error if parsed value is Infinity", () => {
      const responseText = "worker_scale_requested Infinity";
      expect(() => metricsHelper.parseWorkerScaleRequested(responseText))
        .to.throw("Parsed value is not finite: Infinity");
    });

    it("should throw error if parsed value is -Infinity", () => {
      const responseText = "worker_scale_requested -Infinity";
      expect(() => metricsHelper.parseWorkerScaleRequested(responseText))
        .to.throw("Parsed value is not finite: -Infinity");
    });

    it("should throw error for values outside 0-100 range", () => {
      const responseText = "worker_scale_requested 150";
      expect(() => metricsHelper.parseWorkerScaleRequested(responseText))
        .to.throw("Worker scale value 150 is outside valid range 0-100");
    });

    it("should throw error for negative values", () => {
      const responseText = "worker_scale_requested -10";
      expect(() => metricsHelper.parseWorkerScaleRequested(responseText))
        .to.throw("Worker scale value -10 is outside valid range 0-100");
    });

    it("should not throw error for values within 0-100 range", () => {
      const responseText = "worker_scale_requested 50";
      expect(() => metricsHelper.parseWorkerScaleRequested(responseText)).to.not.throw();
      expect(metricsHelper.parseWorkerScaleRequested(responseText)).to.equal(50);
    });
  });

  describe("publishMetricToCloudWatch", () => {
    let cwMock;

    beforeEach(() => {
      cwMock = mockClient(CloudWatchClient);
    });

    afterEach(() => {
      cwMock.reset();
    });

    it("should send correct PutMetricDataCommand without dimensions", async () => {
      cwMock.on(PutMetricDataCommand).resolves({});

      const namespace = "MyTestNamespace";
      const metricName = "MyTestMetric";
      const value = 42;

      await metricsHelper.publishMetricToCloudWatch(namespace, metricName, value);

      expect(cwMock.calls()).to.have.lengthOf(1);
      const commandInput = cwMock.call(0).args[0].input;

      expect(commandInput.Namespace).to.equal(namespace);
      expect(commandInput.MetricData).to.be.an("array").with.lengthOf(1);
      expect(commandInput.MetricData[0].MetricName).to.equal(metricName);
      expect(commandInput.MetricData[0].Value).to.equal(value);
      expect(commandInput.MetricData[0].Unit).to.equal("None");
      expect(commandInput.MetricData[0].Timestamp).to.be.a("Date");
      expect(commandInput.MetricData[0].Dimensions).to.be.undefined;
    });

    it("should send correct PutMetricDataCommand with dimensions", async () => {
      cwMock.on(PutMetricDataCommand).resolves({});

      const namespace = "MyTestNamespace";
      const metricName = "MyTestMetric";
      const value = 42;
      const dimensions = [{ Name: "Dim1", Value: "Val1" }];

      await metricsHelper.publishMetricToCloudWatch(namespace, metricName, value, dimensions);

      expect(cwMock.calls()).to.have.lengthOf(1);
      const commandInput = cwMock.call(0).args[0].input;
      expect(commandInput.MetricData[0].Dimensions).to.deep.equal(dimensions);
    });

    it("should throw an error if CloudWatch SDK call fails", async () => {
      const sdkError = new Error("AWS SDK Call Failed");
      cwMock.on(PutMetricDataCommand).rejects(sdkError);

      try {
        await metricsHelper.publishMetricToCloudWatch("NS", "MN", 1);
        expect.fail("Expected publishMetricToCloudWatch to throw");
      } catch (error) {
        expect(error).to.equal(sdkError);
      }
    });
  });
});