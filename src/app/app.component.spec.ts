import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should start with the default table name`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.tableName).toEqual('minha_tabela');
  });

  it('should render the converter heading', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('CSV');
  });

  it('imports semicolon separated CSV and reports malformed rows', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    await app.readFile(new File(['nome;idade\nAna;31'], 'dados.csv', { type: 'text/csv' }));
    expect(app.rowCount).toBe(1);
    expect(app.columns.map(column => column.name)).toEqual(['nome', 'idade']);
    expect(app.generatedSql).toContain("'Ana', '31'");

    await app.readFile(new File(['nome;idade\nAna'], 'invalido.csv', { type: 'text/csv' }));
    expect(app.errorText).toContain('Linha 2');
    expect(app.generatedSql).toBe('');
  });

  it('limits the preview while the downloaded SQL contains every row', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const csv = ['nome', ...Array.from({ length: 501 }, (_, index) => `linha-${index}`)].join('\n');
    await app.readFile(new File([csv], 'grande.csv', { type: 'text/csv' }));

    expect(app.previewRowCount).toBe(100);
    expect(app.generatedSql).toContain('linha-99');
    expect(app.generatedSql).not.toContain('linha-100');

    let downloaded: Blob | undefined;
    spyOn(URL, 'createObjectURL').and.callFake(blob => {
      downloaded = blob as Blob;
      return 'blob:mock';
    });
    spyOn(URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'click');
    await app.downloadSql();

    expect(downloaded).toBeDefined();
    expect(await downloaded!.text()).toContain('linha-500');
  });

  it('shows JavaScript default errors and blocks incomplete SQL', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    await app.readFile(new File(['nome,id\n,1'], 'dados.csv', { type: 'text/csv' }));
    app.columns[0].defaultMode = 'javascript';
    app.columns[0].defaultValue = '() => { throw new Error("falhou") }';
    app.updateColumnNames();

    expect(app.errorText).toContain('Linha 2, coluna "nome"');
    expect(app.errorText).toContain('falhou');
    expect(app.generatedSql).toBe('');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.download-button')?.hasAttribute('disabled')).toBeTrue();
  });

  it('finds a JavaScript default error beyond the visible preview', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const csv = [
      'nome,id',
      ...Array.from({ length: 100 }, (_, index) => `nome-${index},${index}`),
      ',100',
    ].join('\n');
    await app.readFile(new File([csv], 'dados.csv', { type: 'text/csv' }));
    app.columns[0].defaultMode = 'javascript';
    app.columns[0].defaultValue = '() => { throw new Error("falhou") }';
    app.updateColumnNames();

    expect(app.errorText).toContain('Linha 102, coluna "nome"');
    expect(app.generatedSql).toBe('');
  });
});
