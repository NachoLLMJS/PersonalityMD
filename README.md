# Personality.md

Personality.md is an independent application layer for designing virtual influencers and submitting compatible work to the public IMD request infrastructure

It is not an official IMD product

## Product surfaces

- Industrial landing page with a live IMD jobs Explorer
- Standalone Creator Studio at `/create.html`
- Operational documentation at `/docs.html`
- Live IMD validation and quote creation
- Explicit Ethereum Mainnet payment flow using IMD, x402 v2 and Permit2
- Local image references that remain in the browser and block paid submission until IMD exposes a supported upload route

## Development

```text
npm install
npm run dev -- --port 4178
npm run check
node --test scripts/payment.test.mjs
npm run build
```

## Deployment

The Vite application builds to `dist`

Production IMD requests are transported through the same-origin Vercel Function at `api/imd/[...path].js`

No private key, wallet seed, API key or permanent IMD credential is required by the application

## Payment safety

- Wallet access is user initiated
- Quote creation does not charge the wallet
- Payment terms are read from each live IMD quote
- The x402 client allowlists only the quoted Ethereum Mainnet asset and caps it at the quoted atomic amount
- Every approval and signature remains visible in the connected wallet
- Local reference files disable quote and payment actions

## Assets and provenance

Review the provenance files before commercial publication

- `public/imd-assets/PROVENANCE.md`
- `public/references/PROVENANCE.md`
- `public/videos/PROVENANCE.md`
- `public/portraits/PROVENANCE.md`

The repository does not claim ownership of third-party IMD-derived assets or user-supplied videos
