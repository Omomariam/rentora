import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { ContractFactory, JsonRpcProvider, Wallet } from 'ethers';
import { compileContract, root, writeArtifact } from './contract-tools.mjs';

const rpcUrl = 'https://rpc.bohr.life';
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error('PRIVATE_KEY is missing from .env.');

const provider = new JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
if (network.chainId !== 968n) throw new Error(`Refusing to deploy to chain ${network.chainId}; expected BOT Chain testnet 968.`);

const signer = new Wallet(privateKey, provider);
const { contract, compilerVersion } = compileContract();
writeArtifact(contract);

const factory = new ContractFactory(contract.abi, `0x${contract.evm.bytecode.object}`, signer);
console.log(`Deploying RentoraEscrow from ${signer.address} to BOT Chain testnet...`);
const instance = await factory.deploy();
const deployment = instance.deploymentTransaction();
console.log(`Transaction submitted: ${deployment.hash}`);
await instance.waitForDeployment();
const address = await instance.getAddress();
const receipt = await deployment.wait(2);

const record = {
  network: 'BOT Chain Testnet',
  chainId: 968,
  address,
  transactionHash: deployment.hash,
  blockNumber: receipt.blockNumber,
  deployer: signer.address,
  compilerVersion,
  deployedAt: new Date().toISOString(),
  explorerUrl: `https://scan.bohr.life/address/${address}`
};
const deployments = path.join(root, 'deployments');
fs.mkdirSync(deployments, { recursive: true });
fs.writeFileSync(path.join(deployments, 'testnet.json'), JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
