import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { converterLatitudeDmsParaDd, converterLongitudeDmsParaDd } from './coordinate-conversion';
import { CsvDelimiter, CsvRecord, detectDelimiter, parseCsv } from './csv-parser';

type ColumnType = 'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'latitudeDms' | 'longitudeDms';
type DefaultMode = 'value' | 'javascript' | 'sql';
type InsertMode = 'separate' | 'single';
type CsvEncoding = 'auto' | 'utf-8' | 'windows-1252';

interface ColumnDefinition {
  originalName: string;
  name: string;
  enabled: boolean;
  type: ColumnType;
  defaultValue: string;
  defaultMode: DefaultMode;
}

interface ActiveColumn {
  column: ColumnDefinition;
  index: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly previewLimit = 100;
  private readonly downloadBatchSize = 500;
  readonly columnTypes: { value: ColumnType; label: string }[] = [
    { value: 'string', label: 'Texto' },
    { value: 'integer', label: 'Inteiro' },
    { value: 'decimal', label: 'Decimal' },
    { value: 'boolean', label: 'Booleano' },
    { value: 'date', label: 'Data' },
    { value: 'latitudeDms', label: 'Latitude DMS → DD' },
    { value: 'longitudeDms', label: 'Longitude DMS → DD' },
  ];

  tableName = 'minha_tabela';
  fileName = '';
  fileMeta = '';
  generatedSql = '';
  rowCount = 0;
  statusText = 'Aguardando arquivo';
  copied = false;
  insertMode: InsertMode = 'separate';
  csvEncoding: CsvEncoding = 'auto';
  csvDelimiter: 'auto' | CsvDelimiter = 'auto';
  delimiterLabel = 'automático';
  previewRowCount = 0;
  errorText = '';
  isGeneratingDownload = false;
  newColumnName = '';
  columns: ColumnDefinition[] = [];

  private selectedFile?: File;
  private fileBytes?: ArrayBuffer;
  private dataRows: CsvRecord[] = [];
  private dmsConversionFailures = 0;
  private revision = 0;

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.readFile(file);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) this.readFile(file);
  }

  async readFile(file: File): Promise<void> {
    if (!this.isCsvFile(file)) {
      this.reset();
      this.errorText = 'Selecione um arquivo CSV válido';
      this.statusText = this.errorText;
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.reset();
      this.errorText = 'O arquivo deve ter no máximo 10 MB';
      this.statusText = this.errorText;
      return;
    }

    this.selectedFile = file;
    this.revision++;
    this.fileBytes = undefined;
    this.dataRows = [];
    this.columns = [];
    this.generatedSql = '';
    this.rowCount = 0;
    this.fileName = '';
    this.fileMeta = '';
    this.previewRowCount = 0;
    this.errorText = '';
    this.statusText = 'Lendo arquivo...';
    try {
      const bytes = await file.arrayBuffer();
      if (this.selectedFile !== file) return;
      this.fileBytes = bytes;
      this.decodeSelectedFile();
    } catch {
      if (this.selectedFile === file) this.statusText = 'Não foi possível ler o arquivo';
    }
  }

  onEncodingChange(): void {
    if (this.fileBytes) this.decodeSelectedFile();
  }

  onDelimiterChange(): void {
    if (this.fileBytes) this.decodeSelectedFile();
  }

  private decodeSelectedFile(): void {
    if (!this.fileBytes) return;

    try {
      const bytes = new Uint8Array(this.fileBytes);
      let encoding: string = this.csvEncoding;

      if (encoding === 'auto') {
        if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
          encoding = 'utf-16le';
        } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
          encoding = 'utf-16be';
        } else {
          try {
            new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            encoding = 'utf-8';
          } catch {
            encoding = 'windows-1252';
          }
        }
      }

      let text: string;
      try {
        text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      } catch {
        throw new Error('Codificação inválida. Selecione Automático ou Windows-1252.');
      }
      this.loadCsv(text, encoding);
    } catch (error) {
      this.columns = [];
      this.dataRows = [];
      this.generatedSql = '';
      this.rowCount = 0;
      this.previewRowCount = 0;
      this.fileName = '';
      this.fileMeta = '';
      this.errorText = error instanceof Error ? error.message : 'Não foi possível interpretar o CSV.';
      this.statusText = this.errorText;
    }
  }

  updateTableName(): void {
    this.updateSql();
  }

  updateColumnNames(): void {
    this.updateSql();
  }

  setInsertMode(mode: InsertMode): void {
    this.insertMode = mode;
    this.updateSql();
  }

  addColumn(): void {
    const name = this.newColumnName.trim();
    if (!name) return;

    if (this.columns.some(column => this.hasSameName(column.name, name))) {
      this.statusText = 'Já existe uma coluna com esse nome';
      return;
    }

    this.columns = [...this.columns, this.createColumn(name, 'Nova coluna')];
    this.newColumnName = '';
    this.updateSql();
  }

  async copySql(): Promise<void> {
    if (!this.generatedSql) return;

    await navigator.clipboard.writeText(this.generatedSql);
    this.copied = true;
    setTimeout(() => this.copied = false, 1600);
  }

  async downloadSql(): Promise<void> {
    if (!this.generatedSql || this.isGeneratingDownload) return;

    const revision = this.revision;
    const rows = this.dataRows;
    const columns = this.getActiveColumns().map(({ column, index }) => ({ column: { ...column }, index }));
    const table = this.tableName.trim() || 'minha_tabela';
    const columnList = columns.map(({ column }) => this.escapeIdentifier(this.getColumnName(column))).join(', ');
    const mode = this.insertMode;
    const parts: BlobPart[] = [];
    this.isGeneratingDownload = true;
    this.statusText = 'Gerando arquivo SQL...';

    try {
      if (mode === 'single') parts.push(`INSERT INTO ${this.escapeIdentifier(table)} (${columnList})\nVALUES\n`);

      for (let start = 0; start < rows.length; start += this.downloadBatchSize) {
        if (revision !== this.revision) return;
        const batch = rows.slice(start, start + this.downloadBatchSize);
        const tuples = batch.map(row => this.createValuesTuple(columns, row));
        if (mode === 'single') {
          parts.push(start > 0 ? ',\n' : '');
          parts.push(tuples.map(tuple => `  ${tuple}`).join(',\n'));
        } else {
          parts.push(start > 0 ? '\n\n' : '');
          parts.push(tuples.map(tuple => this.createInsertStatement(table, columnList, tuple)).join('\n\n'));
        }
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }

      if (revision !== this.revision) return;
      if (mode === 'single') parts.push(';');
      const fileContent = new Blob(parts, { type: 'application/sql;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(fileContent);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = this.getSqlFileName();
      link.click();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      this.statusText = 'Arquivo SQL pronto';
    } catch (error) {
      if (revision !== this.revision) return;
      this.setGenerationError(error);
    } finally {
      this.isGeneratingDownload = false;
    }
  }

  reset(): void {
    this.revision++;
    this.selectedFile = undefined;
    this.fileBytes = undefined;
    this.dataRows = [];
    this.columns = [];
    this.fileName = '';
    this.fileMeta = '';
    this.generatedSql = '';
    this.rowCount = 0;
    this.previewRowCount = 0;
    this.errorText = '';
    this.delimiterLabel = 'automático';
    this.newColumnName = '';
    this.statusText = 'Aguardando arquivo';
    this.copied = false;
  }

  private isCsvFile(file: File): boolean {
    return file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
  }

  private loadCsv(text: string, encoding: string): void {
    this.revision++;
    this.errorText = '';
    const delimiter = this.csvDelimiter === 'auto' ? detectDelimiter(text) : this.csvDelimiter;
    this.delimiterLabel = delimiter === ',' ? 'vírgula' : delimiter === ';' ? 'ponto e vírgula' : 'tabulação';
    const [headerRow, ...dataRows] = parseCsv(text, delimiter);

    if (!headerRow || dataRows.length === 0) {
      this.columns = [];
      this.dataRows = [];
      this.generatedSql = '';
      this.rowCount = 0;
      this.previewRowCount = 0;
      this.errorText = 'O CSV precisa ter cabeçalho e ao menos uma linha';
      this.statusText = this.errorText;
      return;
    }

    this.columns = headerRow.values.map((header, index) => {
      const name = header.trim() || `coluna_${index + 1}`;
      return this.createColumn(name, name);
    });
    this.dataRows = dataRows;
    this.rowCount = dataRows.length;
    this.fileName = this.selectedFile?.name ?? '';
    this.fileMeta = `${this.rowCount} registros · ${((this.selectedFile?.size ?? 0) / 1024).toFixed(1)} KB · ${encoding.toUpperCase()} · ${this.delimiterLabel}`;
    this.updateSql();
  }

  private createColumn(name: string, originalName: string): ColumnDefinition {
    return {
      originalName,
      name,
      enabled: true,
      type: 'string',
      defaultValue: '',
      defaultMode: 'value',
    };
  }

  private updateSql(): void {
    this.revision++;
    this.errorText = '';
    if (this.dataRows.length === 0 || this.columns.length === 0) return;

    const activeColumns = this.getActiveColumns();
    if (activeColumns.length === 0) {
      this.generatedSql = '';
      this.statusText = 'Ative ao menos uma coluna para gerar o SQL';
      return;
    }

    const table = this.tableName.trim() || 'minha_tabela';
    const headers = activeColumns.map(({ column }) => this.getColumnName(column));
    const columnList = headers.map(header => this.escapeIdentifier(header)).join(', ');

    this.dmsConversionFailures = 0;
    this.previewRowCount = Math.min(this.dataRows.length, this.previewLimit);
    try {
      const valueTuples = this.dataRows
        .slice(0, this.previewLimit)
        .map(row => this.createValuesTuple(activeColumns, row));
      this.generatedSql = this.insertMode === 'single'
        ? this.createSingleInsert(table, columnList, valueTuples)
        : valueTuples.map(tuple => this.createInsertStatement(table, columnList, tuple)).join('\n\n');
      this.validateDefaultsBeyondPreview(activeColumns);
      this.statusText = this.dmsConversionFailures > 0
        ? `${this.dmsConversionFailures} valor(es) DMS mantido(s) como texto na prévia`
        : this.rowCount > this.previewLimit ? 'Prévia limitada; o download inclui todos os registros' : 'Pronto para copiar';
      this.copied = false;
    } catch (error) {
      this.setGenerationError(error);
    }
  }

  private getActiveColumns(): ActiveColumn[] {
    return this.columns
      .map((column, index) => ({ column, index }))
      .filter(({ column }) => column.enabled);
  }

  private validateDefaultsBeyondPreview(columns: ActiveColumn[]): void {
    for (const { column, index } of columns) {
      if (column.defaultMode !== 'javascript' || !column.defaultValue.trim()) continue;
      let row: CsvRecord | undefined;
      for (let rowIndex = this.previewLimit; rowIndex < this.dataRows.length; rowIndex++) {
        if (!(this.dataRows[rowIndex].values[index] ?? '').trim()) {
          row = this.dataRows[rowIndex];
          break;
        }
      }
      if (!row) continue;
      try {
        this.evaluateJavaScriptDefault(column.defaultValue.trim(), column.type);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'erro desconhecido';
        throw new Error(`Linha ${row.line}, coluna "${this.getColumnName(column)}": ${reason}`);
      }
    }
  }

  private getColumnName(column: ColumnDefinition): string {
    return column.name.trim() || column.originalName;
  }

  private createInsertStatement(
    table: string,
    columnList: string,
    values: string,
  ): string {
    return `INSERT INTO ${this.escapeIdentifier(table)} (${columnList})\nVALUES (${values});`;
  }

  private createSingleInsert(table: string, columnList: string, valueTuples: string[]): string {
    const values = valueTuples.map(tuple => `  ${tuple}`).join(',\n');
    return `INSERT INTO ${this.escapeIdentifier(table)} (${columnList})\nVALUES\n${values};`;
  }

  private createValuesTuple(columns: ActiveColumn[], row: CsvRecord): string {
    const values = columns
      .map(({ column, index }) => {
        try {
          return this.convertColumnValue(row.values[index] ?? '', column);
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'erro desconhecido';
          throw new Error(`Linha ${row.line}, coluna "${this.getColumnName(column)}": ${reason}`);
        }
      })
      .join(', ');
    return `(${values})`;
  }

  private convertColumnValue(value: string, column: ColumnDefinition): string {
    if (value.trim()) return this.convertValue(value, column.type);

    const defaultValue = column.defaultValue.trim();
    if (!defaultValue) return 'NULL';
    switch (column.defaultMode) {
      case 'sql':
        return defaultValue;
      case 'javascript':
        return this.evaluateJavaScriptDefault(defaultValue, column.type);
      case 'value':
      default:
        return this.convertValue(defaultValue, column.type);
    }
  }

  private evaluateJavaScriptDefault(source: string, type: ColumnType): string {
    try {
      const createFunction = new Function(`"use strict"; return (${source});`) as () => unknown;
      const callback = createFunction();
      if (typeof callback !== 'function') throw new TypeError('O valor informado não é uma função');

      const result = (callback as () => unknown)();
      return result === null || result === undefined
        ? 'NULL'
        : this.convertValue(String(result), type);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'erro desconhecido';
      throw new Error(`função JavaScript padrão falhou: ${reason}`);
    }
  }

  private setGenerationError(error: unknown): void {
    this.generatedSql = '';
    this.previewRowCount = 0;
    this.errorText = error instanceof Error ? error.message : 'Não foi possível gerar o SQL.';
    this.statusText = 'Corrija o erro antes de copiar ou baixar o SQL';
  }

  private convertValue(value: string, type: ColumnType): string {
    const cleanValue = value.trim();
    if (!cleanValue) return 'NULL';

    switch (type) {
      case 'integer':
        return this.convertInteger(cleanValue);
      case 'decimal':
        return this.convertDecimal(cleanValue);
      case 'boolean':
        return this.convertBoolean(cleanValue);
      case 'date':
        return this.isValidIsoDate(cleanValue) ? `'${cleanValue}'` : this.escapeString(cleanValue);
      case 'latitudeDms':
        return this.convertDmsCoordinate(cleanValue, converterLatitudeDmsParaDd);
      case 'longitudeDms':
        return this.convertDmsCoordinate(cleanValue, converterLongitudeDmsParaDd);
      case 'string':
      default:
        return this.escapeString(cleanValue);
    }
  }

  private convertInteger(value: string): string {
    if (!/^[+-]?\d+$/.test(value)) return this.escapeString(value);

    const integer = Number(value);
    return Number.isSafeInteger(integer) ? String(integer) : this.escapeString(value);
  }

  private convertDecimal(value: string): string {
    const isDecimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value);
    const decimal = Number(value);
    return isDecimal && Number.isFinite(decimal) ? String(decimal) : this.escapeString(value);
  }

  private convertBoolean(value: string): string {
    if (/^(true|1|yes|sim)$/i.test(value)) return 'TRUE';
    if (/^(false|0|no|não|nao)$/i.test(value)) return 'FALSE';
    return this.escapeString(value);
  }

  private convertDmsCoordinate(value: string, convert: (coordinate: string) => number): string {
    try {
      return String(convert(value));
    } catch {
      this.dmsConversionFailures++;
      return this.escapeString(value);
    }
  }

  private escapeString(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
  }

  private escapeIdentifier(value: string): string {
    return `"${value.trim().replaceAll('"', '""')}"`;
  }

  private hasSameName(first: string, second: string): boolean {
    return first.trim().toLocaleLowerCase() === second.trim().toLocaleLowerCase();
  }

  private getSqlFileName(): string {
    const safeTableName = (this.tableName.trim() || 'minha_tabela')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
    return `${safeTableName}.sql`;
  }

  private isValidIsoDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }
}
