# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repository Purpose

A comprehensive web-based tool for analyzing ERC-4626 vault deposits, withdrawals, and depositor statistics with advanced programmatic block discovery capabilities. This is a pure client-side application that connects to blockchain networks via RPC to fetch and analyze vault data in real-time.

## Tech Stack

- **Frontend**: Pure HTML5, CSS3, JavaScript (ES6+)
- **Blockchain**: Ethers.js v6 (via CDN)
- **Charts**: Chart.js with date-fns adapter (via CDN)
- **Node.js**: >=16.0.0 (specified in package.json engines)
- **Package Manager**: npm (no lockfile present)
- **Deployment**: Vercel static hosting

## Setup

```bash
npm install
```

## Common Commands

### Development
```bash
npm run dev        # Start local development server using 'serve'
npm start          # Same as dev - starts serve
```

### Build
```bash
npm run build      # No-op for static site (echoes message)
```

### Deployment
```bash
npm run deploy     # Deploy to Vercel production
```

## Architecture

### Core Files
- **index.html**: Main application interface with form inputs and data visualization sections
- **app.js**: Main application logic including VaultTracker class and blockchain integration
- **block-discovery.js**: VaultBlockDiscovery class for efficient event discovery using binary search
- **graph-discovery.js**: GraphVaultDiscovery class for The Graph Protocol integration
- **style.css**: Application styling with theme support

### Key Features
- **Binary Search Block Discovery**: Efficiently discovers blocks containing vault events (O(log n) complexity)
- **Multi-Network Support**: Ethereum, Arbitrum, Base, Optimism, Plasma networks
- **Real-time Data**: Live balance queries via RPC calls
- **Advanced Analytics**: Charts, tables, CSV/JSON export capabilities

### Blockchain Integration
- **Supported Networks**: Configured in `app.js` chains object with RPC endpoints
- **Event Processing**: Handles Deposit, Withdraw, and Transfer events from ERC-4626 vaults
- **Rate Limiting**: Handles RPC limits with exponential backoff and chunk-based scanning

## Network Configuration

The application includes hardcoded RPC endpoints for:
- Ethereum Mainnet (Chain ID: 1)
- Arbitrum One (Chain ID: 42161) 
- Base (Chain ID: 8453)
- Optimism (Chain ID: 10)
- Plasma Network (Chain ID: 9745)

## Development Notes

### Block Discovery System
The app uses a sophisticated binary search algorithm to discover active block ranges efficiently. See `BLOCK_DISCOVERY_GUIDE.md` for detailed technical documentation.

### Testing Files
- **test.html**: Basic button functionality test
- **test-plasma.html**: Plasma network connection and contract testing
- **focused-test.html**: Comprehensive event analysis for specific block ranges

### Deployment
- Configured for Vercel with security headers in `vercel.json`
- Static site - no build process required
- All dependencies loaded via CDN for zero-config deployment