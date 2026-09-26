#!/usr/bin/env node
// Run locally; publish only index.html, style.css, app.js and data/.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pbkdf2Sync,randomBytes,createCipheriv} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(process.argv[2]??join(root,'authoring','content.private.json'));
const out=join(root,'data');
const content=JSON.parse(await readFile(source,'utf8'));
if(!Array.isArray(content.stages)||content.stages.length!==10) throw new Error('Exactly ten stages are required.');
if(typeof content.intro?.title!=='string'||typeof content.intro?.description!=='string') throw new Error('An Abisko introduction with a title and description is required.');

await mkdir(out,{recursive:true});
function stagePath(n){return join(out,`stage${String(n).padStart(2,'0')}.json`);}
function stage(n){
  if(n===11) return {stage:n,ending:content.ending??'You made it to the end.'};
  const stageContent=content.stages[n-1];
  if(!stageContent || typeof stageContent.title!=='string'||typeof stageContent.description!=='string'||typeof stageContent.input!=='string') throw new Error(`Missing content for stage ${n}.`);
  return {stage:n,title:stageContent.title,description:stageContent.description,input:stageContent.input};
}
await writeFile(stagePath(0),JSON.stringify({stage:0,title:content.intro.title,description:content.intro.description})+'\n');
await writeFile(stagePath(1),JSON.stringify(stage(1))+'\n');
for(let n=2;n<=11;n++) {
  const answer=content.stages[n-2].answer;
  if(typeof answer!=='string'||!answer.trim()) throw new Error(`Missing answer for stage ${n-1}.`);
  const salt=randomBytes(16),iv=randomBytes(12),iterations=180000;
  const key=pbkdf2Sync(answer.trim().replace(/\r\n?/g,'\n'),salt,iterations,32,'sha256');
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(stage(n)),'utf8'),cipher.final(),cipher.getAuthTag()]);
  await writeFile(stagePath(n),JSON.stringify({version:1,salt:salt.toString('base64'),iv:iv.toString('base64'),iterations,ciphertext:encrypted.toString('base64')})+'\n');
}
console.log(`Generated introduction, 10 stages, and ending in ${out} from ${source}. Publish data/; keep the source private when it contains real answers.`);
