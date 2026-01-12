# Solana Testnet Setup Guide

## Current Configuration: TESTNET (Devnet)

The system is now configured to use **Solana Devnet** for testing.

## Treasury Wallet

**Test Treasury Address:** `EovXiuzzbusVdLn6ei4bg6NNLNC85KamySSxjzGKzRPf`

**Private Key (base58):** `2uCad17v3ZHbykfnvhSRkxfNSX7o22dbX7EEWv47Nbr1MHV6RSP696tppEGktP7pj9prCeUEvVKUM9UJssUkxUSD`

⚠️ **IMPORTANT:** Save this private key! The wallet is generated fresh each time if not set.

## Getting Test SOL

1. Visit: https://faucet.solana.com
2. Enter the treasury address: `EovXiuzzbusVdLn6ei4bg6NNLNC85KamySSxjzGKzRPf`
3. Request test SOL (you can request multiple times)
4. Verify balance on: https://explorer.solana.com/address/EovXiuzzbusVdLn6ei4bg6NNLNC85KamySSxjzGKzRPf?cluster=devnet

## Testing Deposit Flow

1. Create a new account on your platform
2. Go to Wallet → Deposit
3. Enter an amount (e.g., 0.1 SOL)
4. Copy the deposit address shown
5. Send test SOL from Phantom (devnet) to that address
6. Use the exact amount shown in the UI
7. Verify the deposit is credited

## Testing Withdrawal Flow

1. Make sure you have balance in your account
2. Go to Wallet → Withdraw
3. Enter amount and your devnet wallet address
4. Request withdrawal
5. Check that SOL is sent from treasury to your address

## Environment Variables

To persist the treasury wallet, set:
```bash
export SOLANA_TREASURY_PRIVATE_KEY="2uCad17v3ZHbykfnvhSRkxfNSX7o22dbX7EEWv47Nbr1MHV6RSP696tppEGktP7pj9prCeUEvVKUM9UJssUkxUSD"
export SOLANA_USE_TESTNET="true"
```

## Switching to Mainnet

When ready for production:

1. **Set mainnet environment:**
   ```bash
   unset SOLANA_USE_TESTNET
   # or
   export SOLANA_USE_TESTNET="false"
   ```

2. **Set your mainnet treasury wallet:**
   ```bash
   export SOLANA_TREASURY_PRIVATE_KEY="your_mainnet_private_key_here"
   ```

3. **Fund your mainnet treasury wallet** with real SOL

4. **Restart the server**

## Current Status

- ✅ Network: DEVNET (Testing)
- ✅ Treasury wallet: Generated
- ✅ RPC: https://api.devnet.solana.com
- ✅ Server: Running with testnet config

