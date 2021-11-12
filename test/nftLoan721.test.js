const {
  BN,
  ether,
  constants,
  expectEvent,
  expectRevert,
  time,
  balance,
} = require('@openzeppelin/test-helpers');
const { latest, duration, increase } = time;
const { tracker } = balance;
const abi = require('ethereumjs-abi');
const util = require('ethereumjs-util');
const utils = web3.utils;
const { expect } = require('chai');
const { evmRevert, evmSnapshot, mulPercent } = require('./utils/utils');
const { DAI_TOKEN, DAI_PROVIDER, IOU_STATUS } = require('./utils/constants');
const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants');
const { ZERO_BYTES32, MAX_UINT256 } = constants;

const IToken = artifacts.require('IERC20');
const tokenProviderAddress = DAI_PROVIDER;
const Nft721 = artifacts.require('Nft721');
const NFTLoan721 = artifacts.require('NFTLoan721');
const NFTLoan721ReceiverMock = artifacts.require('NFTLoan721ReceiverMock');
const NFTLoan721ReceiverMock2 = artifacts.require('NFTLoan721ReceiverMock2');

contract('NFTLoan721', function ([_, user, someone]) {
  before(async function () {
    this.nft721 = await Nft721.new();
    this.nftLoan721 = await NFTLoan721.new();
    this.nftLoan721Receiver = await NFTLoan721ReceiverMock.new();
    this.nftLoan721Receiver2 = await NFTLoan721ReceiverMock2.new();
    this.token = await IToken.at(DAI_TOKEN);
    await this.nftLoan721.addTokenToWhiteList(this.token.address);

    for (i = 0; i < 10; i++) {
      await this.nft721.mintNft(user, 'customer NFT url');
    }

    await this.token.transfer(someone, ether('200'), {
      from: tokenProviderAddress,
    });

    await this.token.transfer(user, ether('200'), {
      from: tokenProviderAddress,
    });
  });

  beforeEach(async function () {
    id = await evmSnapshot();
    balanceDeployer = await tracker(_);
    balanceUser = await tracker(user);
    balanceSomeone = await tracker(someone);
    balanceNFTLoan721 = await tracker(this.nftLoan721.address);
  });

  afterEach(async function () {
    await evmRevert(id);
  });

  // PauseContract v
  describe('Freeze', function () {
    it('normal', async function () {
      await this.nftLoan721.setFreezing({
        from: _,
      });
      expect(await this.nftLoan721.freezed.call()).to.be.true;
    });

    it('should revert: depositNFT freezing', async function () {
      await this.nftLoan721.setFreezing({
        from: _,
      });
      expect(await this.nftLoan721.freezed.call()).to.be.true;

      // approve
      nftId = new BN(1);
      const nftFee = new BN(100);
      await this.nft721.approve(this.nftLoan721.address, nftId, {
        from: user,
      });

      // deposit nft
      await expectRevert(
        this.nftLoan721.depositNFT(this.nft721.address, nftId, nftFee, {
          from: user,
        }),
        'Freezed'
      );
    });

    it('should revert: depositNFTs freezing', async function () {
      await this.nftLoan721.setFreezing({
        from: _,
      });
      expect(await this.nftLoan721.freezed.call()).to.be.true;

      nftId1 = new BN(1);
      const nftFee1 = new BN(100);
      nftId2 = new BN(2);
      const nftFee2 = new BN(500);
      // approve
      await this.nft721.approve(this.nftLoan721.address, nftId1, {
        from: user,
      });

      await this.nft721.approve(this.nftLoan721.address, nftId2, {
        from: user,
      });

      await expectRevert(
        this.nftLoan721.depositNFTs(
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
      nftId1 = new BN(1);
      const nftFee1 = new BN(100);
      nftId2 = new BN(2);
      const nftFee2 = new BN(500);
      // approve
      await this.nft721.approve(this.nftLoan721.address, nftId1, {
        from: user,
      });

      await this.nft721.approve(this.nftLoan721.address, nftId2, {
        from: user,
      });

      await this.nftLoan721.depositNFTs(
        this.nft721.address,
        [nftId1, nftId2],
        [nftFee1, nftFee2],
        {
          from: user,
        }
      );

      await this.nftLoan721.setFreezing({
        from: _,
      });
      expect(await this.nftLoan721.freezed.call()).to.be.true;

      await expectRevert(
        this.nftLoan721.flashLoan(
          this.nft721.address,
          [nftId1],
          this.nftLoan721Receiver.address,
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
      await this.nftLoan721.setFreezing({
        from: _,
      });
      expect(await this.nftLoan721.freezed.call()).to.be.true;

      // approve
      nftId = new BN(1);
      const nftFee = new BN(100);
      await this.nft721.approve(this.nftLoan721.address, nftId, {
        from: user,
      });

      // deposit nft
      await expectRevert(
        this.nftLoan721.depositNFT(this.nft721.address, nftId, nftFee, {
          from: user,
        }),
        'Freezed'
      );

      await this.nftLoan721.unFreezing({
        from: _,
      });
      expect(await this.nftLoan721.freezed.call()).to.be.false;

      await this.nftLoan721.depositNFT(this.nft721.address, nftId, nftFee, {
        from: user,
      });

      // verify
      const nft = await this.nftLoan721.nfts.call(this.nft721.address, nftId);
      expect(nft['owner']).to.be.eq(user);
      expect(nft['flashLoanFee']).to.be.bignumber.eq(nftFee);
    });
  });

  describe('Owner operation ', function () {
    it('add/remove token to whitelist', async function () {
      await this.nftLoan721.removeTokenFromWhiteList(this.token.address, {
        from: _,
      });
      expect(
        await this.nftLoan721.borrowTokenWhiteList.call(this.token.address)
      ).to.be.eq(false);

      await this.nftLoan721.addTokenToWhiteList(this.token.address, {
        from: _,
      });
      expect(
        await this.nftLoan721.borrowTokenWhiteList.call(this.token.address)
      ).to.be.eq(true);

      await expectRevert(
        this.nftLoan721.addTokenToWhiteList(this.token.address, {
          from: someone,
        }),
        'Ownable: caller is not the owner'
      );

      await expectRevert(
        this.nftLoan721.removeTokenFromWhiteList(this.token.address, {
          from: someone,
        }),
        'Ownable: caller is not the owner'
      );
    });

    it('changeAdminTradeFee', async function () {
      const newFee = ether('0.005');
      await this.nftLoan721.changeAdminTradeFee(newFee, {
        from: _,
      });
      expect(await this.nftLoan721.adminTradeFeeRate.call()).to.be.bignumber.eq(
        newFee
      );

      await expectRevert(
        this.nftLoan721.changeAdminTradeFee(newFee, {
          from: someone,
        }),
        'Ownable: caller is not the owner'
      );
    });

    it('changeAdminFlashLoanFee', async function () {
      const newFee = ether('0.005');
      await this.nftLoan721.changeAdminFlashLoanFee(newFee, {
        from: _,
      });
      expect(
        await this.nftLoan721.adminFlashLoanFeeRate.call()
      ).to.be.bignumber.eq(newFee);

      await expectRevert(
        this.nftLoan721.changeAdminFlashLoanFee(newFee, {
          from: someone,
        }),
        'Ownable: caller is not the owner'
      );
    });

    it('changeAdminRedeemFee', async function () {
      const newFee = ether('0.005');
      await this.nftLoan721.changeAdminRedeemFee(newFee, {
        from: _,
      });
      expect(
        await this.nftLoan721.adminRedeemFeeRate.call()
      ).to.be.bignumber.eq(newFee);

      await expectRevert(
        this.nftLoan721.changeAdminRedeemFee(newFee, {
          from: someone,
        }),
        'Ownable: caller is not the owner'
      );
    });
  });

  // depositNFT v
  // depositNFTs v
  describe('deposit', function () {
    it('deposit single nft with FlashLoanEnable', async function () {
      // approve
      await this.nft721.approve(this.nftLoan721.address, '1', {
        from: user,
      });

      // deposit nft
      nftId = new BN(1);
      const nftFee = new BN(100);

      const receipt = await this.nftLoan721.depositNFT(
        this.nft721.address,
        nftId,
        nftFee,
        {
          from: user,
        }
      );

      // verify
      const nft = await this.nftLoan721.nfts.call(this.nft721.address, nftId);
      expect(nft['owner']).to.be.eq(user);
      expect(nft['flashLoanFee']).to.be.bignumber.eq(nftFee);

      expectEvent(receipt, 'FlashLoanEnable', {
        nftAddress: this.nft721.address,
        nftId: nftId,
        flashLoanFee: nftFee,
      });
    });

    it('deposit single nft without FlashLoanEnable', async function () {
      // approve
      await this.nft721.approve(this.nftLoan721.address, '1', {
        from: user,
      });

      // deposit nft
      nftId = new BN(1);
      const nftFee = new BN(0);
      await this.nftLoan721.depositNFT(this.nft721.address, nftId, nftFee, {
        from: user,
      });

      // verify
      const nft = await this.nftLoan721.nfts.call(this.nft721.address, nftId);
      expect(nft['owner']).to.be.eq(user);
      expect(nft['flashLoanFee']).to.be.bignumber.eq(nftFee);
    });

    it('deposit multiple nfts', async function () {
      nftId1 = new BN(1);
      const nftFee1 = new BN(100);
      nftId2 = new BN(2);
      const nftFee2 = new BN(500);
      // approve
      await this.nft721.approve(this.nftLoan721.address, nftId1, {
        from: user,
      });

      await this.nft721.approve(this.nftLoan721.address, nftId2, {
        from: user,
      });

      // deposit nft
      await this.nftLoan721.depositNFTs(
        this.nft721.address,
        [nftId1, nftId2],
        [nftFee1, nftFee2],
        {
          from: user,
        }
      );

      // verify
      const nft1 = await this.nftLoan721.nfts.call(this.nft721.address, nftId1);
      expect(nft1['owner']).to.be.eq(user);
      expect(nft1['flashLoanFee']).to.be.bignumber.eq(nftFee1);

      const nft2 = await this.nftLoan721.nfts.call(this.nft721.address, nftId2);
      expect(nft2['owner']).to.be.eq(user);
      expect(nft2['flashLoanFee']).to.be.bignumber.eq(nftFee2);
    });

    it('should revert: deposit repeat nft', async function () {
      nftId = new BN(1);
      const nftFee = new BN(100);

      // approve
      await this.nft721.approve(this.nftLoan721.address, nftId, {
        from: user,
      });

      // deposit nft
      await this.nftLoan721.depositNFT(this.nft721.address, nftId, nftFee, {
        from: user,
      });

      // verify
      const nft1 = await this.nftLoan721.nfts.call(this.nft721.address, nftId);
      expect(nft1['owner']).to.be.eq(user);
      expect(nft1['flashLoanFee']).to.be.bignumber.eq(nftFee);

      await expectRevert(
        this.nftLoan721.depositNFT(this.nft721.address, nftId, nftFee, {
          from: user,
        }),
        'NFT has been deposited'
      );
    });

    it('should revert: no approved', async function () {
      nftId = new BN(1);
      const nftFee = new BN(100);

      await expectRevert(
        this.nftLoan721.depositNFT(this.nft721.address, nftId, nftFee, {
          from: user,
        }),
        'ERC721: transfer caller is not owner nor approved.'
      );
    });
  });

  // withdrawNFT v
  // withdrawNFTs v
  describe('withdraw', function () {
    beforeEach(async function () {
      nftId1 = new BN(1);
      const nftFee1 = new BN(100);
      nftId2 = new BN(2);
      const nftFee2 = new BN(200);
      // approve
      await this.nft721.approve(this.nftLoan721.address, nftId1, {
        from: user,
      });

      await this.nft721.approve(this.nftLoan721.address, nftId2, {
        from: user,
      });

      // deposit nft
      await this.nftLoan721.depositNFTs(
        this.nft721.address,
        [nftId1, nftId2],
        [nftFee1, nftFee2],
        {
          from: user,
        }
      );
    });

    it('withdraw single nft', async function () {
      nftId = new BN(1);
      await this.nftLoan721.withdrawNFT(this.nft721.address, nftId, {
        from: user,
      });

      // verify
      const nft = await this.nftLoan721.nfts.call(this.nft721.address, nftId);
      expect(nft['owner']).to.be.eq(ZERO_ADDRESS);
      expect(nft['flashLoanFee']).to.be.zero;
    });

    it('withdraw multiple nfts', async function () {
      nftId1 = new BN(1);
      nftId2 = new BN(2);

      await this.nftLoan721.withdrawNFTs(
        this.nft721.address,
        [nftId1, nftId2],
        {
          from: user,
        }
      );

      // verify
      const nft1 = await this.nftLoan721.nfts.call(this.nft721.address, nftId1);
      expect(nft1['owner']).to.be.eq(ZERO_ADDRESS);
      expect(nft1['flashLoanFee']).to.be.zero;

      const nft2 = await this.nftLoan721.nfts.call(this.nft721.address, nftId2);
      expect(nft2['owner']).to.be.eq(ZERO_ADDRESS);
      expect(nft2['flashLoanFee']).to.be.zero;
    });

    it('should revert: withdraw single nft by invalid owner', async function () {
      nftId = new BN(1);
      await expectRevert(
        this.nftLoan721.withdrawNFT(this.nft721.address, nftId, {
          from: someone,
        }),
        'invalid NFT owner.'
      );
    });

    it('should revert: withdraw multiple nfts by invalid owner', async function () {
      nftId = new BN(1);
      await expectRevert(
        this.nftLoan721.withdrawNFT(this.nft721.address, [nftId], {
          from: someone,
        }),
        'invalid NFT owner.'
      );
    });

    it('should revert: when nft in ApplyHack', async function () {
      nftId = new BN(1);
      await this.nftLoan721.applyIOU(
        this.nft721.address,
        nftId,
        this.token.address,
        ether('1'),
        new BN(100),
        duration.days(1),
        {
          from: user,
        }
      );

      await expectRevert(
        this.nftLoan721.withdrawNFT(this.nft721.address, [nftId], {
          from: user,
        }),
        'iouExisted'
      );
    });

    it('should revert: when nft in InHock', async function () {
      nftId = new BN(1);
      const borrowAmount = ether('1');
      await this.nftLoan721.applyIOU(
        this.nft721.address,
        nftId,
        this.token.address,
        borrowAmount,
        new BN(100),
        duration.days(1),
        {
          from: user,
        }
      );

      await this.token.approve(
        this.nftLoan721.address,
        borrowAmount.add(ether('1')),
        {
          from: someone,
        }
      );

      await this.nftLoan721.acceptIOU(this.nft721.address, nftId, {
        from: someone,
      });

      await expectRevert(
        this.nftLoan721.withdrawNFT(this.nft721.address, [nftId], {
          from: user,
        }),
        'iouExisted'
      );
    });
  });

  // flashLoan v
  describe('FlashLoan', function () {
    var nftId1;
    var nftId2;
    var nftId3;
    var nftFee1;
    var nftFee2;
    var nftFee3;
    beforeEach(async function () {
      nftId1 = new BN(1);
      nftFee1 = new BN(10000);
      nftId2 = new BN(2);
      nftFee2 = new BN(20000);
      nftId3 = new BN(3);
      nftFee3 = new BN(30000);

      // approve
      await this.nft721.approve(this.nftLoan721.address, nftId1, {
        from: user,
      });

      await this.nft721.approve(this.nftLoan721.address, nftId2, {
        from: user,
      });

      // deposit nft
      await this.nftLoan721.depositNFTs(
        this.nft721.address,
        [nftId1, nftId2],
        [nftFee1, nftFee2],
        {
          from: user,
        }
      );

      // deposit nft by relayer
      await this.nft721.approve(this.nftLoan721Receiver2.address, nftId3, {
        from: user,
      });
      await this.nftLoan721Receiver2.depositNFT(
        this.nftLoan721.address,
        this.nft721.address,
        nftId3,
        nftFee3,
        {
          from: user,
        }
      );

      await balanceUser.get();
    });

    it('flashLoan nfts', async function () {
      nftId1 = new BN(1);
      nftId2 = new BN(2);
      nftIds = [nftId1, nftId2];
      const totalFee = nftFee1.add(nftFee2);

      await balanceUser.get();
      const receipt = await this.nftLoan721.flashLoan(
        this.nft721.address,
        nftIds,
        this.nftLoan721Receiver.address,
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

      const adminFee = mulPercent(
        totalFee,
        await this.nftLoan721.adminFlashLoanFeeRate.call(),
        ether('1')
      );
      expect(await balanceDeployer.delta()).to.be.bignumber.eq(adminFee);
      expect(await balanceUser.delta()).to.be.bignumber.eq(
        totalFee.sub(adminFee)
      );
      expect(await balanceNFTLoan721.get()).to.be.zero;

      for (i = 0; i < nftIds.length; i++) {
        expect(await this.nft721.ownerOf.call(nftIds[i])).to.be.eq(
          this.nftLoan721.address
        );

        expectEvent(receipt, 'FlashLoan', {
          nftAddress: this.nft721.address,
          nftId: nftIds[i],
          operator: this.nftLoan721Receiver.address,
        });

        expectEvent.inTransaction(
          receipt.tx,
          this.nftLoan721Receiver,
          'FlashLoanNFT',
          {
            nftAddress: this.nft721.address,
            nftId: nftIds[i],
            owner: this.nftLoan721Receiver.address,
          }
        );
      }
    });

    // TODO: flashloan fee to accepter

    it('should revert: flashLoan disable', async function () {
      nftId1 = new BN(1);
      nftId2 = new BN(2);
      nftIds = [nftId1, nftId2];
      const totalFee = nftFee1.add(nftFee2);

      await this.nftLoan721.setFlashLoanFee(
        this.nft721.address,
        nftId1,
        new BN(0),
        {
          from: user,
        }
      );

      await expectRevert(
        this.nftLoan721.flashLoan(
          this.nft721.address,
          nftIds,
          this.nftLoan721Receiver.address,
          web3.utils.hexToBytes(ZERO_BYTES32),
          {
            from: someone,
            value: totalFee,
          }
        ),
        'flashLoan disable'
      );
    });

    it('set flashloan fee by relayer', async function () {
      nftIds = [nftId3];
      const totalFee = nftFee3;
      const executeData = abi.simpleEncode(
        'setFlashLoanFee(address,uint256,uint256)',
        this.nft721.address,
        nftId3,
        nftFee3.add(new BN(1))
      );

      // Check order exists
      const params = util.toBuffer(
        web3.eth.abi.encodeParameters(
          ['address', 'bytes'],
          [this.nftLoan721.address, executeData]
        )
      );

      await this.nftLoan721Receiver2.executeOperation(
        this.nft721.address,
        [],
        user,
        params
      );

      const nft = await this.nftLoan721.nfts.call(this.nft721.address, nftId3);
      expect(nft['flashLoanFee']).to.be.bignumber.eq(nftFee3.add(new BN(1)));
    });
  });

  describe('FlashLoan Reentrance', function () {
    var nftId1;
    var nftFee1;
    var nftId2;
    var nftFee2;
    var nftId3;
    var nftFee3;
    beforeEach(async function () {
      nftId1 = new BN(1);
      nftFee1 = new BN(10000);
      nftId2 = new BN(2);
      nftFee2 = new BN(20000);
      nftId3 = new BN(3);
      nftFee3 = new BN(40000);

      // approve
      await this.nft721.approve(this.nftLoan721.address, nftId1, {
        from: user,
      });

      // deposit nft
      await this.nftLoan721.depositNFTs(
        this.nft721.address,
        [nftId1],
        [nftFee1],
        {
          from: user,
        }
      );

      // deposit nft by relayer
      await this.nft721.approve(this.nftLoan721Receiver2.address, nftId2, {
        from: user,
      });
      await this.nftLoan721Receiver2.depositNFT(
        this.nftLoan721.address,
        this.nft721.address,
        nftId2,
        nftFee2,
        {
          from: user,
        }
      );

      await this.nft721.transferFrom(
        user,
        this.nftLoan721Receiver2.address,
        nftId3,
        {
          from: user,
        }
      );
      await this.nftLoan721Receiver2.approveNFT(
        this.nftLoan721.address,
        this.nft721.address,
        nftId3
      );

      await balanceUser.get();
    });

    // should revert: flashLoan nonReentrant
    it('should revert: flashLoan nonReentrant', async function () {
      nftIds = [nftId1];
      const totalFee = nftFee1;
      const executeData = abi.simpleEncode(
        'flashLoan(address,uint256[],address,bytes)',
        this.nft721.address,
        [],
        this.nftLoan721Receiver2.address,
        ZERO_BYTES32
      );

      // Check order exists
      const params = util.toBuffer(
        web3.eth.abi.encodeParameters(
          ['address', 'bytes'],
          [this.nftLoan721.address, executeData]
        )
      );

      await expectRevert(
        this.nftLoan721.flashLoan(
          this.nft721.address,
          nftIds,
          this.nftLoan721Receiver2.address,
          params,
          {
            from: someone,
            value: totalFee,
          }
        ),
        'Execution Failed'
      );
    });
    // should revert: deposit nonReentrant
    it('should revert: flashLoan deposit nonReetrant', async function () {
      const nftIds = [nftId1];
      const totalFee = nftFee3;

      const executeData = abi.simpleEncode(
        'depositNFT(address,uint256,uint256)',
        this.nft721.address,
        nftId2,
        new BN(1)
      );

      // Check order exists
      const params = util.toBuffer(
        web3.eth.abi.encodeParameters(
          ['address', 'bytes'],
          [this.nftLoan721.address, executeData]
        )
      );

      await expectRevert(
        this.nftLoan721.flashLoan(
          this.nft721.address,
          nftIds,
          this.nftLoan721Receiver2.address,
          params,
          {
            from: someone,
            value: totalFee,
          }
        ),
        'Execution Failed'
      );
    });

    it('should revert: flashLoan withdraw nonReetrant', async function () {
      const nftId = nftId2;
      const nftIds = [nftId1];
      const totalFee = nftFee1;
      const executeData = abi.simpleEncode(
        'withdrawNFT(address,uint256)',
        this.nft721.address,
        nftId
      );

      // Check order exists
      const params = util.toBuffer(
        web3.eth.abi.encodeParameters(
          ['address', 'bytes'],
          [this.nftLoan721.address, executeData]
        )
      );

      await expectRevert(
        this.nftLoan721.flashLoan(
          this.nft721.address,
          nftIds,
          this.nftLoan721Receiver2.address,
          params,
          {
            from: someone,
            value: totalFee,
          }
        ),
        'Execution Failed'
      );
    });

    it('should revert: flashLoan setFlashLoanFee', async function () {
      nftIds = [nftId1];
      const totalFee = nftFee1;
      const executeData = abi.simpleEncode(
        'setFlashLoanFee(address,uint256,uint256)',
        this.nft721.address,
        nftId2,
        nftFee3.add(new BN(1))
      );

      // Check order exists
      const params = util.toBuffer(
        web3.eth.abi.encodeParameters(
          ['address', 'bytes'],
          [this.nftLoan721.address, executeData]
        )
      );

      await expectRevert(
        this.nftLoan721.flashLoan(
          this.nft721.address,
          nftIds,
          this.nftLoan721Receiver2.address,
          params,
          {
            from: someone,
            value: totalFee,
          }
        ),
        'Execution Failed'
      );
    });
    // TODO: should revert: applyIOU nonReentrant
    // TODO: should revert: cancelIOU nonReentrant
    // TODO: should revert: acceptIOU nonReentrant
    // TODO: should revert: redeemNFT nonReentrant
    // TODO: should revert: claimNFT nonReentrant
  });

  describe('IOU', function () {
    var nftId1;
    var nftFee1;
    var nftId2;
    var nftFee2;
    var nftId3;
    var nftFee3;

    var nft1borrowAmount;
    var nft1borrowFee;
    var nft1borrowDuration;

    beforeEach(async function () {
      nftId1 = new BN(1);
      nftFee1 = new BN(10000);
      nftId2 = new BN(2);
      nftFee2 = new BN(20000);
      nftId3 = new BN(3);
      nftFee3 = new BN(30000);
      nft1borrowAmount = ether('10');
      nft1borrowFee = ether('1');
      nft1borrowDuration = duration.days(1);

      // approve
      await this.nft721.approve(this.nftLoan721.address, nftId1, {
        from: user,
      });

      // approve
      await this.nft721.approve(this.nftLoan721.address, nftId2, {
        from: user,
      });

      // deposit nft
      await this.nftLoan721.depositNFTs(
        this.nft721.address,
        [nftId1, nftId2],
        [nftFee1, nftFee2],
        {
          from: user,
        }
      );

      // deposit nft by relayer
      await this.nft721.approve(this.nftLoan721Receiver2.address, nftId3, {
        from: user,
      });
      await this.nftLoan721Receiver2.depositNFT(
        this.nftLoan721.address,
        this.nft721.address,
        nftId3,
        nftFee3,
        {
          from: user,
        }
      );

      const receipt = await this.nftLoan721.applyIOU(
        this.nft721.address,
        nftId2,
        this.token.address,
        nft1borrowAmount,
        nft1borrowFee,
        nft1borrowDuration,
        {
          from: user,
        }
      );

      await balanceUser.get();
    });

    // should revert: flashLoan nonReentrant
    it('apply IOU', async function () {
      // deposit nft
      const borrowAmount = ether('10');
      const borrowFee = ether('1');
      const borrowDuration = duration.days(1);
      const receipt = await this.nftLoan721.applyIOU(
        this.nft721.address,
        nftId1,
        this.token.address,
        borrowAmount,
        borrowFee,
        borrowDuration,
        {
          from: user,
        }
      );

      // verify
      const nft = await this.nftLoan721.nfts.call(this.nft721.address, nftId1);
      expect(nft['iou']['status']).to.be.bignumber.eq(
        new BN(IOU_STATUS.ApplyHack)
      );
      expect(nft['iou']['borrowToken']).to.be.eq(this.token.address);
      expect(nft['iou']['borrowAmount']).to.be.bignumber.eq(borrowAmount);
      expect(nft['iou']['borrowFee']).to.be.bignumber.eq(borrowFee);
      expect(nft['iou']['borrowDuration']).to.be.bignumber.eq(borrowDuration);
      expectEvent(receipt, 'ApplyIOU', {
        nftAddress: this.nft721.address,
        nftId: nftId1,
        borrowToken: this.token.address,
        borrowAmount: borrowAmount,
        borrowFee: borrowFee,
        borrowDuration: borrowDuration,
      });
    });

    it('should revert: not owner when apply IOU', async function () {
      // deposit nft
      const borrowAmount = ether('10');
      const borrowFee = ether('1');
      const borrowDuration = duration.days(1);

      await expectRevert(
        this.nftLoan721.applyIOU(
          this.nft721.address,
          nftId1,
          this.token.address,
          borrowAmount,
          borrowFee,
          borrowDuration,
          {
            from: someone,
          }
        ),
        'invalid NFT owner'
      );
    });

    it('should revert: duplicated apply IOU', async function () {
      // deposit nft
      const borrowAmount = ether('10');
      const borrowFee = ether('1');
      const borrowDuration = duration.days(1);
      const receipt = await this.nftLoan721.applyIOU(
        this.nft721.address,
        nftId1,
        this.token.address,
        borrowAmount,
        borrowFee,
        borrowDuration,
        {
          from: user,
        }
      );

      await expectRevert(
        this.nftLoan721.applyIOU(
          this.nft721.address,
          nftId1,
          this.token.address,
          borrowAmount,
          borrowFee,
          borrowDuration,
          {
            from: user,
          }
        ),
        'iouExisted'
      );
    });

    it('cancel IOU', async function () {
      const cancelReceipt = await this.nftLoan721.cancelIOU(
        this.nft721.address,
        nftId2,
        {
          from: user,
        }
      );

      const nft = await this.nftLoan721.nfts.call(this.nft721.address, nftId2);
      expect(nft['iou']['status']).to.be.bignumber.eq(
        new BN(IOU_STATUS.NoHack)
      );

      expectEvent(cancelReceipt, 'CancelIOU', {
        nftAddress: this.nft721.address,
        nftId: nftId2,
      });
    });

    it('should revert: invalid owner when cancel IOU', async function () {
      await expectRevert(
        this.nftLoan721.cancelIOU(this.nft721.address, nftId2, {
          from: someone,
        }),
        'invalid NFT owner'
      );
    });

    it('should revert: invalid iou status when cancel IOU', async function () {
      const cancelReceipt = await this.nftLoan721.cancelIOU(
        this.nft721.address,
        nftId2,
        {
          from: user,
        }
      );

      await expectRevert(
        this.nftLoan721.cancelIOU(this.nft721.address, nftId2, {
          from: user,
        }),
        'invalid iou status'
      );
    });

    it('accept IOU', async function () {
      const adminFee = mulPercent(
        nft1borrowAmount,
        await this.nftLoan721.adminTradeFeeRate.call(),
        ether('1')
      );

      await this.token.approve(
        this.nftLoan721.address,
        nft1borrowAmount.add(adminFee),
        {
          from: someone,
        }
      );

      const tokenSomeoneBefore = await this.token.balanceOf.call(someone);
      const tokenUserBefore = await this.token.balanceOf.call(user);
      const tokenAdminBefore = await this.token.balanceOf.call(_);

      const receipt = await this.nftLoan721.acceptIOU(
        this.nft721.address,
        nftId2,
        {
          from: someone,
        }
      );

      const tokenSomeoneEnd = await this.token.balanceOf.call(someone);
      const tokenUserEnd = await this.token.balanceOf.call(user);
      const tokenAdminEnd = await this.token.balanceOf.call(_);

      expect(tokenSomeoneBefore.sub(tokenSomeoneEnd)).to.be.bignumber.eq(
        nft1borrowAmount.add(adminFee)
      );
      expect(tokenUserEnd.sub(tokenUserBefore)).to.be.bignumber.eq(
        nft1borrowAmount
      );
      expect(tokenAdminEnd.sub(tokenAdminBefore)).to.be.bignumber.eq(adminFee);

      const nft = await this.nftLoan721.nfts.call(this.nft721.address, nftId2);
      const block = await web3.eth.getBlock(receipt.receipt.blockNumber);
      const deadline = utils
        .toBN(block.timestamp)
        .add(new BN(nft['iou']['borrowDuration']));
      expect(nft['iou']['status']).to.be.bignumber.eq(
        new BN(IOU_STATUS.InHack)
      );
      expect(nft['iou']['accepter']).to.be.eq(someone);
      expect(nft['iou']['borrowDeadline']).to.be.bignumber.eq(deadline);
      expect(nft['flashLoanFeeReceiver']).to.be.eq(someone);

      expectEvent(receipt, 'AcceptIOU', {
        nftAddress: this.nft721.address,
        nftId: nftId2,
        accepter: someone,
        borrowDeadline: deadline,
      });
    });

    it('should revert: IOU has been accepted', async function () {
      await this.token.approve(
        this.nftLoan721.address,
        nft1borrowAmount.add(ether('1')),
        {
          from: someone,
        }
      );
      const receipt = await this.nftLoan721.acceptIOU(
        this.nft721.address,
        nftId2,
        {
          from: someone,
        }
      );

      await expectRevert(
        this.nftLoan721.acceptIOU(this.nft721.address, nftId2, {
          from: someone,
        }),
        'invalid iou status'
      );
    });

    it('should revert: IOU can not be accepted by owner', async function () {
      await this.token.approve(
        this.nftLoan721.address,
        nft1borrowAmount.add(ether('1')),
        {
          from: user,
        }
      );

      await expectRevert(
        this.nftLoan721.acceptIOU(this.nft721.address, nftId2, {
          from: user,
        }),
        'accepter and owner are the same'
      );
    });

    // applyIOU;
    // cancelIOU;
    // acceptIOU;
    // redeemNFT;
    // it('redeem NFF', async function() {
    //   const adminFee = mulPercent(
    //     nft1borrowAmount,
    //     await this.nftLoan721.adminTradeFeeRate,
    //     ether('1')
    //   );

    //   await this.token.approve(
    //     this.nftLoan721.address,
    //     nft1borrowAmount.add(adminFee),
    //     {
    //       from: someone,
    //     }
    //   );
    //   await this.nftLoan721.acceptIOU(this.nft721.address, nftId2, {
    //     from: someone,
    //   });

    //   // pass time
    //   await increase(duration.hours('7'));

    //   const nftBefore = await this.nftLoan721.nfts.call(this.nft721.address, nftId2);
    //   await this.token.approve(
    //     this.nftLoan721.address,
    //     nft1borrowAmount.add(nft['iou']['borrowFee'])
    //   );

    //   const tokenSomeoneBefore = await this.token.balanceOf.call(someone);
    //   const tokenUserBefore = await this.token.balanceOf.call(user);
    //   const tokenAdminBefore = await this.token.balanceOf.call(_);

    //   const receipt = await this.nftLoan721.redeemNFT(
    //     this.nft721.address,
    //     nftId2,
    //     {
    //       from: user,
    //     }
    //   );

    //   const tokenSomeoneEnd = await this.token.balanceOf.call(someone);
    //   const tokenUserEnd = await this.token.balanceOf.call(user);
    //   const tokenAdminEnd = await this.token.balanceOf.call(_);

    //   expect(tokenSomeoneEnd.sub(tokenSomeoneBefore)).to.be.bignumber.eq(
    //     nft1borrowAmount.add(adminFee)
    //   );

    //   const nftAfter = await this.nftLoan721.nfts.call(this.nft721.address, nftId2);

    // });
    // claimNFT;
  });

  // TODO: can't withdraw when iou existed
});
