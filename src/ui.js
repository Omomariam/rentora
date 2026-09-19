import { CHAIN } from './chain.js';

export const shortAddress = value => `${value.slice(0, 6)}…${value.slice(-4)}`;
export const escapeText = value => String(value ?? '');

let toastTimer;
export function toast(title, message, tone = 'default') {
  const element = document.querySelector('#toast');
  if (!element) return;
  element.dataset.tone = tone;
  element.querySelector('#toastTitle').textContent = title;
  element.querySelector('#toastMessage').textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 5000);
}

export function userMessage(error) {
  const message = `${error?.shortMessage || ''} ${error?.message || ''}`.toLowerCase();
  if (error?.message === 'WALLET_NOT_FOUND') return { title: 'No wallet found', message: 'Install a compatible EVM wallet, then return to connect.' };
  if (error?.message === 'WRONG_NETWORK') return { title: 'Switch network', message: `Choose ${CHAIN.name} in your wallet to continue.` };
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED' || message.includes('user rejected')) return { title: 'Request cancelled', message: 'Nothing changed. You can try again whenever you are ready.' };
  if (message.includes('insufficient funds')) return { title: 'Not enough BOT', message: 'Your wallet needs more test BOT for this amount and the network fee.' };
  if (message.includes('notavailable')) return { title: 'Resource unavailable', message: 'This resource was booked or paused before your transaction completed. Refresh the marketplace.' };
  if (message.includes('dateunavailable')) return { title: 'Dates unavailable', message: 'Another booking already reserves part of this period. Choose different dates.' };
  if (message.includes('nothingtowithdraw')) return { title: 'Nothing to withdraw', message: 'This wallet has no settled BOT ready to withdraw.' };
  if (message.includes('incorrectpayment')) return { title: 'Price changed', message: 'The required amount changed. Reopen the booking and review the latest total.' };
  if (message.includes('unauthorized')) return { title: 'Action not available', message: 'This connected wallet is not allowed to perform that action.' };
  if (message.includes('invalidstatus')) return { title: 'Status changed', message: 'This rental is no longer at the stage required for that action. Refresh the page.' };
  if (message.includes('invalidterms')) return { title: 'Check the rental terms', message: 'The dates or amounts do not meet this listing’s requirements.' };
  if (message.includes('network') || message.includes('failed to fetch') || message.includes('could not coalesce')) return { title: 'BOT Chain is not responding', message: 'Check your connection and try again in a moment.' };
  return { title: 'Could not complete the action', message: 'Your funds were not moved. Please review the details and try again.' };
}

export function showError(error) { const friendly = userMessage(error); toast(friendly.title, friendly.message, 'error'); }

export async function runTransaction(button, labels, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = labels.confirm || 'Confirm in wallet…';
  try {
    const transaction = await action();
    button.textContent = labels.wait || 'Waiting for BOT Chain…';
    const receipt = await transaction.wait();
    toast(labels.doneTitle || 'Transaction confirmed', labels.doneMessage || `Included in block ${receipt.blockNumber}.`, 'success');
    return receipt;
  } catch (error) {
    showError(error);
    return null;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

export function parseMetadata(uri, listingId) {
  try {
    if (uri.startsWith('data:application/json')) {
      const payload = uri.slice(uri.indexOf(',') + 1);
      return JSON.parse(decodeURIComponent(payload));
    }
  } catch {}
  return { name: `Resource #${listingId}`, category: 'Resource', location: 'See listing metadata', description: uri || 'No description was provided.', image: '' };
}

export function formatDate(unix) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(unix) * 1000)); }
