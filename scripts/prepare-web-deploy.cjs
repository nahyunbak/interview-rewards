// Vercel CLI uploads web/ alone. Reuse the exact versions from the monorepo lock.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const lock=fs.readFileSync(path.join(root,'pnpm-lock.yaml'),'utf8');
const prefix=lock.slice(0,lock.indexOf('importers:'));
const start=lock.indexOf('\n  web:\n');
const packages=lock.indexOf('\npackages:\n');
if(start<0||packages<start)throw new Error('web importer missing from pnpm lock');
const importer=lock.slice(start,packages).replace('\n  web:\n','\n  .:\n');
fs.writeFileSync(path.join(root,'web/pnpm-lock.yaml'),prefix+'importers:\n'+importer+lock.slice(packages));
console.log('Prepared standalone frontend lock from the existing monorepo lock.');
