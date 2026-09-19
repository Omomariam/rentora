import { compileContract, contractName, writeArtifact } from './contract-tools.mjs';

const { contract, compilerVersion } = compileContract();
writeArtifact(contract);
console.log(`${contractName} compiled with ${compilerVersion}.`);
