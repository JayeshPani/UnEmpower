import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log("=".repeat(60));
    console.log("🚀 UnEmpower Contract Deployment");
    console.log("=".repeat(60));
    console.log(`Chain ID:        ${chainId}`);
    console.log(`Deployer:        ${deployer.address}`);
    console.log(`Balance:         ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log("=".repeat(60));

    // Deploy MockUSDC
    console.log("\n1. Deploying MockUSDC...");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    const mockUSDCAddress = await mockUSDC.getAddress();
    console.log("   ✅ MockUSDC deployed to:", mockUSDCAddress);

    // Deploy WorkerRegistry
    console.log("\n2. Deploying WorkerRegistry...");
    const WorkerRegistry = await ethers.getContractFactory("WorkerRegistry");
    const workerRegistry = await WorkerRegistry.deploy();
    await workerRegistry.waitForDeployment();
    const workerRegistryAddress = await workerRegistry.getAddress();
    console.log("   ✅ WorkerRegistry deployed to:", workerRegistryAddress);

    // Deploy WorkProof
    console.log("\n3. Deploying WorkProof...");
    const WorkProof = await ethers.getContractFactory("WorkProof");
    const workProof = await WorkProof.deploy();
    await workProof.waitForDeployment();
    const workProofAddress = await workProof.getAddress();
    console.log("   ✅ WorkProof deployed to:", workProofAddress);

    // Deploy CreditAttestationVerifier
    console.log("\n4. Deploying CreditAttestationVerifier...");
    const CreditAttestationVerifier = await ethers.getContractFactory("CreditAttestationVerifier");
    const verifier = await CreditAttestationVerifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log("   ✅ CreditAttestationVerifier deployed to:", verifierAddress);

    // Deploy LoanVault
    console.log("\n5. Deploying LoanVault...");
    const LoanVault = await ethers.getContractFactory("LoanVault");
    const loanVault = await LoanVault.deploy(mockUSDCAddress, verifierAddress, workerRegistryAddress);
    await loanVault.waitForDeployment();
    const loanVaultAddress = await loanVault.getAddress();
    console.log("   ✅ LoanVault deployed to:", loanVaultAddress);

    // Save addresses to files
    const addresses = {
        MockUSDC: mockUSDCAddress,
        WorkerRegistry: workerRegistryAddress,
        WorkProof: workProofAddress,
        CreditAttestationVerifier: verifierAddress,
        LoanVault: loanVaultAddress,
        deployer: deployer.address,
        chainId: chainId,
        timestamp: new Date().toISOString()
    };

    // Save to chainId-specific path
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const chainDeployPath = path.join(deploymentsDir, `${chainId}.json`);
    fs.writeFileSync(chainDeployPath, JSON.stringify(addresses, null, 2));

    // Also save to legacy path for compatibility
    const legacyPath = path.join(__dirname, "..", "deployments.json");
    fs.writeFileSync(legacyPath, JSON.stringify(addresses, null, 2));

    console.log("\n" + "=".repeat(60));
    console.log("✅ Deployment complete!");
    console.log("=".repeat(60));
    console.log("\nContract Addresses:");
    console.log(`  MockUSDC:                   ${mockUSDCAddress}`);
    console.log(`  WorkerRegistry:             ${workerRegistryAddress}`);
    console.log(`  WorkProof:                  ${workProofAddress}`);
    console.log(`  CreditAttestationVerifier:  ${verifierAddress}`);
    console.log(`  LoanVault:                  ${loanVaultAddress}`);
    console.log("\nAddresses saved to:");
    console.log(`  ${chainDeployPath}`);
    console.log(`  ${legacyPath}`);
    console.log("\n⚠️  Next steps:");
    console.log("  1. Run: pnpm contracts:setup:local   (or :sepolia)");
    console.log("  2. Run: pnpm contracts:seed:local    (or :sepolia)");
    console.log("  3. Copy addresses to apps/web/.env.local and apps/api/.env");
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
