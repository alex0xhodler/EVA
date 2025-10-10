// The Graph Protocol Integration for Vault Discovery
// Uses GraphQL to efficiently query indexed blockchain data

class GraphVaultDiscovery {
    constructor(graphEndpoint, vaultAddress) {
        this.graphEndpoint = graphEndpoint;
        this.vaultAddress = vaultAddress.toLowerCase();
    }

    // Query The Graph for vault events
    async discoverVaultEvents(first = 1000, skip = 0) {
        const query = `
            query GetVaultEvents($vaultAddress: String!, $first: Int!, $skip: Int!) {
                deposits(
                    where: { vault: $vaultAddress }
                    orderBy: blockNumber
                    orderDirection: desc
                    first: $first
                    skip: $skip
                ) {
                    id
                    blockNumber
                    blockTimestamp
                    transactionHash
                    vault
                    owner
                    receiver
                    assets
                    shares
                }
                
                withdraws(
                    where: { vault: $vaultAddress }
                    orderBy: blockNumber
                    orderDirection: desc
                    first: $first
                    skip: $skip
                ) {
                    id
                    blockNumber
                    blockTimestamp
                    transactionHash
                    vault
                    sender
                    receiver
                    owner
                    assets
                    shares
                }
                
                transfers(
                    where: { 
                        or: [
                            { from: $vaultAddress },
                            { to: $vaultAddress }
                        ]
                    }
                    orderBy: blockNumber
                    orderDirection: desc
                    first: $first
                    skip: $skip
                ) {
                    id
                    blockNumber
                    blockTimestamp
                    transactionHash
                    from
                    to
                    value
                }
            }
        `;

        const variables = {
            vaultAddress: this.vaultAddress,
            first,
            skip
        };

        try {
            const response = await fetch(this.graphEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query,
                    variables
                })
            });

            const result = await response.json();
            
            if (result.errors) {
                throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
            }

            return result.data;

        } catch (error) {
            console.error('Error querying The Graph:', error);
            throw error;
        }
    }

    // Get unique block numbers from events
    extractBlockNumbers(events) {
        const blockNumbers = new Set();
        
        ['deposits', 'withdraws', 'transfers'].forEach(eventType => {
            if (events[eventType]) {
                events[eventType].forEach(event => {
                    blockNumbers.add(parseInt(event.blockNumber));
                });
            }
        });

        return Array.from(blockNumbers).sort((a, b) => a - b);
    }

    // Get block ranges from individual block numbers
    consolidateBlockRanges(blockNumbers, maxGap = 100) {
        if (blockNumbers.length === 0) return [];

        const ranges = [];
        let rangeStart = blockNumbers[0];
        let rangeEnd = blockNumbers[0];

        for (let i = 1; i < blockNumbers.length; i++) {
            const currentBlock = blockNumbers[i];
            
            if (currentBlock - rangeEnd <= maxGap) {
                // Extend current range
                rangeEnd = currentBlock;
            } else {
                // Start new range
                ranges.push({ start: rangeStart, end: rangeEnd });
                rangeStart = currentBlock;
                rangeEnd = currentBlock;
            }
        }

        // Add final range
        ranges.push({ start: rangeStart, end: rangeEnd });
        return ranges;
    }
}

// Usage example for Euler Protocol (if they have a subgraph)
const EULER_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/euler-xyz/euler-mainnet';

async function discoverEulerVaultActivity(vaultAddress) {
    const discovery = new GraphVaultDiscovery(EULER_SUBGRAPH_URL, vaultAddress);
    
    try {
        const events = await discovery.discoverVaultEvents();
        const blockNumbers = discovery.extractBlockNumbers(events);
        const ranges = discovery.consolidateBlockRanges(blockNumbers);
        
        console.log(`Found activity in ${blockNumbers.length} blocks`);
        console.log(`Consolidated into ${ranges.length} ranges`);
        
        return { events, blockNumbers, ranges };
        
    } catch (error) {
        console.error('Error discovering vault activity:', error);
        return null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GraphVaultDiscovery, discoverEulerVaultActivity };
}