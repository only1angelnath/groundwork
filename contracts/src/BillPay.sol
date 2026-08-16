// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title BillPay
/// @notice Deployed on Ethereum Sepolia. Deliberately minimal: one function, one event.
/// A payer sends value to a payee (a demo biller); the event this emits is what the
/// Python readability worker watches for, attests via the Attestcoin Protocol, and
/// forwards to GroundworkASC on Creditcoin.
contract BillPay {
    /// @notice Emitted on every successful bill payment.
    /// @dev Event signature: keccak256("BillPaid(address,address,uint256,uint256)")
    /// = 0x4112c87bb6b33df7c39789e375cbdef65ff342a26cfd011bc0b40b80496769e1
    /// GroundworkASC.sol on Creditcoin filters verified transaction logs against this
    /// exact signature, so the parameter order and indexing here must not change without
    /// updating BILL_PAID_EVENT_SIGNATURE there too.
    event BillPaid(address indexed payer, address indexed payee, uint256 amount, uint256 timestamp);

    /// @notice Pay a bill to `payee`. The full msg.value is forwarded to the payee;
    /// this contract never holds funds.
    function payBill(address payee) external payable {
        require(payee != address(0), "BillPay: payee is the zero address");
        require(msg.value > 0, "BillPay: no payment sent");

        emit BillPaid(msg.sender, payee, msg.value, block.timestamp);

        (bool sent, ) = payee.call{value: msg.value}("");
        require(sent, "BillPay: transfer to payee failed");
    }
}
