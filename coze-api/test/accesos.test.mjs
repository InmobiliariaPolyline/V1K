// Pruebas de los accesos del bot de Telegram: db/04_accesos.sql (tabla, vista y rol) contra un Postgres de prueba (PGlite) y el
// manejador de /api/accesos (token de administrador, validación, tope, errores sin filtraciones). Todo con datos ficticios y sin red.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { MAX_ACCESOS, TELEFONO_RE, adminTokenValido, crearManejadorAccesos, validarPersona } from '../lib/accesos.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const igual = (a, b, m) => { n++; assert.deepEqual(a, b, m); };

// ── La base: tabla, vista y rol ──────────────────────────────────────────────────────────
const pg = new PGlite();
await pg.exec(leer('db', '01_schema.sql'));
await pg.exec("CREATE ROLE coze_reader LOGIN PASSWORD 'x';"); // existen antes que 03 y 04, como en Neon
const sql03 = leer('db', '03_historial.sql');
const sql04 = leer('db', '04_accesos.sql');
await pg.exec(sql03);
await pg.exec(sql04);
await pg.exec(sql04); // repetirlo no rompe nada
ok(true, '04_accesos.sql se puede ejecutar dos veces');

const filasDe = async (texto, params = []) => (await pg.query(texto, params)).rows;
const puede = async (rol, objeto, privilegio) => (await pg.query('SELECT has_table_privilege($1, $2, $3) AS p', [rol, objeto, privilegio])).rows[0].p;

{
  const rol = (await filasDe("SELECT rolconnlimit, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolconfig FROM pg_roles WHERE rolname = 'writer_accesos'"))[0];
  ok(rol, 'existe el rol writer_accesos');
  igual([rol.rolcanlogin, rol.rolsuper, rol.rolcreatedb, rol.rolcreaterole, rol.rolconnlimit], [true, false, false, false, 3], 'puede conectarse, no es superusuario y tiene máximo 3 conexiones');
  ok(rol.rolconfig.some((c) => c.startsWith('statement_timeout')), 'tiene límite de tiempo por consulta');

  for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) ok(await puede('writer_accesos', 'central.telegram_accesos', p), `writer_accesos puede ${p} en la tabla de accesos`);
  ok(!(await puede('writer_accesos', 'central.telegram_accesos', 'TRUNCATE')), 'writer_accesos no puede vaciar la tabla de golpe');
  for (const t of ['planner_proyectos', 'planner_hitos', 'mrp_stock', 'mrp_pedidos', 'scraper_propiedades', 'scraper_resumen', 'sync_estado', 'historial_diario']) {
    for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) ok(!(await puede('writer_accesos', `central.${t}`, p)), `writer_accesos NO puede ${p} en ${t}`);
  }

  // Quien lee (Coze, el bot y el resumen) ve solo la vista de números de chat, nunca nombres ni teléfonos
  for (const r of ['coze_reader', 'writer_historial']) {
    ok(await puede(r, 'central.v_telegram_chats_activos', 'SELECT'), `${r} lee la vista de números de chat`);
    for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) ok(!(await puede(r, 'central.telegram_accesos', p)), `${r} NO puede ${p} en la tabla de accesos (nombres y teléfonos)`);
  }
  for (const r of ['writer_scraper', 'writer_planner', 'writer_mrp']) {
    const existe = (await filasDe('SELECT 1 FROM pg_roles WHERE rolname = $1', [r])).length > 0;
    if (existe) ok(!(await puede(r, 'central.telegram_accesos', 'SELECT')), `${r} no ve los accesos`);
  }
  const cols = (await filasDe("SELECT column_name FROM information_schema.columns WHERE table_schema = 'central' AND table_name = 'v_telegram_chats_activos'")).map((c) => c.column_name);
  igual(cols, ['chat_id'], 'la vista expone únicamente el número de chat');
}

// ── Restricciones de la tabla ────────────────────────────────────────────────────────────
const falla = async (texto, params, msg) => { await assert.rejects(() => pg.query(texto, params), undefined, msg); n++; };
await falla("INSERT INTO central.telegram_accesos (chat_id, nombre, telefono) VALUES (0, 'Ana', '+51 999 888 777')", [], 'chat 0 no vale');
await falla("INSERT INTO central.telegram_accesos (chat_id, nombre, telefono) VALUES (-100123, 'Grupo', '+51 999 888 777')", [], 'un chat negativo (grupo) no vale: solo personas');
await falla("INSERT INTO central.telegram_accesos (chat_id, nombre, telefono) VALUES (111111, 'A', '+51 999 888 777')", [], 'nombre de un carácter');
await falla("INSERT INTO central.telegram_accesos (chat_id, nombre, telefono) VALUES (111111, 'Ana', 'no es un teléfono')", [], 'teléfono inválido');
await falla("INSERT INTO central.telegram_accesos (chat_id, nombre, telefono) VALUES (111111, 'Ana', '12')", [], 'teléfono demasiado corto');
await pg.query("INSERT INTO central.telegram_accesos (chat_id, nombre, telefono) VALUES (111111, 'Ana', '+51 999 888 777')"); n++;
await falla("INSERT INTO central.telegram_accesos (chat_id, nombre, telefono) VALUES (111111, 'Otra', '+51 999 888 777')", [], 'el mismo chat no se duplica');
await pg.query('DELETE FROM central.telegram_accesos'); n++;

// ── Validación (pura) ────────────────────────────────────────────────────────────────────
ok(TELEFONO_RE.test('+51 999 888 777') && TELEFONO_RE.test('999-888-777') && TELEFONO_RE.test('999888777'), 'teléfonos válidos');
ok(!TELEFONO_RE.test('abc') && !TELEFONO_RE.test('12') && !TELEFONO_RE.test('+51 (999) 888') && !TELEFONO_RE.test('999 888 777 <b>'), 'teléfonos inválidos');
{
  const v = validarPersona({ chat_id: '123 456 789', nombre: '  Juan   Pérez ', telefono: '+51   999 888 777' });
  igual(v, { ok: true, valor: { chat_id: '123456789', nombre: 'Juan Pérez', telefono: '+51 999 888 777' } }, 'se normalizan espacios en chat, nombre y teléfono');
  igual(validarPersona({ chat_id: 123456789, nombre: 'Ana', telefono: '999888777' }).ok, true, 'el chat puede llegar como número');
  for (const [chat_id, motivo] of [['', 'vacío'], ['abc', 'letras'], ['-123456789', 'negativo'], ['1234', 'muy corto'], ['0123456789', 'empieza en cero'], ['1'.repeat(16), 'demasiado largo'], ['123456789; DROP TABLE x', 'inyección'], [null, 'nulo']]) {
    ok(!validarPersona({ chat_id, nombre: 'Ana', telefono: '999888777' }).ok, `chat inválido (${motivo})`);
  }
  ok(!validarPersona({ chat_id: '123456789', nombre: 'A', telefono: '999888777' }).ok, 'nombre muy corto');
  ok(!validarPersona({ chat_id: '123456789', nombre: 'x'.repeat(61), telefono: '999888777' }).ok, 'nombre muy largo');
  ok(!validarPersona({ chat_id: '123456789', nombre: '   ', telefono: '999888777' }).ok, 'nombre en blanco');
  ok(!validarPersona({ chat_id: '123456789', nombre: 'Ana', telefono: '' }).ok, 'sin teléfono');
  const raro = validarPersona({ chat_id: '123456789', nombre: 'An\u0000a‮\n Gómez', telefono: '999888777' });
  igual(raro.valor.nombre, 'An a Gómez', 'se quitan caracteres de control y de dirección de texto del nombre');
  for (const malo of [null, undefined, 'texto', 5, [], true]) ok(!validarPersona(malo).ok, `cuerpo inválido: ${JSON.stringify(malo)}`);
}

// ── Token de administrador ───────────────────────────────────────────────────────────────
const ADMIN = 'A'.repeat(20) + 'b'.repeat(20);
ok(adminTokenValido(`Bearer ${ADMIN}`, ADMIN), 'token correcto');
ok(!adminTokenValido(`Bearer ${ADMIN}x`, ADMIN) && !adminTokenValido(ADMIN, ADMIN) && !adminTokenValido(undefined, ADMIN) && !adminTokenValido('Bearer ', ADMIN), 'incorrecto, sin «Bearer», ausente o vacío');
ok(!adminTokenValido('Bearer corto', 'corto') && !adminTokenValido(`Bearer ${'x'.repeat(31)}`, 'x'.repeat(31)), 'un token esperado de menos de 32 caracteres nunca vale');
ok(!adminTokenValido(`Bearer ${ADMIN}`, undefined), 'sin token configurado nadie entra');
ok(!adminTokenValido([`Bearer ${ADMIN}`], ADMIN), 'una cabecera repetida (arreglo) no vale');

// ── El manejador HTTP, contra la base de prueba ──────────────────────────────────────────
const ENTORNO = { ADMIN_TOKEN: ADMIN, DATABASE_URL_ACCESOS: 'postgres://x' };
const sqlReal = async (texto, params) => (await pg.query(texto, params)).rows;
const aviso = [];
const notificar = async (chat) => { aviso.push(chat); return true; };
const manejador = (extra = {}) => crearManejadorAccesos({ env: ENTORNO, sql: sqlReal, notificar, ...extra });
const resFalsa = () => ({ cabeceras: {}, codigo: 0, cuerpo: null, setHeader(k, v) { this.cabeceras[k] = v; }, status(c) { this.codigo = c; return this; }, json(c) { this.cuerpo = c; return this; } });
const llamar = async (metodo, cuerpo, token = ADMIN, m = manejador()) => {
  const res = resFalsa();
  await m({ method: metodo, headers: token === null ? {} : { authorization: `Bearer ${token}` }, body: cuerpo }, res);
  return res;
};
const PERSONA = { chat_id: '123456789', nombre: 'Ana Prueba', telefono: '+51 999 888 777' };

{
  let r = await llamar('PUT', {});
  igual([r.codigo, r.cabeceras.Allow], [405, 'GET, POST, PATCH, DELETE'], 'PUT → 405');
  igual(r.cabeceras['Cache-Control'], 'no-store', 'sin caché');
  r = await llamar('OPTIONS', {}); igual(r.codigo, 405, 'OPTIONS → 405 (sin CORS: solo el mismo sitio)');

  for (const env of [{}, { ADMIN_TOKEN: ADMIN }, { DATABASE_URL_ACCESOS: 'x' }, { ADMIN_TOKEN: 'corto', DATABASE_URL_ACCESOS: 'x' }]) {
    const res = resFalsa(); await crearManejadorAccesos({ env, sql: sqlReal })({ method: 'GET', headers: { authorization: `Bearer ${ADMIN}` } }, res);
    igual(res.codigo, 503, `sin configurar (${Object.keys(env).join(',') || 'nada'}) → 503`);
  }

  for (const [nombre, token] of [['sin cabecera', null], ['token equivocado', 'x'.repeat(40)], ['vacío', ''], ['token de lectura de Coze', 'L'.repeat(40)]]) {
    for (const metodo of ['GET', 'POST', 'PATCH', 'DELETE']) {
      r = await llamar(metodo, PERSONA, token);
      igual(r.codigo, 401, `${metodo} ${nombre} → 401`);
      ok(JSON.stringify(r.cuerpo).length < 120 && !/neon|postgres|chat_id/i.test(JSON.stringify(r.cuerpo)), `${metodo} ${nombre}: la respuesta no filtra nada`);
    }
  }
  igual((await filasDe('SELECT count(*)::int AS n FROM central.telegram_accesos'))[0].n, 0, 'los intentos sin permiso no escribieron nada');

  r = await llamar('GET');
  igual([r.codigo, r.cuerpo.total, r.cuerpo.maximo, r.cuerpo.datos], [200, 0, MAX_ACCESOS, []], 'lista vacía al principio');

  r = await llamar('POST', PERSONA);
  igual(r.codigo, 201, 'alta → 201');
  igual([r.cuerpo.persona.chat_id, r.cuerpo.persona.nombre, r.cuerpo.persona.telefono, r.cuerpo.persona.activo], ['123456789', 'Ana Prueba', '+51 999 888 777', true], 'la persona queda activa');
  igual([r.cuerpo.notificado, r.cuerpo.actualizado], [true, false], 'se le avisó por Telegram');
  igual(aviso, ['123456789'], 'se avisó al chat correcto');
  igual((await filasDe('SELECT chat_id FROM central.v_telegram_chats_activos')).map((f) => f.chat_id), ['123456789'], 'la vista que lee el bot ya incluye a la persona');

  r = await llamar('POST', { ...PERSONA, nombre: 'Ana P. Actualizada' });
  igual([r.codigo, r.cuerpo.actualizado, r.cuerpo.persona.nombre], [200, true, 'Ana P. Actualizada'], 'repetir el alta actualiza a la persona, no la duplica');
  igual((await filasDe('SELECT count(*)::int AS n FROM central.telegram_accesos'))[0].n, 1, 'sigue habiendo una fila');

  r = await llamar('POST', { chat_id: '987654321', nombre: 'Luis Prueba', telefono: '999-111-222' });
  igual(r.codigo, 201, 'segunda persona');
  r = await llamar('GET');
  igual(r.cuerpo.datos.map((d) => d.nombre), ['Ana P. Actualizada', 'Luis Prueba'], 'la lista llega ordenada por nombre');
  ok(r.cuerpo.datos.every((d) => typeof d.chat_id === 'string'), 'el número de chat viaja como texto (no se pierde precisión)');

  // Revocar y reactivar
  aviso.length = 0;
  r = await llamar('PATCH', { chat_id: '123456789', activo: false });
  igual([r.codigo, r.cuerpo.persona.activo, r.cuerpo.notificado], [200, false, false], 'revocar: no se le avisa');
  igual((await filasDe('SELECT chat_id FROM central.v_telegram_chats_activos ORDER BY 1')).map((f) => f.chat_id), ['987654321'], 'revocada: sale de la vista que lee el bot');
  igual(aviso, [], 'revocar no envía mensajes');
  r = await llamar('PATCH', { chat_id: '123456789', activo: true });
  igual([r.cuerpo.persona.activo, r.cuerpo.notificado, aviso], [true, true, ['123456789']], 'reactivar: vuelve y se le avisa');
  r = await llamar('PATCH', { chat_id: '123456789' }); igual(r.codigo, 400, 'PATCH sin «activo» → 400');
  r = await llamar('PATCH', { chat_id: '123456789', activo: 'si' }); igual(r.codigo, 400, '«activo» no booleano → 400');
  r = await llamar('PATCH', { chat_id: '555555555', activo: false }); igual(r.codigo, 404, 'PATCH de alguien que no está → 404');
  r = await llamar('PATCH', { chat_id: 'abc', activo: false }); igual(r.codigo, 400, 'PATCH con chat inválido → 400');

  // Quitar
  r = await llamar('DELETE', { chat_id: '987654321' });
  igual([r.codigo, r.cuerpo.eliminada], [200, '987654321'], 'quitar → 200');
  r = await llamar('DELETE', { chat_id: '987654321' }); igual(r.codigo, 404, 'quitar a alguien que ya no está → 404');
  r = await llamar('DELETE', {}); igual(r.codigo, 400, 'DELETE sin chat → 400');
  r = await llamar('DELETE', "{ esto no es json"); igual(r.codigo, 400, 'cuerpo que no es JSON → 400');
  r = await llamar('DELETE', JSON.stringify({ chat_id: '123456789' })); igual(r.codigo, 200, 'el cuerpo también puede llegar como texto JSON');

  // Datos inválidos no escriben nada
  for (const [malo, msg] of [[{ ...PERSONA, chat_id: 'abc' }, 'chat con letras'], [{ ...PERSONA, telefono: 'xx' }, 'teléfono inválido'], [{ ...PERSONA, nombre: '' }, 'sin nombre'], [{}, 'cuerpo vacío'], [null, 'sin cuerpo']]) {
    r = await llamar('POST', malo);
    igual(r.codigo, 400, `alta inválida (${msg}) → 400`);
    ok(typeof r.cuerpo.error === 'string' && r.cuerpo.error.length > 10, `alta inválida (${msg}): mensaje claro para el administrador`);
  }
  igual((await filasDe('SELECT count(*)::int AS n FROM central.telegram_accesos'))[0].n, 0, 'las altas inválidas no escribieron nada');
  r = await llamar('POST', { ...PERSONA, nombre: 'x'.repeat(3000) }); igual(r.codigo, 413, 'solicitud enorme → 413');

  // Inyección SQL en el nombre: se guarda como texto, no se ejecuta
  r = await llamar('POST', { chat_id: '222333444', nombre: "Robert'); DROP TABLE central.telegram_accesos;--", telefono: '999888777' });
  igual(r.codigo, 201, 'un nombre con comillas es solo texto');
  ok((await filasDe("SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_accesos'")).length === 1, 'la tabla sigue existiendo');
  await llamar('DELETE', { chat_id: '222333444' });

  // Aviso a Telegram que falla: el alta igual se guarda
  const sinAviso = manejador({ notificar: async () => { throw new Error('Telegram caído'); } });
  r = await llamar('POST', PERSONA, ADMIN, sinAviso);
  igual([r.codigo, r.cuerpo.notificado], [201, false], 'si el aviso falla, el alta se guarda y se informa notificado=false');
  r = await llamar('POST', { chat_id: '444555666', nombre: 'Sin aviso', telefono: '999888777' }, ADMIN, manejador({ notificar: async () => false }));
  igual(r.cuerpo.notificado, false, 'si la persona aún no pulsó Iniciar, notificado=false');
  await pg.query('DELETE FROM central.telegram_accesos');
  n++;

  // Tope de personas
  for (let i = 0; i < MAX_ACCESOS; i++) await pg.query('INSERT INTO central.telegram_accesos (chat_id, nombre, telefono) VALUES ($1, $2, $3)', [100000 + i, `Persona ${i}`, '999888777']);
  r = await llamar('POST', { chat_id: '999999999', nombre: 'Una más', telefono: '999888777' });
  igual(r.codigo, 409, `la persona ${MAX_ACCESOS + 1} se rechaza con 409`);
  ok(r.cuerpo.error.includes(String(MAX_ACCESOS)), 'el mensaje dice el máximo');
  r = await llamar('POST', { chat_id: '100000', nombre: 'Ya estaba', telefono: '999888777' });
  igual(r.codigo, 200, 'con la lista llena, actualizar a alguien que ya está sí se puede');
  await pg.query('DELETE FROM central.telegram_accesos');
  n++;

  // Fallos de la base: el cliente recibe un mensaje genérico, sin detalles
  const rota = manejador({ sql: async () => { throw new Error('connection to ep-secreto.neon.tech failed: password authentication failed for user writer_accesos'); } });
  for (const metodo of ['GET', 'POST', 'PATCH', 'DELETE']) {
    r = await llamar(metodo, metodo === 'PATCH' ? { chat_id: PERSONA.chat_id, activo: true } : PERSONA, ADMIN, rota);
    ok(r.codigo === 502 && !/neon|password|writer_accesos|secreto/i.test(JSON.stringify(r.cuerpo)), `${metodo}: si la base falla → 502 genérico, sin detalles`);
  }
}

// ── El módulo del panel (public/js/nucleo/accesos.js): mismas reglas que el servidor ───────
{
  const P = await import('../public/js/nucleo/accesos.js');
  const { ErrorApi } = await import('../public/js/nucleo/api.js');
  igual(P.MAX_ACCESOS, MAX_ACCESOS, 'el panel y el servidor comparten el mismo tope');
  // El formulario del panel acepta y rechaza exactamente lo mismo que el servidor
  const casos = [
    { chat_id: '123456789', nombre: 'Ana', telefono: '+51 999 888 777' }, { chat_id: '12345', nombre: 'Al', telefono: '999-888-777' }, { chat_id: '123 456 789', nombre: ' Ana  Paz ', telefono: '999888777' },
    { chat_id: 'abc', nombre: 'Ana', telefono: '999888777' }, { chat_id: '-123456789', nombre: 'Ana', telefono: '999888777' }, { chat_id: '0123456789', nombre: 'Ana', telefono: '999888777' },
    { chat_id: '123456789', nombre: 'A', telefono: '999888777' }, { chat_id: '123456789', nombre: 'x'.repeat(61), telefono: '999888777' }, { chat_id: '123456789', nombre: 'Ana', telefono: '12' },
    { chat_id: '123456789', nombre: 'Ana', telefono: 'abc' }, { chat_id: '', nombre: '', telefono: '' },
  ];
  for (const c of casos) {
    const panel = P.validarFormulario(c), servidor = validarPersona(c);
    igual(panel.ok, servidor.ok, `panel y servidor coinciden con ${JSON.stringify(c).slice(0, 70)}`);
    if (panel.ok) igual(panel.valor, servidor.valor, 'y normalizan igual');
  }
  const mal = P.validarFormulario({ chat_id: 'x', nombre: '', telefono: '1' });
  igual(Object.keys(mal.errores).sort(), ['chat_id', 'nombre', 'telefono'], 'cada campo inválido trae su mensaje');
  ok(Object.values(mal.errores).every((t) => t.length > 15), 'mensajes claros');

  igual(P.resumirAccesos([]), { total: 0, activos: 0, revocados: 0, libres: MAX_ACCESOS }, 'resumen de lista vacía');
  igual(P.resumirAccesos([{ activo: true }, { activo: true }, { activo: false }]), { total: 3, activos: 2, revocados: 1, libres: MAX_ACCESOS - 3 }, 'resumen con activos y revocados');
  ok(P.textoAlta({ notificado: true }, 'Ana').includes('se le avisó'), 'aviso: se notificó');
  ok(P.textoAlta({ notificado: false }, 'Ana').includes('Iniciar'), 'aviso: si no se pudo notificar, dice que debe pulsar «Iniciar»');
  ok(P.textoAlta({ actualizado: true }, 'Ana').includes('actualizados'), 'aviso: datos actualizados');

  // Motor de demostración
  const reloj = () => new Date('2026-11-19T15:00:00Z');
  const demo = P.crearDemoAccesos(reloj);
  let r = await demo('GET');
  igual([r.total, r.datos.map((p) => p.activo)], [2, [true, false]], 'la demostración trae dos personas de ejemplo, las activas primero');
  r = await demo('POST', { chat_id: '555666777', nombre: 'Marta Prueba', telefono: '999888777' });
  igual([r.persona.activo, r.notificado, r.actualizado], [true, false, false], 'demostración: alta (nunca envía nada a Telegram)');
  r = await demo('POST', { chat_id: '555666777', nombre: 'Marta P.', telefono: '999888777' });
  igual([r.actualizado, r.persona.nombre], [true, 'Marta P.'], 'demostración: repetir actualiza');
  r = await demo('PATCH', { chat_id: '555666777', activo: false });
  igual(r.persona.activo, false, 'demostración: revocar');
  r = await demo('DELETE', { chat_id: '555666777' });
  igual(r.eliminada, '555666777', 'demostración: quitar');
  for (const [m, cuerpo, estado] of [['DELETE', { chat_id: '555666777' }, 404], ['PATCH', { chat_id: '999000111', activo: true }, 404], ['POST', { chat_id: 'x', nombre: 'Ana', telefono: '999888777' }, 400]]) {
    await assert.rejects(() => demo(m, cuerpo), (e) => e instanceof ErrorApi && e.estado === estado); n++;
  }
  const llena = P.crearDemoAccesos(reloj);
  for (let i = 0; i < MAX_ACCESOS - 2; i++) await llena('POST', { chat_id: String(300000 + i), nombre: `Persona ${i}`, telefono: '999888777' });
  await assert.rejects(() => llena('POST', { chat_id: '999999999', nombre: 'Una más', telefono: '999888777' }), (e) => e.estado === 409); n++;
  ok((await llena('POST', { chat_id: '300000', nombre: 'Ya estaba', telefono: '999888777' })).actualizado, 'demostración: con la lista llena se puede actualizar a quien ya está');

  // El token de administrador solo vive en memoria
  ok(!P.hayAdmin(), 'sin token de administrador no hay acceso');
  P.entrarAdmin('Z'.repeat(40)); ok(P.hayAdmin(), 'con token de 40 caracteres hay acceso');
  P.salirAdmin(); ok(!P.hayAdmin(), 'salir lo olvida');
  P.entrarAdmin('corto'); ok(!P.hayAdmin(), 'un token corto no cuenta'); P.salirAdmin();
  const codigoPanel = fs.readFileSync(path.join(raiz, 'coze-api', 'public', 'js', 'nucleo', 'accesos.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  ok(!/localStorage|sessionStorage|document\.cookie/.test(codigoPanel), 'el token de administrador nunca se guarda en el navegador');
  ok(/vistas\/accesos\.js/.test(fs.readFileSync(path.join(raiz, 'coze-api', 'public', 'js', 'app.js'), 'utf8')) && /'accesos'/.test(fs.readFileSync(path.join(raiz, 'coze-api', 'public', 'js', 'nucleo', 'rutas.js'), 'utf8')), 'la sección está registrada en el enrutador del panel');
}

// ── Estáticas ────────────────────────────────────────────────────────────────────────────
{
  const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const api = sinComentarios(leer('coze-api', 'api', 'accesos.js'));
  const lib = sinComentarios(leer('coze-api', 'lib', 'accesos.js'));
  ok(api.includes('DATABASE_URL_ACCESOS') && !/DATABASE_URL_READER|DATABASE_URL(?!_ACCESOS)/.test(api), 'el módulo usa solo la cadena del rol writer_accesos');
  ok(!/console\.(log|error|warn)/.test(api + lib), 'no escribe nada en los registros (el repositorio es público)');
  ok(!/process\.env\.ADMIN_TOKEN[^;]*(json|send|log)/.test(api + lib), 'el token de administrador no se devuelve ni se imprime');
  ok(!/eval\(|new Function|child_process/.test(api + lib), 'sin ejecución dinámica');
  const telegram = sinComentarios(leer('coze-api', 'api', 'telegram.js'));
  ok(/v_telegram_chats_activos/.test(telegram) && !/telegram_accesos\b/.test(telegram.replace(/v_telegram_chats_activos/g, '')), 'el bot lee solo la vista de números de chat con su rol de solo lectura');
  const mod = await import('../api/accesos.js');
  ok(typeof mod.default === 'function', 'api/accesos.js exporta el manejador');
  const res = resFalsa(); const guardado = { ...process.env };
  delete process.env.ADMIN_TOKEN;
  await mod.default({ method: 'GET', headers: {} }, res);
  igual(res.codigo, 503, 'el endpoint real sin variables → 503');
  Object.assign(process.env, guardado);
}

await pg.close();
console.log(`OK: accesos del bot — ${n} comprobaciones (tabla, vista, permisos del rol, token de administrador, validación, tope y errores sin filtraciones)`);
