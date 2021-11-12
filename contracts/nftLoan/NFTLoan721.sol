pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./IFlashNFT721Receiver.sol";

contract NFTLoan721 is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // DepositFor
    // WithdrawFor

    // -------------------
    // --     EVENT     --
    // -------------------
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

    event FlashLoanEnable(
        address indexed nftAddress,
        uint256 nftId,
        uint256 flashLoanFee
    );

    event FlashLoan(
        address indexed nftAddress,
        uint256 nftId,
        address indexed operator
    );

    event ApplyIOU(
        address indexed nftAddress,
        uint256 nftId,
        address borrowToken,
        uint256 borrowAmount,
        uint256 borrowFee,
        uint256 borrowDuration
    );

    event AcceptIOU(
        address indexed nftAddress,
        uint256 nftId,
        address accepter,
        uint256 borrowDeadline
    );
    event CancelIOU(address indexed nftAddress, uint256 nftId);
    event RedeemNFT(address indexed nftAddress, uint256 nftId, address owner);
    event ClaimNFT(address indexed nftAddress, uint256 nftId, address accepter);

    // -----------------------
    // --     Structure     --
    // -----------------------
    struct IOU {
        address accepter;
        address borrowToken;
        uint256 borrowAmount;
        uint256 borrowFee;
        uint256 borrowDuration;
        uint256 borrowDeadline;
        uint256 status;
    }

    struct NFT {
        address owner;
        uint256 flashLoanFee;
        address flashLoanFeeReceiver;
        IOU iou;
    }

    enum IOUStatus {
        NoHack,
        ApplyHack,
        InHack
    }

    // ----------------------------
    // --     State Variable     --
    // ----------------------------

    mapping(address => mapping(uint256 => NFT)) public nfts; // nft mappingf
    mapping(address => bool) public borrowTokenWhiteList; // nft mapping
    uint256 public adminFlashLoanFeeRate = 3000000000000000; // 0.003
    uint256 public adminTradeFeeRate = 3000000000000000; // 0.003
    uint256 public adminRedeemFeeRate = 3000000000000000; // 0.003
    uint256 constant flashLoanNFTsLimit = 20;
    uint256 constant feeBase = 1 ether;
    bool public freezed;

    // ------------------------
    // --      Modifier      --
    // ------------------------
    modifier checkFreezed() {
        require(!freezed, "Freezed");
        _;
    }

    modifier isNFTOwner(address nftAddress, uint256 nftId) {
        require(
            nfts[nftAddress][nftId].owner == msg.sender,
            "invalid NFT owner"
        );
        _;
    }

    modifier iouExisted(address nftAddress, uint256 nftId) {
        require(
            nfts[nftAddress][nftId].iou.status == uint256(IOUStatus.NoHack),
            "iouExisted"
        );
        _;
    }

    modifier checkBorrowToken(address token) {
        require(borrowTokenWhiteList[token], "invalid borrow token");
        _;
    }

    // ---------------------------
    // --   External Function   --
    // ---------------------------

    // Owner only function
    constructor() public {}

    function setFreezing() external onlyOwner {
        freezed = true;
    }

    function unFreezing() external onlyOwner {
        freezed = false;
    }

    function addTokenToWhiteList(address token) external onlyOwner {
        borrowTokenWhiteList[token] = true;
    }

    function removeTokenFromWhiteList(address token) external onlyOwner {
        borrowTokenWhiteList[token] = false;
    }

    function changeAdminTradeFee(uint256 newFee) external onlyOwner {
        adminTradeFeeRate = newFee;
    }

    function changeAdminFlashLoanFee(uint256 newFee) external onlyOwner {
        adminFlashLoanFeeRate = newFee;
    }

    function changeAdminRedeemFee(uint256 newFee) external onlyOwner {
        adminRedeemFeeRate = newFee;
    }

    // User function
    function setFlashLoanFee(
        address nftAddress,
        uint256 nftId,
        uint256 newFee
    ) external isNFTOwner(nftAddress, nftId) nonReentrant checkFreezed {
        nfts[nftAddress][nftId].flashLoanFee = newFee;
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
        uint256 flashLoanFee
    ) external {
        _depositNFT(nftAddress, nftId);
        if (flashLoanFee > 0) {
            _flashLoanEnable(nftAddress, nftId, flashLoanFee);
        }
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
            _depositNFT(nftAddress, nftIds[i]);
            if (fees[i] > 0) {
                _flashLoanEnable(nftAddress, nftIds[i], fees[i]);
            }
        }
    }

    function flashLoan(
        address nftAddress,
        uint256[] calldata nftIds,
        address operator,
        bytes calldata params
    ) external payable nonReentrant checkFreezed {
        require(nftIds.length <= flashLoanNFTsLimit, "To many NFTs");

        for (uint256 i = 0; i < nftIds.length; i++) {
            _checkFlashLoanEnable(nftAddress, nftIds[i]);
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
            uint256 flashLoanFee = nfts[nftAddress][nftIds[i]].flashLoanFee;
            uint256 adminFee = _calcAdminFee(
                adminFlashLoanFeeRate,
                flashLoanFee
            );
            admin.transfer(adminFee);

            // charge nft owner Fee
            address payable payableOwner = address(
                uint160(nfts[nftAddress][nftIds[i]].flashLoanFeeReceiver)
            );
            uint256 ownerFee = flashLoanFee.sub(adminFee);
            payableOwner.transfer(ownerFee);
            emit FlashLoan(nftAddress, nftIds[i], operator);
        }

        // refund remaining eth to sender
        uint256 amount = address(this).balance;
        if (amount > 0) msg.sender.transfer(amount);
    }

    // applyIOU
    function applyIOU(
        address nftAddress,
        uint256 nftId,
        address borrowToken,
        uint256 borrowAmount,
        uint256 borrowFee,
        uint256 borrowDuration
    )
        external
        checkBorrowToken(borrowToken)
        iouExisted(nftAddress, nftId)
        isNFTOwner(nftAddress, nftId)
        nonReentrant
        checkFreezed
    {
        IOU memory iou = IOU(
            address(0),
            borrowToken,
            borrowAmount,
            borrowFee,
            borrowDuration,
            0,
            uint256(IOUStatus.ApplyHack)
        );
        nfts[nftAddress][nftId].iou = iou;

        emit ApplyIOU(
            nftAddress,
            nftId,
            borrowToken,
            borrowAmount,
            borrowFee,
            borrowDuration
        );
    }

    // cancelIOU
    function cancelIOU(address nftAddress, uint256 nftId)
        external
        isNFTOwner(nftAddress, nftId)
        nonReentrant
    {
        require(
            nfts[nftAddress][nftId].iou.status == uint256(IOUStatus.ApplyHack),
            "invalid iou status"
        );
        IOU memory iou;
        nfts[nftAddress][nftId].iou = iou;

        emit CancelIOU(nftAddress, nftId);
    }

    // acceptIOU
    function acceptIOU(address nftAddress, uint256 nftId)
        external
        nonReentrant
        checkFreezed
    {
        require(
            nfts[nftAddress][nftId].iou.status == uint256(IOUStatus.ApplyHack),
            "invalid iou status"
        );

        require(
            nfts[nftAddress][nftId].owner != msg.sender,
            "accepter and owner are the same"
        );

        // Update iou info
        NFT storage nft = nfts[nftAddress][nftId];
        nft.iou.accepter = msg.sender;
        nft.iou.status = uint256(IOUStatus.InHack);
        nft.iou.borrowDeadline = nft.iou.borrowDuration.add(now);
        nft.flashLoanFeeReceiver = msg.sender;

        // Transfer Token
        IERC20(nft.iou.borrowToken).safeTransferFrom(
            msg.sender,
            nft.owner,
            nft.iou.borrowAmount
        );

        // transfer fee to admin
        uint256 adminFee = _calcAdminFee(
            adminTradeFeeRate,
            nft.iou.borrowAmount
        );
        IERC20(nft.iou.borrowToken).safeTransferFrom(
            msg.sender,
            owner(),
            adminFee
        );
        emit AcceptIOU(nftAddress, nftId, msg.sender, nft.iou.borrowDeadline);
    }

    // redeemNFT
    function redeemNFT(address nftAddress, uint256 nftId)
        external
        isNFTOwner(nftAddress, nftId)
        nonReentrant
    {
        NFT storage nft = nfts[nftAddress][nftId];
        require(
            nft.iou.status == uint256(IOUStatus.InHack),
            "invalid iou status"
        );
        require(now < nft.iou.borrowDeadline, "over deadline");

        // Transfer Token
        IERC20(nft.iou.borrowToken).safeTransferFrom(
            msg.sender,
            nft.iou.accepter,
            nft.iou.borrowAmount.add(nft.iou.borrowFee)
        );

        // trasnfer fee to admin
        uint256 adminFee = _calcAdminFee(
            adminTradeFeeRate,
            nft.iou.borrowAmount
        );
        IERC20(nft.iou.borrowToken).safeTransferFrom(
            msg.sender,
            owner(),
            adminFee
        );

        // update iou
        IOU memory iou;
        nft.iou = iou;
        nft.flashLoanFeeReceiver = nft.owner;

        emit RedeemNFT(nftAddress, nftId, nft.owner);
    }

    // claimNFT
    function claimNFT(address nftAddress, uint256 nftId) external nonReentrant {
        NFT storage nft = nfts[nftAddress][nftId];
        require(
            nft.iou.status == uint256(IOUStatus.InHack),
            "invalid iou status"
        );
        require(nft.iou.accepter == msg.sender, "invalid sender");
        require(now >= nft.iou.borrowDeadline, "not over deadline");

        // update iou
        IOU memory iou;
        nft.iou = iou;
        nft.owner = msg.sender;
        nft.flashLoanFeeReceiver = msg.sender;
        emit ClaimNFT(nftAddress, nftId, msg.sender);
    }

    // ---------------------------
    // --   Internal Function   --
    // ---------------------------

    function _withdrawNFT(address _nftAddress, uint256 _nftId)
        internal
        iouExisted(_nftAddress, _nftId)
        isNFTOwner(_nftAddress, _nftId)
        nonReentrant
    {
        IOU memory iou;
        nfts[_nftAddress][_nftId].owner = address(0);
        nfts[_nftAddress][_nftId].flashLoanFee = 0;
        nfts[_nftAddress][_nftId].flashLoanFeeReceiver = address(0);
        nfts[_nftAddress][_nftId].iou = iou;

        IERC721(_nftAddress).safeTransferFrom(
            address(this),
            msg.sender,
            _nftId
        );
        emit Withdraw(_nftAddress, _nftId, msg.sender);
    }

    function _depositNFT(address _nftAddress, uint256 _nftId)
        internal
        checkFreezed
        nonReentrant
    {
        require(
            nfts[_nftAddress][_nftId].owner == address(0),
            "NFT has been deposited."
        );
        NFT memory nft;
        nft.owner = msg.sender;
        nft.flashLoanFeeReceiver = msg.sender;
        nfts[_nftAddress][_nftId] = nft;
        IERC721(_nftAddress).transferFrom(msg.sender, address(this), _nftId);
        emit Deposit(_nftAddress, _nftId, msg.sender);
    }

    function _flashLoanEnable(
        address _nftAddress,
        uint256 _nftId,
        uint256 _flashLoanFee
    ) internal isNFTOwner(_nftAddress, _nftId) checkFreezed {
        require(_flashLoanFee > 0, "fee is zero");
        nfts[_nftAddress][_nftId].flashLoanFee = _flashLoanFee;
        emit FlashLoanEnable(_nftAddress, _nftId, _flashLoanFee);
    }

    function _calcAdminFee(uint256 _adminFeeRate, uint256 _amount)
        internal
        pure
        returns (uint256)
    {
        return _amount.mul(_adminFeeRate).div(feeBase);
    }

    function _checkFlashLoanEnable(address _nftAddress, uint256 _nftId)
        internal
        view
    {
        require(
            nfts[_nftAddress][_nftId].flashLoanFee > 0,
            "flashLoan disable"
        );
    }
}
