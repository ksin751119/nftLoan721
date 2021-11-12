const {
  BN,
  ether,
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
const { evmRevert, evmSnapshot, toUSDCWei } = require('./utils/utils');

// const { USDT_TOKEN, USDT_PROVIDER } = require('./utils/constants');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');

const Nft721 = artifacts.require('Nft721');

contract('NFT721 Token', function ([_, user, someone]) {
  before(async function () {
    this.nft721 = await Nft721.new();
  });

  beforeEach(async function () {
    id = await evmSnapshot();
    balanceUser = await tracker(user);
    balanceSomeone = await tracker(someone);
  });

  afterEach(async function () {
    await evmRevert(id);
  });

  describe('nft', function () {
    it('mint', async function () {
      tokenURI =
        'https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.facebook.com%2FDankMemeTherapy%2F&psig=AOvVaw3bnoFEeeidzDwYAKmSKOXc&ust=1636775694382000&source=images&cd=vfe&ved=0CAsQjRxqFwoTCJjCzOD2kfQCFQAAAAAdAAAAABAJ';
      const nftId1 = await this.nft721.mintNft.call(user, tokenURI);
      await this.nft721.mintNft(user, tokenURI);
      console.log(nftId1.toString());

      const nftId2 = await this.nft721.mintNft.call(user, tokenURI);
      await this.nft721.mintNft(user, tokenURI);
      console.log(nftId2.toString());
    });
  });
});
