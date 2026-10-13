import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const cwd = fileURLToPath(new URL("../",import.meta.url));
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED:"1", PAPER_DESKTOP_BUILD:"1" };
delete env.ELECTRON_RUN_AS_NODE;
async function run(binary,args) {
  await new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{cwd,env,stdio:"inherit",windowsHide:true});
    child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(new Error(`Command exited with ${code}`)));
  });
}
const mode=process.argv[2] || "dev";
try {
  if(mode!=="electron")await run(process.execPath,[fileURLToPath(new URL("../node_modules/astro/bin/astro.mjs",import.meta.url)),"build"]);
  if(mode==="dev"||mode==="electron")await run(require("electron"),[cwd,...process.argv.slice(3)]);
} catch(error){console.error(error.message);process.exitCode=1;}
