import { ethers } from "hardhat";

async function main() {
    const verifier = "0x2D4913747eAe194076F45f141C804750a86F87c7";
    const balance = await ethers.provider.getBalance(verifier);
    console.log(`Verifier balance:`, ethers.formatEther(balance), "ETH");
    
    // Try to simulate the call
    const wp = await ethers.getContractAt("WorkProof", "0xBdD5fC2fBbC1C5F823448437B862c745e985e27C");
    const worker = "0x2D49a13227f68F77f1D51f0457a87c587Fc087c7";
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
    
    try {
        // Static call to check if it would revert
        const result = await wp.submitProof.staticCall(
            worker,
            proofHash,
            10,
            100000000,
            "ipfs://demo/test"
        );
        console.log("Static call succeeded, proof ID would be:", result.toString());
    } catch (e: any) {
        console.log("Static call would revert:", e.message);
    }
}

main().catch(console.error);
