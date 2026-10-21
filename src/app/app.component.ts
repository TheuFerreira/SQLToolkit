import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({ selector: 'app-root', standalone: true, imports: [FormsModule], templateUrl: './app.component.html', styleUrl: './app.component.scss' })
export class AppComponent {
  tableName = 'minha_tabela'; fileName = ''; fileMeta = ''; generatedSql = ''; rowCount = 0; statusText = 'Aguardando arquivo'; copied = false;
  columns: { originalName: string; name: string }[] = [];
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
      return { originalName: name, name };
    });
    this.dataRows = rows.slice(1);
    this.fileName = this.selectedFile?.name ?? '';
    this.fileMeta = `${this.dataRows.length} registros · ${((this.selectedFile?.size ?? 0) / 1024).toFixed(1)} KB`;
    this.rowCount = this.dataRows.length;
    this.updateSql();
  }
  updateTableName(): void { this.updateSql(); }
  updateColumnNames(): void { this.updateSql(); }
  private updateSql(): void {
    if (!this.dataRows.length || !this.columns.length) return;
    const table = this.tableName.trim() || 'minha_tabela';
    const headers = this.columns.map(column => column.name.trim() || column.originalName);
    this.generatedSql = this.dataRows.map(row => `INSERT INTO ${this.escapeIdentifier(table)} (${headers.map(header => this.escapeIdentifier(header)).join(', ')})\nVALUES (${headers.map((_, index) => this.escapeValue(row[index] ?? '')).join(', ')});`).join('\n\n');
    this.statusText = 'Pronto para copiar';
    this.copied = false;
  }
  async copySql(): Promise<void> { if (!this.generatedSql) return; await navigator.clipboard.writeText(this.generatedSql); this.copied = true; setTimeout(() => this.copied = false, 1600); }
  reset(): void { this.selectedFile = undefined; this.fileName = ''; this.fileMeta = ''; this.generatedSql = ''; this.rowCount = 0; this.columns = []; this.dataRows = []; this.statusText = 'Aguardando arquivo'; this.copied = false; }
  private parseCsv(text: string): string[][] {
    const input = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n'); const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
    for (let i = 0; i < input.length; i++) { const c = input[i]; if (c === '"') { if (quoted && input[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; } else if (c === ',' && !quoted) { row.push(value); value = ''; } else if (c === '\n' && !quoted) { row.push(value); if (row.some(cell => cell.trim())) rows.push(row); row = []; value = ''; } else value += c; }
    if (value || row.length) { row.push(value); if (row.some(cell => cell.trim())) rows.push(row); } return rows;
  }
  private escapeIdentifier(value: string): string { return `"${value.trim().replaceAll('"', '""')}"`; }
  private escapeValue(value: string): string { const clean = value.trim(); if (!clean) return 'NULL'; if (/^(null|true|false)$/i.test(clean) || /^-?\d+(\.\d+)?$/.test(clean)) return clean.toUpperCase(); return `'${clean.replaceAll("'", "''")}'`; }
}
