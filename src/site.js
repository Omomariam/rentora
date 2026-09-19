import { connectWallet, CONTRACT_ADDRESS, CONTRACT_URL, disconnectWallet, getConnectedAccounts, getWalletContext, userDisconnected, walletAvailable } from './chain.js';
import { shortAddress, showError, toast } from './ui.js';

document.querySelectorAll('[data-contract-link]').forEach(link => link.href = CONTRACT_URL);
document.querySelectorAll('[data-contract-short]').forEach(node => node.textContent = `${CONTRACT_ADDRESS.slice(0, 6)}…${CONTRACT_ADDRESS.slice(-4)}`);

function setConnected(account) {
  document.querySelectorAll('[data-connect]').forEach(button => { button.hidden = true; });
  document.querySelectorAll('[data-disconnect]').forEach(button => { button.hidden = false; button.disabled = false; button.textContent = 'Disconnect wallet'; });
  document.querySelectorAll('[data-enter-app]').forEach(button => { button.disabled = false; button.classList.remove('is-locked'); });
  document.querySelector('.wallet-requirement').innerHTML = `<span></span>${shortAddress(account)} connected. Open the marketplace when you are ready.`;
}

function setDisconnected() {
  document.querySelectorAll('[data-connect]').forEach(button => { button.hidden = false; button.disabled = false; button.textContent = 'Connect wallet'; });
  document.querySelectorAll('[data-disconnect]').forEach(button => { button.hidden = true; });
  document.querySelectorAll('[data-enter-app]').forEach(button => { button.disabled = true; button.classList.add('is-locked'); });
  document.querySelector('.wallet-requirement').innerHTML = '<span></span>A compatible EVM wallet is required to enter the marketplace.';
}

document.querySelectorAll('[data-enter-app]').forEach(button => button.addEventListener('click', () => {
  if (!button.classList.contains('is-locked')) window.location.assign('/app.html');
}));

document.querySelectorAll('[data-connect]').forEach(button => button.addEventListener('click', async () => {
  document.querySelectorAll('[data-connect]').forEach(item => { item.disabled = true; item.textContent = 'Check your wallet…'; });
  try {
    const { account } = await connectWallet();
    setConnected(account);
    toast('Wallet connected', 'The marketplace is unlocked. Enter when you are ready.', 'success');
  } catch (error) {
    showError(error);
    setDisconnected();
  }
}));

document.querySelectorAll('[data-disconnect]').forEach(button => button.addEventListener('click', async () => {
  document.querySelectorAll('[data-disconnect]').forEach(item => { item.disabled = true; item.textContent = 'Disconnecting…'; });
  const permissionRevoked = await disconnectWallet();
  setDisconnected();
  toast('Wallet disconnected', permissionRevoked ? 'Rentora no longer has permission to view this wallet.' : 'Rentora is locked. Your wallet may require you to remove this site from its connected-sites menu.', 'success');
}));

async function restoreConnection() {
  if (!walletAvailable() || userDisconnected()) return;
  const accounts = await getConnectedAccounts();
  if (!accounts.length) return;
  try {
    const { account } = await getWalletContext();
    setConnected(account);
  } catch {
    document.querySelectorAll('[data-connect]').forEach(button => button.textContent = 'Switch to BOT Chain');
  }
}

if (walletAvailable() && typeof window.ethereum.on === 'function') {
  window.ethereum.on('accountsChanged', accounts => { if (!accounts.length) setDisconnected(); });
}

restoreConnection();
