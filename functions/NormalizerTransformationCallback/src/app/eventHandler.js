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

        await Promise.allSettled(
            event.Records.map(async (record) => {
                const bodyData = JSON.parse(record.body);

                const checkResult = bodyData.checkResult;
                const outputPath = bodyData.outputPath;

                const parsedUri = parseS3Uri(outputPath);
                if (!parsedUri) {
                    console.error("L'URI S3 non è valido:", outputPath);
                    return;
                }

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
                    // Se il tag non esiste, aggiungiamolo
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

                    // Aggiungi il nuovo tag
                    const command = new PutObjectTaggingCommand(tagSettings);
                    await s3.send(command);

                    console.log("nuovo Tag impostato", tagSettings.Tagging.TagSet)
                } else {
                    console.log("Il tag 'Transformation-NORMALIZATION' è già presente, nessuna azione necessaria.");
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
