'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
for(const test of ['site/test/site.test.js','site/test/settlement.test.js','builder/rung.test.js','builder/server.test.js','launch/admin.test.js']) {
  const result=spawnSync(process.execPath,[test],{cwd:path.resolve(__dirname,'..'),stdio:'inherit',windowsHide:true,timeout:30000});
  if(result.status!==0)process.exit(result.status||1);
}
console.log('OK: STOCK_CANDLE_CLOSEOUT_SUITE_PASS (5 suites)');
