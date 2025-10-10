// Advanced Block Discovery System for Vault Events
// Uses binary search and event filtering for efficient block range detection

class VaultBlockDiscovery {
    constructor(provider, vaultAddress) {
        this.provider = provider;
        this.vaultAddress = vaultAddress.toLowerCase();
        this.maxBlockRange = 10000; // Adjust based on RPC limits
        this.eventTopics = {
            // ERC-4626 standard event signatures
            deposit: '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7', // Deposit(address,address,uint256,uint256)
            withdraw: '0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db', // Withdraw(address,address,address,uint256,uint256)
            transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'  // Transfer(address,address,uint256)
        };
    }

    // Main method to discover active blocks for a vault
    async discoverActiveBlocks(fromBlock = 0, toBlock = 'latest') {
        console.log(`🔍 Starting block discovery for vault: ${this.vaultAddress}`);
        
        // Get current block if toBlock is 'latest'
        if (toBlock === 'latest') {
            toBlock = await this.provider.getBlockNumber();
        }

        console.log(`📊 Scanning range: ${fromBlock} to ${toBlock} (${toBlock - fromBlock} blocks)`);

        const activeRanges = [];
        const startTime = Date.now();

        try {
            // Strategy 1: Use binary search to find first and last activity
            const boundaries = await this.findActivityBoundaries(fromBlock, toBlock);
            
            if (boundaries.length === 0) {
                console.log('❌ No vault activity found in the specified range');
                return [];
            }

            // Strategy 2: Subdivide active regions for detailed scanning
            for (const boundary of boundaries) {
                const detailedRanges = await this.subdivideActiveRegion(
                    boundary.start, 
                    boundary.end
                );
                activeRanges.push(...detailedRanges);
            }

            const endTime = Date.now();
            console.log(`✅ Discovery complete in ${endTime - startTime}ms`);
            console.log(`📈 Found ${activeRanges.length} active block ranges`);
            
            return activeRanges;

        } catch (error) {
            console.error('💥 Error during block discovery:', error);
            throw error;
        }
    }

    // Binary search to find activity boundaries
    async findActivityBoundaries(fromBlock, toBlock) {
        const boundaries = [];
        
        // Find first activity block
        const firstActive = await this.binarySearchFirstActivity(fromBlock, toBlock);
        if (firstActive === -1) return boundaries;

        // Find last activity block
        const lastActive = await this.binarySearchLastActivity(firstActive, toBlock);
        
        boundaries.push({
            start: firstActive,
            end: lastActive,
            totalBlocks: lastActive - firstActive + 1
        });

        console.log(`🎯 Activity boundaries: ${firstActive} to ${lastActive}`);
        return boundaries;
    }

    // Binary search for first block with activity
    async binarySearchFirstActivity(left, right) {
        let result = -1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const hasActivity = await this.checkBlockRangeForActivity(mid, Math.min(mid + this.maxBlockRange, right));
            
            if (hasActivity) {
                result = mid;
                right = mid - 1; // Look for earlier activity
            } else {
                left = mid + this.maxBlockRange + 1; // Move forward
            }
        }
        
        return result;
    }

    // Binary search for last block with activity
    async binarySearchLastActivity(left, right) {
        let result = left;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const hasActivity = await this.checkBlockRangeForActivity(Math.max(mid - this.maxBlockRange, left), mid);
            
            if (hasActivity) {
                result = mid;
                left = mid + 1; // Look for later activity
            } else {
                right = mid - this.maxBlockRange - 1; // Move backward
            }
        }
        
        return result;
    }

    // Check if a block range contains any vault events
    async checkBlockRangeForActivity(fromBlock, toBlock) {
        try {
            const filter = {
                address: this.vaultAddress,
                fromBlock: fromBlock,
                toBlock: toBlock,
                topics: [
                    [this.eventTopics.deposit, this.eventTopics.withdraw, this.eventTopics.transfer]
                ]
            };

            const logs = await this.provider.getLogs(filter);
            return logs.length > 0;

        } catch (error) {
            if (error.message.includes('query exceeds')) {
                // If range too large, subdivide
                const midPoint = Math.floor((fromBlock + toBlock) / 2);
                const firstHalf = await this.checkBlockRangeForActivity(fromBlock, midPoint);
                const secondHalf = await this.checkBlockRangeForActivity(midPoint + 1, toBlock);
                return firstHalf || secondHalf;
            }
            throw error;
        }
    }

    // Subdivide active regions into smaller, scannable chunks
    async subdivideActiveRegion(startBlock, endBlock) {
        const ranges = [];
        const chunkSize = Math.min(this.maxBlockRange, 5000); // Conservative chunk size
        
        for (let i = startBlock; i <= endBlock; i += chunkSize) {
            const rangeEnd = Math.min(i + chunkSize - 1, endBlock);
            
            // Verify this chunk has activity
            const hasActivity = await this.checkBlockRangeForActivity(i, rangeEnd);
            if (hasActivity) {
                ranges.push({
                    start: i,
                    end: rangeEnd,
                    blocks: rangeEnd - i + 1
                });
                console.log(`📦 Active chunk: ${i} to ${rangeEnd} (${rangeEnd - i + 1} blocks)`);
            }
        }
        
        return ranges;
    }

    // Get detailed events from discovered ranges
    async getEventsFromRanges(ranges) {
        const allEvents = {
            deposits: [],
            withdraws: [],
            transfers: []
        };

        for (const range of ranges) {
            console.log(`📥 Fetching events from blocks ${range.start} to ${range.end}`);
            
            try {
                // Get deposits
                const deposits = await this.getEventsInRange(
                    range.start, 
                    range.end, 
                    [this.eventTopics.deposit]
                );
                
                // Get withdraws  
                const withdraws = await this.getEventsInRange(
                    range.start, 
                    range.end, 
                    [this.eventTopics.withdraw]
                );

                // Get transfers
                const transfers = await this.getEventsInRange(
                    range.start, 
                    range.end, 
                    [this.eventTopics.transfer]
                );

                allEvents.deposits.push(...deposits);
                allEvents.withdraws.push(...withdraws);
                allEvents.transfers.push(...transfers);

                console.log(`✅ Range ${range.start}-${range.end}: ${deposits.length} deposits, ${withdraws.length} withdraws, ${transfers.length} transfers`);

            } catch (error) {
                console.warn(`⚠️ Error fetching events from range ${range.start}-${range.end}:`, error.message);
            }
        }

        return allEvents;
    }

    // Helper to get specific events in a range
    async getEventsInRange(fromBlock, toBlock, topics) {
        const filter = {
            address: this.vaultAddress,
            fromBlock: fromBlock,
            toBlock: toBlock,
            topics: topics
        };

        return await this.provider.getLogs(filter);
    }

    // Advanced: Use bloom filters for rapid pre-filtering (if supported by RPC)
    async bloomFilterPreCheck(blockNumber) {
        try {
            const block = await this.provider.getBlock(blockNumber);
            if (!block.logsBloom) return true; // Assume activity if no bloom filter
            
            // Check if vault address appears in bloom filter
            // This is a probabilistic check - false positives possible, no false negatives
            return this.checkAddressInBloomFilter(block.logsBloom, this.vaultAddress);
        } catch (error) {
            console.warn(`⚠️ Bloom filter check failed for block ${blockNumber}`);
            return true; // Default to checking the block
        }
    }

    checkAddressInBloomFilter(logsBloom, address) {
        // Simplified bloom filter check
        // In production, you'd want a more sophisticated implementation
        const addressHash = ethers.utils.keccak256(address);
        return logsBloom.includes(addressHash.slice(2, 10));
    }
}

// Usage example
async function discoverVaultActivity(provider, vaultAddress) {
    const discovery = new VaultBlockDiscovery(provider, vaultAddress);
    
    // Discover active blocks (can specify custom range)
    const activeRanges = await discovery.discoverActiveBlocks();
    
    if (activeRanges.length > 0) {
        // Get all events from discovered ranges
        const events = await discovery.getEventsFromRanges(activeRanges);
        
        console.log('\n📊 Final Results:');
        console.log(`💰 Total Deposits: ${events.deposits.length}`);
        console.log(`💸 Total Withdraws: ${events.withdraws.length}`);
        console.log(`📈 Total Transfers: ${events.transfers.length}`);
        
        return {
            ranges: activeRanges,
            events: events
        };
    }
    
    return null;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VaultBlockDiscovery, discoverVaultActivity };
}