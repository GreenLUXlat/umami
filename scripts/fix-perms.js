/* eslint-disable no-console */
/* ── Reparar los permisos de ejecución antes de compilar ──────────────────
   Existe por el entorno de compilación de Hostinger: su instalador escribe
   los archivos con una máscara que les quita el bit de ejecución, así que
   los binarios que pnpm descarga —el motor de migraciones de Prisma, el
   ejecutable de esbuild— quedan en disco como -rw-r--r-- y el primer
   `spawn` muere con EACCES.

   Se comprobó el 11-ago-2026: un `chmod +x` manual arregla la compilación,
   pero el siguiente despliegue reinstala node_modules y el permiso se
   pierde otra vez. Por eso esto corre como PRIMER paso de `pnpm run build`
   (ver package.json): se ejecuta después de instalar y antes de que nadie
   intente lanzar un binario, en todas las compilaciones, sin que nadie
   tenga que acordarse.

   Solo toca rutas concretas —los directorios bin y los motores— en vez de
   recorrer los ~100.000 archivos de node_modules. Y nunca rompe la
   compilación: si algo falla aquí, se anota y se sigue; el error real, si
   lo hay, aparecerá después con su propio mensaje.                        */
const fs = require('fs');
const path = require('path');

function darEjecucion(dir) {
  let n = 0;
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0; // el directorio no existe en esta instalación: nada que hacer
  }
  for (const e of entradas) {
    if (!e.isFile() && !e.isSymbolicLink()) continue;
    try {
      fs.chmodSync(path.join(dir, e.name), 0o755);
      n++;
    } catch {
      /* un archivo que no se deja no puede parar a los demás */
    }
  }
  return n;
}

function main() {
  const raiz = path.join(__dirname, '..', 'node_modules');
  let total = 0;

  // Los lanzadores que npm-run-all y compañía invocan por nombre.
  total += darEjecucion(path.join(raiz, '.bin'));

  // Dentro del almacén de pnpm, las carpetas con binarios que se ejecutan
  // con spawn: los motores de Prisma y el ejecutable de esbuild.
  const almacen = path.join(raiz, '.pnpm');
  let paquetes = [];
  try {
    paquetes = fs.readdirSync(almacen);
  } catch {
    console.log('fix-perms: sin node_modules/.pnpm (¿instalación sin pnpm?); nada que hacer');
    return;
  }

  for (const d of paquetes) {
    if (d.startsWith('@prisma+engines@')) {
      total += darEjecucion(path.join(almacen, d, 'node_modules', '@prisma', 'engines'));
    } else if (d.startsWith('prisma@')) {
      total += darEjecucion(path.join(almacen, d, 'node_modules', 'prisma', 'build'));
    } else if (d.startsWith('esbuild@')) {
      total += darEjecucion(path.join(almacen, d, 'node_modules', 'esbuild', 'bin'));
    } else if (d.startsWith('@esbuild+')) {
      // @esbuild+linux-x64@x.y.z/node_modules/@esbuild/linux-x64/bin
      const ambito = path.join(almacen, d, 'node_modules', '@esbuild');
      let plataformas = [];
      try {
        plataformas = fs.readdirSync(ambito);
      } catch {
        continue;
      }
      for (const p of plataformas) {
        total += darEjecucion(path.join(ambito, p, 'bin'));
      }
    }
  }

  console.log(`fix-perms: permiso de ejecución asegurado en ${total} archivos`);
}

try {
  main();
} catch (e) {
  console.log('fix-perms: aviso —', e.message);
}
process.exit(0);
