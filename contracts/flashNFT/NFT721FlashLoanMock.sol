pragma solidity ^0.6.0;

// ERC721

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./IFlashNFT721Receiver.sol";

contract FlashNFT721ReceiverMock is IFlashNFT721Receiver {
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
        for (uint256 i = 0; i < nftIds.length; i++) {
            address owner = IERC721(nftAddress).ownerOf(nftIds[i]);
            require(owner == address(this), "Mock is not owner");
            IERC721(nftAddress).approve(msg.sender, nftIds[i]);
            emit FlashLoanNFT(nftAddress, nftIds[i], address(this));
        }

        return true;
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
