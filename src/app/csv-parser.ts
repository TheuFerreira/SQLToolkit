export type CsvDelimiter = ',' | ';' | '\t';

export interface CsvRecord {
  values: string[];
  line: number;
}

export function detectDelimiter(text: string): CsvDelimiter {
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const counts = new Map<CsvDelimiter, number>([[',', 0], [';', 0], ['\t', 0]]);
  let quoted = false;
  let hasContent = false;

  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === '\n') {
      if (hasContent) break;
    } else if (!quoted && counts.has(character as CsvDelimiter)) {
      counts.set(character as CsvDelimiter, counts.get(character as CsvDelimiter)! + 1);
      hasContent = true;
    } else if (character.trim()) {
      hasContent = true;
    }
  }

  return [...counts].reduce((best, current) => current[1] > best[1] ? current : best)[0];
}

export function parseCsv(text: string, delimiter: CsvDelimiter): CsvRecord[] {
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const records: CsvRecord[] = [];
  let values: string[] = [];
  let value = '';
  let line = 1;
  let rowLine = 1;
  let quoted = false;
  let closedQuote = false;
  let fieldStarted = false;
  let rowHadQuote = false;

  const finishField = () => {
    values.push(value);
    value = '';
    closedQuote = false;
    fieldStarted = false;
  };

  const finishRecord = () => {
    finishField();
    if (values.length > 1 || rowHadQuote || values[0].trim()) {
      records.push({ values, line: rowLine });
    }
    values = [];
    rowHadQuote = false;
  };

  for (let index = 0; index < input.length; index++) {
    const character = input[index];

    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        value += character;
        if (character === '\n') line++;
      }
    } else if (character === delimiter) {
      finishField();
    } else if (character === '\n') {
      finishRecord();
      line++;
      rowLine = line;
    } else if (character === '"') {
      if (fieldStarted || closedQuote) {
        throw new Error(`Linha ${line}: aspas fora do início do campo.`);
      }
      quoted = true;
      fieldStarted = true;
      rowHadQuote = true;
    } else if (closedQuote) {
      if (character !== ' ' && character !== '\t') {
        throw new Error(`Linha ${line}: caractere após o fechamento das aspas.`);
      }
    } else {
      value += character;
      fieldStarted = true;
    }
  }

  if (quoted) throw new Error(`Linha ${rowLine}: campo entre aspas não foi fechado.`);
  finishRecord();

  if (records.length === 0) return records;
  const width = records[0].values.length;
  for (let index = 1; index < records.length; index++) {
    const record = records[index];
    if (record.values.length !== width) {
      throw new Error(
        `Linha ${record.line}: ${record.values.length} coluna(s); o cabeçalho tem ${width}. Verifique o separador e as aspas.`,
      );
    }
  }
  return records;
}
