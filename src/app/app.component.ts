import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({ selector: 'app-root', standalone: true, imports: [FormsModule], templateUrl: './app.component.html', styleUrl: './app.component.scss' })
export class AppComponent {
  tableName = 'minha_tabela'; fileName = ''; fileMeta = ''; generatedSql = ''; rowCount = 0; statusText = 'Aguardando arquivo'; copied = false; private selectedFile?: File;
  onFileSelected(event: Event): void { const file = (event.target as HTMLInputElement).files?.[0]; if (file) this.readFile(file); }
  onDrop(event: DragEvent): void { event.preventDefault(); const file = event.dataTransfer?.files[0]; if (file) this.readFile(file); }
  readFile(file: File): void {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') { this.statusText = 'Selecione um arquivo CSV válido'; return; }
    if (file.size > 10 * 1024 * 1024) { this.statusText = 'O arquivo deve ter no máximo 10 MB'; return; }
    this.selectedFile = file; const reader = new FileReader(); reader.onload = () => this.generateSql(String(reader.result ?? '')); reader.readAsText(file, 'UTF-8');
  }
  generateSql(text: string): void {
    const rows = this.parseCsv(text); if (rows.length < 2) { this.statusText = 'O CSV precisa ter cabeçalho e ao menos uma linha'; return; }
    const headers = rows[0].map((header, i) => header.trim() || `coluna_${i + 1}`); const table = this.tableName.trim() || 'minha_tabela';
    this.generatedSql = rows.slice(1).map(row => `INSERT INTO ${this.escapeIdentifier(table)} (${headers.map(h => this.escapeIdentifier(h)).join(', ')})\nVALUES (${headers.map((_, i) => this.escapeValue(row[i] ?? '')).join(', ')});`).join('\n\n');
    this.rowCount = rows.length - 1; this.fileName = this.selectedFile?.name ?? ''; this.fileMeta = `${this.rowCount} registros · ${((this.selectedFile?.size ?? 0) / 1024).toFixed(1)} KB`; this.statusText = 'Pronto para copiar'; this.copied = false;
  }
  updateTableName(): void { if (this.selectedFile) { const reader = new FileReader(); reader.onload = () => this.generateSql(String(reader.result ?? '')); reader.readAsText(this.selectedFile, 'UTF-8'); } }
  async copySql(): Promise<void> { if (!this.generatedSql) return; await navigator.clipboard.writeText(this.generatedSql); this.copied = true; setTimeout(() => this.copied = false, 1600); }
  reset(): void { this.selectedFile = undefined; this.fileName = ''; this.fileMeta = ''; this.generatedSql = ''; this.rowCount = 0; this.statusText = 'Aguardando arquivo'; this.copied = false; }
  private parseCsv(text: string): string[][] {
    const input = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n'); const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
    for (let i = 0; i < input.length; i++) { const c = input[i]; if (c === '"') { if (quoted && input[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; } else if (c === ',' && !quoted) { row.push(value); value = ''; } else if (c === '\n' && !quoted) { row.push(value); if (row.some(cell => cell.trim())) rows.push(row); row = []; value = ''; } else value += c; }
    if (value || row.length) { row.push(value); if (row.some(cell => cell.trim())) rows.push(row); } return rows;
  }
  private escapeIdentifier(value: string): string { return `"${value.trim().replaceAll('"', '""')}"`; }
  private escapeValue(value: string): string { const clean = value.trim(); if (!clean) return 'NULL'; if (/^(null|true|false)$/i.test(clean) || /^-?\d+(\.\d+)?$/.test(clean)) return clean.toUpperCase(); return `'${clean.replaceAll("'", "''")}'`; }
}
