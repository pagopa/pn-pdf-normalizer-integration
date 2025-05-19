"use strict";
const {
    S3Client,
    GetObjectTaggingCommand,
    PutObjectTaggingCommand
} = require("@aws-sdk/client-s3");

const s3 = new S3Client({});

exports.handleEvent = async function (event) {
    try {
        console.log("Received event:", JSON.stringify(event));

        const bodyData = JSON.parse(event.body);

        const checkResult = bodyData.checkResult;
        const { bucketName, fileKey } = parseS3Uri(bodyData.pdffileName);

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

        var statusCode;
        var responseBody = {};

        if (errorCode === 'NoSuchBucket' || errorCode === 'NoSuchKey') {
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
