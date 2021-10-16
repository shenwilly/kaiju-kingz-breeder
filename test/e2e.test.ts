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

describe("e2e", function () {
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
    await fastForwardTo(now.add(25920000).toNumber());
    await rwaste.connect(user).claimReward();
    const balance = await rwaste.balanceOf(user.address);
    expect(balance).to.be.gte(breedCost);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  beforeEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("Breed kaiju(s)", async () => {
    it("should breed 1 kaiju", async () => {
      await kaiju.connect(user).approve(kaijuBreeder.address, userKaijuId);
      await rwaste.connect(user).approve(kaijuBreeder.address, breedCost);
      const kaijuBalancePre = await kaiju.balanceOf(user.address);
      await kaijuBreeder.connect(user).breed(userKaijuId, 1, {
        value: breedFee,
      });
      const kaijuBalancePost = await kaiju.balanceOf(user.address);
      expect(kaijuBalancePost.sub(kaijuBalancePre)).to.be.eq(1);
    });
    it("should breed 2 kaiju", async () => {
      await kaiju.connect(user).approve(kaijuBreeder.address, userKaijuId);
      await rwaste
        .connect(user)
        .approve(kaijuBreeder.address, breedCost.mul(2));
      const kaijuBalancePre = await kaiju.balanceOf(user.address);
      await kaijuBreeder.connect(user).breed(userKaijuId, 2, {
        value: breedFee.mul(2),
      });
      const kaijuBalancePost = await kaiju.balanceOf(user.address);
      expect(kaijuBalancePost.sub(kaijuBalancePre)).to.be.eq(2);
    });
  });
});
