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
      await expect(
        kaijuBreeder.connect(user).breed(0, {
          value: breedFee,
        })
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });
    it("should revert if user haven't approved _kaijuId", async () => {
      await expect(
        kaijuBreeder.connect(user).breed(userKaijuId, {
          value: breedFee,
        })
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });
    it("should revert if user don't have enough rwaste", async () => {
      await kaiju.connect(user).approve(kaijuBreeder.address, userKaijuId);
      await rwaste.connect(user).approve(kaijuBreeder.address, breedCost);
      await rwaste.connect(user).transfer(owner.address, breedCost);
      await expect(
        kaijuBreeder.connect(user).breed(userKaijuId, {
          value: breedFee,
        })
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("should revert if user haven't allowed enough rwaste", async () => {
      await kaiju.connect(user).approve(kaijuBreeder.address, userKaijuId);
      await expect(
        kaijuBreeder.connect(user).breed(userKaijuId, {
          value: breedFee,
        })
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("should revert if no breeder available", async () => {
      await kaijuBreeder.connect(owner).withdrawBreeder();
      await expect(
        kaijuBreeder.connect(user).breed(userKaijuId, {
          value: breedFee,
        })
      ).to.be.revertedWith("no breeder");
    });
    it("should revert if msg.value != fee", async () => {
      await expect(
        kaijuBreeder.connect(user).breed(userKaijuId, {
          value: breedFee.sub(1),
        })
      ).to.be.revertedWith("not enough ETH");
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

  describe("breedFree()", async () => {
    beforeEach(async () => {
      await kaijuBreeder.connect(owner).updateWhitelist([user.address], [true]);
    });

    it("should revert if user didn't own _kaijuId", async () => {
      await expect(kaijuBreeder.connect(user).breedFree(0)).to.be.revertedWith(
        "ERC721: transfer caller is not owner nor approved"
      );
    });
    it("should revert if user haven't approved _kaijuId", async () => {
      await expect(
        kaijuBreeder.connect(user).breedFree(userKaijuId)
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });
    it("should revert if user don't have enough rwaste", async () => {
      await kaiju.connect(user).approve(kaijuBreeder.address, userKaijuId);
      await rwaste.connect(user).approve(kaijuBreeder.address, breedCost);
      await rwaste.connect(user).transfer(owner.address, breedCost);
      await expect(
        kaijuBreeder.connect(user).breedFree(userKaijuId)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("should revert if user haven't allowed enough rwaste", async () => {
      await kaiju.connect(user).approve(kaijuBreeder.address, userKaijuId);
      await expect(
        kaijuBreeder.connect(user).breedFree(userKaijuId)
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("should revert if no breeder available", async () => {
      await kaijuBreeder.connect(owner).withdrawBreeder();
      await expect(
        kaijuBreeder.connect(user).breedFree(userKaijuId)
      ).to.be.revertedWith("no breeder");
    });
    it("should revert if user not in whitelist", async () => {
      await kaijuBreeder
        .connect(owner)
        .updateWhitelist([user.address], [false]);
      await expect(
        kaijuBreeder.connect(user).breedFree(userKaijuId)
      ).to.be.revertedWith("not in whitelist");
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

      const tx = await kaijuBreeder.connect(user).breedFree(userKaijuId);
      expect(tx).to.emit(kaijuBreeder, "Breed").withArgs(babyId);

      const kaijuBalancePost = await kaiju.balanceOf(user.address);
      const rwasteBalancePost = await rwaste.balanceOf(user.address);
      const contractBalancePost = await ethers.provider.getBalance(
        kaijuBreeder.address
      );

      expect(kaijuBalancePost).to.be.eq(kaijuBalancePre.add(1));
      expect(rwasteBalancePost).to.be.eq(rwasteBalancePre.sub(breedCost));
      expect(contractBalancePost.sub(contractBalancePre)).to.be.eq(0);
      expect(await kaiju.balanceOf(kaijuBreeder.address)).to.be.eq(1);
    });
  });

  describe("depositBreeder()", async () => {
    beforeEach(async () => {
      await kaijuBreeder.connect(owner).withdrawBreeder();
      expect(await kaijuBreeder.hasBreeder()).to.be.eq(false);

      await kaiju
        .connect(owner)
        .approve(ethers.constants.AddressZero, ownerKaijuId);
    });

    it("should revert if didn't own _kaijuId", async () => {
      await expect(
        kaijuBreeder.connect(owner).depositBreeder(userKaijuId)
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });
    it("should revert if didn't allow _kaijuId", async () => {
      await expect(
        kaijuBreeder.connect(owner).depositBreeder(ownerKaijuId)
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });
    it("should revert if breeder already deposited", async () => {
      await kaiju.connect(owner).approve(kaijuBreeder.address, ownerKaijuId);
      await kaijuBreeder.connect(owner).depositBreeder(ownerKaijuId);

      await kaiju
        .connect(user)
        .safeTransferFrom(user.address, owner.address, userKaijuId, "0x");

      await expect(
        kaijuBreeder.connect(owner).depositBreeder(userKaijuId)
      ).to.be.revertedWith("already has breeder");
    });
    it("should revert if sender is not owner", async () => {
      await expect(
        kaijuBreeder.connect(user).depositBreeder(userKaijuId)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should deposit breeder kaiju", async () => {
      expect(await kaiju.balanceOf(kaijuBreeder.address)).to.be.eq(0);
      expect(await kaijuBreeder.hasBreeder()).to.be.eq(false);

      await kaiju.connect(owner).approve(kaijuBreeder.address, ownerKaijuId);
      await kaijuBreeder.connect(owner).depositBreeder(ownerKaijuId);

      expect(await kaiju.balanceOf(kaijuBreeder.address)).to.be.eq(1);
      expect(await kaijuBreeder.hasBreeder()).to.be.eq(true);
    });
  });

  describe("withdrawBreeder()", async () => {
    it("should revert if no breeder", async () => {
      await kaijuBreeder.connect(owner).withdrawBreeder();
      await expect(
        kaijuBreeder.connect(owner).withdrawBreeder()
      ).to.be.revertedWith("no breeder");
    });
    it("should revert if sender is not owner", async () => {
      await expect(
        kaijuBreeder.connect(user).withdrawBreeder()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should withdraw breeder kaiju", async () => {
      expect(await kaiju.balanceOf(owner.address)).to.be.eq(0);
      expect(await kaiju.balanceOf(kaijuBreeder.address)).to.be.eq(1);
      expect(await kaijuBreeder.hasBreeder()).to.be.eq(true);

      await kaijuBreeder.connect(owner).withdrawBreeder();

      expect(await kaiju.balanceOf(owner.address)).to.be.eq(1);
      expect(await kaiju.balanceOf(kaijuBreeder.address)).to.be.eq(0);
      expect(await kaijuBreeder.hasBreeder()).to.be.eq(false);
    });
  });

  describe("withdrawRWaste()", async () => {
    beforeEach(async () => {
      // TODO
    });

    it("should withdraw RWaste from contract", async () => {
      // TODO
    });
  });

  describe("withdrawETH()", async () => {
    beforeEach(async () => {
      // TODO
    });

    it("should withdraw ETH from contract", async () => {
      // TODO
    });
  });

  describe("syncRWaste()", async () => {
    beforeEach(async () => {
      // TODO
    });

    it("should update rwaste address", async () => {
      // TODO
    });
  });

  describe("updateFee()", async () => {
    it("should update fee", async () => {
      // TODO
    });
  });

  describe("updateWhitelist()", async () => {
    it("should update whitelist", async () => {
      // TODO
    });
  });

  describe("getRWaste()", async () => {
    it("should return rwaste address", async () => {
      // TODO
    });
  });

  describe("getNextBabyId()", async () => {
    it("should return next babyId", async () => {
      // TODO
    });
  });
});
