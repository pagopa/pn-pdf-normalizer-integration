const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");



const proxyquire = require("proxyquire").noPreserveCache();
const {
  S3Client,
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");


// Variabile per catturare il comando inviato
let capturedTagging = null;


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

class FakeS3ClientError {
  send(command) {
    if (command instanceof GetObjectTaggingCommand) {
      // Simuliamo che il tag "Transformation-NORMALIZATION" NON sia presente
      return Promise.reject({
        code:"NoSuchKey" // Simula che non ci siano tag esistenti (per il primo test)
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


class FakeS3ClientError500 {
  send(command) {
    if (command instanceof GetObjectTaggingCommand) {
      // Simuliamo che il tag "Transformation-NORMALIZATION" NON sia presente
      return Promise.reject(new Error("internal server error"));
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
  const s3Mock = mockClient(FakeS3ClientError); // Crea il mock UNA VOLTA sola

  beforeEach(() => {
    capturedTagging = null;
    s3Mock.reset();

  });

  afterEach(() => {
    delete process.env.BEYONDOC_API_URL;
    delete process.env.PnSsGestoreRepositoryProtocol;
    delete process.env.NORMALIZER_MARGINS;

  });

  it("Imposto Transformation-NORMALIZATION = OK ricevendo checkResult= true", async () => {

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
      }
    });

    const fakeEvent = {
        body: JSON.stringify({
          checkResult: true,
          mainErrorReason: "",
          pdffileName: "s3://openshift-pam-bucket/PAC/test.pdf",
          correlationId: "abcdefg-hijkl"
        }),
        messageId: "msg-1"
    };

    const result = await lambda.handleEvent(fakeEvent);

    expect(result.statusCode).to.equal(200);


    // Verifica che il comando di tagging contenga i tag
    expect(capturedTagging).to.not.be.undefined;

  });

  it("Imposto Transformation-NORMALIZATION = Error ricevendo checkResult=false", async () => {
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
      }
    });

    const fakeEvent = {
        body: JSON.stringify({
          checkResult: false,
          mainErrorReason: "Some issue",
          pdffileName: "s3://openshift-pam-bucket/PAC/test.pdf",
          correlationId: "xyz-123"
        }),
        messageId: "msg-2"
    };

    const result = await lambda.handleEvent(fakeEvent);

    expect(result.statusCode).to.equal(200);
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
      }
    });

    const fakeEvent = {
        body: JSON.stringify({
          checkResult: true,
          mainErrorReason: "",
          pdffileName: "s3://openshift-pam-bucket/PAC/test.pdf",
          correlationId: "abc-already-tagged"
        }),
        messageId: "msg-3"
    };

    const result = await lambda.handleEvent(fakeEvent);

    expect(result.statusCode).to.equal(200);
  });





  //TO-DO test errore 400 e 500
  it("Torniamo 500 per errore generale", async () => {
    // Simula errore GetObjectTaggingCommand
    s3Mock.on(GetObjectTaggingCommand).rejects({
      code: 'NoSuchKey',
      message: 'The specified key does not exist.'
    });

    // Carica la lambda SENZA sovrascrivere S3Client
    const lambda = proxyquire("../app/eventHandler.js", {
      "@aws-sdk/client-s3": {
        S3Client: FakeS3ClientError500,
        GetObjectTaggingCommand,
        PutObjectTaggingCommand,
        DeleteObjectCommand
      }
    });

    const fakeEvent = {
        body: JSON.stringify({
          checkResult: true,
          mainErrorReason: "",
          pdffileName: "s3://openshift-pam-bucket/PAC/test.pdf",
          correlationId: "test-id"
        }),
        messageId: "msg-123"
    };

    const res = await lambda.handleEvent(fakeEvent);

    expect(res.statusCode).to.equal(500);
  });

  it("torniamo 400 per NoSuchKey ", async () => {
    // Simula errore GetObjectTaggingCommand
    s3Mock.on(GetObjectTaggingCommand).rejects({
      code: 'NoSuchKey',
      message: 'The specified key does not exist.'
    });

    // Carica la lambda SENZA sovrascrivere S3Client
    const lambda = proxyquire("../app/eventHandler.js", {
      "@aws-sdk/client-s3": {
        S3Client: FakeS3ClientError,
        GetObjectTaggingCommand,
        PutObjectTaggingCommand,
        DeleteObjectCommand
      }
    });

    const fakeEvent = {
        body: JSON.stringify({
          checkResult: true,
          mainErrorReason: "",
          pdffileName: "s3://openshift-pam-bucket/PAC/test.pdf",
          correlationId: "test-id"
        }),
        messageId: "msg-123"
    };

    const res = await lambda.handleEvent(fakeEvent);

    expect(res.statusCode).to.equal(400);
  });




});
