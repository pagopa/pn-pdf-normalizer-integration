#!/bin/bash

set -e

if [ "$#" -lt 5 ]; then
  echo "Usage: $0 <input_pdf_path> <bucket_name> <file_key> <queue_url> <json_payload> [aws_profile] [aws_region]"
  exit 1
fi

INPUT_PDF_PATH="$1"   # es. /path/to/file.pdf
BUCKET_NAME="$2"      # es. pn-safestorage-staging-eu-south-1-089813480515
FILE_KEY="$3"         # es. TEST_NORMALIZATION-abc123.pdf
QUEUE_URL="$4"        # es. https://sqs.eu-south-1.amazonaws.com/123456789012/my-queue
PAYLOAD="$5"          # il messaggio JSON da inviare (stringa)

AWS_PROFILE_OPTIONAL="$6"

if [ -n "$AWS_PROFILE_OPTIONAL" ]; then
  export AWS_PROFILE="$AWS_PROFILE_OPTIONAL"
  echo "Using AWS_PROFILE: $AWS_PROFILE"
fi

export AWS_REGION="eu-south-1"

echo "Uploading file $INPUT_PDF_PATH to s3://$BUCKET_NAME/$INPUT_PDF_PATH..."

aws s3 cp "$INPUT_PDF_PATH" "s3://$BUCKET_NAME/$FILE_KEY"
UPLOAD_EXIT_CODE=$?

if [ $UPLOAD_EXIT_CODE -ne 0 ]; then
  echo "Upload failed with exit code $UPLOAD_EXIT_CODE"
  exit $UPLOAD_EXIT_CODE
fi

echo "Upload succeeded. Sending message to queue $QUEUE_NAME..."
echo "Payload : $PAYLOAD"

echo "Sending message to queue $QUEUE_URL..."
aws sqs send-message --queue-url "$QUEUE_URL" --message-body "$PAYLOAD"
SEND_EXIT_CODE=$?

if [ $SEND_EXIT_CODE -ne 0 ]; then
  echo "Sending message failed with exit code $SEND_EXIT_CODE"
  exit $SEND_EXIT_CODE
fi

echo "Message sent successfully."

exit 0
