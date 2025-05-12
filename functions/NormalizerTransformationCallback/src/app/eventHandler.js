"use strict";
const {
    S3Client,
    GetObjectTaggingCommand,
    PutObjectTaggingCommand
} = require("@aws-sdk/client-s3");
const AmazonS3URI = require('amazon-s3-uri')

const s3 = new S3Client({});

exports.handleEvent = async function(event) {
    try {
        console.log("Received event:", JSON.stringify(event));

        await Promise.all(
            event.Records.map(async (record) => {
                const bodyData = JSON.parse(record.body);

                const checkResult = bodyData.checkResult;
                const outputPath = bodyData.outputPath;
                const { REGION, BUCKET_NAME, FILE_KEY } = AmazonS3URI(outputPath);
                console.log("Normalization CheckResult:", checkResult);

                const TAG_KEY = "Transformation-NORMALIZATION";

                // Recupera i tag esistenti
                const tagResponse = await s3.send(new GetObjectTaggingCommand({
                    Bucket: BUCKET_NAME,
                    Key: FILE_KEY
                }));


                // Cerca se il tag "Transformation-NORMALIZATION" è già presente
                const normalizationTag = tagResponse.TagSet.find(tag => tag.Key === TAG_KEY);
                

                if (!normalizationTag) {
                    const tagValue = checkResult ? "OK" : "ERROR";
                    const tagSettings = {
                        Bucket: BUCKET_NAME,
                        Key: FILE_KEY,
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
                    console.log("The '"+TAG_KEY+"' tag is already present, no action needed.");
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
