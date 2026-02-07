import { ethers } from "hardhat";

async function main() {
    const vaultAddr = "0xC13Ab7125e174FCC1ABce3C28062a1476e18F5a8";
    const usdcAddr = "0xD240BdA157005f74A48F22fdA0e6858eA0ADDa8f";
    
    // Check vault balance
    const usdc = await ethers.getContractAt("IERC20", usdcAddr);
    const balance = await usdc.balanceOf(vaultAddr);
    
    console.log(`Vault Address: ${vaultAddr}`);
    console.log(`USDC Address:  ${usdcAddr}`);
    console.log(`Vault Balance: ${ethers.formatUnits(balance, 6)} USDC`);

    if (balance === 0n) {
        console.log("⚠️ WARNING: Vault has 0 liquidity!");
    } else {
        console.log("✅ Vault has liquidity");
    }
}

main().catch(console.error);
