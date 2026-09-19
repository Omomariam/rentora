import { BrowserProvider, Contract, JsonRpcProvider } from 'ethers';
import deployment from '../deployments/testnet.json';

export const CHAIN = {
  id: 968,
  hexId: '0x3C8',
  name: 'BOT Chain Testnet',
  currency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrl: 'https://rpc.bohr.life',
  explorerUrl: 'https://scan.bohr.life',
  faucetUrl: 'https://faucet.botchain.ai'
};

export const CONTRACT_ADDRESS = deployment.address;
export const CONTRACT_URL = `${CHAIN.explorerUrl}/address/${CONTRACT_ADDRESS}`;

export const ABI = [
  'error Unauthorized()',
  'error InvalidTerms()',
  'error InvalidStatus()',
  'error NotAvailable()',
  'error IncorrectPayment()',
  'error TransferFailed()',
  'function listingCount() view returns (uint256)',
  'function rentalCount() view returns (uint256)',
  'function listings(uint256) view returns (address owner,uint96 dailyRate,uint96 deposit,uint32 maxDurationDays,bool active,bool available,string metadataURI)',
  'function rentals(uint256) view returns (uint256 listingId,address renter,uint64 startTime,uint64 endTime,uint96 rentalFee,uint96 deposit,uint8 status)',
  'function getOwnerListingIds(address owner) view returns (uint256[])',
  'function getRenterRentalIds(address renter) view returns (uint256[])',
  'function quote(uint256 listingId,uint64 startTime,uint64 endTime) view returns (uint256 rentalFee,uint256 totalDue)',
  'function createListing(uint96 dailyRate,uint96 deposit,uint32 maxDurationDays,string metadataURI) returns (uint256)',
  'function setListingActive(uint256 listingId,bool active)',
  'function book(uint256 listingId,uint64 startTime,uint64 endTime) payable returns (uint256)',
  'function startRental(uint256 rentalId)',
  'function completeRental(uint256 rentalId)',
  'function cancelBeforeStart(uint256 rentalId)',
  'event ListingCreated(uint256 indexed listingId,address indexed owner,uint256 dailyRate,uint256 deposit)',
  'event ListingAvailabilityChanged(uint256 indexed listingId,bool active)',
  'event RentalBooked(uint256 indexed rentalId,uint256 indexed listingId,address indexed renter,uint256 startTime,uint256 endTime)',
  'event RentalStarted(uint256 indexed rentalId)',
  'event RentalCompleted(uint256 indexed rentalId,uint256 ownerPayment,uint256 depositRefund)',
  'event RentalCancelled(uint256 indexed rentalId,uint256 refund)'
];

export const readProvider = new JsonRpcProvider(CHAIN.rpcUrl, CHAIN.id, { staticNetwork: true });
export const readContract = new Contract(CONTRACT_ADDRESS, ABI, readProvider);

export function walletAvailable() { return typeof window.ethereum !== 'undefined'; }

export async function connectWallet() {
  if (!walletAvailable()) throw new Error('WALLET_NOT_FOUND');
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  await switchToBotChain();
  sessionStorage.removeItem('rentora:user-disconnected');
  return getWalletContext();
}

export function userDisconnected() {
  return sessionStorage.getItem('rentora:user-disconnected') === 'true';
}

export async function disconnectWallet() {
  sessionStorage.setItem('rentora:user-disconnected', 'true');
  if (!walletAvailable()) return false;
  try {
    await window.ethereum.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
    return true;
  } catch {
    return false;
  }
}

export async function switchToBotChain() {
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hexId }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN.hexId, chainName: CHAIN.name, nativeCurrency: CHAIN.currency, rpcUrls: [CHAIN.rpcUrl], blockExplorerUrls: [CHAIN.explorerUrl] }] });
  }
}

export async function getConnectedAccounts() {
  if (!walletAvailable()) return [];
  return window.ethereum.request({ method: 'eth_accounts' });
}

export async function getWalletContext() {
  const provider = new BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN.id) throw new Error('WRONG_NETWORK');
  const signer = await provider.getSigner();
  const account = await signer.getAddress();
  return { provider, signer, account, contract: new Contract(CONTRACT_ADDRESS, ABI, signer) };
}
