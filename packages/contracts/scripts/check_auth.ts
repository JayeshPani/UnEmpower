import { ethers } from "hardhat";

async function main() {
    const wp = await ethers.getContractAt("WorkProof", "0xBdD5fC2fBbC1C5F823448437B862c745e985e27C");
    const verifier = "0x2D4913747eAe194076F45f141C804750a86F87c7";
    
    const isAuth = await wp.authorizedVerifiers(verifier);
    console.log(`Verifier ${verifier} is authorized:`, isAuth);
    
    const owner = await wp.owner();
    console.log(`Contract owner:`, owner);
}

main().catch(console.error);
