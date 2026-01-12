# Testing Guide - Deposit Flow

## Quick Answer: YES, it will work!

The deposit address you get is the **treasury wallet address**. You can airdrop test SOL directly to it.

## Method 1: Direct Airdrop to Treasury (Easiest)

1. **Get the treasury address:**
   - Run: `npx tsx scripts/get-treasury-address.ts`
   - Or check server logs for: "Test treasury address: ..."
   - Current address: `EovXiuzzbusVdLn6ei4bg6NNLNC85KamySSxjzGKzRPf`

2. **Airdrop test SOL:**
   - Visit: https://faucet.solana.com
   - Select "devnet" or "testnet"
   - Paste treasury address: `EovXiuzzbusVdLn6ei4bg6NNLNC85KamySSxjzGKzRPf`
   - Click "Confirm Airdrop"
   - Wait for confirmation (usually instant)

3. **Verify:**
   - Check balance: https://explorer.solana.com/address/EovXiuzzbusVdLn6ei4bg6NNLNC85KamySSxjzGKzRPf?cluster=devnet
   - You should see the airdropped SOL

4. **Test Withdrawal:**
   - Create account → Deposit some amount (this credits your account balance)
   - Then test withdrawal to your devnet wallet

## Method 2: Full User Deposit Flow (Recommended)

This tests the complete deposit verification flow:

1. **Create Account:**
   - Register a new account on your platform
   - Should show $0.00 balance

2. **Initiate Deposit:**
   - Go to Wallet → Deposit tab
   - Enter amount: 0.5 SOL
   - Copy the deposit address shown

3. **Get Test SOL to Your Wallet:**
   - Open Phantom wallet (switch to Devnet)
   - Go to https://faucet.solana.com
   - Enter YOUR Phantom wallet address (not the deposit address)
   - Request airdrop
   - Wait for test SOL to arrive in Phantom

4. **Send Deposit:**
   - In Phantom, send exactly 0.5 SOL
   - To the deposit address you copied
   - Include the memo if shown (important for tracking)
   - Wait for transaction confirmation

5. **Verify Deposit:**
   - Check your account balance (should be credited)
   - The deposit should show as "CONFIRMED" in the system

## Important Notes

- **Exact Amount Required:** You must send the EXACT amount shown in the UI (0.5 SOL in your case)
- **Memo Field:** If a memo is shown, include it in the transaction (some wallets support this)
- **Network:** Make sure Phantom is on **Devnet** (not Mainnet)
- **Faucet Limits:** https://faucet.solana.com allows 2 requests every 8 hours (or more with GitHub login)

## Troubleshooting

**Deposit not credited?**
- Check transaction on Solana Explorer
- Verify amount matches exactly
- Check server logs for errors
- Make sure you're on devnet

**Can't get test SOL?**
- Try different faucet: https://solfaucet.com
- Or use: `solana airdrop 1 <address> --url devnet` (if you have Solana CLI)

## Current Treasury Address (Devnet)

**Address:** `EovXiuzzbusVdLn6ei4bg6NNLNC85KamySSxjzGKzRPf`

You can airdrop directly to this address to fund the treasury for testing withdrawals.

