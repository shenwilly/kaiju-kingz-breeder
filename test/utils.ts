import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers/lib/ethers";
import { ethers, network } from "hardhat";

export const getCurrentTimestamp = async (): Promise<BigNumber> => {
  const block = await ethers.provider.getBlock("latest");
  return BigNumber.from(block.timestamp);
};

export const fastForwardTo = async (timestamp: number) => {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
};

export const impersonateAccount = async (
  address: string
): Promise<SignerWithAddress> => {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });

  return ethers.getSigner(address);
};
