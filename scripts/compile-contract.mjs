import { compileContract, writeArtifact } from './contract-tools.mjs';

const { contract, compilerVersion } = compileContract();
writeArtifact(contract);
console.log(`RentoraEscrow compiled with ${compilerVersion}.`);
