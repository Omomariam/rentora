import { formatEther, parseEther } from 'ethers';
import { CHAIN, CONTRACT_ADDRESS, CONTRACT_URL, connectWallet, getConnectedAccounts, getWalletContext, walletAvailable } from './chain.js';
import { formatDate, parseMetadata, runTransaction, shortAddress, showError, toast } from './ui.js';

const page = document.body.dataset.page;
let wallet;
let allListings = [];
const statusNames = ['Unknown', 'Booked', 'Active', 'Completed', 'Cancelled'];

function renderChrome() {
  const links = [{ href: '/app.html', key: 'marketplace', label: 'Explore' }, { href: '/rentals.html', key: 'rentals', label: 'My rentals' }, { href: '/dashboard.html', key: 'dashboard', label: 'Owner dashboard' }];
  document.querySelector('#appShell').innerHTML = `<header class="app-header"><a class="wordmark" href="/" aria-label="Rentora home"><span class="wordmark-symbol">R</span><span>rentora</span></a><nav>${links.map(link => `<a href="${link.href}" class="${page === link.key ? 'active' : ''}">${link.label}</a>`).join('')}</nav><div class="wallet-chip"><i></i><span data-wallet-address>Wallet</span><small>${CHAIN.name}</small></div><button class="mobile-nav-button" aria-label="Open navigation">Menu</button></header>`;
  document.querySelector('#appOverlays').innerHTML = `<div class="access-gate" id="accessGate"><div class="gate-panel"><a class="wordmark" href="/"><span class="wordmark-symbol">R</span><span>rentora</span></a><p class="overline">WALLET REQUIRED</p><h1 id="gateTitle">Connect to enter</h1><p id="gateMessage">Rentora reads your listings and rentals from your wallet on BOT Chain testnet.</p><button class="button button-primary button-large" id="gateConnect">Connect wallet</button><a class="gate-home" href="/">Return to landing page</a></div></div><dialog class="booking-dialog" id="bookingDialog"><button class="dialog-close" id="closeBooking" aria-label="Close">×</button><div class="booking-preview" id="bookingPreview"></div><div class="booking-panel"><p class="overline">ONCHAIN RENTAL</p><h2 id="bookingName"></h2><p id="bookingDescription"></p><div class="booking-owner"><span>Owner</span><a id="bookingOwner" target="_blank" rel="noreferrer"></a></div><div class="booking-dates"><label class="field"><span>Start</span><input id="bookingStart" type="datetime-local"/></label><label class="field"><span>End</span><input id="bookingEnd" type="datetime-local"/></label></div><div class="booking-total"><div><span>Rental fee</span><strong id="bookingFee">—</strong></div><div><span>Refundable deposit</span><strong id="bookingDeposit">—</strong></div><div><span>Total sent to escrow</span><strong id="bookingTotal">—</strong></div></div><p class="inline-message" id="bookingMessage">Choose valid dates to see the exact contract quote.</p><button class="button button-primary button-large button-full" id="bookResource" disabled>Book with BOT</button><small class="contract-note">Funds go directly to <a href="${CONTRACT_URL}" target="_blank" rel="noreferrer">the verified escrow contract ↗</a></small></div></dialog><div class="toast" id="toast" role="status" aria-live="polite"><strong id="toastTitle"></strong><span id="toastMessage"></span></div>`;
  document.querySelector('.mobile-nav-button').addEventListener('click', () => document.querySelector('.app-header nav').classList.toggle('open'));
}

function setGate(title, message, buttonLabel = 'Connect wallet') {
  document.querySelector('#gateTitle').textContent = title;
  document.querySelector('#gateMessage').textContent = message;
  document.querySelector('#gateConnect').textContent = buttonLabel;
  document.querySelector('#accessGate').classList.add('visible');
}

async function unlockApp() {
  if (!walletAvailable()) {
    setGate('A wallet is required', 'Install a compatible EVM wallet to use Rentora. The app never creates a placeholder account or stores a private key.', 'Wallet not detected');
    document.querySelector('#gateConnect').disabled = true;
    return false;
  }
  const accounts = await getConnectedAccounts();
  if (!accounts.length) { setGate('Connect to enter', 'Your wallet address is used to find your real listings, bookings, and refunds on BOT Chain testnet.'); return false; }
  try {
    wallet = await getWalletContext();
    document.querySelector('#accessGate').classList.remove('visible');
    document.body.classList.add('wallet-ready');
    const balance = await wallet.provider.getBalance(wallet.account);
    document.querySelector('[data-wallet-address]').textContent = `${shortAddress(wallet.account)} · ${Number(formatEther(balance)).toLocaleString(undefined, { maximumFractionDigits: 4 })} BOT`;
    return true;
  } catch (error) {
    setGate('Switch to BOT Chain', `Rentora uses ${CHAIN.name} (chain ID ${CHAIN.id}). Switch networks to continue.`, 'Switch network');
    return false;
  }
}

async function connectFromGate() {
  const button = document.querySelector('#gateConnect');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Check your wallet…';
  try { wallet = await connectWallet(); window.location.reload(); } catch (error) { showError(error); button.disabled = false; button.textContent = original; }
}

function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function explorerAddress(address) { return `${CHAIN.explorerUrl}/address/${address}`; }

async function getListing(id) {
  const raw = await wallet.contract.listings(id);
  return { id: Number(id), owner: raw.owner, dailyRate: raw.dailyRate, deposit: raw.deposit, maxDurationDays: Number(raw.maxDurationDays), active: raw.active, available: raw.available, metadataURI: raw.metadataURI, meta: parseMetadata(raw.metadataURI, id) };
}

function listingVisual(meta, className = 'listing-visual') {
  const visual = element('div', className);
  const fallback = element('span', 'visual-fallback', (meta.category || 'R').slice(0, 1).toUpperCase());
  visual.append(fallback);
  if (meta.image && /^https:\/\//i.test(meta.image)) {
    const image = new Image(); image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.src = meta.image; image.addEventListener('error', () => image.remove()); visual.append(image);
  }
  return visual;
}

async function loadMarketplace() {
  const status = document.querySelector('#marketStatus');
  const grid = document.querySelector('#listingGrid');
  status.hidden = false; status.textContent = 'Reading listings from BOT Chain…'; grid.replaceChildren();
  try {
    const count = Number(await wallet.contract.listingCount());
    allListings = await Promise.all(Array.from({ length: count }, (_, index) => getListing(index + 1)));
    renderMarketplace();
  } catch (error) { status.textContent = 'Listings could not be loaded. Check your connection and try Refresh.'; showError(error); }
}

function renderMarketplace() {
  const status = document.querySelector('#marketStatus'); const grid = document.querySelector('#listingGrid');
  const query = document.querySelector('#marketSearch').value.trim().toLowerCase(); const category = document.querySelector('#categoryFilter').value;
  const visible = allListings.filter(item => item.active && (!category || item.meta.category === category) && `${item.meta.name} ${item.meta.category} ${item.meta.location}`.toLowerCase().includes(query));
  grid.replaceChildren();
  if (!visible.length) { status.hidden = false; status.innerHTML = allListings.length ? 'No listings match these filters.' : `No resources have been listed yet. <a href="/create.html">Create the first onchain listing</a>.`; return; }
  status.hidden = true;
  visible.forEach(item => {
    const card = element('article', 'onchain-card'); card.append(listingVisual(item.meta));
    const body = element('div', 'onchain-card-body');
    const metaLine = element('div', 'card-meta'); metaLine.append(element('span', '', item.meta.category || 'Resource'), element('span', item.available ? 'available' : 'unavailable', item.available ? 'Available' : 'Booked'));
    const title = element('h2', '', item.meta.name || `Resource #${item.id}`); const location = element('p', 'card-location', item.meta.location || 'Location not specified');
    const terms = element('div', 'card-terms'); const rate = element('strong', '', `${formatEther(item.dailyRate)} BOT`); rate.append(element('small', '', ' / day')); terms.append(rate, element('span', '', `${formatEther(item.deposit)} BOT deposit`));
    const owner = element('a', 'owner-link', `Owner ${shortAddress(item.owner)} ↗`); owner.href = explorerAddress(item.owner); owner.target = '_blank'; owner.rel = 'noreferrer'; owner.addEventListener('click', event => event.stopPropagation());
    body.append(metaLine, title, location, terms, owner); card.append(body); card.tabIndex = 0; card.addEventListener('click', () => openBooking(item)); card.addEventListener('keydown', event => { if (event.key === 'Enter') openBooking(item); }); grid.append(card);
  });
}

let bookingItem;
function localDateValue(date) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
function openBooking(item) {
  bookingItem = item; const dialog = document.querySelector('#bookingDialog');
  const preview = document.querySelector('#bookingPreview'); preview.replaceChildren(listingVisual(item.meta, 'booking-visual'));
  document.querySelector('#bookingName').textContent = item.meta.name || `Resource #${item.id}`; document.querySelector('#bookingDescription').textContent = item.meta.description || 'No description was provided.';
  const owner = document.querySelector('#bookingOwner'); owner.textContent = `${shortAddress(item.owner)} ↗`; owner.href = explorerAddress(item.owner);
  document.querySelector('#bookingDeposit').textContent = `${formatEther(item.deposit)} BOT`;
  const start = new Date(Date.now() + 60 * 60 * 1000); start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0); const end = new Date(start.getTime() + 86400000);
  const startInput = document.querySelector('#bookingStart'); const endInput = document.querySelector('#bookingEnd'); startInput.min = localDateValue(new Date(Date.now() + 5 * 60000)); startInput.value = localDateValue(start); endInput.value = localDateValue(end);
  updateQuote(); dialog.showModal();
}

async function updateQuote() {
  const message = document.querySelector('#bookingMessage'); const button = document.querySelector('#bookResource'); button.disabled = true;
  if (!bookingItem.available) { message.textContent = 'This resource already has an active booking.'; return; }
  if (bookingItem.owner.toLowerCase() === wallet.account.toLowerCase()) { message.textContent = 'Owners cannot book their own resources.'; return; }
  const start = Math.floor(new Date(document.querySelector('#bookingStart').value).getTime() / 1000); const end = Math.floor(new Date(document.querySelector('#bookingEnd').value).getTime() / 1000);
  if (!start || !end || end <= start || start <= Math.floor(Date.now() / 1000)) { message.textContent = 'Choose a future start time and an end time after it.'; return; }
  try {
    const [fee, total] = await wallet.contract.quote(bookingItem.id, start, end); document.querySelector('#bookingFee').textContent = `${formatEther(fee)} BOT`; document.querySelector('#bookingTotal').textContent = `${formatEther(total)} BOT`; button.dataset.start = start; button.dataset.end = end; button.dataset.total = total.toString(); button.disabled = false; message.textContent = `Maximum duration: ${bookingItem.maxDurationDays} days. The wallet will also show the network fee.`;
  } catch { message.textContent = `These dates exceed the listing’s ${bookingItem.maxDurationDays}-day limit or are no longer valid.`; }
}

async function submitBooking() {
  const button = document.querySelector('#bookResource');
  const receipt = await runTransaction(button, { confirm: 'Confirm booking in wallet…', wait: 'Booking on BOT Chain…', doneTitle: 'Booking confirmed', doneMessage: 'Your fee and deposit are now held by the escrow contract.' }, () => wallet.contract.book(bookingItem.id, Number(button.dataset.start), Number(button.dataset.end), { value: BigInt(button.dataset.total) }));
  if (receipt) window.location.assign('/rentals.html');
}

async function createListing(event) {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); const data = new FormData(form);
  const image = data.get('image').trim();
  if (image && !/^https:\/\//i.test(image)) { toast('Use an HTTPS image', 'The image link must begin with https:// so wallets and browsers can load it safely.', 'error'); return; }
  const metadata = { name: data.get('name').trim(), category: data.get('category'), location: data.get('location').trim(), description: data.get('description').trim(), image };
  const uri = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(metadata))}`;
  let dailyRate, deposit;
  try { dailyRate = parseEther(data.get('dailyRate')); deposit = parseEther(data.get('deposit')); } catch { toast('Check the BOT amounts', 'Enter valid numbers with no more than 18 decimal places.', 'error'); return; }
  const receipt = await runTransaction(button, { confirm: 'Confirm listing in wallet…', wait: 'Publishing on BOT Chain…', doneTitle: 'Listing is live', doneMessage: 'Your resource is now available in the marketplace.' }, () => wallet.contract.createListing(dailyRate, deposit, Number(data.get('maxDays')), uri));
  if (receipt) window.location.assign('/dashboard.html');
}

async function getRental(id) { const raw = await wallet.contract.rentals(id); return { id: Number(id), listingId: Number(raw.listingId), renter: raw.renter, startTime: Number(raw.startTime), endTime: Number(raw.endTime), rentalFee: raw.rentalFee, deposit: raw.deposit, status: Number(raw.status) }; }

async function loadRentals() {
  const status = document.querySelector('#rentalsStatus'); const list = document.querySelector('#rentalList'); status.hidden = false; status.textContent = 'Reading your rentals from BOT Chain…'; list.replaceChildren();
  try {
    const ids = await wallet.contract.getRenterRentalIds(wallet.account); const rentals = await Promise.all([...ids].reverse().map(getRental)); const rows = await Promise.all(rentals.map(async rental => ({ rental, listing: await getListing(rental.listingId) })));
    if (!rows.length) { status.innerHTML = `This wallet has no rentals yet. <a href="/app.html">Browse available resources</a>.`; return; }
    status.hidden = true; rows.forEach(({ rental, listing }) => list.append(rentalRow(rental, listing, false)));
  } catch (error) { status.textContent = 'Your rentals could not be loaded. Check your connection and try Refresh.'; showError(error); }
}

function rentalRow(rental, listing, forOwner) {
  const row = element('article', 'rental-row'); row.append(listingVisual(listing.meta, 'rental-thumb'));
  const info = element('div', 'rental-info'); const top = element('div', 'rental-top'); top.append(element('span', 'status-tag status-'+rental.status, statusNames[rental.status]), element('span', 'mono', `Rental #${rental.id}`));
  info.append(top, element('h2', '', listing.meta.name || `Resource #${listing.id}`), element('p', '', `${formatDate(rental.startTime)} — ${formatDate(rental.endTime)}`));
  const money = element('div', 'rental-money'); money.append(element('span', '', `Fee ${formatEther(rental.rentalFee)} BOT`), element('span', '', `Deposit ${formatEther(rental.deposit)} BOT`)); info.append(money);
  const actions = element('div', 'rental-actions'); const now = Math.floor(Date.now() / 1000);
  if (!forOwner && rental.status === 1 && now < rental.startTime) actions.append(actionButton('Cancel & refund', 'secondary', button => transactRental(button, rental, 'cancel')));
  if (!forOwner && rental.status === 1 && now >= rental.startTime && now < rental.endTime) actions.append(actionButton('Start rental', 'primary', button => transactRental(button, rental, 'start')));
  if (!forOwner && rental.status === 2) actions.append(actionButton('Complete & release funds', 'primary', button => transactRental(button, rental, 'complete')));
  if (forOwner && (rental.status === 1 || rental.status === 2) && now >= rental.endTime) actions.append(actionButton('Settle completed rental', 'primary', button => transactRental(button, rental, 'complete', true)));
  const explorer = element('a', 'button button-text', 'View contract ↗'); explorer.href = CONTRACT_URL; explorer.target = '_blank'; explorer.rel = 'noreferrer'; actions.append(explorer); row.append(info, actions); return row;
}

function actionButton(label, style, handler) { const button = element('button', `button button-${style}`, label); button.addEventListener('click', () => handler(button)); return button; }
async function transactRental(button, rental, action, owner = false) {
  const config = action === 'cancel' ? { method: 'cancelBeforeStart', confirm: 'Confirm cancellation…', wait: 'Returning funds…', title: 'Booking cancelled', message: 'The rental fee and deposit have been returned to your wallet.' } : action === 'start' ? { method: 'startRental', confirm: 'Confirm start…', wait: 'Starting rental…', title: 'Rental started', message: 'The rental is now marked active on BOT Chain.' } : { method: 'completeRental', confirm: 'Confirm completion…', wait: 'Settling funds…', title: 'Rental completed', message: owner ? 'The rental fee was paid and the renter’s deposit was returned.' : 'The owner was paid and your deposit was returned.' };
  const receipt = await runTransaction(button, { confirm: config.confirm, wait: config.wait, doneTitle: config.title, doneMessage: config.message }, () => wallet.contract[config.method](rental.id));
  if (receipt) page === 'rentals' ? loadRentals() : loadDashboard();
}

async function loadDashboard() {
  const status = document.querySelector('#dashboardStatus'); const list = document.querySelector('#ownerList'); status.hidden = false; status.textContent = 'Reading owner activity from BOT Chain…'; list.replaceChildren();
  try {
    const ids = await wallet.contract.getOwnerListingIds(wallet.account); const listings = await Promise.all([...ids].reverse().map(getListing));
    const rentalCount = Number(await wallet.contract.rentalCount()); const rentals = await Promise.all(Array.from({ length: rentalCount }, (_, index) => getRental(index + 1))); const ownedIds = new Set(listings.map(item => item.id)); const ownerRentals = rentals.filter(item => ownedIds.has(item.listingId)); const earned = ownerRentals.filter(item => item.status === 3).reduce((sum, item) => sum + item.rentalFee, 0n);
    const values = document.querySelectorAll('#ownerStats strong'); values[0].textContent = listings.filter(item => item.active).length; values[1].textContent = ownerRentals.length; values[2].textContent = `${formatEther(earned)} BOT`;
    if (!listings.length) { status.innerHTML = `This wallet has no listings. <a href="/create.html">List a resource</a>.`; return; }
    status.hidden = true;
    listings.forEach(listing => {
      const group = element('section', 'owner-group'); const head = element('div', 'owner-group-head'); const title = element('div'); title.append(element('span', 'mono', `LISTING #${listing.id}`), element('h2', '', listing.meta.name || `Resource #${listing.id}`), element('p', '', `${formatEther(listing.dailyRate)} BOT/day · ${formatEther(listing.deposit)} BOT deposit · ${listing.available ? 'Available' : 'Booked'}`));
      const toggle = actionButton(listing.active ? 'Pause listing' : 'Reactivate listing', 'secondary', button => toggleListing(button, listing)); head.append(title, toggle); group.append(head);
      const related = ownerRentals.filter(rental => rental.listingId === listing.id); if (related.length) related.slice().reverse().forEach(rental => group.append(rentalRow(rental, listing, true))); else group.append(element('p', 'no-bookings', 'No bookings for this listing yet.')); list.append(group);
    });
  } catch (error) { status.textContent = 'Owner activity could not be loaded. Check your connection and refresh.'; showError(error); }
}

async function toggleListing(button, listing) {
  const next = !listing.active; const receipt = await runTransaction(button, { confirm: next ? 'Confirm reactivation…' : 'Confirm pause…', wait: 'Updating listing…', doneTitle: next ? 'Listing reactivated' : 'Listing paused', doneMessage: next ? 'Renters can see and book this resource again.' : 'The listing is hidden from the marketplace. Existing bookings are unchanged.' }, () => wallet.contract.setListingActive(listing.id, next)); if (receipt) loadDashboard();
}

function bindPage() {
  if (page === 'marketplace') {
    document.querySelector('#marketSearch').addEventListener('input', renderMarketplace); document.querySelector('#categoryFilter').addEventListener('change', renderMarketplace); document.querySelector('#refreshListings').addEventListener('click', loadMarketplace); document.querySelector('#closeBooking').addEventListener('click', () => document.querySelector('#bookingDialog').close()); document.querySelector('#bookingStart').addEventListener('change', updateQuote); document.querySelector('#bookingEnd').addEventListener('change', updateQuote); document.querySelector('#bookResource').addEventListener('click', submitBooking); loadMarketplace();
    wallet.contract.on('ListingCreated', loadMarketplace); wallet.contract.on('ListingAvailabilityChanged', loadMarketplace); wallet.contract.on('RentalBooked', loadMarketplace);
  }
  if (page === 'create') document.querySelector('#createListingForm').addEventListener('submit', createListing);
  if (page === 'rentals') { document.querySelector('#refreshRentals').addEventListener('click', loadRentals); loadRentals(); wallet.contract.on('RentalStarted', loadRentals); wallet.contract.on('RentalCompleted', loadRentals); wallet.contract.on('RentalCancelled', loadRentals); }
  if (page === 'dashboard') { loadDashboard(); wallet.contract.on('ListingCreated', loadDashboard); wallet.contract.on('ListingAvailabilityChanged', loadDashboard); wallet.contract.on('RentalBooked', loadDashboard); wallet.contract.on('RentalCompleted', loadDashboard); }
}

renderChrome();
document.querySelector('#gateConnect').addEventListener('click', connectFromGate);
if (walletAvailable()) { window.ethereum.on('accountsChanged', () => window.location.reload()); window.ethereum.on('chainChanged', () => window.location.reload()); }
try { if (await unlockApp()) bindPage(); } catch (error) { setGate('BOT Chain is unavailable', 'Rentora could not reach your wallet. Check the wallet connection and try again.'); showError(error); }
