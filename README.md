# Rentora

Rentora is a wallet-gated rental marketplace running on BOT Chain testnet. Listings, bookings, deposits, rental status, owner income, and refunds are read from and written to the deployed escrow contract; the app does not use mock accounts or local transaction state.

## Pages

- `/` — public landing page and wallet entry
- `/app.html` — live onchain marketplace
- `/create.html` — create an onchain listing
- `/rentals.html` — renter history and settlement actions
- `/dashboard.html` — owner listings, bookings, and earnings

App pages require a connected EVM wallet on BOT Chain testnet (chain ID `968`).

## Contract

- V2 address: [`0x88A5AA396abbaD16221Ed7e9AD07d8eAdEe3Bc64`](https://scan.bohr.life/address/0x88A5AA396abbaD16221Ed7e9AD07d8eAdEe3Bc64?tab=contract)
- Deprecated V1: [`0x477eaA87fD857632F8874ebe0Ad9DDE8Ffe6Dd7a`](https://scan.bohr.life/address/0x477eaA87fD857632F8874ebe0Ad9DDE8Ffe6Dd7a?tab=contract)
- Network: BOT Chain testnet
- Native token: BOT
- Compiler: Solidity `0.8.24`, optimizer enabled with 200 runs

The source is verified on the testnet Blockscout explorer. This is a testnet release and the contract has not undergone an independent security audit.

V2 adds owner acceptance and cancellation, scheduled non-overlapping bookings, refunds for unaccepted bookings, bounded rental activation, and pull-based BOT withdrawals after settlement.

## Local development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Contract commands:

```bash
npm run contract:compile
npm run contract:deploy:testnet
npm run contract:verify:testnet
```

Copy `.env.example` to `.env` for deployment credentials. Never commit `.env` or private keys.
