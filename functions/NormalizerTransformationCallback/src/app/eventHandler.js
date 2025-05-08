"use strict";
const {
    S3Client,
    GetObjectTaggingCommand,
    PutObjectTaggingCommand
} = require("@aws-sdk/client-s3");
const { parseS3Uri } = require("@aws-sdk/util-uri-escape");

const s3 = new S3Client({});


exports.handleEvent = async function(event) {
    try {
        console.log("Received event:", JSON.stringify(event));

        await Promise.all(
            event.Records.map(async (record) => {
                const bodyData = JSON.parse(record.body);

                const checkResult = bodyData.checkResult;
                const outputPath = bodyData.outputPath;

                const parsedUri = parseS3Uri(outputPath);
                
                if (!parsedUri || parsedUri === "") {
                    throw new Error(`Invalid S3 URI: ${outputPath}`);
                }

                console.log("Normalization CheckResult:", checkResult);

                const BUCKET_NAME = parsedUri.bucket;
                const FILE_KEY = parsedUri.key;

                // Recupera i tag esistenti
                const tagResponse = await s3.send(new GetObjectTaggingCommand({
                    Bucket: BUCKET_NAME,
                    Key: FILE_KEY
                }));


                // Cerca se il tag "Transformation-NORMALIZATION" è già presente
                const normalizationTag = tagResponse.TagSet.find(tag => tag.Key === "Transformation-NORMALIZATION");
                

                if (!normalizationTag) {
                    const tagValue = checkResult ? "OK" : "ERROR";
                    const tagSettings = {
                        Bucket: BUCKET_NAME,
                        Key: FILE_KEY,
                        Tagging: {
                            TagSet: [{
                                Key: "Transformation-NORMALIZATION",
                                Value: tagValue,
                            }],
                        }
                    };
                    const command = new PutObjectTaggingCommand(tagSettings);
                    await s3.send(command);
                    console.log("New Tag Set:", tagSettings.Tagging.TagSet);
                } else {
                    console.log("Normalization tag found:", normalizationTag);

                    console.log("The 'Transformation-NORMALIZATION' tag is already present, no action needed.");
                }
            })
        );

        return {
            statusCode: 200,
        };
    } catch (error) {
        console.error("ERROR: ", error);
      
        const errorCode = error?.code || error?.Code || error?.name;
      
        if (errorCode === 'NoSuchBucket' || errorCode === 'NoSuchKey') {
            return {
            statusCode: 400,
            body: errorCode
          };
        } else {
          return {
            statusCode: 500,
            body: "Error during normalization processing."
          };
        }
      }
      
};
