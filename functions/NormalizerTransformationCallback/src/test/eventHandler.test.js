const { mockClient } = require("aws-sdk-client-mock");
const { S3Client, GetObjectTaggingCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const proxyquire = require("proxyquire").noPreserveCache();
const { expect } = require("chai");

let s3MockClient = mockClient(S3Client);

describe("NormalizerTransformationCallback", () => {
  let capturedTagging;
  let fakeParseS3Uri;

  beforeEach(() => {
    // Mock di S3Client
    s3MockClient = {
      send: (command) => {
        if (command instanceof GetObjectTaggingCommand) {
          return Promise.resolve({
            TagSet: [] // Simuliamo l'assenza di tag
          });
        } else if (command instanceof PutObjectTaggingCommand) {
          capturedTagging = command;
          return Promise.resolve({});
        }
        return Promise.reject(new Error("Unknown command"));
      }
    };

    fakeParseS3Uri = {
      parse: (uri) => {
        return { bucket: "openshift-pam-bucket", key: "PAC/test.pdf" };
      }
    };
  });

  it("test ok", async () => {
    const lambda = proxyquire("../app/eventHandler.js", {
      "@aws-sdk/client-s3": { S3Client: s3MockClient },
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

    // Verifica che la risposta sia corretta
    expect(result.statusCode).to.equal(200);
    expect(result.body).to.equal("Process completed successfully!");

    // Verifica che i tag siano stati aggiunti correttamente
    expect(capturedTagging.Tagging.TagSet).to.deep.equal([{
      Key: "Transformation-NORMALIZATION",
      Value: "OK"
    }]);
  });

  afterEach(() => {
    delete process.env.BEYONDOC_API_URL;
    delete process.env.PnSsGestoreRepositoryProtocol;
    delete process.env.NORMALIZER_MARGINS;
  });
});
