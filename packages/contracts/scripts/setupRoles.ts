/**
 * Setup Roles Script
 * 
 * Grants required roles to backend addresses:
 * 1. AUTHORIZED_VERIFIER on WorkProof -> Verifier address
 * 2. APPROVED_SIGNER on CreditAttestationVerifier -> AI Signer address
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

interface Deployments {
    WorkerRegistry: string;
    WorkProof: string;
    CreditAttestationVerifier: string;
    LoanVault: string;
    MockUSDC: string;
}

async function main() {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log("=".repeat(60));
    console.log("🔐 UnEmpower Role Setup Script");
    console.log("=".repeat(60));
    console.log(`Chain ID:    ${chainId}`);
    console.log(`Deployer:    ${deployer.address}`);
    console.log("=".repeat(60));

    // Load deployments
    const deploymentsPath = path.resolve(__dirname, `../deployments/${chainId}.json`);
    if (!fs.existsSync(deploymentsPath)) {
        // Try legacy path
        const legacyPath = path.resolve(__dirname, "../deployments.json");
        if (!fs.existsSync(legacyPath)) {
            console.error("❌ No deployments found. Run deploy first.");
            process.exit(1);
        }
        fs.copyFileSync(legacyPath, deploymentsPath);
    }

    const deployments: Deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
    console.log("\n📋 Contract Addresses:");
    console.log(`  WorkProof:               ${deployments.WorkProof}`);
    console.log(`  CreditAttestationVerifier: ${deployments.CreditAttestationVerifier}`);

    // Get backend addresses from env or derive from private keys
    let verifierAddress: string;
    let aiSignerAddress: string;

    const verifierKey = process.env.WORKPROOF_VERIFIER_PRIVATE_KEY;
    const aiSignerKey = process.env.AI_SIGNER_PRIVATE_KEY;

    if (verifierKey) {
        const wallet = new ethers.Wallet(verifierKey);
        verifierAddress = wallet.address;
    } else if (process.env.VERIFIER_ADDRESS) {
        verifierAddress = process.env.VERIFIER_ADDRESS;
    } else {
        // Default to second hardhat account for local dev
        const signers = await ethers.getSigners();
        verifierAddress = signers[2]?.address || deployer.address;
    }

    if (aiSignerKey) {
        const wallet = new ethers.Wallet(aiSignerKey);
        aiSignerAddress = wallet.address;
    } else if (process.env.AI_SIGNER_ADDRESS) {
        aiSignerAddress = process.env.AI_SIGNER_ADDRESS;
    } else {
        // Default to third hardhat account for local dev
        const signers = await ethers.getSigners();
        aiSignerAddress = signers[1]?.address || deployer.address;
    }

    console.log("\n👤 Backend Addresses:");
    console.log(`  Verifier (WorkProof):    ${verifierAddress}`);
    console.log(`  AI Signer (Attestation): ${aiSignerAddress}`);

    // Get contract instances
    const workProof = await ethers.getContractAt("WorkProof", deployments.WorkProof);
    const verifier = await ethers.getContractAt("CreditAttestationVerifier", deployments.CreditAttestationVerifier);

    console.log("\n🔧 Setting up roles...\n");

    // Grant Authorized Verifier on WorkProof
    try {
        const isAuthorized = await workProof.authorizedVerifiers(verifierAddress);
        if (isAuthorized) {
            console.log("  ✓ Verifier already authorized on WorkProof");
        } else {
            const tx1 = await workProof.authorizeVerifier(verifierAddress);
            const receipt1 = await tx1.wait();
            console.log(`  ✅ Verifier authorized: ${verifierAddress}`);
            console.log(`     TX: ${receipt1?.hash}`);
        }
    } catch (e: any) {
        console.log(`  ❌ Failed to authorize verifier: ${e.message}`);
    }

    // Add approved signer on CreditAttestationVerifier
    try {
        const isSigner = await verifier.approvedSigners(aiSignerAddress);
        if (isSigner) {
            console.log("  ✓ AI Signer already approved");
        } else {
            const tx2 = await verifier.approveSigner(aiSignerAddress);
            const receipt2 = await tx2.wait();
            console.log(`  ✅ AI Signer approved on CreditAttestationVerifier`);
            console.log(`     TX: ${receipt2?.hash}`);
        }
    } catch (e: any) {
        console.log(`  ❌ Failed to add signer: ${e.message}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Role setup complete!");
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
