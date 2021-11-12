const {
  BN,
  ether,
  constants,
  expectEvent,
  expectRevert,
  time,
  balance,
} = require('@openzeppelin/test-helpers');
const { latest } = time;
const { tracker } = balance;
const abi = require('ethereumjs-abi');
const utils = web3.utils;
const { expect } = require('chai');
const { evmRevert, evmSnapshot, mulPercent } = require('./utils/utils');
const {
  ZERO_ADDRESS,
  ZERO_BYTES32,
} = require('@openzeppelin/test-helpers/src/constants');

const Nft721 = artifacts.require('Nft721');
const FlashNFT721 = artifacts.require('FlashNFT721');
const FlashNFT721ReceiverMock = artifacts.require('FlashNFT721ReceiverMock');

contract('FlashNFT721', function ([_, user, someone]) {
  before(async function () {
    this.nft721 = await Nft721.new();
    this.flashNFT721 = await FlashNFT721.new();
    this.flashNFT721Receiver = await FlashNFT721ReceiverMock.new();

    for (i = 0; i < 10; i++) {
      await this.nft721.mintNft(user, 'customer NFT url');
    }
  });

  beforeEach(async function () {
    id = await evmSnapshot();
    balanceDeployer = await tracker(_);
    balanceUser = await tracker(user);
    balanceSomeone = await tracker(someone);
    balanceFlashNFT721 = await tracker(this.flashNFT721.address);
  });

  afterEach(async function () {
    await evmRevert(id);
  });

  describe('Freeze', function () {
    it('normal', async function () {
      await this.flashNFT721.setFreezing({
        from: _,
      });
      expect(await this.flashNFT721.freezed.call()).to.be.true;
    });

    it('should revert: depositNFT freezing', async function () {
      await this.flashNFT721.setFreezing({
        from: _,
      });
      expect(await this.flashNFT721.freezed.call()).to.be.true;

      // approve
      const nftId = new BN(1);
      const nftFee = new BN(100);
      await this.nft721.approve(this.flashNFT721.address, nftId, {
        from: user,
      });

      // deposit nft
      await expectRevert(
        this.flashNFT721.depositNFT(this.nft721.address, nftId, nftFee, {
          from: user,
        }),
        'Freezed'
      );
    });

    it('should revert: depositNFTs freezing', async function () {
      await this.flashNFT721.setFreezing({
        from: _,
      });
      expect(await this.flashNFT721.freezed.call()).to.be.true;

      const nftId1 = new BN(1);
      const nftFee1 = new BN(100);
      const nftId2 = new BN(2);
      const nftFee2 = new BN(500);
      // approve
      await this.nft721.approve(this.flashNFT721.address, nftId1, {
        from: user,
      });

      await this.nft721.approve(this.flashNFT721.address, nftId2, {
        from: user,
      });

      await expectRevert(
        this.flashNFT721.depositNFTs(
          this.nft721.address,
          [nftId1, nftId2],
          [nftFee1, nftFee2],
          {
            from: user,
          }
        ),
        'Freezed'
      );
    });

    it('should revert: flashLoan freezing', async function () {
      const nftId1 = new BN(1);
      const nftFee1 = new BN(100);
      const nftId2 = new BN(2);
      const nftFee2 = new BN(500);
      // approve
      await this.nft721.approve(this.flashNFT721.address, nftId1, {
        from: user,
      });

      await this.nft721.approve(this.flashNFT721.address, nftId2, {
        from: user,
      });

      await this.flashNFT721.depositNFTs(
        this.nft721.address,
        [nftId1, nftId2],
        [nftFee1, nftFee2],
        {
          from: user,
        }
      );

      await this.flashNFT721.setFreezing({
        from: _,
      });
      expect(await this.flashNFT721.freezed.call()).to.be.true;

      await expectRevert(
        this.flashNFT721.flashLoan(
          this.nft721.address,
          [nftId1],
          this.flashNFT721Receiver.address,
          web3.utils.hexToBytes(ZERO_BYTES32),
          {
            from: someone,
            value: nftFee1,
          }
        ),
        'Freezed.'
      );
    });

    it('unFreeaing ', async function () {
      await this.flashNFT721.setFreezing({
        from: _,
      });
      expect(await this.flashNFT721.freezed.call()).to.be.true;

      // approve
      const nftId = new BN(1);
      const nftFee = new BN(100);
      await this.nft721.approve(this.flashNFT721.address, nftId, {
        from: user,
      });

      // deposit nft
      await expectRevert(
        this.flashNFT721.depositNFT(this.nft721.address, nftId, nftFee, {
          from: user,
        }),
        'Freezed'
      );

      await this.flashNFT721.unFreezing({
        from: _,
      });
      expect(await this.flashNFT721.freezed.call()).to.be.false;

      await this.flashNFT721.depositNFT(this.nft721.address, nftId, nftFee, {
        from: user,
      });

      // verify
      const nft = await this.flashNFT721.nfts.call(this.nft721.address, nftId);
      expect(nft['owner']).to.be.eq(user);
      expect(nft['borrowFee']).to.be.bignumber.eq(nftFee);
    });
  });

  describe('deposit', function () {
    it('deposit single nft', async function () {
      // approve
      await this.nft721.approve(this.flashNFT721.address, '1', {
        from: user,
      });

      // deposit nft
      const nftId = new BN(1);
      const nftFee = new BN(100);

      await this.flashNFT721.depositNFT(this.nft721.address, nftId, nftFee, {
        from: user,
      });

      // verify
      const nft = await this.flashNFT721.nfts.call(this.nft721.address, nftId);
      expect(nft['owner']).to.be.eq(user);
      expect(nft['borrowFee']).to.be.bignumber.eq(nftFee);
    });

    it('deposit multiple nfts', async function () {
      const nftId1 = new BN(1);
      const nftFee1 = new BN(100);
      const nftId2 = new BN(2);
      const nftFee2 = new BN(500);
      // approve
      await this.nft721.approve(this.flashNFT721.address, nftId1, {
        from: user,
      });

      await this.nft721.approve(this.flashNFT721.address, nftId2, {
        from: user,
      });

      // deposit nft
      await this.flashNFT721.depositNFTs(
        this.nft721.address,
        [nftId1, nftId2],
        [nftFee1, nftFee2],
        {
          from: user,
        }
      );

      // verify
      const nft1 = await this.flashNFT721.nfts.call(
        this.nft721.address,
        nftId1
      );
      expect(nft1['owner']).to.be.eq(user);
      expect(nft1['borrowFee']).to.be.bignumber.eq(nftFee1);

      const nft2 = await this.flashNFT721.nfts.call(
        this.nft721.address,
        nftId2
      );
      expect(nft2['owner']).to.be.eq(user);
      expect(nft2['borrowFee']).to.be.bignumber.eq(nftFee2);
    });

    it('should revert: deposit repeat nft', async function () {
      const nftId = new BN(1);
      const nftFee = new BN(100);

      // approve
      await this.nft721.approve(this.flashNFT721.address, nftId, {
        from: user,
      });

      // deposit nft
      await this.flashNFT721.depositNFT(this.nft721.address, nftId, nftFee, {
        from: user,
      });

      // verify
      const nft1 = await this.flashNFT721.nfts.call(this.nft721.address, nftId);
      expect(nft1['owner']).to.be.eq(user);
      expect(nft1['borrowFee']).to.be.bignumber.eq(nftFee);

      await expectRevert(
        this.flashNFT721.depositNFT(this.nft721.address, nftId, nftFee, {
          from: user,
        }),
        'NFT has been deposited'
      );
    });

    it('should revert: no approved', async function () {
      const nftId = new BN(1);
      const nftFee = new BN(100);

      await expectRevert(
        this.flashNFT721.depositNFT(this.nft721.address, nftId, nftFee, {
          from: user,
        }),
        'ERC721: transfer caller is not owner nor approved.'
      );
    });
  });

  describe('withdraw', function () {
    beforeEach(async function () {
      const nftId1 = new BN(1);
      const nftFee1 = new BN(100);
      const nftId2 = new BN(2);
      const nftFee2 = new BN(200);
      // approve
      await this.nft721.approve(this.flashNFT721.address, nftId1, {
        from: user,
      });

      await this.nft721.approve(this.flashNFT721.address, nftId2, {
        from: user,
      });

      // deposit nft
      await this.flashNFT721.depositNFTs(
        this.nft721.address,
        [nftId1, nftId2],
        [nftFee1, nftFee2],
        {
          from: user,
        }
      );
    });

    it('withdraw single nft', async function () {
      const nftId = new BN(1);
      await this.flashNFT721.withdrawNFT(this.nft721.address, nftId, {
        from: user,
      });

      // verify
      const nft = await this.flashNFT721.nfts.call(this.nft721.address, nftId);
      expect(nft['owner']).to.be.eq(ZERO_ADDRESS);
      expect(nft['borrowFee']).to.be.zero;
    });

    it('deposit multiple nfts', async function () {
      const nftId1 = new BN(1);
      const nftId2 = new BN(2);

      await this.flashNFT721.withdrawNFTs(
        this.nft721.address,
        [nftId1, nftId2],
        {
          from: user,
        }
      );

      // verify
      const nft1 = await this.flashNFT721.nfts.call(
        this.nft721.address,
        nftId1
      );
      expect(nft1['owner']).to.be.eq(ZERO_ADDRESS);
      expect(nft1['borrowFee']).to.be.zero;

      const nft2 = await this.flashNFT721.nfts.call(
        this.nft721.address,
        nftId2
      );
      expect(nft2['owner']).to.be.eq(ZERO_ADDRESS);
      expect(nft2['borrowFee']).to.be.zero;
    });

    it('should revert: withdraw single nft by invalid owner', async function () {
      const nftId = new BN(1);
      await expectRevert(
        this.flashNFT721.withdrawNFT(this.nft721.address, nftId, {
          from: someone,
        }),
        'Invalid NFT owner.'
      );
    });

    it('should revert: withdraw multiple nfts by invalid owner', async function () {
      const nftId = new BN(1);
      await expectRevert(
        this.flashNFT721.withdrawNFT(this.nft721.address, [nftId], {
          from: someone,
        }),
        'Invalid NFT owner.'
      );
    });
  });

  describe('Flashloan', function () {
    var nftFee1;
    var nftFee2;
    beforeEach(async function () {
      const nftId1 = new BN(1);
      nftFee1 = new BN(10000);
      const nftId2 = new BN(2);
      nftFee2 = new BN(20000);
      // approve
      await this.nft721.approve(this.flashNFT721.address, nftId1, {
        from: user,
      });

      await this.nft721.approve(this.flashNFT721.address, nftId2, {
        from: user,
      });

      // deposit nft
      await this.flashNFT721.depositNFTs(
        this.nft721.address,
        [nftId1, nftId2],
        [nftFee1, nftFee2],
        {
          from: user,
        }
      );
      await balanceUser.get();
    });

    it('flashLoan nfts', async function () {
      nftId1 = new BN(1);
      nftId2 = new BN(2);
      const nftIds = [nftId1, nftId2];
      const totalFee = nftFee1.add(nftFee2);

      const receipt = await this.flashNFT721.flashLoan(
        this.nft721.address,
        nftIds,
        this.flashNFT721Receiver.address,
        web3.utils.hexToBytes(ZERO_BYTES32),
        {
          from: someone,
          value: totalFee,
        }
      );

      // check nft owner
      expect(await balanceSomeone.delta()).to.be.bignumber.eq(
        ether('0').sub(totalFee).sub(new BN(receipt.receipt.gasUsed))
      );

      const adminFee = mulPercent(totalFee, 3, 1000);
      expect(await balanceDeployer.delta()).to.be.bignumber.eq(adminFee);
      expect(await balanceUser.delta()).to.be.bignumber.eq(
        totalFee.sub(adminFee)
      );
      expect(await balanceFlashNFT721.get()).to.be.zero;

      for (i = 0; i < nftIds.length; i++) {
        expect(await this.nft721.ownerOf.call(nftIds[i])).to.be.eq(
          this.flashNFT721.address
        );

        expectEvent(receipt, 'FlashLoan', {
          nftAddress: this.nft721.address,
          nftId: nftIds[i],
          operator: this.flashNFT721Receiver.address,
        });

        expectEvent.inTransaction(
          receipt.tx,
          this.flashNFT721Receiver,
          'FlashLoanNFT',
          {
            nftAddress: this.nft721.address,
            nftId: nftIds[i],
            owner: this.flashNFT721Receiver.address,
          }
        );
      }
    });
  });

  // use external nft 721
});
