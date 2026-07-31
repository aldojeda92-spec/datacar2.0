// lib/csv.ts
// Parser CSV manual (sin librería externa) usado por el inyector masivo del panel
// admin y por el portal de concesionarias. Soporta comillas dobles escapadas ("").

export const parseCSVRow = (text: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && text[i + 1] === '"') { current += '"'; i++; }
    else if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
};
