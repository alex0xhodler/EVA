// Advanced Block Discovery System for Vault Events
class VaultBlockDiscovery {
    constructor(provider, vaultAddress) {
        this.provider = provider;
        this.vaultAddress = vaultAddress.toLowerCase();
        this.maxBlockRange = 10000; // Adjust based on RPC limits
        this.eventTopics = {
            // ERC-4626 standard event signatures
            deposit: '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7',
            withdraw: '0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db',
            transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        };
    }

    async discoverActiveBlocks(fromBlock = 0, toBlock = 'latest') {
        console.log(`🔍 Starting block discovery for vault: ${this.vaultAddress}`);
        
        if (toBlock === 'latest') {
            toBlock = await this.provider.getBlockNumber();
        }

        console.log(`📊 Discovery scan range: ${fromBlock} to ${toBlock} (${toBlock - fromBlock} blocks)`);

        const activeRanges = [];
        const startTime = Date.now();

        try {
            // Binary search to find activity boundaries
            const boundaries = await this.findActivityBoundaries(fromBlock, toBlock);
            
            if (boundaries.length === 0) {
                console.log('❌ No vault activity found in the specified range');
                return [];
            }

            // Subdivide active regions for detailed scanning
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
            return [];
        }
    }

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

    async binarySearchFirstActivity(left, right) {
        let result = -1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const searchEnd = Math.min(mid + this.maxBlockRange, right);
            const hasActivity = await this.checkBlockRangeForActivity(mid, searchEnd);
            
            if (hasActivity) {
                result = mid;
                right = mid - 1;
            } else {
                left = searchEnd + 1;
            }
        }
        
        return result;
    }

    async binarySearchLastActivity(left, right) {
        let result = left;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const searchStart = Math.max(mid - this.maxBlockRange, left);
            const hasActivity = await this.checkBlockRangeForActivity(searchStart, mid);
            
            if (hasActivity) {
                result = mid;
                left = mid + 1;
            } else {
                right = mid - this.maxBlockRange - 1;
            }
        }
        
        return result;
    }

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
            if (error.message.includes('query exceeds') || error.message.includes('max results')) {
                // If range too large, subdivide
                const midPoint = Math.floor((fromBlock + toBlock) / 2);
                if (midPoint === fromBlock) return false; // Prevent infinite recursion
                
                const firstHalf = await this.checkBlockRangeForActivity(fromBlock, midPoint);
                const secondHalf = await this.checkBlockRangeForActivity(midPoint + 1, toBlock);
                return firstHalf || secondHalf;
            }
            console.warn(`⚠️ Error checking range ${fromBlock}-${toBlock}:`, error.message);
            return false;
        }
    }

    async subdivideActiveRegion(startBlock, endBlock) {
        const ranges = [];
        const chunkSize = Math.min(this.maxBlockRange, 5000);
        
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
}

// Global Application State
class VaultTracker {
    constructor() {
        this.provider = null;
        this.currentVaultData = null;
        this.currentTheme = localStorage.getItem('theme') || 'auto';
        this.charts = {};
        this.tableData = [];
        this.filteredData = [];
        this.currentPage = 1;
        this.pageSize = 25;
        
        // Chain configurations with reliable RPC endpoints
        this.chains = {
            1: { name: 'Ethereum', rpc: 'https://ethereum.publicnode.com', explorer: 'https://etherscan.io' },
            42161: { name: 'Arbitrum', rpc: 'https://arbitrum-one.publicnode.com', explorer: 'https://arbiscan.io' },
            8453: { name: 'Base', rpc: 'https://base.publicnode.com', explorer: 'https://basescan.org' },
            10: { name: 'Optimism', rpc: 'https://optimism.publicnode.com', explorer: 'https://optimistic.etherscan.io' },
            9745: { name: 'Plasma', rpc: 'https://rpc.plasma.to', explorer: 'https://plasmascan.to' }
        };

        // ERC-4626 ABI with essential functions and events
        this.erc4626Abi = [
            'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
            'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
            // Alternative event signatures that some vaults might use
            'event DepositMade(address indexed user, uint256 amount, uint256 shares)',
            'event WithdrawalMade(address indexed user, uint256 amount, uint256 shares)',
            // Common auxiliary events seen on Plasma vaults
            'event VaultUpdate(uint256 totalAssets, uint256 totalShares)',
            'event Transfer(address indexed from, address indexed to, uint256 value)',
            'function asset() view returns (address)',
            'function totalAssets() view returns (uint256)',
            'function convertToAssets(uint256 shares) view returns (uint256)',
            'function decimals() view returns (uint8)',
            'function symbol() view returns (string)',
            'function name() view returns (string)',
            'function totalSupply() view returns (uint256)',
            'function previewDeposit(uint256 assets) view returns (uint256)',
            'function maxDeposit(address owner) view returns (uint256)'
        ];

        // ERC-20 ABI for asset token info
        this.erc20Abi = [
            'function symbol() view returns (string)',
            'function decimals() view returns (uint8)',
            'function name() view returns (string)'
        ];

        this.init();

        // Cache for block timestamps to avoid excessive RPC calls
        this.blockTimestampCache = new Map();
    }

    init() {
        this.setupEventListeners();
        this.setupTheme();
        this.updateConnectionStatus('Disconnected', 'info');
    }

    setupEventListeners() {
        console.log('🔌 Setting up event listeners...');
        
        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        console.log('Theme toggle found:', !!themeToggle);
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Example vault buttons
        const exampleBtns = document.querySelectorAll('.example-vault');
        console.log('Example vault buttons found:', exampleBtns.length);
        exampleBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const address = e.target.getAttribute('data-address');
                document.getElementById('vaultAddress').value = address;
                
                // Auto-select the correct network for known vaults
                if (address === '0x527295f09Ff7c411B213B29a0DE8c816a669b3fe') {
                    document.getElementById('chainSelect').value = '9745'; // Plasma
                    console.log('🌐 Auto-selected Plasma network for this vault');
                } else {
                    document.getElementById('chainSelect').value = '1'; // Ethereum for others
                    console.log('🌐 Auto-selected Ethereum network for this vault');
                }
            });
        });

        // Analyze vault button
        const analyzeBtn = document.getElementById('analyzeVault');
        console.log('Analyze vault button found:', !!analyzeBtn);
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => {
                console.log('🟢 Button click event triggered');
                this.analyzeVault();
            });
        } else {
            console.error('❌ Analyze vault button not found!');
        }
        
        const retryBtn = document.getElementById('retryButton');
        console.log('Retry button found:', !!retryBtn);
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.analyzeVault());
        }

        // Table controls
        document.getElementById('searchTable').addEventListener('input', (e) => this.filterTable(e.target.value));
        document.getElementById('pageSize').addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            this.renderTable();
        });

        // Export buttons
        document.getElementById('exportCSV').addEventListener('click', () => this.exportData('csv'));
        document.getElementById('exportJSON').addEventListener('click', () => this.exportData('json'));

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => this.changePage(-1));
        document.getElementById('nextPage').addEventListener('click', () => this.changePage(1));

        // Table sorting
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.sortTable(th.getAttribute('data-sort')));
        });
    }

    setupTheme() {
        const applyTheme = (theme) => {
            if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.setAttribute('data-color-scheme', 'dark');
                document.getElementById('themeToggle').textContent = '☀️';
            } else {
                document.documentElement.setAttribute('data-color-scheme', 'light');
                document.getElementById('themeToggle').textContent = '🌙';
            }
        };

        applyTheme(this.currentTheme);

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (this.currentTheme === 'auto') {
                applyTheme('auto');
            }
        });
    }

    toggleTheme() {
        const themes = ['auto', 'light', 'dark'];
        const currentIndex = themes.indexOf(this.currentTheme);
        this.currentTheme = themes[(currentIndex + 1) % themes.length];
        localStorage.setItem('theme', this.currentTheme);
        this.setupTheme();
    }

    updateConnectionStatus(status, type) {
        const statusEl = document.getElementById('connectionStatus');
        statusEl.textContent = status;
        statusEl.className = `status status--${type}`;
    }

    // Ethereum address validation
    isValidAddress(address) {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    // Destroy all existing charts
    destroyAllCharts() {
        Object.keys(this.charts).forEach(chartKey => {
            if (this.charts[chartKey] && typeof this.charts[chartKey].destroy === 'function') {
                try {
                    this.charts[chartKey].destroy();
                } catch (error) {
                    console.warn(`Error destroying chart ${chartKey}:`, error);
                }
                delete this.charts[chartKey];
            }
        });
        this.charts = {};
    }

    async analyzeVault() {
        console.log('🔍 Analyze Vault button clicked!');
        
        try {
            console.log('📊 Starting vault analysis...');
            this.showLoading();
            this.hideError();
            
            // Destroy any existing charts first
            this.destroyAllCharts();
            
            const vaultAddress = document.getElementById('vaultAddress').value.trim();
            const chainId = parseInt(document.getElementById('chainSelect').value);
            
            console.log('Vault address:', vaultAddress);
            console.log('Chain ID:', chainId);
            
            if (!vaultAddress || !this.isValidAddress(vaultAddress)) {
                throw new Error('Please enter a valid vault contract address (42 characters starting with 0x)');
            }
            
            console.log('✅ Address validation passed');

            this.updateProgress(10, 'Connecting to blockchain network...');
            console.log('🔗 Attempting to connect to chain...');
            await this.connectToChain(chainId);
            
            this.updateProgress(30, 'Validating vault contract...');
            const vaultContract = new ethers.Contract(vaultAddress, this.erc4626Abi, this.provider);
            
            // Validate contract exists and is ERC-4626
            await this.validateVaultContract(vaultContract, vaultAddress);
            
            this.updateProgress(50, 'Fetching vault information...');
            const vaultInfo = await this.getVaultInfo(vaultContract, vaultAddress);
            
            this.updateProgress(70, 'Querying deposit and withdrawal events...');
            const events = await this.fetchVaultEvents(vaultContract);
            
            this.updateProgress(85, 'Processing blockchain data...');
            await this.processRealEventData(vaultInfo, events);
            
            this.updateProgress(95, 'Generating visualizations...');
            this.renderDashboard();
            
            this.updateProgress(100, 'Analysis complete!');
            await this.sleep(500);
            this.hideLoading();
            this.showDashboard();
            
        } catch (error) {
            console.error('Analysis error:', error);
            this.hideLoading();
            this.showError(error.message);
        }
    }

    async connectToChain(chainId) {
        const chainConfig = this.chains[chainId];
        if (!chainConfig) {
            throw new Error('Unsupported blockchain network selected');
        }

        try {
            // Connect to the actual RPC endpoint
            this.provider = new ethers.JsonRpcProvider(chainConfig.rpc);
            
            // Test the connection
            await this.provider.getNetwork();
            
            this.updateConnectionStatus(`Connected to ${chainConfig.name}`, 'success');
            console.log(`Successfully connected to ${chainConfig.name}`);
            
        } catch (error) {
            this.updateConnectionStatus('Connection Failed', 'error');
            throw new Error(`Failed to connect to ${chainConfig.name}. Please check your internet connection or try a different network.`);
        }
    }

    async validateVaultContract(vaultContract, vaultAddress) {
        try {
            console.log(`🔍 Validating contract at ${vaultAddress}...`);
            
            // Check if contract exists by calling basic view functions
            const symbol = await vaultContract.symbol();
            const asset = await vaultContract.asset();
            
            console.log(`✅ Contract validation successful:`);
            console.log(`  - Symbol: ${symbol}`);
            console.log(`  - Asset: ${asset}`);
            
            // Try to get additional info to confirm it's working
            try {
                const totalAssets = await vaultContract.totalAssets();
                console.log(`  - Total Assets: ${totalAssets.toString()}`);
            } catch (err) {
                console.warn('  ⚠️ Could not fetch totalAssets:', err.message);
            }
            
            console.log('🎉 Contract validated as ERC-4626 vault');
        } catch (error) {
            console.error('❌ Contract validation failed:', error);
            if (error.code === 'CALL_EXCEPTION') {
                throw new Error(`Contract at ${vaultAddress} is not a valid ERC-4626 vault or does not exist on this network`);
            }
            throw new Error(`Failed to validate vault contract: ${error.message}`);
        }
    }

    async getVaultInfo(vaultContract, vaultAddress) {
        try {
            // Get basic vault information
            const [name, symbol, decimals, totalAssets, assetAddress, totalSupply] = await Promise.all([
                vaultContract.name(),
                vaultContract.symbol(),
                vaultContract.decimals(),
                vaultContract.totalAssets(),
                vaultContract.asset(),
                vaultContract.totalSupply()
            ]);

            // Get asset token information
            let assetSymbol = 'TOKEN';
            let assetDecimals = 18;
            try {
                const assetContract = new ethers.Contract(assetAddress, this.erc20Abi, this.provider);
                assetSymbol = await assetContract.symbol();
                assetDecimals = await assetContract.decimals();
            } catch (error) {
                console.warn('Could not fetch asset token info:', error.message);
            }

            return {
                address: vaultAddress,
                name,
                symbol,
                decimals: Number(decimals),
                totalAssets: totalAssets.toString(),
                totalSupply: totalSupply.toString(),
                assetAddress,
                assetSymbol,
                assetDecimals: Number(assetDecimals)
            };
        } catch (error) {
            throw new Error(`Failed to fetch vault information: ${error.message}`);
        }
    }

    async fetchVaultEvents(vaultContract) {
        try {
            const blockRange = document.getElementById('blockRange').value;
            let fromBlock = 0;
            const currentBlock = await this.provider.getBlockNumber();

            console.log(`Current block number: ${currentBlock}`);

            // Determine block range based on selection, with RPC limits in mind
            const maxBlockRange = 9000; // Stay under 10k limit for Plasma RPC

            if (blockRange === '30days') {
                const idealRange = 30 * 24 * 60 * 4; // Approximate 30 days
                fromBlock = Math.max(0, currentBlock - Math.min(idealRange, maxBlockRange));
            } else if (blockRange === '90days') {
                const idealRange = 90 * 24 * 60 * 4; // Approximate 90 days
                fromBlock = Math.max(0, currentBlock - Math.min(idealRange, maxBlockRange));
            } else {
                // For "deployment", use maximum allowed range
                fromBlock = Math.max(0, currentBlock - maxBlockRange);
            }

            console.log(`Querying events (chunked) from block ${fromBlock} to ${currentBlock} (range: ${currentBlock - fromBlock} blocks)`);

            // Always prefer chunked scanning with topics to handle RPC quirks and non-standard events
            const chunked = await this.scanByChunksWithTopics(vaultContract, fromBlock, currentBlock);
            let { depositEvents, withdrawEvents, transferEvents } = chunked;
            console.log(`📊 Final results (chunked): ${depositEvents.length} deposits, ${withdrawEvents.length} withdrawals, ${transferEvents.length} transfers`);

            // If no standard events but we have transfers, convert immediately
            if (depositEvents.length === 0 && withdrawEvents.length === 0 && transferEvents.length > 0) {
                console.log('🔄 No Deposit/Withdraw found, converting Transfer mint/burn to deposits/withdrawals');
                const converted = this.processTransferEvents(transferEvents, vaultContract.address);
                depositEvents = converted.depositEvents;
                withdrawEvents = converted.withdrawEvents;
            }

            // If still nothing, fall back to broader discovery scan
            if (depositEvents.length === 0 && withdrawEvents.length === 0) {
                console.log('🔍 No events found via chunked scan, attempting discovery-based scan...');
                const chunkResults = await this.scanInChunks(vaultContract, currentBlock);
                return chunkResults;
            }

            return { depositEvents, withdrawEvents };
        } catch (error) {
            console.error('❌ Critical error fetching events:', error);
            return { depositEvents: [], withdrawEvents: [] };
        }
    }

    async processRealEventData(vaultInfo, events) {
        const { depositEvents, withdrawEvents } = events;
        
        if (depositEvents.length === 0 && withdrawEvents.length === 0) {
            throw new Error('No deposit or withdrawal events found for this vault. The vault may be new or inactive.');
        }

        // Process events to calculate net positions per address
        const addressData = new Map();
        const assetDecimals = vaultInfo.assetDecimals;
        const vaultDecimals = vaultInfo.decimals;

        // Process deposit events
        console.log(`📊 Processing ${depositEvents.length} deposit events...`);
        for (const event of depositEvents) {
            const { owner, assets, shares } = event.args;
            const blockTime = await this.getBlockTimestamp(event.blockNumber);
            
            console.log(`  Deposit: ${owner} - Assets: ${assets.toString()} - Shares: ${shares.toString()}`);
            
            if (!addressData.has(owner)) {
                console.log(`  ✨ New depositor: ${owner}`);
                addressData.set(owner, {
                    address: owner,
                    totalDeposits: BigInt(0),
                    totalWithdrawals: BigInt(0),
                    totalShares: BigInt(0),
                    firstDeposit: new Date(blockTime * 1000),
                    lastActivity: new Date(blockTime * 1000),
                    depositCount: 0,
                    withdrawalCount: 0
                });
            }
            
            const data = addressData.get(owner);
            data.totalDeposits += BigInt(assets);
            data.totalShares += BigInt(shares);
            data.depositCount++;
            
            const eventDate = new Date(blockTime * 1000);
            if (eventDate < data.firstDeposit) data.firstDeposit = eventDate;
            if (eventDate > data.lastActivity) data.lastActivity = eventDate;
        }

        // Process withdrawal events
        console.log(`📊 Processing ${withdrawEvents.length} withdrawal events...`);
        for (const event of withdrawEvents) {
            const { owner, assets, shares } = event.args;
            const blockTime = await this.getBlockTimestamp(event.blockNumber);
            
            console.log(`  Withdrawal: ${owner} - Assets: ${assets.toString()} - Shares: ${shares.toString()}`);
            
            if (!addressData.has(owner)) {
                addressData.set(owner, {
                    address: owner,
                    totalDeposits: BigInt(0),
                    totalWithdrawals: BigInt(0),
                    totalShares: BigInt(0),
                    firstDeposit: new Date(blockTime * 1000),
                    lastActivity: new Date(blockTime * 1000),
                    depositCount: 0,
                    withdrawalCount: 0
                });
            }
            
            const data = addressData.get(owner);
            data.totalWithdrawals += BigInt(assets);
            data.totalShares -= BigInt(shares);
            data.withdrawalCount++;
            
            const eventDate = new Date(blockTime * 1000);
            if (eventDate > data.lastActivity) data.lastActivity = eventDate;
        }

        // Convert to display format and filter
        const includeWithdrawn = document.getElementById('includeWithdrawn').checked;
        const minThreshold = parseFloat(document.getElementById('minThreshold').value) || 0;
        
        console.log(`📋 Filtering results: includeWithdrawn=${includeWithdrawn}, minThreshold=${minThreshold}`);
        console.log(`📁 Total unique addresses found: ${addressData.size}`);
        
        this.tableData = Array.from(addressData.values())
            .map(data => {
                const netAssets = data.totalDeposits - data.totalWithdrawals;
                const netAssetsFormatted = ethers.formatUnits(netAssets, assetDecimals);
                const netAssetsNum = parseFloat(netAssetsFormatted);
                const sharesFormatted = ethers.formatUnits(data.totalShares, vaultDecimals);
                
                return {
                    address: data.address,
                    netDeposit: netAssetsFormatted,
                    netDepositRaw: netAssets,
                    shares: sharesFormatted,
                    sharesRaw: data.totalShares,
                    usdValue: netAssetsNum, // For sorting/calculations
                    firstDeposit: data.firstDeposit.toISOString().split('T')[0],
                    lastActivity: data.lastActivity.toISOString().split('T')[0],
                    depositCount: data.depositCount,
                    withdrawalCount: data.withdrawalCount
                };
            })
            .filter(item => {
                // Filter based on settings
                if (!includeWithdrawn && item.usdValue <= 0) {
                    console.log(`  ❌ Filtered out ${item.address} (net <= 0, includeWithdrawn=false)`);
                    return false;
                }
                // Apply threshold only to positive net positions; keep negatives when includeWithdrawn=true
                if (item.usdValue > 0 && item.usdValue < minThreshold) {
                    console.log(`  ❌ Filtered out ${item.address} (positive net below threshold: ${item.usdValue})`);
                    return false;
                }
                console.log(`  ✅ Keeping ${item.address} (net: ${item.usdValue})`);
                return true;
            })
            .sort((a, b) => b.usdValue - a.usdValue); // Sort by net deposit amount descending

        // Calculate percentages
        const totalTVL = this.tableData.reduce((sum, item) => sum + Math.max(0, item.usdValue), 0);
        this.tableData.forEach(item => {
            item.percentage = totalTVL > 0 ? ((Math.max(0, item.usdValue) / totalTVL) * 100).toFixed(2) : '0.00';
        });

        if (this.tableData.length === 0) {
            throw new Error('No active positions found with the current filters. Try adjusting your filters or including withdrawn positions.');
        }

        // Calculate vault metrics from real data
        const totalAssetsFormatted = ethers.formatUnits(vaultInfo.totalAssets, assetDecimals);
        this.currentVaultData = {
            ...vaultInfo,
            totalDepositors: this.tableData.length,
            totalTVL: parseFloat(totalAssetsFormatted),
            averageDeposit: this.tableData.reduce((sum, item) => sum + Math.max(0, item.usdValue), 0) / this.tableData.length,
            largestDeposit: this.tableData.length > 0 ? Math.max(...this.tableData.map(item => Math.max(0, item.usdValue))) : 0,
            tokenSymbol: vaultInfo.assetSymbol
        };
        
        this.filteredData = [...this.tableData];
        console.log(`Processed ${this.tableData.length} unique depositors with real blockchain data`);
    }

    renderDashboard() {
        this.updateKPIs();
        // Add small delay to ensure DOM is ready
        setTimeout(() => {
            this.renderCharts();
        }, 100);
        this.renderTable();
    }

    updateKPIs() {
        const data = this.currentVaultData;
        
        document.getElementById('totalTVL').textContent = `${this.formatNumber(data.totalTVL)} ${data.tokenSymbol}`;
        document.getElementById('totalTVLTokens').textContent = `${this.formatNumber(data.totalTVL)} ${data.tokenSymbol}`;
        document.getElementById('totalDepositors').textContent = data.totalDepositors;
        document.getElementById('activeDepositors').textContent = `${data.totalDepositors} active`;
        document.getElementById('largestDeposit').textContent = `${this.formatNumber(data.largestDeposit)} ${data.tokenSymbol}`;
        document.getElementById('largestDepositPercent').textContent = `${((data.largestDeposit / data.totalTVL) * 100).toFixed(1)}%`;
        document.getElementById('averageDeposit').textContent = `${this.formatNumber(data.averageDeposit)} ${data.tokenSymbol}`;
        
        // Calculate median
        const sortedAmounts = this.tableData.map(item => Math.max(0, item.usdValue)).sort((a, b) => a - b);
        const median = sortedAmounts.length > 0 ? sortedAmounts[Math.floor(sortedAmounts.length / 2)] : 0;
        document.getElementById('medianDeposit').textContent = `Median: ${this.formatNumber(median)} ${data.tokenSymbol}`;
    }

    renderCharts() {
        try {
            this.renderPieChart();
            this.renderTimelineChart();
            this.renderDistributionChart();
        } catch (error) {
            console.error('Error rendering charts:', error);
        }
    }

    renderPieChart() {
        try {
            const canvas = document.getElementById('pieChart');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            
            const topDepositors = this.tableData.filter(item => item.usdValue > 0).slice(0, 10);
            if (topDepositors.length === 0) return;
            
            const otherAmount = this.currentVaultData.totalTVL - topDepositors.reduce((sum, item) => sum + item.usdValue, 0);
            
            const labels = [...topDepositors.map(item => this.truncateAddress(item.address)), 'Others'];
            const data = [...topDepositors.map(item => item.usdValue), Math.max(0, otherAmount)];
            const colors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B', '#cccccc'];

            this.charts.pieChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                usePointStyle: true,
                                padding: 15,
                                font: { size: 12 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const percentage = ((context.parsed / this.currentVaultData.totalTVL) * 100).toFixed(1);
                                    return `${context.label}: ${this.formatNumber(context.parsed)} ${this.currentVaultData.tokenSymbol} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error rendering pie chart:', error);
        }
    }

    renderTimelineChart() {
        try {
            const canvas = document.getElementById('timelineChart');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');

            // Generate cumulative data over time using real first deposit dates
            const sortedData = [...this.tableData]
                .filter(item => item.usdValue > 0)
                .sort((a, b) => new Date(a.firstDeposit) - new Date(b.firstDeposit));
            
            if (sortedData.length === 0) return;
            
            let cumulative = 0;
            const timelineData = sortedData.map(item => {
                cumulative += item.usdValue;
                return {
                    x: new Date(item.firstDeposit),
                    y: cumulative
                };
            });

            this.charts.timelineChart = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [{
                        label: `Cumulative Deposits (${this.currentVaultData.tokenSymbol})`,
                        data: timelineData,
                        borderColor: '#1FB8CD',
                        backgroundColor: 'rgba(31, 184, 205, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointBackgroundColor: '#1FB8CD',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: 'month',
                                displayFormats: {
                                    month: 'MMM yyyy'
                                }
                            },
                            title: {
                                display: true,
                                text: 'Date'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: `Cumulative Deposits (${this.currentVaultData.tokenSymbol})`
                            },
                            ticks: {
                                callback: (value) => this.formatNumber(value) + ' ' + this.currentVaultData.tokenSymbol
                            }
                        }
                    },
                    plugins: {
                        legend: { 
                            display: true,
                            position: 'top'
                        },
                        tooltip: {
                            callbacks: {
                                title: (context) => {
                                    const date = new Date(context[0].parsed.x);
                                    return date.toLocaleDateString();
                                },
                                label: (context) => `Total: ${this.formatNumber(context.parsed.y)} ${this.currentVaultData.tokenSymbol}`
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error rendering timeline chart:', error);
        }
    }

    renderDistributionChart() {
        try {
            const canvas = document.getElementById('distributionChart');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            
            const activeData = this.tableData.filter(item => item.usdValue > 0);
            if (activeData.length === 0) return;

            // Create dynamic distribution bins based on data range
            const maxAmount = Math.max(...activeData.map(item => item.usdValue));
            const bins = this.createDynamicBins(maxAmount);

            const distribution = bins.map(bin => ({
                label: bin.label,
                count: activeData.filter(item => item.usdValue >= bin.min && item.usdValue < bin.max).length
            }));

            this.charts.distributionChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: distribution.map(d => d.label),
                    datasets: [{
                        label: 'Number of Depositors',
                        data: distribution.map(d => d.count),
                        backgroundColor: '#1FB8CD',
                        borderColor: '#13343B',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: `Deposit Amount Range (${this.currentVaultData.tokenSymbol})`
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Number of Depositors'
                            },
                            ticks: { stepSize: 1 }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => `Depositors: ${context.parsed.y}`
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error rendering distribution chart:', error);
        }
    }

    createDynamicBins(maxAmount) {
        if (maxAmount <= 100) {
            return [
                { label: '0-10', min: 0, max: 10 },
                { label: '10-50', min: 10, max: 50 },
                { label: '50-100', min: 50, max: 100 },
                { label: '100+', min: 100, max: Infinity }
            ];
        } else if (maxAmount <= 10000) {
            return [
                { label: '0-100', min: 0, max: 100 },
                { label: '100-1K', min: 100, max: 1000 },
                { label: '1K-5K', min: 1000, max: 5000 },
                { label: '5K-10K', min: 5000, max: 10000 },
                { label: '10K+', min: 10000, max: Infinity }
            ];
        } else {
            return [
                { label: '0-1K', min: 0, max: 1000 },
                { label: '1K-10K', min: 1000, max: 10000 },
                { label: '10K-100K', min: 10000, max: 100000 },
                { label: '100K-1M', min: 100000, max: 1000000 },
                { label: '1M+', min: 1000000, max: Infinity }
            ];
        }
    }

    renderTable() {
        const tbody = document.getElementById('tableBody');
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, this.filteredData.length);
        const pageData = this.filteredData.slice(startIndex, endIndex);
        
        tbody.innerHTML = pageData.map((item, index) => {
            const globalRank = startIndex + index + 1;
            const explorerUrl = this.getExplorerUrl(item.address);
            const netAmount = parseFloat(item.netDeposit);
            const tokenSymbol = this.currentVaultData?.tokenSymbol || 'TOKENS';
            
            return `
                <tr>
                    <td>${globalRank}</td>
                    <td class="address-cell">
                        <a href="${explorerUrl}" target="_blank" class="address-link">
                            ${this.truncateAddress(item.address)}
                        </a>
                        <button class="copy-btn" onclick="vaultTracker.copyToClipboard('${item.address}')" title="Copy address">
                            📋
                        </button>
                    </td>
                    <td class="amount-cell">${this.formatNumber(netAmount)} ${tokenSymbol}</td>
                    <td class="amount-cell">${this.formatNumber(parseFloat(item.shares))}</td>
                    <td class="percentage-cell">${item.percentage}%</td>
                    <td>${item.firstDeposit}</td>
                    <td>${item.lastActivity}</td>
                    <td>
                        <a href="${explorerUrl}" target="_blank" class="btn btn--outline btn--sm">
                            View
                        </a>
                    </td>
                </tr>
            `;
        }).join('');
        
        this.updatePagination();
    }

    getExplorerUrl(address) {
        const chainId = parseInt(document.getElementById('chainSelect').value);
        const chain = this.chains[chainId];
        return `${chain.explorer}/address/${address}`;
    }

    filterTable(searchTerm) {
        if (!searchTerm) {
            this.filteredData = [...this.tableData];
        } else {
            this.filteredData = this.tableData.filter(item => 
                item.address.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        this.currentPage = 1;
        this.renderTable();
    }

    sortTable(column) {
        const th = document.querySelector(`th[data-sort="${column}"]`);
        const currentSort = th.classList.contains('sort-asc') ? 'asc' : 
                          th.classList.contains('sort-desc') ? 'desc' : 'none';
        
        // Remove all sort classes
        document.querySelectorAll('th[data-sort]').forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
        });
        
        let newSort;
        if (currentSort === 'none' || currentSort === 'desc') {
            newSort = 'asc';
            th.classList.add('sort-asc');
        } else {
            newSort = 'desc';
            th.classList.add('sort-desc');
        }
        
        this.filteredData.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];
            
            // Handle different data types
            if (column === 'netDeposit' || column === 'shares') {
                aVal = parseFloat(aVal);
                bVal = parseFloat(bVal);
            } else if (column === 'percentage') {
                aVal = parseFloat(aVal);
                bVal = parseFloat(bVal);
            } else if (column === 'firstDeposit' || column === 'lastActivity') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            }
            
            if (newSort === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
        
        this.currentPage = 1;
        this.renderTable();
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, this.filteredData.length);
        
        document.getElementById('paginationInfo').textContent = 
            `Showing ${startIndex + 1} to ${endIndex} of ${this.filteredData.length} entries`;
        
        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = this.currentPage === totalPages;
        
        // Generate page numbers
        const pageNumbers = document.getElementById('pageNumbers');
        pageNumbers.innerHTML = '';
        
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `page-number ${i === this.currentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => this.goToPage(i));
            pageNumbers.appendChild(pageBtn);
        }
    }

    changePage(delta) {
        const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        const newPage = this.currentPage + delta;
        
        if (newPage >= 1 && newPage <= totalPages) {
            this.goToPage(newPage);
        }
    }

    goToPage(page) {
        this.currentPage = page;
        this.renderTable();
    }

    exportData(format) {
        if (format === 'csv') {
            this.exportCSV();
        } else if (format === 'json') {
            this.exportJSON();
        }
    }

    exportCSV() {
        const tokenSymbol = this.currentVaultData?.tokenSymbol || 'TOKENS';
        const headers = ['Rank', 'Address', `Net Deposit (${tokenSymbol})`, 'Shares', 'Percentage', 'First Deposit', 'Last Activity'];
        const rows = this.filteredData.map((item, index) => [
            index + 1,
            item.address,
            parseFloat(item.netDeposit).toFixed(6),
            parseFloat(item.shares).toFixed(6),
            item.percentage,
            item.firstDeposit,
            item.lastActivity
        ]);
        
        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
        
        this.downloadFile(csvContent, 'vault-deposits.csv', 'text/csv');
    }

    exportJSON() {
        const jsonData = {
            vault: this.currentVaultData,
            exportDate: new Date().toISOString(),
            totalDepositors: this.filteredData.length,
            depositors: this.filteredData
        };
        
        this.downloadFile(JSON.stringify(jsonData, null, 2), 'vault-deposits.json', 'application/json');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            // Show temporary success feedback
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅';
            setTimeout(() => { btn.textContent = originalText; }, 1000);
        });
    }

    truncateAddress(address) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    formatNumber(num) {
        if (isNaN(num)) return '0';
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return Number(num).toLocaleString(undefined, {maximumFractionDigits: 2});
    }

    showLoading() {
        document.getElementById('loadingSection').classList.remove('hidden');
        document.getElementById('analyzeVault').classList.add('loading');
    }

    hideLoading() {
        document.getElementById('loadingSection').classList.add('hidden');
        document.getElementById('analyzeVault').classList.remove('loading');
    }

    updateProgress(percent, message) {
        document.getElementById('progressFill').style.width = percent + '%';
        document.getElementById('progressText').textContent = percent + '% complete';
        document.getElementById('loadingText').textContent = message;
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorSection').classList.remove('hidden');
    }

    hideError() {
        document.getElementById('errorSection').classList.add('hidden');
    }

    showDashboard() {
        document.getElementById('kpiSection').classList.remove('hidden');
        document.getElementById('chartsSection').classList.remove('hidden');
        document.getElementById('tableSection').classList.remove('hidden');
        
        // Add fade-in animation
        [document.getElementById('kpiSection'), 
         document.getElementById('chartsSection'), 
         document.getElementById('tableSection')].forEach(section => {
            section.classList.add('fade-in');
        });
    }

    async scanInChunks(vaultContract, currentBlock) {
        console.log('🕵️ Starting comprehensive chunk-based event scan...');
        console.log('📊 This vault is VERY active - using Transfer events to track deposits/withdrawals');

        let allTransferEvents = [];
        let allDepositEvents = [];
        let allWithdrawEvents = [];

        try {
            const vaultAddress = vaultContract.target || vaultContract.address || document.getElementById('vaultAddress').value.trim();

            // First try to discover active blocks programmatically
            const discoveredRanges = await this.discoverActiveBlocks(vaultAddress);

            // Fallback to a small recent range if discovery finds nothing
            const fallbackRange = { start: Math.max(0, currentBlock - 5000), end: currentBlock };
            const rangesToScan = discoveredRanges.length > 0 ? discoveredRanges : [fallbackRange];

            console.log(`🎯 Scanning ${discoveredRanges.length > 0 ? 'discovered' : 'recent'} active block ranges...`);

            for (const range of rangesToScan) {
                const fromBlock = range.start;
                const toBlock = range.end;

                console.log(`  Scanning range: blocks ${fromBlock} to ${toBlock}`);

                try {
                    const { depositEvents, withdrawEvents, transferEvents } = await this.scanByChunksWithTopics(vaultContract, fromBlock, toBlock);

                    console.log(`  📊 Found ${depositEvents.length} deposits, ${withdrawEvents.length} withdraws, ${transferEvents.length} transfers`);

                    if (depositEvents.length > 0) allDepositEvents = allDepositEvents.concat(depositEvents);
                    if (withdrawEvents.length > 0) allWithdrawEvents = allWithdrawEvents.concat(withdrawEvents);
                    if (transferEvents.length > 0) allTransferEvents = allTransferEvents.concat(transferEvents);
                } catch (chunkError) {
                    console.warn(`  ⚠️ Failed to scan range ${fromBlock}-${toBlock}: ${chunkError.message}`);
                }

                // Add delay to avoid overwhelming the RPC
                await this.sleep(200);

                // Stop if we've accumulated enough events
                if (allDepositEvents.length + allWithdrawEvents.length + allTransferEvents.length > 300) {
                    console.log(`  ℹ️ Found sufficient events for analysis, stopping scan`);
                    break;
                }
            }

            console.log(`🎆 Scan complete: ${allDepositEvents.length} deposits, ${allWithdrawEvents.length} withdraws, ${allTransferEvents.length} transfers`);

            if (allDepositEvents.length > 0 || allWithdrawEvents.length > 0) {
                return { depositEvents: allDepositEvents, withdrawEvents: allWithdrawEvents };
            } else if (allTransferEvents.length > 0) {
                console.log(`🔄 Converting ${allTransferEvents.length} Transfer events to deposit/withdraw format`);
                return this.processTransferEvents(allTransferEvents, vaultContract.address);
            } else {
                return { depositEvents: [], withdrawEvents: [] };
            }
        } catch (error) {
            console.error('❌ Chunk scanning failed:', error.message);
            return { depositEvents: [], withdrawEvents: [] };
        }
    }

    // Chunked scan using provider.getLogs to robustly collect Deposit/Withdraw/Transfer
    async scanByChunksWithTopics(vaultContract, fromBlock, toBlock) {
        const iface = new ethers.Interface(this.erc4626Abi);
        const depositTopic = iface.getEvent('Deposit').topicHash;
        const withdrawTopic = iface.getEvent('Withdraw').topicHash;
        const transferTopic = iface.getEvent('Transfer').topicHash;
        // Some vaults emit VaultUpdate; we ignore for accounting but use for activity signals
        let vaultUpdateTopic;
        try { vaultUpdateTopic = iface.getEvent('VaultUpdate').topicHash; } catch (_) { vaultUpdateTopic = null; }

        const address = vaultContract.target || vaultContract.address;
        const chunkSize = 2000; // Small chunks for Plasma RPC

        const depositEvents = [];
        const withdrawEvents = [];
        const transferEvents = [];

        for (let start = fromBlock; start <= toBlock; start += chunkSize) {
            const end = Math.min(start + chunkSize - 1, toBlock);
            const topicsOr = [depositTopic, withdrawTopic, transferTopic].filter(Boolean);
            const topics0 = vaultUpdateTopic ? [...topicsOr, vaultUpdateTopic] : topicsOr;

            const filter = {
                address,
                fromBlock: start,
                toBlock: end,
                topics: [topics0]
            };

            let logs = [];
            try {
                logs = await this.provider.getLogs(filter);
            } catch (e) {
                // On range errors, split once
                if (end - start > 500) {
                    const mid = Math.floor((start + end) / 2);
                    const first = await this.provider.getLogs({ address, fromBlock: start, toBlock: mid, topics: [topics0] }).catch(() => []);
                    const second = await this.provider.getLogs({ address, fromBlock: mid + 1, toBlock: end, topics: [topics0] }).catch(() => []);
                    logs = first.concat(second);
                } else {
                    console.warn(`  ⚠️ getLogs failed for ${start}-${end}: ${e.message}`);
                    continue;
                }
            }

            for (const log of logs) {
                try {
                    const parsed = iface.parseLog({ topics: log.topics, data: log.data });
                    if (parsed.name === 'Deposit' || parsed.name === 'DepositMade') {
                        depositEvents.push({ ...log, args: parsed.args });
                    } else if (parsed.name === 'Withdraw' || parsed.name === 'WithdrawalMade') {
                        withdrawEvents.push({ ...log, args: parsed.args });
                    } else if (parsed.name === 'Transfer') {
                        transferEvents.push({ ...log, args: parsed.args });
                    } else if (parsed.name === 'VaultUpdate') {
                        // Ignored for accounting; useful to confirm activity
                    }
                } catch (e) {
                    // Unknown event; ignore
                }
            }

            // Small pacing delay
            await this.sleep(100);
        }

        // If standard events are missing, we may still convert transfers later
        return { depositEvents, withdrawEvents, transferEvents };
    }

    processTransferEvents(transferEvents, vaultAddress) {
        console.log('🔄 Converting Transfer events to deposit/withdrawal data...');
        
        const depositEvents = [];
        const withdrawEvents = [];
        const zeroAddress = '0x0000000000000000000000000000000000000000';
        
        transferEvents.forEach(event => {
            const { from, to, value } = event.args;
            
            // Minting (deposit): from zero address to user
            if (from === zeroAddress && to !== zeroAddress) {
                depositEvents.push({
                    ...event,
                    args: {
                        sender: to, // User who deposited
                        owner: to,  // Same as sender for mints
                        assets: value, // Use share value as proxy for assets
                        shares: value
                    }
                });
            }
            // Burning (withdrawal): from user to zero address  
            else if (from !== zeroAddress && to === zeroAddress) {
                withdrawEvents.push({
                    ...event,
                    args: {
                        sender: from,
                        receiver: from,
                        owner: from,
                        assets: value,
                        shares: value
                    }
                });
            }
            // Regular transfers between users are ignored for deposit/withdrawal analysis
        });
        
        console.log(`✅ Converted ${depositEvents.length} deposits and ${withdrawEvents.length} withdrawals from Transfer events`);
        return { depositEvents, withdrawEvents };
    }

    async discoverContractEvents(vaultContract, currentBlock) {
        console.log('🕵️ Discovering what events this contract actually emits...');
        
        try {
            // Look at recent blocks for any events from this contract
            // Use smaller range to avoid RPC limits
            const recentFromBlock = Math.max(0, currentBlock - 5000); // Last 5000 blocks
            
            console.log(`Scanning blocks ${recentFromBlock} to ${currentBlock} for events...`);
            
            // Try to get all logs from this contract address
            const allLogs = await this.provider.getLogs({
                address: vaultContract.address,
                fromBlock: recentFromBlock,
                toBlock: currentBlock
            });
            
            console.log(`📊 Found ${allLogs.length} total events from this contract in recent blocks`);
            
            if (allLogs.length > 0) {
                // Group events by topic (event signature)
                const eventsByTopic = {};
                allLogs.forEach(log => {
                    const topic = log.topics[0];
                    if (!eventsByTopic[topic]) {
                        eventsByTopic[topic] = [];
                    }
                    eventsByTopic[topic].push(log);
                });
                
                console.log('📁 Event signatures found:');
                Object.entries(eventsByTopic).forEach(([topic, logs]) => {
                    console.log(`  - ${topic}: ${logs.length} events`);
                });
                
                // Try to identify common ERC-4626 event signatures
                const knownSignatures = {
                    '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7': 'Deposit(address,address,uint256,uint256)',
                    '0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db': 'Withdraw(address,address,address,uint256,uint256)',
                    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef': 'Transfer(address,address,uint256)'
                };
                
                Object.entries(eventsByTopic).forEach(([topic, logs]) => {
                    const signature = knownSignatures[topic];
                    if (signature) {
                        console.log(`  ✅ Identified: ${signature} (${logs.length} events)`);
                    }
                });
            } else {
                console.log('⚠️ No recent events found - the vault might be inactive or very new');
            }
            
        } catch (error) {
            console.warn('⚠️ Could not discover contract events:', error.message);
        }
    }

    // Programmatic block discovery system
    async discoverActiveBlocks(vaultAddress) {
        console.log('🔍 Attempting programmatic block discovery...');
        
        try {
            const discovery = new VaultBlockDiscovery(this.provider, vaultAddress);
            
            // For efficiency, we'll scan the last 500,000 blocks or so
            // You can adjust this range based on when the vault was deployed
            const currentBlock = await this.provider.getBlockNumber();
            const scanFromBlock = Math.max(0, currentBlock - 500000);
            
            console.log(`📊 Discovery scan range: ${scanFromBlock} to ${currentBlock}`);
            
            const activeRanges = await discovery.discoverActiveBlocks(scanFromBlock, currentBlock);
            
            if (activeRanges.length > 0) {
                console.log(`✅ Discovery found ${activeRanges.length} active ranges`);
                return activeRanges;
            } else {
                console.log('⚠️ No active ranges discovered, falling back to known ranges');
                return [];
            }
            
        } catch (error) {
            console.warn('⚠️ Block discovery failed:', error.message);
            console.log('📋 Falling back to known active ranges');
            return [];
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getBlockTimestamp(blockNumber) {
        if (this.blockTimestampCache.has(blockNumber)) return this.blockTimestampCache.get(blockNumber);
        const blk = await this.provider.getBlock(blockNumber);
        const ts = blk?.timestamp || Math.floor(Date.now() / 1000);
        this.blockTimestampCache.set(blockNumber, ts);
        return ts;
    }
}

// Initialize the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

function initializeApp() {
    console.log('🚀 Initializing Vault Tracker application...');
    const vaultTracker = new VaultTracker();
    
    // Make it globally available for event handlers
    window.vaultTracker = vaultTracker;
    console.log('✅ Vault Tracker initialized successfully');
}
