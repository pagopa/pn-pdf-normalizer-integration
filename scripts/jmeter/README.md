# Esecuzione Test JMeter da linea di comando

## Prerequisiti

* Apache JMeter installato e configurato 
* WSL o ambiente linux disponibile

## Comando per eseguire il test

```bash
jmeter.sh -n -t RemediationST.jmx -e -o ./report -l results.txt
```

## Report

Una volta completata l’esecuzione il report sarà disponibile al path specificato nel comando (default `./report/index.html`).
