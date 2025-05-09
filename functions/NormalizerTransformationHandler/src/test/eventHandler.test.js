const { expect } = require("chai");
const proxyquire = require("proxyquire").noPreserveCache();


describe("Lambda BeyonDoc - handleEvent", () => {
  let capturedOptions;
  let capturedPayload;
  let fakeHttp;

  beforeEach(() => {
    // Setta le variabili d'ambiente usate dalla Lambda
    process.env.PnSsGestoreRepositoryProtocol = "http";
    process.env.BEYONDOC_API_URL = "http://beyondoc/api/v1/notify-input-pdf-uploaded";
    process.env.NORMALIZER_MARGINS = "2";

    // Mock del modulo "http"
    fakeHttp = {
      request: (url, options, callback) => {
        capturedOptions = options;

        const res = {
          statusCode: 200,
          on: (event, handler) => {
            if (event === "data") handler(JSON.stringify({ response: "Operazione presa in carico" }));
            if (event === "end") handler();
          }
        };

        const req = {
          on: (event, errHandler) => {},
          write: (data) => { capturedPayload = JSON.parse(data); },
          end: () => callback(res),
        };

        return req;
      }
    };
  });
// test-OK
  it("deve processare correttamente un evento SQS e chiamare l'API BeyondDoc", async () => {
    const lambda = proxyquire("../app/eventHandler.js", {
      http: fakeHttp,
    });

    const fakeEvent = {
      Records: [{
        body: JSON.stringify({
          inputPath: "s3://tmp/input.pdf"
        }),
        messageId: "msg-1"
      }]
    };

    const result = await lambda.handleEvent(fakeEvent);

    expect(result).to.deep.equal({ batchItemFailures: [] });

    expect(capturedPayload).to.deep.equal({
      inputPath: "s3://tmp/input.pdf",
      margins: 2
    });

    expect(capturedOptions.method).to.equal("POST");
    expect(capturedOptions.headers["Content-Type"]).to.equal("application/json");
  });


//test-KO
  it("deve gestire un errore 500 nell'API BeyondDoc", async () => {

    // Override per simulare errore HTTP 500
    fakeHttp.request = (url, options, callback) => {
      const res = {
        statusCode: 500,
        on: (event, handler) => {
          if (event === "data") handler("Internal Server Error");
          if (event === "end") handler();
        }
      };

      const req = {
        on: (event, errHandler) => {},
        write: () => {},
        end: () => callback(res),
      };

      return req;
    };

    const lambda = proxyquire("../app/eventHandler.js", {
      http: fakeHttp,
    });

    const fakeEvent = {
      Records: [{
        body: JSON.stringify({
          inputPath: "s3://tmp/input3.pdf"
        }),
        messageId: "msg-2"
      }]
    };

    const result = await lambda.handleEvent(fakeEvent);

    expect(result.batchItemFailures).to.deep.equal([
      { itemIdentifier: "msg-2" }
    ]);
  });

  it("deve gestire un errore 404 nell'API BeyondDoc", async () => {

     // Override per simulare errore HTTP 500
     fakeHttp.request = (url, options, callback) => {
       const res = {
         statusCode: 404,
         on: (event, handler) => {
           if (event === "data") handler("file not found");
           if (event === "end") handler();
         }
       };

       const req = {
         on: (event, errHandler) => {},
         write: () => {},
         end: () => callback(res),
       };

       return req;
     };

     const lambda = proxyquire("../app/eventHandler.js", {
       http: fakeHttp,
     });

     const fakeEvent = {
       Records: [{
         body: JSON.stringify({
           inputPath: "s3://tmp/input4.pdf"
         }),
         messageId: "msg-4"
       }]
     };

     const result = await lambda.handleEvent(fakeEvent);

     expect(result.batchItemFailures).to.deep.equal([
       { itemIdentifier: "msg-4" }
     ]);
   });

  it("deve gestire un record con inputPath mancante", async () => {
    const lambda = proxyquire("../app/eventHandler.js", {
      http: fakeHttp,
    });

    const fakeEvent = {
      Records: [{
        body: JSON.stringify({

        }),
        messageId: "msg-3"
      }]
    };

    const result = await lambda.handleEvent(fakeEvent);

    expect(result.batchItemFailures).to.deep.equal([
      { itemIdentifier: "msg-3" }
    ]);
  });


  afterEach(() => {
    delete process.env.BEYONDOC_API_URL;
    delete process.env.PnSsGestoreRepositoryProtocol;
    delete process.env.NORMALIZER_MARGINS;
  });
});
