"use strict";
const {
    S3Client,
    CopyObjectCommand,
    GetObjectTaggingCommand,
    DeleteObjectCommand
} = require("@aws-sdk/client-s3");
const {
    parseS3Uri
} = require("@aws-sdk/util-uri-escape");

const s3 = new S3Client();

const BUCKET_NAME = "";
const FILE_KEY = "";

let checkResult = "";
let mainErrorReason = "";
let outputPath = "";
let correlationId = "";

let tagValue = "";

exports.handleEvent = async function(event) {
    try {
        console.log("Received event:", JSON.stringify(event));

        await Promise.allSettled(
            event.Records.map(async (record) => {
                const bodyData = JSON.parse(record.body);

                checkResult = bodyData.checkResult;
                mainErrorReason = bodyData.mainErrorReason;
                outputPath = bodyData.outputPath;
                correlationId = bodyData.correlationId;

                const parsedUri = parseS3Uri(outputPath);

                if (parsedUri) {
                    BUCKET_NAME = parsedUri.bucket;
                    FILE_KEY = parsedUri.key;
                } else {
                    console.error("L'URI S3 non è valido:", outputPath);
                }

                const tagResponse = await s3.send(new GetObjectTaggingCommand({
                    Bucket: BUCKET_NAME,
                    Key: FILE_KEY
                }));

                const normalizationTag = tagResponse.TagSet.find(tag => tag.Key === "Transformation-NORMALIZATION");
                if (!normalizationTag) {

                    if (checkResult) {
                        tagValue = "OK";
                    } else {
                        tagValue = "ERROR";
                    }

                    let tagSettings = {
                        Bucket: BUCKET_NAME,
                        Key: FILE_KEY,
                        Tagging: {
                            TagSet: [{
                                Key: "Transformation-NORMALIZATION",
                                Value: tagValue,
                            }, ],
                        }
                    };

                    const command = new PutObjectTaggingCommand(tagSettings);
                    const response = await client.send(command);

                }

            })
        );

        return {
            statusCode: 200,
            body: "Process completed successfully!"
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: "Error during normalization processing."
        };
    }
};