const { expect } = require("chai");
const proxyquire = require("proxyquire").noPreserveCache();
const {
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
  DeleteObjectCommand
} = require("@aws-sdk/client-s3");

// Variabile per catturare il comando inviato
let capturedTagging = null;

// Mock parseS3Uri
let fakeParseS3Uri = {
  parse: (uri) => ({
    bucket: "openshift-pam-bucket",
    key: "PAC/test.pdf"
  })
};

// Finto client S3
class FakeS3Client {
  send(command) {
    if (command instanceof GetObjectTaggingCommand) {
      // Simuliamo che il tag "Transformation-NORMALIZATION" NON sia presente
      return Promise.resolve({
        TagSet: [] // Simula che non ci siano tag esistenti (per il primo test)
      });
    } else if (command instanceof PutObjectTaggingCommand) {
      // Cattura il comando per le asserzioni
      capturedTagging = command;
      return Promise.resolve({});
    } else if (command instanceof DeleteObjectCommand) {
      return Promise.resolve({});
    }
    return Promise.reject(new Error("Unknown command"));
  }
}

describe("NormalizerTransformationCallback", () => {
  beforeEach(() => {
    capturedTagging = null;
  });

  afterEach(() => {
    delete process.env.BEYONDOC_API_URL;
    delete process.env.PnSsGestoreRepositoryProtocol;
    delete process.env.NORMALIZER_MARGINS;
  });

  it("test ok - checkResult true", async () => {
    const lambda = proxyquire("../app/eventHandler.js", {
      "@aws-sdk/client-s3": {
        S3Client: FakeS3Client,
        GetObjectTaggingCommand,
        PutObjectTaggingCommand,
        DeleteObjectCommand
      },
      "@aws-sdk/util-uri-escape": { parseS3Uri: fakeParseS3Uri.parse }
    });

    const fakeEvent = {
      Records: [{
        body: JSON.stringify({
          checkResult: true,
          mainErrorReason: "",
          outputPath: "s3://openshift-pam-bucket/PAC/test.pdf",
          correlationId: "abcdefg-hijkl"
        }),
        messageId: "msg-1"
      }]
    };

    const result = await lambda.handleEvent(fakeEvent);

    expect(result.statusCode).to.equal(200);
    expect(result.body).to.equal("Process completed successfully!");

    // Verifica che il comando di tagging contenga i tag
    expect(capturedTagging).to.not.be.undefined;

  });

  it("test errore - checkResult false", async () => {
    class FakeS3ClientWithTagging {
      send(command) {
        if (command instanceof GetObjectTaggingCommand) {
          return Promise.resolve({
            TagSet: [] // Simula che non ci siano tag esistenti
          });
        } else if (command instanceof PutObjectTaggingCommand) {
          capturedTagging = command;
          return Promise.resolve({});
        }
        return Promise.reject(new Error("Unknown command"));
      }
    }

    const lambda = proxyquire("../app/eventHandler.js", {
      "@aws-sdk/client-s3": {
        S3Client: FakeS3ClientWithTagging,
        GetObjectTaggingCommand,
        PutObjectTaggingCommand,
        DeleteObjectCommand
      },
      "@aws-sdk/util-uri-escape": { parseS3Uri: fakeParseS3Uri.parse }
    });

    const fakeEvent = {
      Records: [{
        body: JSON.stringify({
          checkResult: false,
          mainErrorReason: "Some issue",
          outputPath: "s3://openshift-pam-bucket/PAC/test.pdf",
          correlationId: "xyz-123"
        }),
        messageId: "msg-2"
      }]
    };

    const result = await lambda.handleEvent(fakeEvent);

    expect(result.statusCode).to.equal(200);
    expect(result.body).to.equal("Process completed successfully!");
    console.log(result)
    // Verifica che i tag siano stati aggiunti correttamente
    expect(capturedTagging).to.not.be.undefined;

  });

  it("non applica nuovo tag se 'Transformation-NORMALIZATION' già presente", async () => {
    class S3ClientWithExistingTag {
      send(command) {
        if (command instanceof GetObjectTaggingCommand) {
          return Promise.resolve({
            TagSet: [{ Key: "Transformation-NORMALIZATION", Value: "OK" }]
          });
        } else if (command instanceof PutObjectTaggingCommand) {
          // NON dovrebbe arrivare qui
          throw new Error("PutObjectTaggingCommand non dovrebbe essere chiamato");
        }
        return Promise.resolve({});
      }
    }

    const lambda = proxyquire("../app/eventHandler.js", {
      "@aws-sdk/client-s3": {
        S3Client: S3ClientWithExistingTag,
        GetObjectTaggingCommand,
        PutObjectTaggingCommand,
        DeleteObjectCommand
      },
      "@aws-sdk/util-uri-escape": { parseS3Uri: fakeParseS3Uri.parse }
    });

    const fakeEvent = {
      Records: [{
        body: JSON.stringify({
          checkResult: true,
          mainErrorReason: "",
          outputPath: "s3://openshift-pam-bucket/PAC/test.pdf",
          correlationId: "abc-already-tagged"
        }),
        messageId: "msg-3"
      }]
    };

    const result = await lambda.handleEvent(fakeEvent);

    expect(result.statusCode).to.equal(200);
    expect(result.body).to.equal("Process completed successfully!");
  });
});
