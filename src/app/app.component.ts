import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

type ColumnType = 'string' | 'integer' | 'decimal' | 'boolean' | 'date';

interface ColumnDefinition {
  originalName: string;
  name: string;
  enabled: boolean;
  type: ColumnType;
  defaultValue: string;
  defaultIsFunction: boolean;
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
  readonly columnTypes: { value: ColumnType; label: string }[] = [
    { value: 'string', label: 'Texto' },
    { value: 'integer', label: 'Inteiro' },
    { value: 'decimal', label: 'Decimal' },
    { value: 'boolean', label: 'Booleano' },
    { value: 'date', label: 'Data' },
  ];

  tableName = 'minha_tabela';
  fileName = '';
  fileMeta = '';
  generatedSql = '';
  rowCount = 0;
  statusText = 'Aguardando arquivo';
  copied = false;
  newColumnName = '';
  columns: ColumnDefinition[] = [];

  private selectedFile?: File;
  private dataRows: string[][] = [];

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.readFile(file);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) this.readFile(file);
  }

  readFile(file: File): void {
    if (!this.isCsvFile(file)) {
      this.statusText = 'Selecione um arquivo CSV válido';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.statusText = 'O arquivo deve ter no máximo 10 MB';
      return;
    }

    this.selectedFile = file;
    const reader = new FileReader();
    reader.onload = () => this.loadCsv(String(reader.result ?? ''));
    reader.onerror = () => this.statusText = 'Não foi possível ler o arquivo';
    reader.readAsText(file, 'UTF-8');
  }

  updateTableName(): void {
    this.updateSql();
  }

  updateColumnNames(): void {
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

  reset(): void {
    this.selectedFile = undefined;
    this.dataRows = [];
    this.columns = [];
    this.fileName = '';
    this.fileMeta = '';
    this.generatedSql = '';
    this.rowCount = 0;
    this.newColumnName = '';
    this.statusText = 'Aguardando arquivo';
    this.copied = false;
  }

  private isCsvFile(file: File): boolean {
    return file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
  }

  private loadCsv(text: string): void {
    const [headerRow, ...dataRows] = this.parseCsv(text);

    if (!headerRow || dataRows.length === 0) {
      this.columns = [];
      this.dataRows = [];
      this.generatedSql = '';
      this.statusText = 'O CSV precisa ter cabeçalho e ao menos uma linha';
      return;
    }

    this.columns = headerRow.map((header, index) => {
      const name = header.trim() || `coluna_${index + 1}`;
      return this.createColumn(name, name);
    });
    this.dataRows = dataRows;
    this.rowCount = dataRows.length;
    this.fileName = this.selectedFile?.name ?? '';
    this.fileMeta = `${this.rowCount} registros · ${((this.selectedFile?.size ?? 0) / 1024).toFixed(1)} KB`;
    this.updateSql();
  }

  private createColumn(name: string, originalName: string): ColumnDefinition {
    return {
      originalName,
      name,
      enabled: true,
      type: 'string',
      defaultValue: '',
      defaultIsFunction: false,
    };
  }

  private updateSql(): void {
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

    this.generatedSql = this.dataRows
      .map(row => this.createInsertStatement(table, columnList, activeColumns, row))
      .join('\n\n');
    this.statusText = 'Pronto para copiar';
    this.copied = false;
  }

  private getActiveColumns(): ActiveColumn[] {
    return this.columns
      .map((column, index) => ({ column, index }))
      .filter(({ column }) => column.enabled);
  }

  private getColumnName(column: ColumnDefinition): string {
    return column.name.trim() || column.originalName;
  }

  private createInsertStatement(
    table: string,
    columnList: string,
    columns: ActiveColumn[],
    row: string[],
  ): string {
    const values = columns
      .map(({ column, index }) => this.convertColumnValue(row[index] ?? '', column))
      .join(', ');

    return `INSERT INTO ${this.escapeIdentifier(table)} (${columnList})\nVALUES (${values});`;
  }

  private convertColumnValue(value: string, column: ColumnDefinition): string {
    if (value.trim()) return this.convertValue(value, column.type);

    const defaultValue = column.defaultValue.trim();
    if (!defaultValue) return 'NULL';
    if (column.defaultIsFunction) return defaultValue;

    return this.convertValue(defaultValue, column.type);
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

  private escapeString(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
  }

  private escapeIdentifier(value: string): string {
    return `"${value.trim().replaceAll('"', '""')}"`;
  }

  private hasSameName(first: string, second: string): boolean {
    return first.trim().toLocaleLowerCase() === second.trim().toLocaleLowerCase();
  }

  private parseCsv(text: string): string[][] {
    const input = text
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentValue = '';
    let isQuoted = false;

    for (let index = 0; index < input.length; index++) {
      const character = input[index];

      if (character === '"') {
        if (isQuoted && input[index + 1] === '"') {
          currentValue += '"';
          index++;
        } else {
          isQuoted = !isQuoted;
        }
      } else if (character === ',' && !isQuoted) {
        currentRow.push(currentValue);
        currentValue = '';
      } else if (character === '\n' && !isQuoted) {
        this.pushNonEmptyRow(rows, currentRow, currentValue);
        currentRow = [];
        currentValue = '';
      } else {
        currentValue += character;
      }
    }

    this.pushNonEmptyRow(rows, currentRow, currentValue);
    return rows;
  }

  private pushNonEmptyRow(rows: string[][], row: string[], lastValue: string): void {
    const completedRow = [...row, lastValue];
    if (completedRow.some(cell => cell.trim())) rows.push(completedRow);
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
