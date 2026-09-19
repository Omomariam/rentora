import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

export const root = path.resolve(import.meta.dirname, '..');
export const sourcePath = path.join(root, 'contracts', 'RentoraEscrowV2.sol');
export const sourceName = 'contracts/RentoraEscrowV2.sol';
export const contractName = 'RentoraEscrowV2';

export function compileContract() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { [sourceName]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'metadata'] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter(item => item.severity === 'error');
  if (errors.length) throw new Error(errors.map(item => item.formattedMessage).join('\n'));
  const contract = output.contracts[sourceName][contractName];
  const compilerVersion = `v${solc.version().split('.Emscripten')[0]}`;
  return { contract, input, compilerVersion };
}

export function writeArtifact(contract) {
  const directory = path.join(root, 'artifacts');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${contractName}.json`), JSON.stringify(contract, null, 2));
}
