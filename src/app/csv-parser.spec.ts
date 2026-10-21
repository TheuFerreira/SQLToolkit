import { detectDelimiter, parseCsv } from './csv-parser';

describe('CSV parsing', () => {
  it('detects semicolons outside quoted fields', () => {
    const csv = 'nome;observação\n"Ana, Maria";"texto; com separador"';
    expect(detectDelimiter(csv)).toBe(';');
    expect(parseCsv(csv, ';')).toEqual([
      { values: ['nome', 'observação'], line: 1 },
      { values: ['Ana, Maria', 'texto; com separador'], line: 2 },
    ]);
  });

  it('keeps line numbers when a quoted field spans lines', () => {
    const rows = parseCsv('nome,nota\nAna,"primeira\nsegunda"\nBia,ok', ',');
    expect(rows[1]).toEqual({ values: ['Ana', 'primeira\nsegunda'], line: 2 });
    expect(rows[2].line).toBe(4);
  });

  it('rejects an unclosed quoted field', () => {
    expect(() => parseCsv('nome,nota\nAna,"sem fim', ','))
      .toThrowError('Linha 2: campo entre aspas não foi fechado.');
  });

  it('rejects rows with a different number of columns', () => {
    expect(() => parseCsv('nome,idade\nAna,31\nBia', ','))
      .toThrowError('Linha 3: 1 coluna(s); o cabeçalho tem 2. Verifique o separador e as aspas.');
  });

  it('rejects quotes in the middle of an unquoted field', () => {
    expect(() => parseCsv('nome,nota\nAna,texto"incorreto', ','))
      .toThrowError('Linha 2: aspas fora do início do campo.');
  });

  it('preserves a record whose fields are all empty', () => {
    expect(parseCsv('nome,id\n,', ',')[1]).toEqual({ values: ['', ''], line: 2 });
  });
});
