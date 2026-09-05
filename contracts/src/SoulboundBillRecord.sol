// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SoulboundBillRecord
/// @notice Deployed on Creditcoin CC3 Testnet. A non-transferable ERC-721 minted
/// directly by BillValidator when a validator approves an uploaded bill — the
/// permanent on-chain receipt tying a verified bill to the wallet that submitted it.
/// One token per approved bill; tokens can never move after mint, including via
/// approve/setApprovalForAll, since a transferable "proof you paid a bill" would be
/// a saleable/forgeable credential rather than a real record of that wallet's history.
///
/// Minting is restricted to an owner-managed set of authorized minters (BillValidator,
/// and potentially other approval paths later) via the same isRecorder-style pattern
/// already used by CreditVault — see docs/HANDOFFphase6.md, "Next: finish the
/// validator/upload system".
contract SoulboundBillRecord is ERC721, Ownable {
    struct BillRecord {
        address payer;
        uint256 billId;
        uint256 claimedAmount;
        uint256 mintedAt;
    }

    mapping(address => bool) public isMinter;
    mapping(uint256 => BillRecord) public recordOf;
    uint256 public nextTokenId;

    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event RecordMinted(
        uint256 indexed tokenId, address indexed payer, uint256 indexed billId, uint256 claimedAmount
    );

    modifier onlyMinter() {
        require(isMinter[msg.sender], "SoulboundBillRecord: caller is not an authorized minter");
        _;
    }

    constructor(address initialOwner) ERC721("Groundwork Verified Bill", "GWBILL") Ownable(initialOwner) {}

    /// @notice Authorize a new minter (BillValidator, or another approval-path
    /// contract later). Owner-only, mirrors CreditVault.addRecorder.
    function addMinter(address minter) external onlyOwner {
        require(minter != address(0), "SoulboundBillRecord: minter is the zero address");
        require(!isMinter[minter], "SoulboundBillRecord: already a minter");
        isMinter[minter] = true;
        emit MinterAdded(minter);
    }

    /// @notice Revoke a minter's authorization.
    function removeMinter(address minter) external onlyOwner {
        require(isMinter[minter], "SoulboundBillRecord: not a minter");
        isMinter[minter] = false;
        emit MinterRemoved(minter);
    }

    /// @notice Mint a new record token to `to`. Called by BillValidator inside
    /// approveBill — one token per approved bill, never minted speculatively.
    function mint(address to, uint256 billId, uint256 claimedAmount) external onlyMinter returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        recordOf[tokenId] =
            BillRecord({payer: to, billId: billId, claimedAmount: claimedAmount, mintedAt: block.timestamp});

        _safeMint(to, tokenId);

        emit RecordMinted(tokenId, to, billId, claimedAmount);
    }

    /// @dev OZ v5's single choke point for mint/transfer/burn. Mint (from == address(0))
    /// is allowed; burn (to == address(0)) is allowed; any actual transfer between two
    /// nonzero addresses reverts. This is what makes the token soulbound.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert("SoulboundBillRecord: token is non-transferable");
        }
        return super._update(to, tokenId, auth);
    }

    /// @dev Approvals are meaningless (and misleading, since they'd imply transfer is
    /// possible) for a token that can never actually move. Disabled outright.
    function approve(address, uint256) public pure override {
        revert("SoulboundBillRecord: approvals are disabled");
    }

    function setApprovalForAll(address, bool) public pure override {
        revert("SoulboundBillRecord: approvals are disabled");
    }
}
