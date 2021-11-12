pragma solidity ^0.6.0;

interface IFlashNFT721Receiver {
    function executeOperation(
        address nftAddress,
        uint256[] calldata nftIds,
        address initiator,
        bytes calldata params
    ) external returns (bool);

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}
