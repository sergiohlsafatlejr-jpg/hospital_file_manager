// Test sanitizeFilename function
function sanitizeFilename(filename) {
  // Remove file extension temporarily
  const lastDotIndex = filename.lastIndexOf('.');
  const hasExtension = lastDotIndex > 0;
  const name = hasExtension ? filename.substring(0, lastDotIndex) : filename;
  const ext = hasExtension ? filename.substring(lastDotIndex) : '';
  
  // Normalize unicode characters (remove accents)
  let sanitized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Replace + and spaces with underscore
  sanitized = sanitized.replace(/[+\s]+/g, '_');
  
  // Remove any character that is not alphanumeric, underscore, hyphen, or dot
  sanitized = sanitized.replace(/[^a-zA-Z0-9_\-]/g, '');
  
  // Remove multiple consecutive underscores
  sanitized = sanitized.replace(/_+/g, '_');
  
  // Remove leading/trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '');
  
  // Ensure we have a valid filename
  if (!sanitized) {
    sanitized = 'arquivo';
  }
  
  return sanitized + ext;
}

// Test cases
const testCases = [
  'Demonstrativo+de+análise+de+conta_14_01_2026_11_57_32.pdf',
  'Arquivo com espaços.xml',
  'Relatório_Médico_2025.xlsx',
  'arquivo-normal.pdf',
  'ARQUIVO_TESTE.xml',
  'çãõéíóú.pdf',
  '+++arquivo+++.pdf',
  '   espaços   .pdf',
  'arquivo@#$%&*.pdf',
];

console.log('Teste de sanitização de nomes de arquivos:\n');
for (const test of testCases) {
  const result = sanitizeFilename(test);
  console.log(`"${test}"`);
  console.log(`  → "${result}"`);
  console.log('');
}
