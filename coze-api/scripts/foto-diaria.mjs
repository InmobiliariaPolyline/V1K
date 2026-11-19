// Toma la foto diaria del historial: llama a central.tomar_foto_diaria() con el rol de escritura acotada `writer_historial`.
// Lo ejecuta .github/workflows/diario.yml una vez al día; a mano:  HISTORIAL_DATABASE_URL=... node scripts/foto-diaria.mjs
//
// El repositorio es PÚBLICO y el registro del flujo también: aquí solo se escribe QUÉ DÍA se tomó la foto, nunca los números.
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'node:url';

/** Pide la foto con una conexión que tenga `.query(texto)`; devuelve { dia: 'AAAA-MM-DD' }. Lanza si no hay fila. */
export async function tomarFoto(sql) {
  const filas = await sql.query('SELECT * FROM central.tomar_foto_diaria()');
  const dia = filas?.[0]?.dia;
  if (!dia) throw new Error('la función no devolvió ninguna fila');
  return { dia: dia instanceof Date ? dia.toISOString().slice(0, 10) : String(dia).slice(0, 10) };
}

/** Mensaje de error sin cadenas de conexión (nunca credenciales en un registro público). */
export const mensajeSeguro = (e) => String(e?.message ?? e ?? 'error').replace(/postgres(ql)?:\/\/\S+/gi, '[conexión]').slice(0, 200);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.HISTORIAL_DATABASE_URL ?? '';
  if (url.length < 20) {
    console.error('Falta el secreto HISTORIAL_DATABASE_URL (Settings → Secrets and variables → Actions) o es demasiado corto.');
    process.exit(2);
  }
  try {
    const { dia } = await tomarFoto(neon(url));
    console.log(`Foto del día ${dia} tomada.`);
  } catch (e) {
    console.error('No se pudo tomar la foto diaria:', mensajeSeguro(e));
    process.exit(1);
  }
}
