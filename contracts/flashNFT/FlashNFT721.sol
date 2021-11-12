pragma solidity ^0.6.0;

// ERC721

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./IFlashNFT721Receiver.sol";

contract FlashNFT721 is Ownable {
    using SafeMath for uint256;

    event Withdraw(
        address indexed nftAddress,
        uint256 nftId,
        address indexed owner
    );
    event Deposit(
        address indexed nftAddress,
        uint256 nftId,
        address indexed owner
    );

    event FlashLoan(
        address indexed nftAddress,
        uint256 nftId,
        address indexed operator
    );
    struct NFTOwner {
        address owner;
        uint256 borrowFee;
    }

    mapping(address => mapping(uint256 => NFTOwner)) public nfts;
    uint256 adminFeeRate = 3000000000000000; // 0.003
    uint256 borrowNFTsLimit = 20;
    uint256 feeBase = 1 ether;
    bool public freezed;

    // PauseContract v
    // withdrawNFT v
    // withdrawNFTs v
    // depositNFT v
    // depositNFTs v
    // flashLoan v
    // ChangeFee v
    // CalcFee v

    // Test:
    // PauseContract
    // withdrawNFT
    // withdrawNFTs
    // depositNFT
    // depositNFTs
    // flashLoan
    // ChangeFee

    // Modifier

    modifier checkFreezed() {
        require(!freezed, "Freezed");
        _;
    }

    modifier nftNotDeposit(address nftAddress, uint256 nftId) {
        require(
            nfts[nftAddress][nftId].owner == address(0),
            "NFT has been deposited."
        );
        _;
    }

    modifier isNFTOwner(address nftAddress, uint256 nftId) {
        require(
            nfts[nftAddress][nftId].owner == msg.sender,
            "Invalid NFT owner."
        );
        _;
    }

    constructor() public {}

    // ---------------------------
    // --   External Function   --
    // ---------------------------

    function setFreezing() external onlyOwner {
        freezed = true;
    }

    function unFreezing() external onlyOwner {
        freezed = false;
    }

    function changeAdminFee(uint256 newFee) external onlyOwner {
        adminFeeRate = newFee;
    }

    function changeBorrowFee(
        address nftAddress,
        uint256 nftId,
        uint256 newFee
    ) external isNFTOwner(nftAddress, nftId) checkFreezed {
        require(newFee > 0, "fee is zero");
        nfts[nftAddress][nftId].borrowFee = newFee;
    }

    function withdrawNFT(address nftAddress, uint256 nftId) external {
        _withdrawNFT(nftAddress, nftId);
    }

    function withdrawNFTs(address nftAddress, uint256[] calldata nftIds)
        external
    {
        for (uint256 i = 0; i < nftIds.length; i++) {
            _withdrawNFT(nftAddress, nftIds[i]);
        }
    }

    function depositNFT(
        address nftAddress,
        uint256 nftId,
        uint256 fee
    ) external {
        _depositNFT(nftAddress, nftId, fee);
    }

    function depositNFTs(
        address nftAddress,
        uint256[] calldata nftIds,
        uint256[] calldata fees
    ) external {
        require(
            nftIds.length == fees.length,
            "id length and fee length are the same"
        );
        for (uint256 i = 0; i < nftIds.length; i++) {
            _depositNFT(nftAddress, nftIds[i], fees[i]);
        }
    }

    function flashLoan(
        address nftAddress,
        uint256[] calldata nftIds,
        address operator,
        bytes calldata params
    ) external payable checkFreezed {
        require(nftIds.length <= borrowNFTsLimit, "To many NFTs");

        for (uint256 i = 0; i < nftIds.length; i++) {
            IERC721(nftAddress).safeTransferFrom(
                address(this),
                operator,
                nftIds[i]
            );
        }

        require(
            IFlashNFT721Receiver(operator).executeOperation(
                nftAddress,
                nftIds,
                msg.sender,
                params
            ),
            "Execution Failed"
        );

        address payable admin = address(uint160(owner()));
        for (uint256 i = 0; i < nftIds.length; i++) {
            IERC721(nftAddress).transferFrom(
                operator,
                address(this),
                nftIds[i]
            );

            // charge admin Fee
            uint256 borrowFee = nfts[nftAddress][nftIds[i]].borrowFee;
            uint256 adminFee = _calcAdminFee(borrowFee);
            admin.transfer(adminFee);

            // charge nft owner Fee
            address payable payableOwner = address(
                uint160(nfts[nftAddress][nftIds[i]].owner)
            );
            uint256 ownerFee = borrowFee.sub(adminFee);
            payableOwner.transfer(ownerFee);

            emit FlashLoan(nftAddress, nftIds[i], operator);
        }

        // refund remaining eth to sender
        uint256 amount = address(this).balance;
        if (amount > 0) msg.sender.transfer(amount);
    }

    // ---------------------------
    // --   Internal Function   --
    // ---------------------------

    function _withdrawNFT(address _nftAddress, uint256 _nftId)
        internal
        isNFTOwner(_nftAddress, _nftId)
    {
        nfts[_nftAddress][_nftId].owner = address(0);
        nfts[_nftAddress][_nftId].borrowFee = 0;
        IERC721(_nftAddress).safeTransferFrom(
            address(this),
            msg.sender,
            _nftId
        );
        emit Withdraw(_nftAddress, _nftId, msg.sender);
    }

    function _depositNFT(
        address _nftAddress,
        uint256 _nftId,
        uint256 _fee
    ) internal nftNotDeposit(_nftAddress, _nftId) checkFreezed {
        require(_fee > 0, "fee is zero");
        NFTOwner memory nftOwner = NFTOwner(msg.sender, _fee);
        nfts[_nftAddress][_nftId] = nftOwner;
        IERC721(_nftAddress).transferFrom(msg.sender, address(this), _nftId);
        emit Deposit(_nftAddress, _nftId, msg.sender);
    }

    function _calcAdminFee(uint256 _borrowFee) internal view returns (uint256) {
        return _borrowFee.mul(adminFeeRate).div(feeBase);
    }
}
