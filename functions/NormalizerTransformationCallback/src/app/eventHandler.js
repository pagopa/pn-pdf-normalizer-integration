"use strict";
const {
    S3Client,
    GetObjectTaggingCommand,
    PutObjectTaggingCommand,
    HeadObjectCommand
} = require("@aws-sdk/client-s3");

const s3 = new S3Client({});
const MAIN_BUCKET="mainBucket";

exports.handleEvent = async function (event) {
    let bucketName,fileKey;

    try {

        console.log("Received event:", JSON.stringify(event));

        const bodyData = JSON.parse(event.body);

        const checkResult = bodyData.checkResult;
        ({ bucketName, fileKey } = parseS3Uri(bodyData.pdffileName));

        console.log("Normalization CheckResult:", checkResult);

        const TAG_KEY = "Transformation-NORMALIZATION";

        // Recupera i tag esistenti
        const tagResponse = await s3.send(new GetObjectTaggingCommand({
            Bucket: bucketName,
            Key: fileKey
        }));

        // Cerca se il tag "Transformation-NORMALIZATION" è già presente
        const normalizationTag = tagResponse.TagSet.find(tag => tag.Key === TAG_KEY);


        if (!normalizationTag) {
            const tagValue = checkResult ? "OK" : "ERROR";
            const tagSettings = {
                Bucket: bucketName,
                Key: fileKey,
                Tagging: {
                    TagSet: [{
                        Key: TAG_KEY,
                        Value: tagValue,
                    }],
                }
            };
            const command = new PutObjectTaggingCommand(tagSettings);
            await s3.send(command);
            console.log("New Tag Set:", tagSettings.Tagging.TagSet);
        } else {
            console.log("The '" + TAG_KEY + "' tag is already present, no action needed.");
        }

        return {
            statusCode: 200,
        };
    } catch (error) {
        console.error("ERROR: ", error);
        const errorCode = error?.code || error?.Code || error?.name;
        if (errorCode === 'NoSuchKey'){
            try{
                await s3.send(new HeadObjectCommand({
                    Bucket: MAIN_BUCKET,
                    Key: fileKey
                }));

                console.log(`Duplicate callback: file ${fileKey} already in ${MAIN_BUCKET}`)
                return createJsonResponse(200,`Already processed: ${fileKey}`)
            } catch (e){
                if (e.code === 'NotFound' || e.code === "NoSuchKey"){
                    return createJsonResponse(400,e.message)
                }
                throw e;
            }
        }

        if (errorCode === 'NoSuchBucket') {
            return createJsonResponse(400, error.message);
        } else {
            return createJsonResponse(500, "Error during normalization processing: " + error.message);
        }

    }

};

function parseS3Uri(uri) {
  const s3Regex = /^s3:\/\/([^\/]+)\/(.+)$/;

  const match = uri.match(s3Regex);
  if (!match) {
    throw new Error(`Invalid S3 URI: ${uri}`);
  }

  const [, bucketName, fileKey] = match;
  return { bucketName, fileKey };
}

function createJsonResponse(statusCode, message = "") {
    const response = {
      statusCode,
      body: JSON.stringify({
        status: statusCode,
        message: message
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    };
    return response;
}
