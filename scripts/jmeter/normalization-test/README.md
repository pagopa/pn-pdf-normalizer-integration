# Esecuzione Test JMeter da linea di comando

## Prerequisiti

* Apache JMeter installato e configurato
* WSL o ambiente linux disponibile
* AWS CLI configurato con profilo funzionante (es. `dev_confinfo`)
* Script `script.sh` con permessi di esecuzione (`chmod +x script.sh`)
## Comando per eseguire il test

```bash
jmeter.sh -n \ 
  -t RemediationST.jmx \                    # File del test JMeter
  -JINPUT_PDF_PATH="<percorso_file_pdf>" \  # Percorso al file PDF da caricare
  -JBUCKET_NAME="<nome_bucket_s3>" \        # Nome del bucket S3 di destinazione
  -JQUEUE_URL="<url_coda_sqs>" \            # URL della coda SQS
  -JAWS_PROFILE="<profilo_aws>" \           # Nome del profilo AWS CLI da usare
  -l results.jtl \                          # File di log dei risultati
  -e -o ./report                            # Abilitazione e path output report HTML
```
