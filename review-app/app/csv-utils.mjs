export function csvCell(value) {
  const stringValue = value == null ? "" : String(value);
  const formulaCandidate = stringValue.trimStart();
  const spreadsheetDanger = /^[\t\r\n]/.test(stringValue) || /^[=+\-@]/.test(formulaCandidate);
  const spreadsheetSafe = spreadsheetDanger ? `'${stringValue}` : stringValue;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}
