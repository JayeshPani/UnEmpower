import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    const wp = await ethers.getContractAt("WorkProof", "0xBdD5fC2fBbC1C5F823448437B862c745e985e27C");
    
    // Use the connected wallet's address (which is the deployer/verifier)
    const workerAddr = "0x2D49a13227f68F77f1D51f0457a87c587Fc087c7";
    
    // Get the proper checksum address
    const checksumWorker = ethers.getAddress(workerAddr);
    console.log("Checksum worker address:", checksumWorker);
    
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes("test" + Date.now()));
    
    try {
        console.log("Submitting proof...");
        const tx = await wp.submitProof(
            checksumWorker,
            proofHash,
            10,
            100000000,
            "ipfs://demo/test"
        );
        console.log("TX hash:", tx.hash);
        const receipt = await tx.wait();
        console.log("TX confirmed, status:", receipt?.status);
    } catch (e: any) {
        console.log("Error:", e.message);
        if (e.data) console.log("Revert data:", e.data);
    }
}

main().catch(console.error);
