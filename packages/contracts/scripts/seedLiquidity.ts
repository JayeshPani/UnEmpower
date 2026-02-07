/**
 * Seed Liquidity Script
 * 
 * Seeds the LoanVault with initial liquidity for demo:
 * 1. Mints MockUSDC to deployer
 * 2. Approves LoanVault to spend MockUSDC
 * 3. Deposits initial liquidity into LoanVault
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface Deployments {
    WorkerRegistry: string;
    WorkProof: string;
    CreditAttestationVerifier: string;
    LoanVault: string;
    MockUSDC: string;
}

// Default liquidity amount: 100,000 USDC (6 decimals)
const DEFAULT_LIQUIDITY = ethers.parseUnits("100000", 6);

async function main() {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log("=".repeat(60));
    console.log("💰 UnEmpower Seed Liquidity Script");
    console.log("=".repeat(60));
    console.log(`Chain ID:    ${chainId}`);
    console.log(`Deployer:    ${deployer.address}`);
    console.log("=".repeat(60));

    // Parse liquidity amount from args or use default
    const liquidityArg = process.env.LIQUIDITY_AMOUNT;
    const liquidityAmount = liquidityArg
        ? ethers.parseUnits(liquidityArg, 6)
        : DEFAULT_LIQUIDITY;

    console.log(`\n💵 Target Liquidity: ${ethers.formatUnits(liquidityAmount, 6)} USDC\n`);

    // Load deployments
    const deploymentsPath = path.resolve(__dirname, `../deployments/${chainId}.json`);
    if (!fs.existsSync(deploymentsPath)) {
        const legacyPath = path.resolve(__dirname, "../deployments.json");
        if (!fs.existsSync(legacyPath)) {
            console.error("❌ No deployments found. Run deploy first.");
            process.exit(1);
        }
        fs.copyFileSync(legacyPath, deploymentsPath);
    }

    const deployments: Deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
    console.log("📋 Contract Addresses:");
    console.log(`  MockUSDC:   ${deployments.MockUSDC}`);
    console.log(`  LoanVault:  ${deployments.LoanVault}`);

    // Get contract instances
    const mockUSDC = await ethers.getContractAt("MockUSDC", deployments.MockUSDC);
    const loanVault = await ethers.getContractAt("LoanVault", deployments.LoanVault);

    // Check current balances
    const deployerBalance = await mockUSDC.balanceOf(deployer.address);
    const vaultBalance = await mockUSDC.balanceOf(deployments.LoanVault);

    console.log("\n📊 Current Balances:");
    console.log(`  Deployer:   ${ethers.formatUnits(deployerBalance, 6)} USDC`);
    console.log(`  LoanVault:  ${ethers.formatUnits(vaultBalance, 6)} USDC`);

    // Skip if already seeded
    if (vaultBalance >= liquidityAmount) {
        console.log("\n✅ LoanVault already has sufficient liquidity!");
        process.exit(0);
    }

    const neededInVault = liquidityAmount - vaultBalance;
    console.log(`\n🔧 Need to deposit: ${ethers.formatUnits(neededInVault, 6)} USDC`);

    // Mint if deployer doesn't have enough
    if (deployerBalance < neededInVault) {
        const mintAmount = neededInVault - deployerBalance + ethers.parseUnits("1000", 6); // Extra buffer
        console.log(`\n💸 Minting ${ethers.formatUnits(mintAmount, 6)} USDC to deployer...`);

        const mintTx = await mockUSDC.mint(deployer.address, mintAmount);
        await mintTx.wait();
        console.log(`  ✅ Minted! TX: ${mintTx.hash}`);
    }

    // Approve LoanVault
    console.log(`\n🔓 Approving LoanVault to spend ${ethers.formatUnits(neededInVault, 6)} USDC...`);
    const approveTx = await mockUSDC.approve(deployments.LoanVault, neededInVault);
    await approveTx.wait();
    console.log(`  ✅ Approved! TX: ${approveTx.hash}`);

    // Deposit to LoanVault
    console.log(`\n💰 Depositing ${ethers.formatUnits(neededInVault, 6)} USDC to LoanVault...`);

    // Check if LoanVault has deposit function, or just transfer directly
    try {
        // Try direct transfer - MockUSDC ERC20 transfer
        const transferTx = await mockUSDC.transfer(deployments.LoanVault, neededInVault);
        await transferTx.wait();
        console.log(`  ✅ Deposited! TX: ${transferTx.hash}`);
    } catch (e: any) {
        console.log(`  ❌ Deposit failed: ${e.message}`);
        process.exit(1);
    }

    // Verify final balance
    const finalBalance = await mockUSDC.balanceOf(deployments.LoanVault);
    console.log(`\n📊 Final LoanVault Balance: ${ethers.formatUnits(finalBalance, 6)} USDC`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ Liquidity seeding complete!");
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
