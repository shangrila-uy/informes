
const SPREADSHEET_ID = '1dYFIQCIcVmyEwN4u6_So5z36xMUS8Yo-M2tzqW0DcJs';
const SHEET_NAME = 'publicadores';

export interface SheetData {
  rows: any[][];
  headers: string[];
}

export class GoogleSheetsService {
  private accessToken: string | null = null;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}) {
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const error = await response.json();
      const message = error.error?.message || 'Sheets API Error';
      throw new Error(`${response.status}: ${message}`);
    }
    return response.json();
  }

  async getSheetData(): Promise<SheetData> {
    const data = await this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:ZZ1000`
    );
    if (!data.values || data.values.length === 0) {
      return { rows: [], headers: [] };
    }
    return {
      headers: data.values[0],
      rows: data.values,
    };
  }

  async updateCell(range: string, value: any) {
    return this.fetchWithAuth(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        body: JSON.stringify({
          values: [[value]],
        }),
      }
    );
  }

  // Convert column index to Letter (0 -> A, 1 -> B, 26 -> AA, ...)
  getColumnLetter(index: number): string {
    let letter = "";
    let i = index;
    while (i >= 0) {
      letter = String.fromCharCode((i % 26) + 65) + letter;
      i = Math.floor(i / 26) - 1;
    }
    return letter;
  }
}
