import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({ selector: 'app-root', standalone: true, imports: [FormsModule], templateUrl: './app.component.html', styleUrl: './app.component.scss' })
export class AppComponent {
  readonly columnTypes = [
    { value: 'string', label: 'Texto' },
    { value: 'integer', label: 'Inteiro' },
    { value: 'decimal', label: 'Decimal' },
    { value: 'boolean', label: 'Booleano' },
    { value: 'date', label: 'Data' },
  ] as const;
  tableName = 'minha_tabela'; fileName = ''; fileMeta = ''; generatedSql = ''; rowCount = 0; statusText = 'Aguardando arquivo'; copied = false;
  columns: { originalName: string; name: string; enabled: boolean; isNew: boolean; type: string; defaultValue: string; defaultIsFunction: boolean }[] = [];
  newColumnName = '';
  private selectedFile?: File;
  private dataRows: string[][] = [];
  onFileSelected(event: Event): void { const file = (event.target as HTMLInputElement).files?.[0]; if (file) this.readFile(file); }
  onDrop(event: DragEvent): void { event.preventDefault(); const file = event.dataTransfer?.files[0]; if (file) this.readFile(file); }
  readFile(file: File): void {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') { this.statusText = 'Selecione um arquivo CSV válido'; return; }
    if (file.size > 10 * 1024 * 1024) { this.statusText = 'O arquivo deve ter no máximo 10 MB'; return; }
    this.selectedFile = file; const reader = new FileReader(); reader.onload = () => this.loadCsv(String(reader.result ?? '')); reader.readAsText(file, 'UTF-8');
  }
  private loadCsv(text: string): void {
    const rows = this.parseCsv(text);
    if (rows.length < 2) { this.statusText = 'O CSV precisa ter cabeçalho e ao menos uma linha'; this.columns = []; this.generatedSql = ''; return; }
    this.columns = rows[0].map((header, index) => {
      const name = header.trim() || `coluna_${index + 1}`;
      return { originalName: name, name, enabled: true, isNew: false, type: 'string', defaultValue: '', defaultIsFunction: false };
    });
    this.dataRows = rows.slice(1);
    this.fileName = this.selectedFile?.name ?? '';
    this.fileMeta = `${this.dataRows.length} registros · ${((this.selectedFile?.size ?? 0) / 1024).toFixed(1)} KB`;
    this.rowCount = this.dataRows.length;
    this.updateSql();
  }
  updateTableName(): void { this.updateSql(); }
  updateColumnNames(): void { this.updateSql(); }
  addColumn(): void {
    const name = this.newColumnName.trim();
    if (!name) return;
    if (this.columns.some(column => column.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      this.statusText = 'Já existe uma coluna com esse nome';
      return;
    }
    this.columns = [...this.columns, { originalName: 'Nova coluna', name, enabled: true, isNew: true, type: 'string', defaultValue: '', defaultIsFunction: false }];
    this.newColumnName = '';
    this.updateSql();
  }
  private updateSql(): void {
    if (!this.dataRows.length || !this.columns.length) return;
    const table = this.tableName.trim() || 'minha_tabela';
    const activeColumns = this.columns
      .map((column, index) => ({ column, index }))
      .filter(item => item.column.enabled);
    if (!activeColumns.length) {
      this.generatedSql = '';
      this.statusText = 'Ative ao menos uma coluna para gerar o SQL';
      return;
    }
    const headers = activeColumns.map(({ column }) => column.name.trim() || column.originalName);
    this.generatedSql = this.dataRows.map(row => `INSERT INTO ${this.escapeIdentifier(table)} (${headers.map(header => this.escapeIdentifier(header)).join(', ')})\nVALUES (${activeColumns.map(({ column, index }) => this.convertColumnValue(row[index] ?? '', column)).join(', ')});`).join('\n\n');
    this.statusText = 'Pronto para copiar';
    this.copied = false;
  }
  async copySql(): Promise<void> { if (!this.generatedSql) return; await navigator.clipboard.writeText(this.generatedSql); this.copied = true; setTimeout(() => this.copied = false, 1600); }
  reset(): void { this.selectedFile = undefined; this.fileName = ''; this.fileMeta = ''; this.generatedSql = ''; this.rowCount = 0; this.columns = []; this.dataRows = []; this.newColumnName = ''; this.statusText = 'Aguardando arquivo'; this.copied = false; }
  private parseCsv(text: string): string[][] {
    const input = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n'); const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
    for (let i = 0; i < input.length; i++) { const c = input[i]; if (c === '"') { if (quoted && input[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; } else if (c === ',' && !quoted) { row.push(value); value = ''; } else if (c === '\n' && !quoted) { row.push(value); if (row.some(cell => cell.trim())) rows.push(row); row = []; value = ''; } else value += c; }
    if (value || row.length) { row.push(value); if (row.some(cell => cell.trim())) rows.push(row); } return rows;
  }
  private escapeIdentifier(value: string): string { return `"${value.trim().replaceAll('"', '""')}"`; }
  private convertValue(value: string, type: string): string {
    const clean = value.trim();
    if (!clean) return 'NULL';
    if (type === 'integer' && /^[+-]?\d+$/.test(clean)) {
      const integer = Number(clean);
      if (Number.isSafeInteger(integer)) return String(integer);
    }
    if (type === 'decimal' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(clean)) {
      const decimal = Number(clean);
      if (Number.isFinite(decimal)) return String(decimal);
    }
    if (type === 'boolean') {
      if (/^(true|1|yes|sim)$/i.test(clean)) return 'TRUE';
      if (/^(false|0|no|não|nao)$/i.test(clean)) return 'FALSE';
    }
    if (type === 'date' && this.isValidIsoDate(clean)) return `'${clean}'`;
    return `'${clean.replaceAll("'", "''")}'`;
  }

  private convertColumnValue(value: string, column: AppComponent['columns'][number]): string {
    const cleanValue = value.trim();
    if (cleanValue) return this.convertValue(cleanValue, column.type);
    const defaultValue = column.defaultValue.trim();
    if (!defaultValue) return 'NULL';
    return column.defaultIsFunction ? defaultValue : this.convertValue(defaultValue, column.type);
  }

  private isValidIsoDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
}
