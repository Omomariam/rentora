import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { compileContract, root, sourceName } from './contract-tools.mjs';

const deploymentPath = path.join(root, 'deployments', 'testnet.json');
if (!fs.existsSync(deploymentPath)) throw new Error('No testnet deployment record found. Deploy the contract first.');
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const apiKey = process.env.BLOCKSCOUT_API_KEY;
if (!apiKey) throw new Error('BLOCKSCOUT_API_KEY is missing from .env.');

const { input, compilerVersion } = compileContract();
const body = new URLSearchParams({
  module: 'contract',
  action: 'verifysourcecode',
  apikey: apiKey,
  contractaddress: deployment.address,
  sourceCode: JSON.stringify(input),
  codeformat: 'solidity-standard-json-input',
  contractname: `${sourceName}:RentoraEscrow`,
  compilerversion: compilerVersion,
  optimizationUsed: '1',
  runs: '200'
});

const response = await fetch('https://scan.bohr.life/api', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body
});
const raw = await response.text();
let result;
try { result = JSON.parse(raw); } catch { throw new Error(`Explorer returned HTTP ${response.status} with an unreadable response.`); }
if (!response.ok || (result.status !== '1' && !String(result.result || '').toLowerCase().includes('already verified'))) {
  throw new Error(`Verification submission failed: ${result.result || result.message || `HTTP ${response.status}`}`);
}
const guid = result.result;
if (String(guid).toLowerCase().includes('already verified')) {
  console.log(`Contract ${deployment.address} is already verified.`);
  process.exit(0);
}

for (let attempt = 0; attempt < 12; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 3000));
  const statusUrl = new URL('https://scan.bohr.life/api');
  statusUrl.search = new URLSearchParams({ module: 'contract', action: 'checkverifystatus', guid, apikey: apiKey });
  const statusResponse = await fetch(statusUrl);
  const status = await statusResponse.json();
  const detail = String(status.result || status.message || '');
  if (/pass|verified/i.test(detail)) {
    console.log(`Contract verified: https://scan.bohr.life/address/${deployment.address}?tab=contract`);
    process.exit(0);
  }
  if (/fail|unable/i.test(detail)) throw new Error(`Verification failed: ${detail}`);
}
throw new Error('Verification is still pending. Run this command again to check the explorer.');
