import { ethers } from "hardhat";
import {
  IKaijuKingz,
  IRWaste,
  KaijuKingzBreeder,
  KaijuKingzBreeder__factory,
} from "../typechain";

import chai from "chai";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { KAIJUKINGZ_ADDRESS, KAIJUKINGZ_OWNERS } from "../constants";
import {
  fastForwardTo,
  getCurrentTimestamp,
  impersonateAccount,
} from "./utils";
import { BigNumber } from "@ethersproject/bignumber";
import { parseUnits } from "@ethersproject/units";

const { expect } = chai;
chai.use(solidity);

describe("KaijuKingzBreeder", function () {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let ownerKaijuId: BigNumber;
  let userKaijuId: BigNumber;

  let kaijuBreeder: KaijuKingzBreeder;
  let kaiju: IKaijuKingz;
  let rwaste: IRWaste;

  const breedCost = parseUnits("750", "18");
  let breedFee: BigNumber;

  let snapshotId: string;

  before("setup contracts", async () => {
    [owner, user] = await ethers.getSigners();

    const BreederFactory = (await ethers.getContractFactory(
      "KaijuKingzBreeder",
      owner
    )) as KaijuKingzBreeder__factory;
    kaijuBreeder = await BreederFactory.deploy(KAIJUKINGZ_ADDRESS);
    await kaijuBreeder.deployed();
    breedFee = await kaijuBreeder.fee();

    kaiju = <IKaijuKingz>(
      await ethers.getContractAt("IKaijuKingz", KAIJUKINGZ_ADDRESS)
    );
    const kaijuRwaste = await kaiju.RWaste();
    const kaijuGenesisCount = await kaiju.maxGenCount();

    expect(await kaijuBreeder.kaiju()).to.be.eq(kaiju.address);
    expect(await kaijuBreeder.rwaste()).to.be.eq(kaijuRwaste);
    expect(await kaijuBreeder.genesisCount()).to.be.eq(kaijuGenesisCount);
    rwaste = <IRWaste>await ethers.getContractAt("IRWaste", kaijuRwaste);

    const kaijuOwner = await impersonateAccount(KAIJUKINGZ_OWNERS[0]);

    // for breeder
    ownerKaijuId = await kaiju.tokenOfOwnerByIndex(kaijuOwner.address, 0);
    await kaiju
      .connect(kaijuOwner)
      .safeTransferFrom(kaijuOwner.address, owner.address, ownerKaijuId, "0x");
    await kaiju.connect(owner).approve(kaijuBreeder.address, ownerKaijuId);
    await kaijuBreeder.connect(owner).depositBreeder(ownerKaijuId);

    // for user
    userKaijuId = await kaiju.tokenOfOwnerByIndex(kaijuOwner.address, 1);
    await kaiju
      .connect(kaijuOwner)
      .safeTransferFrom(kaijuOwner.address, user.address, userKaijuId, "0x");

    // mint rwaste
    const now = await getCurrentTimestamp();
    await fastForwardTo(now.add(12960000).toNumber());
    await rwaste.connect(user).claimReward();
    const balance = await rwaste.balanceOf(user.address);
    expect(balance).to.be.gte(breedCost);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  beforeEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("breed()", async () => {
    it("should revert if user didn't own _kaijuId", async () => {
      // TODO
    });
    it("should revert if user haven't approved _kaijuId", async () => {
      // TODO
    });
    it("should revert if user don't have enough rwaste", async () => {
      // TODO
    });
    it("should revert if user haven't allowed enough rwaste", async () => {
      // TODO
    });
    it("should revert if no breeder available", async () => {
      await kaijuBreeder.connect(owner).withdrawBreeder();
      await expect(
        kaijuBreeder.connect(user).breed(userKaijuId, {
          value: breedFee,
        })
      ).to.be.revertedWith("no breeder");
    });
    it("should breed and send the new kaiju", async () => {
      const babyId = await kaijuBreeder.getNextBabyId();

      await kaiju.connect(user).approve(kaijuBreeder.address, userKaijuId);
      await rwaste.connect(user).approve(kaijuBreeder.address, breedCost);

      const kaijuBalancePre = await kaiju.balanceOf(user.address);
      const rwasteBalancePre = await rwaste.balanceOf(user.address);
      const contractBalancePre = await ethers.provider.getBalance(
        kaijuBreeder.address
      );

      const tx = await kaijuBreeder.connect(user).breed(userKaijuId, {
        value: breedFee,
      });
      expect(tx).to.emit(kaijuBreeder, "Breed").withArgs(babyId);

      const kaijuBalancePost = await kaiju.balanceOf(user.address);
      const rwasteBalancePost = await rwaste.balanceOf(user.address);
      const contractBalancePost = await ethers.provider.getBalance(
        kaijuBreeder.address
      );

      expect(kaijuBalancePost).to.be.eq(kaijuBalancePre.add(1));
      expect(rwasteBalancePost).to.be.eq(rwasteBalancePre.sub(breedCost));
      expect(contractBalancePost.sub(contractBalancePre)).to.be.eq(breedFee);
      expect(await kaiju.balanceOf(kaijuBreeder.address)).to.be.eq(1);
    });
  });
});
