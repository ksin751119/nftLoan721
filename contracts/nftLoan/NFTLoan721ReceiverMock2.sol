pragma solidity ^0.6.0;

// ERC721

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./IFlashNFT721Receiver.sol";
import "./NFTLoan721.sol";

contract NFTLoan721ReceiverMock2 is IFlashNFT721Receiver {
    event FlashLoanNFT(
        address nftAddress,
        uint256 nftId,
        address indexed owner
    );

    function executeOperation(
        address nftAddress,
        uint256[] calldata nftIds,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        (address target, bytes memory executeData) = abi.decode(
            params,
            (address, bytes)
        );

        (bool success, ) = target.call(executeData);
        return success;
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function depositNFT(
        address nftLoan,
        address nftAddress,
        uint256 nftId,
        uint256 flashLoanFee
    ) external {
        IERC721(nftAddress).transferFrom(msg.sender, address(this), nftId);
        IERC721(nftAddress).approve(nftLoan, nftId);
        NFTLoan721(nftLoan).depositNFT(nftAddress, nftId, flashLoanFee);
    }

    function approveNFT(
        address nftLoan,
        address nftAddress,
        uint256 nftId
    ) external {
        IERC721(nftAddress).approve(nftLoan, nftId);
    }
}
