"use strict";

const http = require(process.env.PnSsGestoreRepositoryProtocol);


exports.handleEvent = async (event) => {
  const beyonDocApiUrl = process.env.BEYONDOC_API_URL;
  const margins = process.env.NORMALIZER_MARGINS || '2';

  console.log("Event SQS Received :", JSON.stringify(event));

  const batchItemFailures = [];
  await Promise.allSettled(
    event.Records.map(async (record) => {
      await processSqsRecord(record, beyonDocApiUrl, margins, batchItemFailures);
    })
  );

  console.log("####### END SQS #######");
  return { batchItemFailures };
};

// funzione creazione body da passare a BeyondDoc
const processSqsRecord = async (record, beyonDocApiUrl, margins, batchItemFailures) => {
  try {
    const body = JSON.parse(record.body);
    const inputPath = body.inputPath;

    if (!inputPath) {
      console.error("Error: 'inputPath' not found:", body);
      batchItemFailures.push({ itemIdentifier: record.messageId });
      return;
    }

    await callBeyonDocApi(beyonDocApiUrl, inputPath, margins);

  } catch (error) {
    console.error("Errore calling API BeyonDoc:", error.message);
    batchItemFailures.push({ itemIdentifier: record.messageId });
  }
};

// funzione per chiamare l'API BeyondDoc
const callBeyonDocApi = async (beyonDocApiUrl, inputPath, margins) => {
  return new Promise((resolve, reject) => {
    const payload = {
      inputPath: inputPath,
      margins: parseInt(margins, 10),
    };

    console.log(`Chiamata all'API BeyonDoc: ${beyonDocApiUrl}/beyondoc/api/v1/notify-input-pdf-uploaded with payload:`, payload);

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(
      `${beyonDocApiUrl}`,
      options,
      (res) => {
        let responseBody = '';

        res.on('data', (chunk) => {
          responseBody += chunk;
        });

        res.on('end', () => {
          console.log(`Risposta BeyondDoc (${res.statusCode}):`, responseBody);

          switch (res.statusCode) {
            case 200:
              try {
              resolve(JSON.parse(responseBody));
              } catch (error) {
                console.error("Errore parsing JSON:", error.message);
                reject(new Error(`Errore parsing JSON: ${error.message}`));
              }
              break;

            default:
              console.error(`Errore API BeyondDoc (${res.statusCode}):`, responseBody);
              reject(new Error(`${res.statusCode} - ${responseBody}`));
              break;
          }
        });
      }
    );

    req.on('error', (error) => {
      console.error("Errore request HTTP:", error.message);
      reject(error);
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
};

