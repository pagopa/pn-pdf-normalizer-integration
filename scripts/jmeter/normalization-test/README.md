# Esecuzione Test JMeter da linea di comando

## Prerequisiti

* Apache JMeter installato e configurato
* WSL o ambiente Linux disponibile
* AWS CLI configurato con profilo funzionante

## Comando per eseguire il test

```bash
jmeter.sh -n \
  -t RemediationST.jmx \               # File del test JMeter
  -JINPUT_PDF_PATH="TEST.pdf" \        # Percorso al file PDF da caricare
  -JBUCKET_NAME="<nome_bucket_s3>" \   # Nome del bucket S3 di destinazione
  -JQUEUE_URL="<url_coda_sqs>" \       # URL della coda SQS
  -JAWS_PROFILE="<profilo_aws>" \      # (Opzionale) Nome del profilo AWS CLI da usare
  -JAWS_REGION="<aws_region>" \        # Regione AWS 
  -JKMS_KEY_ARN="<kms_key_arn>" \      # ARN della chiave KMS per crittografia
  -l results.jtl \                     # File di log dei risultati
  -e -o ./report                       # Abilitazione e path output report HTML
```
