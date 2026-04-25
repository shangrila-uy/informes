import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  CheckCircle2, 
  Circle, 
  BookOpen, 
  Award, 
  Clock, 
  Loader2,
  RefreshCcw,
  Search,
  LogOut,
  FileSpreadsheet
} from 'lucide-react';
import { GoogleSheetsService } from './services/googleSheets';

const MONTH = "Abr 26";
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

declare const google: any;

interface SheetPublisher {
  rowIndex: number; // 1-based index for sheets (row 1 is headers, so publishers start at 2)
  id: string;
  nombre: string;
  grupo: string;
  participo: boolean;
  cursos: number;
  precursorado: string;
  horas: number;
  notas: string;
}

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem('sheets_access_token'));
  const [data, setData] = useState<SheetPublisher[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const sheetsServiceRef = useRef<GoogleSheetsService | null>(null);

  const fetchSheetData = useCallback(async (token: string) => {
    try {
      setLoading(true);
      setError(null);
      const service = new GoogleSheetsService(token);
      sheetsServiceRef.current = service;
      
      const { rows } = await service.getSheetData();
      setHeaders(rows[1]);
      // console.log('Sheet Headers:', rows[1]);

      const findCol = (name: string) => {
        const cleanedHeaders = rows[1].map(h => (h || '').toString().trim().toLowerCase());
        const lowerName = name.toLowerCase();
        
        // Try exact match first
        const exactIdx = cleanedHeaders.indexOf(lowerName);
        if (exactIdx !== -1) return exactIdx;
        
        // Try includes
        const includeIdx = cleanedHeaders.findIndex(h => h.includes(lowerName));
        return includeIdx;
      };
      
      const idxNombre = findCol('publicador');
      const idxGrupo = findCol('grupo');
      const idxParticipo = findCol(`${MONTH} participó`);
      const idxCursos = findCol(`${MONTH} cursos`);
      const idxPrecursorado = findCol(`${MONTH} precursorado`);
      const idxHoras = findCol(`${MONTH} horas`);
      const idxNotas = findCol(`${MONTH} notas`);

      console.log('Column Mapping:', {
        idxNombre, idxGrupo, idxParticipo, idxCursos, idxPrecursorado, idxHoras, idxNotas
      });

      const publishers: SheetPublisher[] = rows
        .slice(2) // Skip row 0 and row 1 (headers)
        .map((row, i) => {
          const rawGrupo = idxGrupo !== -1 ? (row[idxGrupo] || '').toString().trim() : '';
          let rawPrecursorado = idxPrecursorado !== -1 ? (row[idxPrecursorado] || '').toString().trim() : '';
          // console.log('rawPrecursorado:', rawPrecursorado);
          
          return {
            rowIndex: i + 3, // row[2] is sheet row 3
            id: `row-${i + 3}`,
            nombre: idxNombre !== -1 ? (row[idxNombre] || '').toString().trim() : '',
            grupo: rawGrupo,
            participo: idxParticipo !== -1 ? ['sí', 'true', '1', 'yes'].includes((row[idxParticipo] || '').toString().toLowerCase().trim()) : false,
            cursos: idxCursos !== -1 ? parseInt(row[idxCursos]) || 0 : 0,
            precursorado: rawPrecursorado,
            horas: idxHoras !== -1 ? parseInt(row[idxHoras]) || 0 : 0,
            notas: idxNotas !== -1 ? row[idxNotas] || '' : '',
          };
        })
        .filter(p => p.nombre !== ''); // Skip empty rows

      console.log('Total Publishers Parsed:', publishers.length);

      setData(publishers);
    } catch (err) {
      console.error('Fetch Error:', err);
      const errorMessage = err instanceof Error ? err.message : '';
      if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('invalid authentication credentials')) {
        handleLogout();
        setError('Sesión expirada o inválida. Por favor inicie sesión nuevamente.');
      } else {
        setError(errorMessage || 'Error al cargar datos de Google Sheets');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      fetchSheetData(accessToken);
    }
  }, [accessToken, fetchSheetData]);

  const handleLogin = () => {
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.access_token) {
            localStorage.setItem('sheets_access_token', response.access_token);
            setAccessToken(response.access_token);
          }
        },
      });
      client.requestAccessToken();
    } catch (err) {
      setError('Error al inicializar Google Auth. ¿Configuró el CLIENT_ID?');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('sheets_access_token');
    setAccessToken(null);
    setData([]);
  };

  const updateField = async (publisher: SheetPublisher, field: keyof SheetPublisher, value: any) => {
    if (!sheetsServiceRef.current) return;
    
    setSaving(`${publisher.id}-${field}`);
    try {
      const findCol = (name: string) => headers.findIndex(h => h.trim().toLowerCase().includes(name.toLowerCase()));
      let colIdx = -1;

      if (field === 'participo') colIdx = findCol(`${MONTH} participó`);
      else if (field === 'cursos') colIdx = findCol(`${MONTH} cursos`);
      else if (field === 'precursorado') colIdx = findCol(`${MONTH} precursorado`);
      else if (field === 'horas') colIdx = findCol(`${MONTH} horas`);
      else if (field === 'notas') colIdx = findCol(`${MONTH} notas`);

      if (colIdx === -1) throw new Error(`Columna para ${field} no encontrada`);

      const colLetter = sheetsServiceRef.current.getColumnLetter(colIdx);
      const range = `${colLetter}${publisher.rowIndex}`;
      
      let sheetValue = value;
      if (field === 'participo') sheetValue = value ? 'TRUE' : 'FALSE';

      await sheetsServiceRef.current.updateCell(range, sheetValue);

      // Local update
      setData(prev => prev.map(p => p.id === publisher.id ? { ...p, [field]: value } : p));
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  };

  if (!accessToken) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl text-center">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Registro de Publicadores</h1>
          <p className="text-slate-500 mb-8">Conecte con Google Sheets para gestionar los informes del Grupo 1.</p>
          
           {!CLIENT_ID && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800 text-left">
              <p className="font-bold mb-1">Falta VITE_GOOGLE_CLIENT_ID</p>
              <p>Configure su Client ID en el panel de Secretos de AI Studio para continuar.</p>
            </div>
          )}

          <button 
            onClick={handleLogin}
            disabled={!CLIENT_ID}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold tracking-wide transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
             <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Conectar con Google
          </button>
        </div>
      </div>
    );
  }

  if (loading && data.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Cargando datos del grupo...</p>
        </div>
      </div>
    );
  }

  const groupPublishers = data.filter(p => {
    const normalizedGrupo = p.grupo.toString().trim();
    // Match "1", "1.0", or "Grupo 1" (case insensitive)
    const isGroup1 = normalizedGrupo === "1" || 
                    normalizedGrupo === "1.0" || 
                    normalizedGrupo.toLowerCase() === "grupo 1";
    
    return isGroup1 && p.nombre.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Debugging information if group is 0
  const totalInAllGroups = data.length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      <header className="h-20 bg-white border-b border-slate-200 px-10 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded flex items-center justify-center text-white font-bold text-xl ring-4 ring-indigo-50">G</div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Registro de Publicadores</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Grupo 1 • Gestión de Informes</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 font-bold" />
            <input 
              type="text" 
              placeholder="Buscar..."
              className="bg-slate-50 border border-slate-200 rounded py-2 pl-9 pr-3 w-64 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="h-10 w-px bg-slate-200 mx-2"></div>
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Periodo</p>
            <p className="text-sm font-bold text-slate-700">{MONTH}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-500 transition-colors bg-slate-50 rounded-lg"
            title="Cerrar sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-10 mt-6 bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button onClick={() => fetchSheetData(accessToken!)} className="text-red-700 p-1 hover:bg-red-100 rounded">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-10 py-6 flex-shrink-0">
        <StatCard label="Total Grupo" value={groupPublishers.length} />
        <StatCard label="Activos" value={groupPublishers.filter(p => p.participo).length} />
        <StatCard 
          label="Auxiliares" 
          value={groupPublishers.filter(p => p.precursorado.includes('auxiliar')).length} 
        />
        <StatCard 
          label="Regulares" 
          value={groupPublishers.filter(p => p.precursorado === 'regular').length} 
        />
      </div>

      <main className="px-10 flex-grow flex flex-col min-h-0 pb-8">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col h-full shadow-sm">
          <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4">
            <div className="col-span-3 px-8">Publicador</div>
            <div className="col-span-1 text-center">Particip&oacute;</div>
            <div className="col-span-1 text-center">Cursos</div>
            <div className="col-span-2 text-center">Precursorado</div>
            <div className="col-span-1 text-center">Horas</div>
            <div className="col-span-4 px-8">Notas</div>
          </div>

          <div className="flex-grow overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {groupPublishers.map((pub, idx) => (
                <motion.div 
                  key={pub.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`grid grid-cols-12 border-b border-slate-100 hover:bg-indigo-50/20 transition-colors items-center min-h-[3.5rem] ${idx % 2 === 1 ? 'bg-slate-50/30' : ''}`}
                >
                  <div className="col-span-3 px-8 font-semibold text-sm text-slate-700">{pub.nombre}</div>
                  
                  <div className="col-span-1 flex justify-center">
                    <input 
                      type="checkbox" 
                      checked={pub.participo}
                      onChange={() => updateField(pub, 'participo', !pub.participo)}
                      disabled={saving?.startsWith(`${pub.id}-participo`)}
                      className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30"
                    />
                  </div>

                  <div className="col-span-1 px-2">
                    <input 
                      type="number" 
                      min="0"
                      value={pub.cursos}
                      onChange={(e) => updateField(pub, 'cursos', parseInt(e.target.value) || 0)}
                      disabled={saving?.startsWith(`${pub.id}-cursos`)}
                      className={`w-full text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 focus:ring-0 rounded-lg py-1 text-sm outline-none transition-all ${pub.cursos === 0 ? 'opacity-30' : ''}`}
                    />
                  </div>

                  <div className="col-span-2 px-4 text-center">
                    <select 
                      value={pub.precursorado}
                      onChange={(e) => updateField(pub, 'precursorado', e.target.value)}
                      disabled={saving?.startsWith(`${pub.id}-precursorado`)}
                      className="bg-slate-100 text-[10px] font-bold border-none rounded-lg px-3 py-1.5 appearance-none uppercase cursor-pointer text-slate-600 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    >
                      <option value=""></option>
                      <option value="Auxiliar 15 hs">Auxiliar 15 hs</option>
                      <option value="Auxiliar 30 hs">Auxiliar 30 hs</option>
                      <option value="Regular">Regular</option>
                    </select>
                  </div>

                  <div className="col-span-1 px-2">
                    <input 
                      type="number" 
                      min="0"
                      value={pub.horas}
                      onChange={(e) => updateField(pub, 'horas', parseInt(e.target.value) || 0)}
                      disabled={saving?.startsWith(`${pub.id}-horas`) || !pub.precursorado}
                      className={`w-full text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 focus:ring-0 rounded-lg py-1 text-sm outline-none transition-all font-bold ${pub.horas === 0 ? 'opacity-30' : ''} disabled:opacity-30 disabled:cursor-not-allowed`}
                    />
                  </div>

                  <div className="col-span-4 px-8">
                    <NoteInput 
                      initialValue={pub.notas}
                      onSave={(val) => updateField(pub, 'notas', val)}
                    />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {groupPublishers.length === 0 && !loading && (
              <div className="p-16 text-center">
                <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400 uppercase tracking-widest text-xs font-semibold">No se encontraron publicadores con Grupo "1"</p>
                {totalInAllGroups > 0 && (
                  <p className="text-[10px] text-slate-300 mt-2 uppercase tracking-tighter">
                    Se encontraron {totalInAllGroups} filas en total. Verifique que la columna "Grupo" contenga el valor "1".
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center text-[11px] text-slate-500 font-medium gap-2">
            <div>Mostrando {groupPublishers.length} publicadores del Grupo 1</div>
            <div className="flex items-center gap-3">
              {saving && <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Guardando...</span>}
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span>Los cambios se guardan automáticamente</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function NoteInput({ initialValue, onSave }: { initialValue: string, onSave: (val: string) => void }) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <input 
      type="text" 
      placeholder="Añadir nota..."
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initialValue) {
          onSave(value);
        }
      }}
      className="w-full bg-transparent border-none text-xs text-slate-500 placeholder-slate-300 focus:ring-0 focus:text-slate-900 transition-all italic hover:bg-slate-50 rounded px-2 py-1"
    />
  );
}

function StatCard({ label, value, subValue, isStatus }: { label: string, value: string | number, subValue?: string, isStatus?: boolean }) {
  return (
    <div className={`bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between min-h-[90px] ${isStatus ? 'border-l-4 border-l-indigo-500' : ''} hover:shadow-md transition-shadow`}>
      <span className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider">{label}</span>
      <div>
        <span className={`${isStatus ? 'text-sm font-bold text-green-600' : 'text-3xl font-light text-slate-800'}`}>
          {isStatus && subValue ? subValue + ' ' : ''}{value}
        </span>
      </div>
    </div>
  );
}

