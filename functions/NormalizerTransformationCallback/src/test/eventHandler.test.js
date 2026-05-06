"use strict";
const { expect } = require("chai");
const { mockClient } = require("aws-sdk-client-mock");
const proxyquire = require("proxyquire").noPreserveCache();
const {
  S3Client,
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const s3Mock=mockClient(S3Client);
// Variabile per catturare il comando inviato
let capturedTagging = null;


// Costanti
const BUCKET = "dummyBucket";
const FILE_KEY = "test.pdf"
const FILE_URI = `s3://${BUCKET}/${FILE_KEY}`;


function loadLambda(){
  return proxyquire("../app/eventHandler.js",{
    "@aws-sdk/client-s3":{
      S3Client,
      GetObjectTaggingCommand,
      PutObjectTaggingCommand,
      DeleteObjectCommand,
      HeadObjectCommand
    }
  });
}

describe("NormalizerTransformationCallback", () => {

  beforeEach(() => {
    capturedTagging = undefined;
    s3Mock.reset();
  });

  afterEach(() => {
    delete process.env.BEYONDOC_API_URL;
    delete process.env.PnSsGestoreRepositoryProtocol;
    delete process.env.NORMALIZER_MARGINS;
  });


  it("Imposto Transformation-NORMALIZATION = OK ricevendo checkResult= true", async () => {
    s3Mock
        .on(GetObjectTaggingCommand).resolves(({TagSet:[]}))
        .on(PutObjectTaggingCommand).callsFake((cmd =>{
          capturedTagging= cmd;
          return {};
    }));

    const lambda = loadLambda();
    const res = await lambda.handleEvent({
      body: JSON.stringify({
        cherResult: true,
        mainErrorReason: "",
        pdffileName: FILE_URI,
        correlationId:"ok-1"
      }),
      messageId:"msg-ok"
    });

    expect(res.statusCode).to.equal(200);
    expect(capturedTagging).to.not.be.undefined;
  });

  it("Imposto Transformation-NORMALIZATION = Error ricevendo checkResult=false", async () => {
    s3Mock
        .on(GetObjectTaggingCommand).resolves({TagSet: [] })
        .on(PutObjectTaggingCommand).callsFake(cmd => {
          capturedTagging=cmd;
          return {};
    })

    const lambda = loadLambda()
    const res = await lambda.handleEvent({
      body: JSON.stringify({
        checkResult:true,
        mainErrorReason:"test-error",
        pdffileName:FILE_URI,
        correlationId: "err-1"
      }),
      messageId:"msg-err"
    });

    expect(res.statusCode).to.equal(200);
    expect(capturedTagging).to.not.be.undefined;
  });

  it("non applica nuovo tag se 'Transformation-NORMALIZATION' già presente", async () => {
    let putCalled= false;
    s3Mock
        .on(GetObjectTaggingCommand).resolves({
      TagSet:[{ Key: "Transformation-NORMALIZATION", Value: "OK"}]
    })
        .on(PutObjectTaggingCommand).callsFake(() => {
      putCalled=true;
      return {};
    });

    const lambda = loadLambda();
    const res = await lambda.handleEvent({
      body: JSON.stringify({
        checkResult:true,
        mainErrorReason:"",
        pdffileName:FILE_URI,
        correlationId:"dub-tag"
      }),
      messageId:"msg-dup"
    });

    expect(res.statusCode).to.equal(200);
    expect(putCalled).to.be.false;
  });

  //TO-DO test errore 400 e 500
  it("Torniamo 500 per errore generale", async () => {
    // Simula errore GetObjectTaggingCommand
    s3Mock.on(GetObjectTaggingCommand).rejects(new Error("internal server error"));

    const lambda = loadLambda();
    const res = await lambda.handleEvent({
      body: JSON.stringify({
        checkResult:true,
        mainErrorReason:"",
        pdffileName:FILE_URI,
        correlationId:"bad-500"
      }),
      messageId:"msg-500"
    });
    expect(res.statusCode).to.equal(500);
  });

  it("torniamo 400 per NoSuchKey ", async () => {
    // Simula errore GetObjectTaggingCommand
    s3Mock.on(GetObjectTaggingCommand).rejects({
      code: 'NoSuchKey',
      message: 'The specified key does not exist.'
    })
        .on(HeadObjectCommand).rejects({
      code: "NotFound",
      message: "Object not found in main bucket."
    });

    const lambda = loadLambda();

    const res = await lambda.handleEvent({
      body: JSON.stringify({
        checkResult: true,
        mainErrorReason: "",
        pdffileName: FILE_URI,
        correlationId: "test-id"
      }),
      messageId: "msg-400"
    });
    expect(res.statusCode).to.equal(400);
  });

  it("rispondiamo 200 se l'oggetto non è in staging ma è presente in main ", async () => {
    let putCalled=false;
    s3Mock
        .on(GetObjectTaggingCommand).rejects({
      code: 'NoSuchKey',
      message: 'The specified key does not exist.'
    })
        .on(HeadObjectCommand).resolves({})
        .on(PutObjectTaggingCommand).callsFake(()=>{
      putCalled=true;
      return {};
    });

    const lambda = loadLambda();

    const res = await lambda.handleEvent({
      body: JSON.stringify({
        checkResult: true,
        mainErrorReason: "",
        pdffileName: "s3://openshift-pam-bucket/PAC/test.pdf",
        correlationId: "test-id"
      }),
      messageId: "msg-dup"
    });
    expect(res.statusCode).to.equal(200);
    expect(putCalled).to.be.false;
  });

  it("se Transformation-NORMALIZATION è inProgress e checkResult=true si applica OK", async () => {
    s3Mock
        .on(GetObjectTaggingCommand).resolves({
          TagSet:[{ Key: "Transformation-NORMALIZATION", Value: "inProgress" }]
        })
        .on(PutObjectTaggingCommand).callsFake(cmd => {
          capturedTagging = cmd;
          return {};
        });

    const lambda = loadLambda();
    const res = await lambda.handleEvent({
      body: JSON.stringify({
        checkResult: true,
        mainErrorReason: "",
        pdffileName: FILE_URI,
        correlationId: "inprogress-ok"
      }),
      messageId: "msg-inprogress-ok"
     });

     expect(res.statusCode).to.equal(200);
     expect(capturedTagging).to.not.be.undefined;
     expect(capturedTagging.Tagging.TagSet[0].Value).to.equal("OK");
   });

   it("se Transformation-NORMALIZATION è inProgress e checkResult=false viene applicato ERROR", async () => {
     s3Mock
         .on(GetObjectTaggingCommand).resolves({
           TagSet:[{ Key: "Transformation-NORMALIZATION", Value: "inProgress" }]
         })
         .on(PutObjectTaggingCommand).callsFake(cmd => {
           capturedTagging = cmd;
           return {};
         });

     const lambda = loadLambda();
     const res = await lambda.handleEvent({
       body: JSON.stringify({
         checkResult: false,
         mainErrorReason: "",
         pdffileName: FILE_URI,
         correlationId: "inprogress-error"
       }),
       messageId: "msg-inprogress-error"
     });

     expect(res.statusCode).to.equal(200);
     expect(capturedTagging).to.not.be.undefined;
     expect(capturedTagging.Tagging.TagSet[0].Value).to.equal("ERROR");
   });

   it("gestisce correttamente chiamate multiple alla stessa callback", async () => {
     let currentTagSet = [];

     s3Mock
       .on(GetObjectTaggingCommand)
       .callsFake(() => {
         return { TagSet: currentTagSet };
       })
       .on(PutObjectTaggingCommand)
       .callsFake(cmd => {
         currentTagSet = cmd.Tagging.TagSet;
         return {};
       });

     const lambda = loadLambda();

     // 1 callback: checkResult = true => dovrebbe creare il tag OK
     let res = await lambda.handleEvent({
       body: JSON.stringify({
         checkResult: true,
         pdffileName: FILE_URI,
         correlationId: "multi-1"
       }),
       messageId: "msg-1"
     });

     expect(res.statusCode).to.equal(200);
     expect(currentTagSet[0].Key).to.equal("Transformation-NORMALIZATION");
     expect(currentTagSet[0].Value).to.equal("OK");

     // 2 callback: checkResult = false => non deve modificare il tag perché già OK
     res = await lambda.handleEvent({
       body: JSON.stringify({
         checkResult: false,
         pdffileName: FILE_URI,
         correlationId: "multi-2"
       }),
       messageId: "msg-2"
     });

     expect(res.statusCode).to.equal(200);
     expect(currentTagSet[0].Value).to.equal("OK"); // il tag rimane OK

     // 3 callback: se mettiamo inProgress, dovrebbe sovrascrivere
     currentTagSet[0].Value = "inProgress";

     res = await lambda.handleEvent({
       body: JSON.stringify({
         checkResult: false,
         pdffileName: FILE_URI,
         correlationId: "multi-3"
       }),
       messageId: "msg-3"
     });

     expect(res.statusCode).to.equal(200);
     expect(currentTagSet[0].Value).to.equal("ERROR"); // il tag viene aggiornato
   });

});
