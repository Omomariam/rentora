import { connectWallet, CONTRACT_ADDRESS, CONTRACT_URL } from './chain.js';
import { showError } from './ui.js';

document.querySelectorAll('[data-contract-link]').forEach(link => link.href = CONTRACT_URL);
document.querySelectorAll('[data-contract-short]').forEach(node => node.textContent = `${CONTRACT_ADDRESS.slice(0, 6)}…${CONTRACT_ADDRESS.slice(-4)}`);

document.querySelectorAll('[data-connect]').forEach(button => button.addEventListener('click', async () => {
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = 'Check your wallet…';
  try {
    await connectWallet();
    window.location.assign('/app.html');
  } catch (error) {
    showError(error);
    button.disabled = false;
    button.innerHTML = original;
  }
}));
