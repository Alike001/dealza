// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DealzaFixture} from "./DealzaOperator.t.sol";
import {DealzaOperator} from "../src/DealzaOperator.sol";
import {AuthCaptureEscrow} from "commerce-payments/AuthCaptureEscrow.sol";
import {TokenCollector} from "commerce-payments/collectors/TokenCollector.sol";
import {PreApprovalPaymentCollector} from "commerce-payments/collectors/PreApprovalPaymentCollector.sol";
import {TokenStore} from "commerce-payments/TokenStore.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Review regressions shared by the local upstream fixture and real deployed Sepolia fork.
abstract contract ReviewSecurityScenarios is DealzaFixture {
    function testFullExecutionPathPreservesTermsAndRequiresBuyerRelease() public {
        DealzaOperator.Order memory o = operator.getOrder(id);
        assertEq(o.payment.operator, address(operator));
        assertEq(o.payment.payer, buyer);
        assertEq(o.payment.receiver, seller);
        assertEq(o.payment.token, USDC_ADDRESS);
        assertEq(o.payment.maxAmount, AMOUNT);
        assertEq(o.payment.minFeeBps, 0);
        assertEq(o.payment.maxFeeBps, 0);
        assertEq(o.payment.feeReceiver, address(0));
        assertEq(o.reviewer, reviewer);
        assertEq(o.descriptionHash, keccak256("order terms"));
        assertEq(o.paymentHash, escrow.getHash(o.payment));
        uint256 buyerBefore = usdc.balanceOf(buyer);
        _fund();
        assertEq(usdc.balanceOf(buyer), buyerBefore - AMOUNT);
        assertEq(usdc.allowance(buyer, COLLECTOR_ADDRESS), 0);
        vm.expectEmit(true, false, false, true, address(operator));
        emit DealzaOperator.DeliveryNoted(id, keccak256("seller claim only"));
        vm.prank(seller);
        operator.noteDelivery(id, keccak256("seller claim only"));
        _status(DealzaOperator.Status.Reserved);
        assertEq(usdc.balanceOf(seller), 0);
        vm.prank(buyer);
        operator.release(id);
        _status(DealzaOperator.Status.Released);
        assertEq(usdc.balanceOf(seller), AMOUNT);
        (bool collected, uint120 held, uint120 captured) = escrow.paymentState(o.paymentHash);
        assertTrue(collected);
        assertEq(held, 0);
        assertEq(captured, AMOUNT);
    }

    function testNoChargeRefundOrGenericExecutionBypass() public {
        _fund();
        bytes[] memory attempts = new bytes[](7);
        attempts[0] = abi.encodeCall(escrow.charge, (p, AMOUNT, COLLECTOR_ADDRESS, bytes(""), 0, address(0)));
        attempts[1] = abi.encodeCall(escrow.capture, (p, AMOUNT, 0, address(0)));
        attempts[2] = abi.encodeCall(escrow.void, (p));
        attempts[3] = abi.encodeCall(escrow.refund, (p, AMOUNT, COLLECTOR_ADDRESS, bytes("")));
        attempts[4] = abi.encodeWithSignature("execute(address,bytes)", address(escrow), attempts[1]);
        attempts[5] = abi.encodeWithSignature("multicall(bytes[])", attempts);
        attempts[6] = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", outsider, bytes(""));
        for (uint256 i; i < attempts.length; ++i) {
            vm.prank(seller);
            (bool success,) = address(operator).call(attempts[i]);
            assertFalse(success);
            vm.prank(buyer);
            (success,) = address(operator).call(attempts[i]);
            assertFalse(success);
        }
        _status(DealzaOperator.Status.Reserved);
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(usdc.balanceOf(escrow.getTokenStore(address(operator))), AMOUNT);
    }

    function testDisputeCannotBeOverriddenOrReviewerReplaced() public {
        _fund();
        _dispute();
        vm.startPrank(buyer);
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        operator.release(id);
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        operator.cancel(id);
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        operator.resolve(id, true, keccak256("buyer ruling"));
        vm.stopPrank();
        vm.prank(seller);
        (bool success,) = address(operator).call(abi.encodeWithSignature("setReviewer(bytes32,address)", id, seller));
        assertFalse(success);
        assertEq(operator.getOrder(id).reviewer, reviewer);
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        vm.prank(reviewer);
        operator.release(id);
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        vm.prank(outsider);
        operator.resolve(id, false, keccak256("outsider ruling"));
        _status(DealzaOperator.Status.Disputed);
        // Seller can only surrender the claim, not divert funds around the reviewer.
        uint256 balance = usdc.balanceOf(buyer);
        vm.prank(seller);
        operator.cancel(id);
        assertEq(usdc.balanceOf(buyer), balance + AMOUNT);
        assertEq(usdc.balanceOf(seller), 0);
    }

    function testUnresolvedDisputeDoesNotFreezeExpiryReclaim() public {
        _fund();
        _dispute();
        vm.warp(p.authorizationExpiry - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                AuthCaptureEscrow.BeforeAuthorizationExpiry.selector, uint48(block.timestamp), p.authorizationExpiry
            )
        );
        vm.prank(buyer);
        escrow.reclaim(p);
        vm.warp(p.authorizationExpiry);
        uint256 balance = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.reclaim(p);
        assertEq(usdc.balanceOf(buyer), balance + AMOUNT);
        assertEq(uint256(operator.getOrder(id).status), uint256(DealzaOperator.Status.Disputed));
        _status(DealzaOperator.Status.Reclaimed);
        vm.expectRevert(DealzaOperator.Expired.selector);
        vm.prank(reviewer);
        operator.resolve(id, true, keccak256("late ruling"));
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(buyer);
        operator.release(id);
        operator.syncRecovery(id);
        assertEq(uint256(operator.getOrder(id).status), uint256(DealzaOperator.Status.Reclaimed));
        assertEq(usdc.balanceOf(seller), 0);
    }

    function testSharedTokenStoreCannotDivertOrConsumeOtherOrder() public {
        _fund();
        vm.prank(seller);
        bytes32 second = operator.createOrder(
            outsider,
            AMOUNT * 2,
            uint48(block.timestamp + 1 days),
            uint48(block.timestamp + 7 days),
            reviewer,
            keccak256("second buyer terms")
        );
        AuthCaptureEscrow.PaymentInfo memory q = operator.getOrder(second).payment;
        deal(USDC_ADDRESS, outsider, AMOUNT * 2, true);
        vm.startPrank(outsider);
        usdc.approve(COLLECTOR_ADDRESS, AMOUNT * 2);
        collector.preApprove(q);
        operator.fund(second, q);
        vm.stopPrank();
        address store = escrow.getTokenStore(address(operator));
        vm.prank(buyer); // Deploys CPP's TokenStore clone, leaving second order reserved.
        operator.release(id);
        assertEq(usdc.balanceOf(store), AMOUNT * 2);
        vm.expectRevert(TokenStore.OnlyAuthCaptureEscrow.selector);
        vm.prank(seller);
        TokenStore(store).sendTokens(USDC_ADDRESS, seller, AMOUNT * 2);
        vm.expectRevert(TokenCollector.OnlyAuthCaptureEscrow.selector);
        vm.prank(seller);
        collector.collectTokens(q, seller, AMOUNT * 2, "");
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        vm.prank(buyer);
        operator.release(second);
        vm.prank(seller);
        operator.cancel(second);
        assertEq(usdc.balanceOf(outsider), AMOUNT * 2);
        assertEq(usdc.balanceOf(seller), AMOUNT);
        assertEq(usdc.balanceOf(store), 0);
    }

    function testPreApprovalCannotBeReplayedAcrossOperators() public {
        _approve(p);
        DealzaOperator other = new DealzaOperator();
        vm.prank(seller);
        bytes32 second = other.createOrder(
            buyer, AMOUNT, p.preApprovalExpiry, p.authorizationExpiry, reviewer, keccak256("order terms")
        );
        AuthCaptureEscrow.PaymentInfo memory q = other.getOrder(second).payment;
        assertEq(q.operator, address(other));
        assertNotEq(escrow.getHash(q), escrow.getHash(p));
        vm.expectRevert(
            abi.encodeWithSelector(PreApprovalPaymentCollector.PaymentNotPreApproved.selector, escrow.getHash(q))
        );
        vm.prank(buyer);
        other.fund(second, q);
        assertEq(uint256(other.status(second)), uint256(DealzaOperator.Status.Pending));
        vm.prank(buyer);
        operator.fund(id, p);
        _status(DealzaOperator.Status.Reserved);
    }

    function testCapturedAccountingDoesNotEnableRecoveryOrRefund() public {
        _fund();
        vm.prank(buyer);
        operator.release(id);
        vm.warp(p.authorizationExpiry);
        bytes32 h = escrow.getHash(p);
        vm.expectRevert(abi.encodeWithSelector(AuthCaptureEscrow.ZeroAuthorization.selector, h));
        vm.prank(buyer);
        escrow.reclaim(p);
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(seller);
        operator.cancel(id);
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(buyer);
        operator.dispute(id, keccak256("too late"));
        (bool collected, uint120 held, uint120 accountingOnly) = escrow.paymentState(h);
        assertTrue(collected);
        assertEq(held, 0);
        assertEq(accountingOnly, AMOUNT);
        assertEq(usdc.balanceOf(seller), AMOUNT);
        assertEq(usdc.balanceOf(escrow.getTokenStore(address(operator))), 0);
    }

    function testDirectTokenDonationDoesNotAuthorizeAnOrder() public {
        address store = escrow.getTokenStore(address(operator));
        vm.prank(buyer);
        usdc.transfer(store, AMOUNT);
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(buyer);
        operator.release(id);
        (bool collected, uint120 held,) = escrow.paymentState(escrow.getHash(p));
        assertFalse(collected);
        assertEq(held, 0);
        _fund();
        vm.prank(buyer);
        operator.release(id);
        assertEq(usdc.balanceOf(seller), AMOUNT);
        assertEq(usdc.balanceOf(store), AMOUNT); // Unsolicited surplus is not part of any order.
    }

    function testRevokedAllowancePreventsFundingAtomically() public {
        _approve(p);
        vm.prank(buyer);
        usdc.approve(COLLECTOR_ADDRESS, 0);
        uint256 balance = usdc.balanceOf(buyer);
        vm.expectRevert();
        vm.prank(buyer);
        operator.fund(id, p);
        assertEq(usdc.balanceOf(buyer), balance);
        _status(DealzaOperator.Status.Pending);
        (bool collected, uint120 held,) = escrow.paymentState(escrow.getHash(p));
        assertFalse(collected);
        assertEq(held, 0);
    }
}

contract ReviewSecurityTest is ReviewSecurityScenarios {
    function setUp() public override {
        _localProtocol();
        _start();
    }

    function testApprovalCannotBeReplayedOnAnotherChain() public {
        _approve(p);
        vm.chainId(84533);
        vm.expectRevert(DealzaOperator.PaymentMismatch.selector);
        vm.prank(buyer);
        operator.fund(id, p);
        vm.chainId(84532);
        vm.prank(buyer);
        operator.fund(id, p);
        _status(DealzaOperator.Status.Reserved);
    }

    function testTokenTransferFailureRollsBackCaptureVoidAndReclaim() public {
        _fund();
        bytes memory failure = abi.encodeWithSignature("TokenTransferBlocked()");
        vm.mockCallRevert(USDC_ADDRESS, abi.encodeWithSelector(IERC20.transfer.selector), failure);
        vm.expectRevert(failure);
        vm.prank(buyer);
        operator.release(id);
        _status(DealzaOperator.Status.Reserved);
        vm.expectRevert(failure);
        vm.prank(seller);
        operator.cancel(id);
        _status(DealzaOperator.Status.Reserved);
        vm.warp(p.authorizationExpiry);
        vm.expectRevert(failure);
        vm.prank(buyer);
        escrow.reclaim(p);
        _status(DealzaOperator.Status.Expired);
        (, uint120 held, uint120 refundable) = escrow.paymentState(escrow.getHash(p));
        assertEq(held, AMOUNT);
        assertEq(refundable, 0);
        vm.clearMockedCalls();
        vm.prank(buyer);
        escrow.reclaim(p);
        _status(DealzaOperator.Status.Reclaimed);
    }
}
