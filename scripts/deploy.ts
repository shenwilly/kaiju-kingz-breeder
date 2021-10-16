import hre from "hardhat";
import { KAIJUKINGZ_ADDRESS } from "../constants";
import { KaijuKingzBreeder__factory } from "../typechain";

async function main() {
  const BreederFactory = <KaijuKingzBreeder__factory>(
    await hre.ethers.getContractFactory("KaijuKingzBreeder")
  );
  const breeder = await BreederFactory.deploy(KAIJUKINGZ_ADDRESS);
  await breeder.deployed();

  console.log("Breeder deployed to:", breeder.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
