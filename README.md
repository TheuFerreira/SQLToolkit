# CsvConverter

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.27.

## Conversão de coordenadas DMS para DD

As funções abaixo convertem coordenadas em graus, minutos e segundos (DMS) para graus decimais (DD). Elas aceitam `°`, `º` ou `§` como marcador de grau. Por exemplo, `-22° 32' 50"` retorna aproximadamente `-22.5472222222`.

```javascript
function converterDmsParaDd(valor, limite) {
  const correspondencia = /^\s*([+-]?\d+)\s*(?:°|º|§)?\s*(\d{1,2})\s*'\s*(\d{1,2}(?:[.,]\d+)?)\s*"\s*$/.exec(valor);

  if (!correspondencia) {
    throw new Error('Coordenada inválida. Use o formato: -22° 32\' 50".');
  }

  const grausComSinal = Number(correspondencia[1]);
  const graus = Math.abs(grausComSinal);
  const minutos = Number(correspondencia[2]);
  const segundos = Number(correspondencia[3].replace(',', '.'));

  if (minutos >= 60 || segundos >= 60) {
    throw new Error('Minutos e segundos devem ser menores que 60.');
  }

  if (graus > limite || (graus === limite && (minutos > 0 || segundos > 0))) {
    throw new Error(`A coordenada excede o limite de ${limite} graus.`);
  }

  const sinal = grausComSinal < 0 ? -1 : 1;
  return sinal * (graus + minutos / 60 + segundos / 3600);
}

function converterLatitudeDmsParaDd(valor) {
  return converterDmsParaDd(valor, 90);
}

function converterLongitudeDmsParaDd(valor) {
  return converterDmsParaDd(valor, 180);
}
```

Exemplos:

```javascript
converterLatitudeDmsParaDd('-22° 32\' 50"');  // -22.54722222222222
converterLongitudeDmsParaDd('43§ 12\' 30"'); // 43.208333333333336
```

### Usar a conversão na interface

Após importar o CSV, escolha **Latitude DMS → DD** ou **Longitude DMS → DD** no seletor de tipo da coluna. A interface usa as mesmas funções `converterLatitudeDmsParaDd` e `converterLongitudeDmsParaDd`, exportadas por [`src/app/coordinate-conversion.ts`](src/app/coordinate-conversion.ts). Valores DMS válidos são convertidos em números decimais; se a conversão falhar, o valor original é mantido como texto no SQL.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
