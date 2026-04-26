// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract iNFT is ERC721, Ownable {
    struct Intelligence {
        string  personalityHash; // 0G Storage CID
        string  memoryHash;      // 0G Storage CID, updated after each trade
        address portfolioManager;
        uint8   riskLevel;       // 1-10
        bool    isActive;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => Intelligence) public intelligence;

    event Minted(uint256 indexed tokenId, address indexed owner, string personalityCID);
    event MemoryUpdated(uint256 indexed tokenId, string newCID);
    event PortfolioManagerSet(uint256 indexed tokenId, address portfolioManager);

    // Authorized: token owner, contract owner (agent wallet), or the token's portfolio manager
    modifier onlyAuthorized(uint256 tokenId) {
        require(
            msg.sender == ownerOf(tokenId) ||
            msg.sender == owner() ||
            msg.sender == intelligence[tokenId].portfolioManager,
            "iNFT: not authorized"
        );
        _;
    }

    constructor() ERC721("iNFT", "iNFT") Ownable(msg.sender) {
        _nextTokenId = 1;
    }

    function mint(string calldata personalityCID, uint8 riskLevel)
        external
        returns (uint256 tokenId)
    {
        require(riskLevel >= 1 && riskLevel <= 10, "iNFT: riskLevel must be 1-10");
        tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        intelligence[tokenId] = Intelligence({
            personalityHash: personalityCID,
            memoryHash: "",
            portfolioManager: address(0),
            riskLevel: riskLevel,
            isActive: true
        });
        emit Minted(tokenId, msg.sender, personalityCID);
    }

    function updateMemory(uint256 tokenId, string calldata newCID)
        external
        onlyAuthorized(tokenId)
    {
        intelligence[tokenId].memoryHash = newCID;
        emit MemoryUpdated(tokenId, newCID);
    }

    function setPortfolioManager(uint256 tokenId, address addr)
        external
    {
        require(msg.sender == ownerOf(tokenId), "iNFT: not token owner");
        intelligence[tokenId].portfolioManager = addr;
        emit PortfolioManagerSet(tokenId, addr);
    }

    function getIntelligence(uint256 tokenId)
        external
        view
        returns (Intelligence memory)
    {
        ownerOf(tokenId); // reverts with ERC721NonexistentToken if not minted
        return intelligence[tokenId];
    }
}
