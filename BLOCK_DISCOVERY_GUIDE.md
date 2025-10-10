# Programmatic Block Discovery System - Usage Guide

## Overview
This system automatically discovers blocks containing vault events using state-of-the-art techniques including binary search, intelligent range subdivision, and fallback mechanisms.

## How It Works

### 1. **Binary Search Discovery (Primary Method)**
The system uses binary search to efficiently find the first and last blocks containing vault activity:
- **Time Complexity**: O(log n) where n is the total block range
- **Efficiency**: Can scan 500,000 blocks in ~15-20 API calls instead of 50+ sequential calls
- **RPC Friendly**: Automatically handles rate limits and "query exceeds" errors

### 2. **Intelligent Range Subdivision**
Once activity boundaries are found:
- Subdivides large ranges into scannable chunks (5,000 blocks max)
- Verifies each chunk contains actual events before including it
- Only returns ranges with confirmed activity

### 3. **Fallback System**
If discovery fails:
- Falls back to known active ranges for your specific vault
- Ensures the app always works even if discovery has issues
- Logs clear messages about which method is being used

## Usage Examples

### Basic Usage (Already Integrated)
The discovery system is already integrated into your app. When you click "Analyze Vault", it will:
1. Try programmatic discovery first
2. Use discovered ranges if found
3. Fall back to known ranges if needed

### Manual Usage
```javascript
// Create discovery instance
const discovery = new VaultBlockDiscovery(provider, vaultAddress);

// Discover active blocks (scan last 100,000 blocks)
const currentBlock = await provider.getBlockNumber();
const activeRanges = await discovery.discoverActiveBlocks(
    currentBlock - 100000, 
    currentBlock
);

console.log('Active ranges:', activeRanges);
// Output: [{ start: 3158449, end: 3158500, blocks: 51 }, ...]
```

### Custom Range Discovery
```javascript
// Discover activity in a specific historical period
const discovery = new VaultBlockDiscovery(provider, vaultAddress);
const activeRanges = await discovery.discoverActiveBlocks(3000000, 3200000);
```

## Performance Benefits

### Before (Hardcoded Ranges)
- ✅ Fast execution (ranges already known)
- ❌ Only works for specific vaults
- ❌ Requires manual blockchain exploration
- ❌ Not portable to other vaults

### After (Programmatic Discovery)
- ✅ Works with ANY vault address
- ✅ Automatically finds all activity periods
- ✅ Efficient binary search algorithm
- ✅ Handles RPC limits gracefully
- ✅ Falls back to known ranges if needed
- ✅ Future-proof for new vault deployments

## Configuration Options

### Adjust Block Range Limits
```javascript
// In VaultBlockDiscovery constructor
this.maxBlockRange = 5000; // Reduce for stricter RPC limits
```

### Modify Discovery Range
```javascript
// In VaultTracker.discoverActiveBlocks()
const scanFromBlock = Math.max(0, currentBlock - 1000000); // Scan more history
```

### Add New Event Types
```javascript
// In VaultBlockDiscovery constructor
this.eventTopics = {
    deposit: '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7',
    withdraw: '0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db',
    transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    // Add custom events here
    customEvent: '0x...'
};
```

## Network Compatibility

The system is designed to work across different networks:
- **Ethereum Mainnet**: Large block ranges, slower RPCs
- **L2 Networks**: Faster blocks, potentially different RPC limits
- **Plasma Network**: Our test case with 10k block limits
- **Custom Networks**: Easily configurable

## Alternative Integration Options

### Option 1: The Graph Protocol (Recommended for Production)
```javascript
// Use the graph-discovery.js file for production apps
const discovery = new GraphVaultDiscovery(SUBGRAPH_URL, vaultAddress);
const events = await discovery.discoverVaultEvents();
```

### Option 2: Alchemy/Moralis APIs
```javascript
// Enhanced with premium RPC features
const discovery = new VaultBlockDiscovery(alchemyProvider, vaultAddress);
// Benefit from higher rate limits and better performance
```

### Option 3: Local Archive Node
```javascript
// For maximum performance and no limits
const discovery = new VaultBlockDiscovery(localArchiveProvider, vaultAddress);
// Scan entire blockchain history without restrictions
```

## Troubleshooting

### Discovery Returns Empty Results
1. Check if the vault address is correct
2. Verify the vault has actual activity
3. Try expanding the scan range
4. Check RPC endpoint rate limits

### "Query Exceeds" Errors
The system handles these automatically, but if persistent:
1. Reduce `maxBlockRange` in the constructor
2. Add delays between API calls
3. Use a premium RPC endpoint

### Performance Issues
1. Reduce discovery range (scan fewer blocks)
2. Use The Graph Protocol instead
3. Implement caching for discovered ranges
4. Use WebSocket RPC connections

## Future Enhancements

### Planned Features
1. **Caching System**: Cache discovered ranges locally
2. **Multi-Vault Discovery**: Batch discovery for multiple vaults
3. **Real-time Monitoring**: Watch for new events automatically
4. **Analytics Dashboard**: Show discovery performance metrics

### Community Contributions
The discovery system is designed to be extensible. Feel free to:
- Add support for new vault types
- Optimize for specific networks
- Implement additional fallback strategies
- Add performance monitoring

## Console Output Example
```
🔍 Starting block discovery for vault: 0x527295f09ff7c411b213b29a0de8c816a669b3fe
📊 Discovery scan range: 2681727 to 3181727 (500000 blocks)
🎯 Activity boundaries: 3098135 to 3168200
📦 Active chunk: 3098135 to 3103135 (5000 blocks)
📦 Active chunk: 3142939 to 3147939 (5000 blocks)
📦 Active chunk: 3158449 to 3163449 (5000 blocks)
📦 Active chunk: 3167762 to 3168200 (438 blocks)
✅ Discovery complete in 3847ms
📈 Found 4 active block ranges
🎯 Scanning discovered active block ranges...
```

This system transforms your vault analyzer from a static tool into a dynamic, intelligent discovery platform that can analyze any ERC-4626 vault across any supported network!