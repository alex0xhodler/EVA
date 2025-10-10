# EVA - ERC-4626 Vault Analyzer 🏦

A comprehensive web-based tool for analyzing ERC-4626 vault deposits, withdrawals, and depositor statistics with advanced programmatic block discovery capabilities.

## 🚀 Live Demo

**Deployed on Vercel:** [eva-vault-analyzer.vercel.app](https://eva-vault-analyzer.vercel.app)

## ✨ Features

### 🔍 Advanced Block Discovery
- **Binary Search Algorithm**: Efficiently discovers blocks containing vault events
- **Intelligent Range Detection**: Automatically finds active block ranges
- **RPC Rate Limiting**: Handles API limits gracefully with exponential backoff
- **Error Recovery**: Robust handling of network issues and timeouts

### 📊 Comprehensive Analysis
- **Depositor Tracking**: Complete historical analysis of all vault depositors
- **Event Processing**: Tracks Deposit, Withdraw, and Transfer events
- **Balance Calculations**: Real-time net balance computations
- **Filtering Options**: Customizable filters for withdrawn depositors and minimum thresholds

### 🌐 Multi-Network Support
- **Ethereum Mainnet**
- **Plasma Network** 
- **Polygon**
- **Arbitrum**
- **Optimism**
- And more...

### 📈 Real-Time Data
- **Live Balance Queries**: Current depositor balances via RPC calls
- **Event History**: Complete transaction history analysis
- **Performance Metrics**: Detailed timing and discovery statistics

## 🛠 Technology Stack

- **Frontend**: Pure HTML5, CSS3, JavaScript (ES6+)
- **Blockchain**: Ethers.js v6 for Web3 interactions
- **Networks**: Multi-chain EVM compatibility
- **Deployment**: Vercel static hosting

## 📖 Usage

1. **Enter Vault Address**: Input any ERC-4626 compatible vault address
2. **Select Network**: Choose the appropriate blockchain network
3. **Analyze**: Click "Analyze Vault" to start comprehensive analysis
4. **Review Results**: View depositor statistics, balances, and transaction history

## 🔧 Local Development

```bash
# Clone the repository
git clone https://github.com/alex0xhodler/EVA.git
cd EVA

# Install dependencies (optional - for local serving)
npm install

# Serve locally
npm run dev
# or simply open index.html in your browser
```

## 📚 Documentation

- **[Block Discovery Guide](./BLOCK_DISCOVERY_GUIDE.md)**: Detailed technical documentation
- **[API Reference](./app.js)**: Complete function documentation
- **[Configuration Guide](./vercel.json)**: Deployment settings

## 🎯 Key Benefits

- **No Backend Required**: Pure client-side application
- **Privacy Focused**: All analysis happens in your browser
- **Cost Effective**: No server costs, scales automatically
- **Fast Performance**: Optimized algorithms for quick analysis
- **User Friendly**: Simple, intuitive interface

## 🔐 Security

- **Client-Side Only**: No sensitive data sent to servers
- **CORS Headers**: Proper security headers implemented
- **Input Validation**: Address and network validation
- **Error Handling**: Comprehensive error management

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 👨‍💻 Author

**alex0xhodler** - [alex@0xhodler.nl](mailto:alex@0xhodler.nl)

---

*Built with ❤️ for the DeFi community*