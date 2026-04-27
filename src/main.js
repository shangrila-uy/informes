// Configuration
const SPREADSHEET_ID = '1dYFIQCIcVmyEwN4u6_So5z36xMUS8Yo-M2tzqW0DcJs';
const SHEET_NAME = 'publicadores';
const MONTH = "Abr 26";
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email';

// Google Client ID
const CLIENT_ID = '241558307299-e146vcp9cuvjfcm50acv3kv4aigciome.apps.googleusercontent.com';

let state = {
  accessToken: localStorage.getItem('sheets_access_token'),
  userEmail: localStorage.getItem('user_email'),
  groupNumber: localStorage.getItem('group_number') || 1,
  data: [],
  headers: [],
  loading: false,
  error: null,
  searchTerm: "",
  saving: null,
};

// --- Google Sheets Service Logic ---
async function fetchWithAuth(url, options = {}) {
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${state.accessToken}`,
    'Content-Type': 'application/json',
  };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const error = await response.json();
    const message = error.error?.message || 'Error de la API de Google Sheets';
    throw new Error(`${response.status}: ${message}`);
  }
  return response.json();
}

async function getSheetData() {
  const data = await fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:ZZ1000`
  );
  return {
    headers: data.values ? data.values[1] : [],
    rows: data.values || [],
  };
}

async function updateCell(range, value) {
  return fetchWithAuth(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [[value]],
      }),
    }
  );
}

function getColumnLetter(index) {
  let letter = "";
  let i = index;
  while (i >= 0) {
    letter = String.fromCharCode((i % 26) + 65) + letter;
    i = Math.floor(i / 26) - 1;
  }
  return letter;
}

// --- App Logic ---
async function fetchGroupConfig(email) {
  try {
    // URL de la tabla de configuración publicada como HTML
    const configUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQh7A0m51lNzuYeQsuRcYPr3EBzqavadrdG6-K8ij_eq5DSHmWiYIDgRIbl3p0dsfryo_NkNHqSfokM/pubhtml';
    const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(configUrl)}`);
    const data = await response.json();
    const html = data.contents;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rows = Array.from(doc.querySelectorAll('table tr'));
    
    if (rows.length === 0) return 1;

    // Buscamos las cabeceras para identificar las columnas por nombre
    const headers = Array.from(rows[0].querySelectorAll('td')).map(td => td.textContent.trim().toLowerCase());
    const emailIndex = headers.indexOf('correo electrónico');
    const groupIndex = headers.indexOf('grupo');

    if (emailIndex === -1 || groupIndex === -1) {
      // Intento alternativo si las cabeceras no están en la primera fila o tienen nombres diferentes
      // Por defecto buscaremos en todas las filas
      for (let i = 0; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td')).map(c => c.textContent.trim());
        const foundEmail = cells.find(c => c.toLowerCase() === email.toLowerCase());
        if (foundEmail) {
          // Si encontramos el email, el grupo suele estar en una columna cercana. 
          // Este es un fallback heurístico.
          const gIndex = cells.findIndex(c => !isNaN(parseInt(c)) && parseInt(c) < 100);
          if (gIndex !== -1) return parseInt(cells[gIndex]);
        }
      }
      return 1;
    }

    for (let i = 1; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll('td'));
      if (cells[emailIndex] && cells[emailIndex].textContent.trim().toLowerCase() === email.toLowerCase()) {
        const groupVal = cells[groupIndex].textContent.trim();
        return parseInt(groupVal) || 1;
      }
    }
    
    return 1;
  } catch (err) {
    console.error('Error fetching group config:', err);
    return 1;
  }
}

function setState(newState) {
  state = { ...state, ...newState };
  render();
}

async function loadData() {
  if (!state.accessToken) return;
  
  setState({ loading: true, error: null });
  try {
    const { rows, headers } = await getSheetData();
    const findCol = (name) => {
      const cleanedHeaders = headers.map(h => (h || '').toString().trim().toLowerCase());
      const lowerName = name.toLowerCase();
      const exactIdx = cleanedHeaders.indexOf(lowerName);
      if (exactIdx !== -1) return exactIdx;
      return cleanedHeaders.findIndex(h => h.includes(lowerName));
    };

    const idxNombre = findCol('publicador');
    const idxGrupo = findCol('grupo');
    const idxParticipo = findCol(`${MONTH} participó`);
    const idxCursos = findCol(`${MONTH} cursos`);
    const idxPrecursorado = findCol(`${MONTH} precursorado`);
    const idxHoras = findCol(`${MONTH} horas`);
    const idxNotas = findCol(`${MONTH} notas`);

    const publishers = rows
      .slice(2)
      .map((row, i) => ({
        rowIndex: i + 3,
        id: `row-${i + 3}`,
        nombre: idxNombre !== -1 ? (row[idxNombre] || '').toString().trim() : '',
        grupo: idxNombre !== -1 ? (row[idxGrupo] || '').toString().trim() : '',
        participo: idxParticipo !== -1 ? ['sí', 'true', '1', 'yes'].includes((row[idxParticipo] || '').toString().toLowerCase().trim()) : false,
        cursos: idxCursos !== -1 ? parseInt(row[idxCursos]) || 0 : 0,
        precursorado: idxPrecursorado !== -1 ? (row[idxPrecursorado] || '').toString().trim() : '',
        horas: idxHoras !== -1 ? parseInt(row[idxHoras]) || 0 : 0,
        notas: idxNotas !== -1 ? (row[idxNotas] || '').toString().trim() : '',
      }))
      .filter(p => p.nombre !== '');

    setState({ data: publishers, headers, loading: false });
  } catch (err) {
    console.error(err);
    if (err.message.includes('401') || err.message.toLowerCase().includes('invalid authentication credentials')) {
      logout();
      setState({ error: 'Sesión expirada. Por favor inicie sesión.', loading: false });
    } else {
      setState({ error: err.message, loading: false });
    }
  }
}

function login() {
  if (!CLIENT_ID) {
    setState({ error: 'Google Client ID no configurado.' });
    return;
  }

  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async (response) => {
      if (response.access_token) {
        localStorage.setItem('sheets_access_token', response.access_token);
        
        // Mostrar estado de carga inmediatamente al recibir el token
        setState({ 
          accessToken: response.access_token, 
          loading: true, 
          error: null 
        });
        
        // Fetch user email to determine group
        try {
          const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${response.access_token}` }
          });
          const userData = await userResponse.json();
          const email = userData.email || '';
          
          // Determinamos el grupo basado en el email y la tabla de configuración externa
          const groupNumber = await fetchGroupConfig(email);
          
          localStorage.setItem('user_email', email);
          localStorage.setItem('group_number', groupNumber);
          
          setState({ 
            userEmail: email, 
            groupNumber: groupNumber
          });
          loadData();
        } catch (err) {
          console.error('Error fetching user info:', err);
          loadData();
        }
      }
    },
    error_callback: (err) => {
      console.error('OAuth Error:', err);
      setState({ error: `Error de Autenticación: ${err.message || 'Client ID inválido'}` });
    }
  });
  client.requestAccessToken();
}

function logout() {
  localStorage.removeItem('sheets_access_token');
  localStorage.removeItem('user_email');
  localStorage.removeItem('group_number');
  setState({ accessToken: null, userEmail: null, groupNumber: 1, data: [], headers: [] });
}

async function handleUpdate(pub, field, value) {
  const saveKey = `${pub.id}-${field}`;
  setState({ saving: saveKey });
  
  try {
    const findCol = (name) => state.headers.findIndex(h => h.trim().toLowerCase().includes(name.toLowerCase()));
    let colIdx = -1;
    if (field === 'participo') colIdx = findCol(`${MONTH} participó`);
    else if (field === 'cursos') colIdx = findCol(`${MONTH} cursos`);
    else if (field === 'precursorado') colIdx = findCol(`${MONTH} precursorado`);
    else if (field === 'horas') colIdx = findCol(`${MONTH} horas`);
    else if (field === 'notas') colIdx = findCol(`${MONTH} notas`);

    if (colIdx === -1) throw new Error(`Columna para ${field} no encontrada`);

    const colLetter = getColumnLetter(colIdx);
    const range = `${colLetter}${pub.rowIndex}`;
    
    let sheetValue = value;
    if (field === 'participo') sheetValue = value ? 'TRUE' : 'FALSE';

    await updateCell(range, sheetValue);

    const newData = state.data.map(p => p.id === pub.id ? { ...p, [field]: value } : p);
    setState({ data: newData, saving: null });
  } catch (err) {
    console.error(err);
    setState({ saving: null, error: `Error guardando: ${err.message}` });
  }
}

function LoginView() {
  return `
    <div class="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div class="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl text-center">
        <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <i data-lucide="file-spreadsheet" class="w-8 h-8"></i>
        </div>
        <h1 class="text-2xl font-bold text-slate-900 mb-2">Informe de Servicio</h1>
        <p class="text-slate-500 mb-8">Conecte con Google Sheets para gestionar los informes de servicio.</p>
        
        ${state.error ? `
          <div class="bg-red-50 border border-red-200 rounded-xl p-3 mb-6 text-xs text-red-700 text-left">
            ${state.error}
          </div>
        ` : ''}

        <button id="login-btn" class="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold tracking-wide transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-3">
          <svg class="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" /><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
          Conectar con Google
        </button>
      </div>
    </div>
  `;
}

function MainHeader() {
  const currentGroup = state.groupNumber.toString();
  return `
    <header class="h-20 bg-white border-b border-slate-200 px-4 sm:px-10 flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 bg-indigo-600 rounded flex items-center justify-center text-white font-bold text-xl ring-4 ring-indigo-50">${currentGroup}</div>
        <div>
          <h1 class="text-xl font-bold tracking-tight">Informe de Servicio</h1>
          <p class="text-xs text-slate-500 uppercase tracking-widest font-semibold">Grupo ${currentGroup} • Shangrilá</p>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <div class="relative hidden md:block">
          <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 font-bold"></i>
          <input 
            type="text" 
            id="search-input"
            placeholder="Buscar..."
            class="bg-slate-50 border border-slate-200 rounded py-2 pl-9 pr-10 w-64 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-xs"
            value="${state.searchTerm}"
          />
          ${state.searchTerm ? `
            <button id="clear-search" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          ` : ''}
        </div>
        <div class="h-10 w-px bg-slate-200 mx-2"></div>
        <div class="text-right hidden sm:block">
          <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Periodo</p>
          <p class="text-sm font-bold text-slate-700">${MONTH}</p>
        </div>
        <button id="logout-btn" class="p-2 text-slate-400 hover:text-red-500 transition-colors bg-slate-50 rounded-lg">
          <i data-lucide="log-out" class="w-5 h-5"></i>
        </button>
      </div>
    </header>
  `;
}

function MainView() {
  const currentGroup = state.groupNumber.toString();
  const groupData = state.data.filter(p => {
    const norm = p.grupo.toString().trim();
    const isCurrentGroup = norm === currentGroup || norm === `${currentGroup}.0` || norm.toLowerCase() === `grupo ${currentGroup}`;
    return isCurrentGroup && p.nombre.toLowerCase().includes(state.searchTerm.toLowerCase());
  });

  const activos = groupData.filter(p => p.participo).length;
  const auxiliares = groupData.filter(p => p.precursorado.toLowerCase().includes('auxiliar')).length;
  const regulares = groupData.filter(p => p.precursorado.toLowerCase() === 'regular').length;

  return `
    ${MainHeader()}
    ${state.error ? `
      <div class="mx-10 mt-6 bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between">
        <p class="text-red-700 text-sm font-medium">${state.error}</p>
        <button id="reload-btn" class="text-red-700 p-1 hover:bg-red-100 rounded">
          <i data-lucide="refresh-ccw" class="w-4 h-4"></i>
        </button>
      </div>
    ` : ''}

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-10 py-6 flex-shrink-0">
      ${StatCard("Publicadores", groupData.length)}
      ${StatCard("Activos", activos)}
      ${StatCard("Auxiliares", auxiliares)}
      ${StatCard("Regulares", regulares)}
    </div>

    <main class="px-4 sm:px-10 flex-grow flex flex-col min-h-0 pb-8">
      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col h-full shadow-sm">
        <!-- Desktop Header -->
        <div class="hidden md:grid grid-cols-12 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4">
          <div class="col-span-3 px-8">Publicador</div>
          <div class="col-span-1 text-center">Particip&oacute;</div>
          <div class="col-span-1 text-center">Cursos</div>
          <div class="col-span-2 text-center">Precursorado</div>
          <div class="col-span-1 text-center">Horas</div>
          <div class="col-span-4 px-8">Notas</div>
        </div>

        <div class="flex-grow overflow-y-auto">
          ${groupData.map((pub, idx) => `
            <!-- Desktop Row -->
            <div data-pub-id="${pub.id}" class="hidden md:grid grid-cols-12 border-b border-slate-100 hover:bg-indigo-50/20 transition-colors items-center min-h-[3.5rem] ${idx % 2 === 1 ? 'bg-slate-50/30' : ''}">
              <div class="col-span-3 px-8 font-semibold text-sm text-slate-700">${pub.nombre}</div>
              
              <div class="col-span-1 flex justify-center">
                <input 
                  type="checkbox" 
                  class="participo-check w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30"
                  ${pub.participo ? 'checked' : ''}
                  ${state.saving === `${pub.id}-participo` ? 'disabled' : ''}
                />
              </div>

              <div class="col-span-1 px-2">
                <input 
                  type="number" 
                  class="cursos-input w-full text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 focus:ring-0 rounded-lg py-1 text-sm outline-none transition-all ${pub.cursos === 0 ? 'opacity-30' : ''}"
                  value="${pub.cursos}"
                  min="0"
                  ${state.saving === `${pub.id}-cursos` ? 'disabled' : ''}
                />
              </div>

              <div class="col-span-2 px-4 text-center">
                <select 
                  class="precursorado-select bg-slate-100 text-[10px] font-bold border-none rounded-lg px-3 py-1.5 appearance-none uppercase cursor-pointer text-slate-600 focus:ring-2 focus:ring-indigo-500/20 transition-all w-full"
                  ${state.saving === `${pub.id}-precursorado` ? 'disabled' : ''}
                >
                  <option value="" ${pub.precursorado === '' ? 'selected' : ''}></option>
                  <option value="Auxiliar 15 hs" ${pub.precursorado === 'Auxiliar 15 hs' ? 'selected' : ''}>Aux15</option>
                  <option value="Auxiliar 30 hs" ${pub.precursorado === 'Auxiliar 30 hs' ? 'selected' : ''}>Aux30</option>
                  <option value="Regular" ${pub.precursorado === 'Regular' ? 'selected' : ''}>Regular</option>
                </select>
              </div>

              <div class="col-span-1 px-2">
                ${pub.precursorado ? (() => {
                  const hasError = pub.participo && pub.precursorado && pub.horas === 0;
                  return `
                    <input 
                      type="number" 
                      class="horas-input w-full text-center rounded-lg py-1 text-sm outline-none transition-all font-bold 
                      ${hasError 
                        ? 'bg-red-50 border-red-500 text-red-700 ring-1 ring-red-500' 
                        : 'bg-transparent border-transparent hover:border-slate-200 focus:border-indigo-400'
                      } 
                      ${pub.horas === 0 && !hasError ? 'opacity-30' : ''} 
                      disabled:opacity-30 disabled:cursor-not-allowed"
                      value="${pub.horas}"
                      min="0"
                      ${state.saving === `${pub.id}-horas` ? 'disabled' : ''}
                    />
                  `;
                })() : ''}
              </div>

              <div class="col-span-4 px-8">
                <input 
                  type="text" 
                  class="notas-input w-full bg-transparent border-none text-xs text-slate-500 placeholder-slate-300 focus:ring-0 focus:text-slate-900 transition-all italic hover:bg-slate-50 rounded px-2 py-1"
                  value="${pub.notas}"
                  placeholder="Añadir nota..."
                  ${state.saving === `${pub.id}-notas` ? 'disabled' : ''}
                />
              </div>
            </div>

            <!-- Mobile Card -->
            <div data-pub-id="${pub.id}" class="md:hidden p-4 border-b border-slate-100 space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-slate-700">${pub.nombre}</h3>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 h-11">
                  <span class="text-[10px] font-bold text-slate-400 uppercase">Participó</span>
                  <input 
                    type="checkbox" 
                    class="participo-check w-6 h-6 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30"
                    ${pub.participo ? 'checked' : ''}
                    ${state.saving === `${pub.id}-participo` ? 'disabled' : ''}
                  />
                </div>

                <div class="relative">
                  <label class="absolute -top-2 left-3 bg-white px-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Cursos</label>
                  <input 
                    type="number" 
                    class="cursos-input w-full bg-white border border-slate-200 rounded-xl h-11 px-3 text-sm font-bold text-center"
                    value="${pub.cursos}"
                    min="0"
                    ${state.saving === `${pub.id}-cursos` ? 'disabled' : ''}
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="relative">
                  <label class="absolute -top-2 left-3 bg-white px-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Precursorado</label>
                  <select 
                    class="precursorado-select w-full bg-white border border-slate-200 rounded-xl h-11 px-3 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500/20 appearance-none"
                    ${state.saving === `${pub.id}-precursorado` ? 'disabled' : ''}
                  >
                    <option value="" ${pub.precursorado === '' ? 'selected' : ''}>Ninguno</option>
                    <option value="Auxiliar 15 hs" ${pub.precursorado === 'Auxiliar 15 hs' ? 'selected' : ''}>Auxiliar 15 hs</option>
                    <option value="Auxiliar 30 hs" ${pub.precursorado === 'Auxiliar 30 hs' ? 'selected' : ''}>Auxiliar 30 hs</option>
                    <option value="Regular" ${pub.precursorado === 'Regular' ? 'selected' : ''}>Regular</option>
                  </select>
                </div>

                <div class="relative">
                  ${pub.precursorado ? (() => {
                    const hasError = pub.participo && pub.precursorado && pub.horas === 0;
                    return `
                      <label class="absolute -top-2 left-3 bg-white px-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Horas</label>
                      <input 
                        type="number" 
                        class="horas-input w-full h-11 bg-white px-3 rounded-xl border text-sm font-bold text-center transition-all
                        ${hasError 
                          ? 'bg-red-50 border-red-500 text-red-700' 
                          : 'border-slate-200 focus:border-indigo-400'
                        }
                        disabled:opacity-30"
                        value="${pub.horas}"
                        min="0"
                        ${state.saving === `${pub.id}-horas` ? 'disabled' : ''}
                      />
                    `;
                  })() : ''}
                </div>
              </div>

              <div class="relative">
                <label class="absolute -top-2 left-3 bg-white px-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Notas</label>
                <textarea 
                  class="notas-input w-full bg-white border border-slate-200 rounded-xl p-3 pt-4 text-xs text-slate-600 italic focus:ring-2 focus:ring-indigo-500/20"
                  rows="2"
                  placeholder="..."
                  ${state.saving === `${pub.id}-notas` ? 'disabled' : ''}
                >${pub.notas}</textarea>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center text-[11px] text-slate-500 font-medium gap-2">
          <div>Mostrando ${groupData.length} publicadores del Grupo ${state.groupNumber}</div>
          <div class="flex items-center gap-3">
            ${state.saving ? `
              <span class="flex items-center gap-1"><i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Guardando...</span>
            ` : ''}
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-green-500"></span>
              <span>Los cambios se guardan automáticamente</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  `;
}

function StatCard(label, value) {
  return `
    <div class="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between min-h-[90px] hover:shadow-md transition-shadow">
      <span class="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider">${label}</span>
      <div>
        <span class="text-3xl font-light text-slate-800">${value}</span>
      </div>
    </div>
  `;
}

function SkeletonStatCard() {
  return `
    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm animate-pulse min-h-[90px] flex flex-col justify-between">
      <div class="h-2 w-20 bg-slate-100 rounded-full"></div>
      <div class="h-8 w-12 bg-slate-100 rounded-lg"></div>
    </div>
  `;
}

function SkeletonRow() {
  return `
    <div class="hidden md:grid grid-cols-12 border-b border-slate-100 hover:bg-indigo-50/20 transition-colors items-center min-h-[3.5rem] animate-pulse">
      <div class="col-span-3 px-8"><div class="h-4 bg-slate-100 rounded-full w-3/4"></div></div>
      <div class="col-span-1 flex justify-center"><div class="h-5 w-5 bg-slate-100 rounded"></div></div>
      <div class="col-span-1 px-2 flex justify-center"><div class="h-4 bg-slate-100 rounded w-8"></div></div>
      <div class="col-span-2 px-4 flex justify-center"><div class="h-6 bg-slate-100 rounded-lg w-full"></div></div>
      <div class="col-span-1 px-2 flex justify-center"><div class="h-4 bg-slate-100 rounded w-8"></div></div>
      <div class="col-span-4 px-8"><div class="h-4 bg-slate-100 rounded-full w-1/2"></div></div>
    </div>
    <div class="md:hidden p-4 border-b border-slate-100 space-y-3 animate-pulse">
      <div class="h-5 bg-slate-100 rounded-full w-1/2 mb-4"></div>
      <div class="grid grid-cols-2 gap-3">
        <div class="h-11 bg-slate-50 border border-slate-100 rounded-xl"></div>
        <div class="h-11 bg-slate-50 border border-slate-100 rounded-xl"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="h-11 bg-slate-50 border border-slate-100 rounded-xl"></div>
        <div class="h-11 bg-slate-50 border border-slate-100 rounded-xl"></div>
      </div>
      <div class="h-16 bg-slate-50 border border-slate-100 rounded-xl"></div>
    </div>
  `;
}

function LoadingView() {
  return `
    ${MainHeader()}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-10 py-6 flex-shrink-0">
      ${SkeletonStatCard()}
      ${SkeletonStatCard()}
      ${SkeletonStatCard()}
      ${SkeletonStatCard()}
    </div>
    <main class="px-4 sm:px-10 flex-grow flex flex-col min-h-0 pb-8">
      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col h-full shadow-sm">
        <div class="hidden md:grid grid-cols-12 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4">
          <div class="col-span-3 px-8">Publicador</div>
          <div class="col-span-1 text-center">Particip&oacute;</div>
          <div class="col-span-1 text-center">Cursos</div>
          <div class="col-span-2 text-center">Precursorado</div>
          <div class="col-span-1 text-center">Horas</div>
          <div class="col-span-4 px-8">Notas</div>
        </div>
        <div class="flex-grow overflow-y-auto">
          ${Array(8).fill(SkeletonRow()).join('')}
        </div>
      </div>
    </main>
  `;
}

function render() {
  const $app = $('#app');
  let html = "";

  if (!state.accessToken) {
    html = LoginView();
  } else if (state.loading && state.data.length === 0) {
    html = LoadingView();
  } else {
    html = MainView();
  }

  $app.html(html);
  if (window.lucide) window.lucide.createIcons();
  
  $('#login-btn').on('click', login);
  $('#logout-btn').on('click', logout);
  $('#reload-btn').on('click', loadData);
  
  $('#search-input').on('keydown', function(e) {
    if (e.key === 'Enter') {
      state.searchTerm = $(this).val();
      render();
    }
  });

  $('#clear-search').on('click', () => {
    state.searchTerm = "";
    render();
  });

  $('.participo-check').on('change', function() {
    const id = $(this).closest('[data-pub-id]').data('pub-id');
    const pub = state.data.find(p => p.id === id);
    handleUpdate(pub, 'participo', $(this).is(':checked'));
  });

  $('.cursos-input').on('change', function() {
    const id = $(this).closest('[data-pub-id]').data('pub-id');
    const pub = state.data.find(p => p.id === id);
    handleUpdate(pub, 'cursos', parseInt($(this).val()) || 0);
  });

  $('.precursorado-select').on('change', function() {
    const id = $(this).closest('[data-pub-id]').data('pub-id');
    const pub = state.data.find(p => p.id === id);
    handleUpdate(pub, 'precursorado', $(this).val());
  });

  $('.horas-input').on('change', async function() {
    const id = $(this).closest('[data-pub-id]').data('pub-id');
    const pub = state.data.find(p => p.id === id);
    const val = parseInt($(this).val()) || 0;
    
    // Si se ingresa un número diferente de 0 en horas, marcar la casilla "Participó"
    if (val > 0 && !pub.participo) {
      await handleUpdate(pub, 'participo', true);
      // Re-fetch pub after state update from handleUpdate
      const updatedPub = state.data.find(p => p.id === id);
      handleUpdate(updatedPub, 'horas', val);
    } else {
      handleUpdate(pub, 'horas', val);
    }
  });

  $('.notas-input').on('blur', function() {
    const id = $(this).closest('[data-pub-id]').data('pub-id');
    const pub = state.data.find(p => p.id === id);
    const newVal = $(this).val();
    if (newVal !== pub.notas) {
      handleUpdate(pub, 'notas', newVal);
    }
  });
}

$(() => {
  render();
  if (state.accessToken) {
    loadData();
  }
});
