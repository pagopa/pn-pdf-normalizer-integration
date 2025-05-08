"use strict";
const {
    S3Client,
    GetObjectTaggingCommand,
    PutObjectTaggingCommand
} = require("@aws-sdk/client-s3");
const { parseS3Uri } = require("@aws-sdk/util-uri-escape");

const s3 = new S3Client({});


// Funzione principale che gestisce l'evento
exports.handleEvent = async function(event) {
    try {
        console.log("Received event:", JSON.stringify(event));

        // Itera su ogni record nell'evento
        await Promise.all(
            event.Records.map(async (record) => {
                const { bucket, key } = parseS3UriFromEvent(record);

                console.log("Normalization CheckResult:", record.body.checkResult);

                // Recupera i tag esistenti
                const existingTags = await getExistingTags(bucket, key);

                // Verifica se il tag "Transformation-NORMALIZATION" è già presente
                const normalizationTag = existingTags.find(tag => tag.Key === "Transformation-NORMALIZATION");

                if (!normalizationTag) {
                    const tagValue = record.body.checkResult ? "OK" : "ERROR";
                    await addTagToS3Object(bucket, key, tagValue);
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
        return handleError(error);
    }
};



// Funzione per analizzare l'URI S3 e ottenere il nome del bucket e la chiave del file
function parseS3UriFromEvent(event) {
    const bodyData = JSON.parse(event.body);
    const outputPath = bodyData.outputPath;
    const parsedUri = parseS3Uri(outputPath);

    if (!parsedUri || parsedUri === "") {
        throw new Error(`Invalid S3 URI: ${outputPath}`);
    }

    return {
        bucket: parsedUri.bucket,
        key: parsedUri.key,
    };
}

// Funzione per recuperare i tag esistenti per un oggetto S3
async function getExistingTags(bucket, key) {
    const tagResponse = await s3.send(new GetObjectTaggingCommand({
        Bucket: bucket,
        Key: key
    }));

    return tagResponse.TagSet;
}

// Funzione per aggiungere un tag a un oggetto S3
async function addTagToS3Object(bucket, key, tagValue) {
    const tagSettings = {
        Bucket: bucket,
        Key: key,
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
}

// Funzione per gestire gli errori e determinare la risposta adeguata
function handleError(error) {

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


