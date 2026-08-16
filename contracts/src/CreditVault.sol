// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CreditVault
/// @notice Deployed on Creditcoin. Tracks a payer's verified-payment score and the
/// collateral ratio required to borrow against it. Only GroundworkASC may record a
/// verified payment; borrowing itself is always initiated directly by the borrower's
/// own wallet — the ASC (and the relayer behind it) never touches loan funds, only proofs.
contract CreditVault is Ownable {
    /// @dev Basis points, i.e. 10_000 = 100%.
    uint256 public constant STARTING_COLLATERAL_RATIO_BPS = 30_000; // 300%
    uint256 public constant FLOOR_COLLATERAL_RATIO_BPS = 11_000; // 110%
    uint256 public constant STEP_DOWN_BPS = 2_000; // -20 points per verified payment

    /// @notice The GroundworkASC contract. Set once after deploy to avoid a
    /// constructor-ordering chicken-and-egg problem (ASC needs this vault's address too).
    address public asc;

    mapping(address => uint256) public scoreOf;
    mapping(address => uint256) public collateralRatioOf;

    event ScoreUpdated(address indexed payer, uint256 newScore, uint256 newCollateralRatioBps);
    event LoanUnlocked(address indexed borrower, uint256 amount, uint256 collateralRatioBps);
    event AscSet(address indexed asc);

    modifier onlyASC() {
        require(msg.sender == asc, "CreditVault: caller is not the ASC");
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice One-time wiring of the ASC address, done by the deployer right after
    /// both contracts exist.
    function setASC(address _asc) external onlyOwner {
        require(asc == address(0), "CreditVault: ASC already set");
        require(_asc != address(0), "CreditVault: ASC is the zero address");
        asc = _asc;
        emit AscSet(_asc);
    }

    /// @notice Called by GroundworkASC once a BillPaid event has been cryptographically
    /// verified. Increments the payer's score and steps their required collateral ratio
    /// down toward the floor.
    function recordVerifiedPayment(address payer, uint256 /* amount */, uint256 /* timestamp */) external onlyASC {
        uint256 newScore = scoreOf[payer] + 1;
        scoreOf[payer] = newScore;

        uint256 currentRatio = collateralRatioOf[payer];
        if (currentRatio == 0) {
            currentRatio = STARTING_COLLATERAL_RATIO_BPS;
        }

        uint256 newRatio = currentRatio > STEP_DOWN_BPS ? currentRatio - STEP_DOWN_BPS : FLOOR_COLLATERAL_RATIO_BPS;
        if (newRatio < FLOOR_COLLATERAL_RATIO_BPS) {
            newRatio = FLOOR_COLLATERAL_RATIO_BPS;
        }
        collateralRatioOf[payer] = newRatio;

        emit ScoreUpdated(payer, newScore, newRatio);
    }

    /// @notice The collateral ratio (basis points) a borrower must post right now.
    /// Defaults to the starting ratio for anyone with no recorded payments yet.
    function requiredCollateralRatioOf(address payer) public view returns (uint256 ratioBps) {
        ratioBps = collateralRatioOf[payer];
        if (ratioBps == 0) {
            ratioBps = STARTING_COLLATERAL_RATIO_BPS;
        }
    }

    /// @notice Borrow `amount` of native currency, posting collateral according to the
    /// caller's current ratio. Always called directly by the borrower's own wallet.
    function borrow(uint256 amount) external payable {
        require(amount > 0, "CreditVault: amount must be positive");

        uint256 ratioBps = requiredCollateralRatioOf(msg.sender);
        uint256 requiredCollateral = (amount * ratioBps) / 10_000;
        require(msg.value >= requiredCollateral, "CreditVault: insufficient collateral");
        require(address(this).balance - msg.value >= amount, "CreditVault: insufficient pool liquidity");

        emit LoanUnlocked(msg.sender, amount, ratioBps);

        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "CreditVault: loan transfer failed");
    }

    /// @notice Lets anyone (the deployer, for a demo) fund the lending pool.
    receive() external payable {}
}
