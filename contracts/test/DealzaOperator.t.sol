// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DealzaOperator} from "../src/DealzaOperator.sol";
import {AuthCaptureEscrow} from "commerce-payments/AuthCaptureEscrow.sol";
import {TokenStore} from "commerce-payments/TokenStore.sol";
import {PreApprovalPaymentCollector} from "commerce-payments/collectors/PreApprovalPaymentCollector.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestUSDC} from "./TestUSDC.sol";

/// @dev Shared suite executes real CPP code locally and, separately, on a read-only Sepolia fork.
abstract contract DealzaFixture is Test {
    address internal constant ESCROW_ADDRESS = 0xf96815976523E00e65Be8f34cA5e64b4f41EB19c;
    address internal constant COLLECTOR_ADDRESS = 0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea;
    address internal constant USDC_ADDRESS = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    AuthCaptureEscrow internal escrow = AuthCaptureEscrow(ESCROW_ADDRESS);
    PreApprovalPaymentCollector internal collector = PreApprovalPaymentCollector(COLLECTOR_ADDRESS);
    IERC20 internal usdc = IERC20(USDC_ADDRESS);
    DealzaOperator internal operator;
    address internal buyer = address(0xB001);
    address internal seller = address(0x5E11);
    address internal reviewer = address(0xAE01);
    address internal outsider = address(0xBAD);
    uint120 internal constant AMOUNT = 10_000_000;
    bytes32 internal id;
    AuthCaptureEscrow.PaymentInfo internal p;

    function setUp() public virtual;

    function _localProtocol() internal {
        vm.chainId(84532);
        vm.warp(1_800_000_000);
        // Test-only installation at canonical addresses. All runtime is unmodified upstream CPP.
        AuthCaptureEscrow implementation = new AuthCaptureEscrow();
        vm.etch(ESCROW_ADDRESS, address(implementation).code);
        // The escrow was relocated; its immutable TokenStore implementation must trust the canonical address.
        TokenStore store = new TokenStore(ESCROW_ADDRESS);
        vm.etch(escrow.tokenStoreImplementation(), address(store).code);
        PreApprovalPaymentCollector c = new PreApprovalPaymentCollector(ESCROW_ADDRESS);
        vm.etch(COLLECTOR_ADDRESS, address(c).code);
        TestUSDC token = new TestUSDC();
        vm.etch(USDC_ADDRESS, address(token).code);
    }

    function _start() internal {
        operator = new DealzaOperator();
        deal(USDC_ADDRESS, buyer, 1_000_000_000_000, true); // Local EVM storage only, including fork tests.
        id = _create(AMOUNT);
        p = operator.getOrder(id).payment;
    }

    function _create(uint120 amount) internal returns (bytes32) {
        vm.prank(seller);
        return operator.createOrder(
            buyer,
            amount,
            uint48(block.timestamp + 1 days),
            uint48(block.timestamp + 7 days),
            reviewer,
            keccak256("order terms")
        );
    }

    function _approve(AuthCaptureEscrow.PaymentInfo memory payment) internal {
        vm.startPrank(buyer);
        usdc.approve(COLLECTOR_ADDRESS, payment.maxAmount);
        collector.preApprove(payment);
        vm.stopPrank();
    }

    function _fund() internal {
        _approve(p);
        vm.prank(buyer);
        operator.fund(id, p);
    }

    function _dispute() internal {
        vm.prank(buyer);
        operator.dispute(id, keccak256("evidence"));
    }

    function _status(DealzaOperator.Status expected) internal view {
        assertEq(uint256(operator.status(id)), uint256(expected));
    }
}

abstract contract DealzaScenarios is DealzaFixture {
    function testProtocolAuthorizationAndCaptureEvents() public {
        _approve(p);
        bytes32 h = escrow.getHash(p);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit AuthCaptureEscrow.PaymentAuthorized(h, p, AMOUNT, COLLECTOR_ADDRESS);
        vm.prank(buyer);
        operator.fund(id, p);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit AuthCaptureEscrow.PaymentCaptured(h, AMOUNT, 0, address(0));
        vm.prank(buyer);
        operator.release(id);
    }

    function testAllOperatorOnlyProtocolEntrypointsRejectSeller() public {
        bytes memory expected =
            abi.encodeWithSelector(AuthCaptureEscrow.InvalidSender.selector, seller, address(operator));
        vm.startPrank(seller);
        vm.expectRevert(expected);
        escrow.authorize(p, AMOUNT, COLLECTOR_ADDRESS, "");
        vm.expectRevert(expected);
        escrow.charge(p, AMOUNT, COLLECTOR_ADDRESS, "", 0, address(0));
        vm.expectRevert(expected);
        escrow.capture(p, AMOUNT, 0, address(0));
        vm.expectRevert(expected);
        escrow.void(p);
        vm.expectRevert(expected);
        escrow.refund(p, AMOUNT, COLLECTOR_ADDRESS, "");
        vm.stopPrank();
    }

    function testExactHashAndCustody() public {
        _fund();
        assertEq(escrow.getHash(p), operator.getOrder(id).paymentHash);
        assertEq(p.operator, address(operator));
        assertEq(p.salt, uint256(id));
        assertEq(usdc.balanceOf(address(operator)), 0);
        assertEq(usdc.balanceOf(escrow.getTokenStore(address(operator))), AMOUNT);
        (bool collected, uint120 held, uint120 refundable) = escrow.paymentState(escrow.getHash(p));
        assertTrue(collected);
        assertEq(held, AMOUNT);
        assertEq(refundable, 0);
        _status(DealzaOperator.Status.Reserved);
    }

    function testSellerCannotReleaseOrDirectlyCapture() public {
        _fund();
        vm.prank(seller);
        operator.noteDelivery(id, keccak256("delivered claim"));
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        vm.prank(seller);
        operator.release(id);
        vm.expectRevert(abi.encodeWithSelector(AuthCaptureEscrow.InvalidSender.selector, seller, address(operator)));
        vm.prank(seller);
        escrow.capture(p, AMOUNT, 0, address(0));
        assertEq(usdc.balanceOf(seller), 0);
        _status(DealzaOperator.Status.Reserved);
    }

    function testBuyerReleaseExactlyOnce() public {
        _fund();
        vm.prank(buyer);
        operator.release(id);
        assertEq(usdc.balanceOf(seller), AMOUNT);
        assertEq(usdc.balanceOf(address(operator)), 0);
        assertEq(usdc.balanceOf(escrow.getTokenStore(address(operator))), 0);
        _status(DealzaOperator.Status.Released);
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(buyer);
        operator.release(id);
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(buyer);
        operator.fund(id, p);
    }

    function testNoCaptureBeforeFunding() public {
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(buyer);
        operator.release(id);
    }

    function testOutsiderCannotFundReleaseCancelDisputeOrResolve() public {
        vm.startPrank(outsider);
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        operator.fund(id, p);
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        operator.cancel(id);
        vm.stopPrank();
        _fund();
        vm.startPrank(outsider);
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        operator.release(id);
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        operator.dispute(id, keccak256("bad"));
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        operator.noteDelivery(id, keccak256("bad"));
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        operator.resolve(id, true, keccak256("bad"));
        vm.stopPrank();
    }

    function testFuzzRejectEveryAlteredPaymentField(uint8 field, uint256 mutation) public {
        field = uint8(bound(field, 0, 11));
        mutation = bound(mutation, 1, type(uint120).max);
        AuthCaptureEscrow.PaymentInfo memory q = p;
        if (field == 0) q.operator = address(uint160(q.operator) ^ uint160(mutation));
        else if (field == 1) q.payer = address(uint160(q.payer) ^ uint160(mutation));
        else if (field == 2) q.receiver = address(uint160(q.receiver) ^ uint160(mutation));
        else if (field == 3) q.token = address(uint160(q.token) ^ uint160(mutation));
        else if (field == 4) q.maxAmount ^= uint120(mutation);
        else if (field == 5) q.preApprovalExpiry ^= uint48(bound(mutation, 1, type(uint48).max));
        else if (field == 6) q.authorizationExpiry ^= uint48(bound(mutation, 1, type(uint48).max));
        else if (field == 7) q.refundExpiry ^= uint48(bound(mutation, 1, type(uint48).max));
        else if (field == 8) q.minFeeBps ^= uint16(bound(mutation, 1, type(uint16).max));
        else if (field == 9) q.maxFeeBps ^= uint16(bound(mutation, 1, type(uint16).max));
        else if (field == 10) q.feeReceiver = address(uint160(mutation));
        else q.salt ^= mutation;
        vm.expectRevert(DealzaOperator.PaymentMismatch.selector);
        vm.prank(buyer);
        operator.fund(id, q);
        assertEq(usdc.balanceOf(seller), 0);
    }

    function testWrongSellerRejected() public {
        AuthCaptureEscrow.PaymentInfo memory q = p;
        q.receiver = outsider;
        _approve(q);
        vm.expectRevert(DealzaOperator.PaymentMismatch.selector);
        vm.prank(buyer);
        operator.fund(id, q);
        assertEq(usdc.balanceOf(outsider), 0);
    }

    function testPreApprovalCannotBeModifiedOrReplayedForAnotherOrder() public {
        _approve(p);
        bytes32 other = _create(AMOUNT);
        AuthCaptureEscrow.PaymentInfo memory q = operator.getOrder(other).payment;
        assertNotEq(escrow.getHash(q), escrow.getHash(p));
        vm.expectRevert(
            abi.encodeWithSelector(PreApprovalPaymentCollector.PaymentNotPreApproved.selector, escrow.getHash(q))
        );
        vm.prank(buyer);
        operator.fund(other, q);
        assertEq(uint256(operator.status(other)), uint256(DealzaOperator.Status.Pending));
        vm.expectRevert(DealzaOperator.PaymentMismatch.selector);
        vm.prank(buyer);
        operator.fund(other, p);
        vm.prank(buyer);
        operator.fund(id, p);
    }

    function testPreApprovalMustComeFromPayer() public {
        vm.expectRevert(abi.encodeWithSelector(AuthCaptureEscrow.InvalidSender.selector, outsider, buyer));
        vm.prank(outsider);
        collector.preApprove(p);
    }

    function testAllowanceAloneInsufficient() public {
        vm.prank(buyer);
        usdc.approve(COLLECTOR_ADDRESS, AMOUNT);
        bytes32 h = escrow.getHash(p);
        vm.expectRevert(abi.encodeWithSelector(PreApprovalPaymentCollector.PaymentNotPreApproved.selector, h));
        vm.prank(buyer);
        operator.fund(id, p);
        _status(DealzaOperator.Status.Pending);
    }

    function testPreApprovalAloneInsufficientAndFailedFundingAtomic() public {
        vm.prank(buyer);
        collector.preApprove(p);
        vm.expectRevert();
        vm.prank(buyer);
        operator.fund(id, p);
        _status(DealzaOperator.Status.Pending);
        (bool collected, uint120 held,) = escrow.paymentState(escrow.getHash(p));
        assertFalse(collected);
        assertEq(held, 0);
        vm.prank(buyer);
        usdc.approve(COLLECTOR_ADDRESS, AMOUNT);
        vm.prank(buyer);
        operator.fund(id, p);
    }

    function testPreApprovalExpiryBoundary() public {
        _approve(p);
        vm.warp(p.preApprovalExpiry);
        vm.expectRevert(DealzaOperator.Expired.selector);
        vm.prank(buyer);
        operator.fund(id, p);
        _status(DealzaOperator.Status.Expired);
    }

    function testDisputeReviewerRelease() public {
        _fund();
        _dispute();
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(buyer);
        operator.release(id);
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        vm.prank(seller);
        operator.resolve(id, true, keccak256("bad ruling"));
        vm.prank(reviewer);
        operator.resolve(id, true, keccak256("ruling"));
        assertEq(usdc.balanceOf(seller), AMOUNT);
        _status(DealzaOperator.Status.Released);
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(reviewer);
        operator.resolve(id, true, keccak256("replay"));
    }

    function testSellerCanDisputeReviewerVoid() public {
        uint256 beforeBalance = usdc.balanceOf(buyer);
        _fund();
        vm.prank(seller);
        operator.dispute(id, keccak256("seller evidence"));
        vm.prank(reviewer);
        operator.resolve(id, false, keccak256("return to buyer"));
        assertEq(usdc.balanceOf(buyer), beforeBalance);
        assertEq(usdc.balanceOf(seller), 0);
        _status(DealzaOperator.Status.Voided);
    }

    function testReviewerCannotReleaseUndisputedOrder() public {
        _fund();
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(reviewer);
        operator.resolve(id, true, keccak256("ruling"));
    }

    function testCaptureFailsAtExpiryAndReclaimIsPayerOnly() public {
        uint256 initial = usdc.balanceOf(buyer);
        _fund();
        vm.warp(p.authorizationExpiry);
        _status(DealzaOperator.Status.Expired);
        vm.expectRevert(DealzaOperator.Expired.selector);
        vm.prank(buyer);
        operator.release(id);
        vm.expectRevert(abi.encodeWithSelector(AuthCaptureEscrow.InvalidSender.selector, seller, buyer));
        vm.prank(seller);
        escrow.reclaim(p);
        vm.expectRevert(abi.encodeWithSelector(AuthCaptureEscrow.InvalidSender.selector, address(operator), buyer));
        vm.prank(address(operator));
        escrow.reclaim(p);
        vm.prank(buyer);
        escrow.reclaim(p);
        assertEq(usdc.balanceOf(buyer), initial);
        _status(DealzaOperator.Status.Reclaimed); // No Dealza sync required for authoritative view.
        operator.syncRecovery(id);
        assertEq(uint256(operator.getOrder(id).status), uint256(DealzaOperator.Status.Reclaimed));
        bytes32 h = escrow.getHash(p);
        vm.expectRevert(abi.encodeWithSelector(AuthCaptureEscrow.ZeroAuthorization.selector, h));
        vm.prank(buyer);
        escrow.reclaim(p);
    }

    function testReclaimBeforeExpiryFails() public {
        _fund();
        vm.expectRevert(
            abi.encodeWithSelector(
                AuthCaptureEscrow.BeforeAuthorizationExpiry.selector, uint48(block.timestamp), p.authorizationExpiry
            )
        );
        vm.prank(buyer);
        escrow.reclaim(p);
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        operator.syncRecovery(id);
    }

    function testReviewerCannotResolveAtExpiryInEitherDirection() public {
        _fund();
        _dispute();
        vm.warp(p.authorizationExpiry);
        vm.startPrank(reviewer);
        vm.expectRevert(DealzaOperator.Expired.selector);
        operator.resolve(id, true, keccak256("ruling"));
        vm.expectRevert(DealzaOperator.Expired.selector);
        operator.resolve(id, false, keccak256("ruling"));
        vm.stopPrank();
        vm.prank(buyer);
        escrow.reclaim(p);
        _status(DealzaOperator.Status.Reclaimed);
    }

    function testLastSecondCaptureSucceeds() public {
        _fund();
        vm.warp(p.authorizationExpiry - 1);
        vm.prank(buyer);
        operator.release(id);
        assertEq(usdc.balanceOf(seller), AMOUNT);
    }

    function testCPPItselfRejectsExpiredOperatorCapture() public {
        _fund();
        vm.warp(p.authorizationExpiry);
        vm.expectRevert(
            abi.encodeWithSelector(
                AuthCaptureEscrow.AfterAuthorizationExpiry.selector, p.authorizationExpiry, p.authorizationExpiry
            )
        );
        vm.prank(address(operator));
        escrow.capture(p, AMOUNT, 0, address(0));
    }

    function testSellerCancellationReturnsAllFundsAndBlocksRelease() public {
        uint256 initial = usdc.balanceOf(buyer);
        _fund();
        vm.expectRevert(DealzaOperator.Unauthorized.selector);
        vm.prank(buyer);
        operator.cancel(id);
        vm.prank(seller);
        operator.cancel(id);
        assertEq(usdc.balanceOf(buyer), initial);
        _status(DealzaOperator.Status.Voided);
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(buyer);
        operator.release(id);
    }

    function testUnfundedCancellationInvalidatesPreApproval() public {
        _approve(p);
        vm.prank(buyer);
        operator.cancel(id);
        vm.expectRevert(DealzaOperator.InvalidState.selector);
        vm.prank(buyer);
        operator.fund(id, p);
        (bool collected,,) = escrow.paymentState(escrow.getHash(p));
        assertFalse(collected);
    }

    function testOperatorVoidAfterExpiryAndReclaimRace() public {
        _fund();
        _dispute();
        vm.warp(p.authorizationExpiry);
        vm.prank(seller);
        operator.cancel(id);
        _status(DealzaOperator.Status.Voided);
        bytes32 h = escrow.getHash(p);
        vm.expectRevert(abi.encodeWithSelector(AuthCaptureEscrow.ZeroAuthorization.selector, h));
        vm.prank(buyer);
        escrow.reclaim(p);
    }

    function testReclaimThenVoidRaceIsAtomic() public {
        _fund();
        vm.warp(p.authorizationExpiry);
        vm.prank(buyer);
        escrow.reclaim(p);
        bytes32 h = escrow.getHash(p);
        vm.expectRevert(abi.encodeWithSelector(AuthCaptureEscrow.ZeroAuthorization.selector, h));
        vm.prank(seller);
        operator.cancel(id);
        _status(DealzaOperator.Status.Reclaimed);
        operator.syncRecovery(id);
    }

    function testFuzzConservationAcrossVerdicts(uint120 amount, bool releaseToSeller) public {
        amount = uint120(bound(amount, 1, 100_000_000_000));
        id = _create(amount);
        p = operator.getOrder(id).payment;
        uint256 initial = usdc.balanceOf(buyer);
        _fund();
        _dispute();
        vm.prank(reviewer);
        operator.resolve(id, releaseToSeller, keccak256("ruling"));
        assertEq(usdc.balanceOf(seller), releaseToSeller ? amount : 0);
        assertEq(usdc.balanceOf(buyer), initial - (releaseToSeller ? amount : 0));
        assertEq(usdc.balanceOf(address(operator)), 0);
        assertEq(usdc.balanceOf(escrow.getTokenStore(address(operator))), 0);
    }
}

contract DealzaOperatorTest is DealzaScenarios {
    function setUp() public override {
        _localProtocol();
        _start();
    }

    function testNoMainnetOrMissingProtocolConfiguration() public {
        vm.chainId(1);
        vm.expectRevert(DealzaOperator.InvalidConfiguration.selector);
        new DealzaOperator();
        vm.chainId(84532);
        vm.etch(COLLECTOR_ADDRESS, "");
        vm.expectRevert(DealzaOperator.InvalidConfiguration.selector);
        new DealzaOperator();
    }

    function testUnknownOrderRejected() public {
        vm.expectRevert(DealzaOperator.UnknownOrder.selector);
        operator.status(bytes32(uint256(123)));
    }

    function testInvalidInputs() public {
        vm.startPrank(seller);
        vm.expectRevert(DealzaOperator.InvalidTerms.selector);
        operator.createOrder(
            address(0), AMOUNT, uint48(block.timestamp + 1), uint48(block.timestamp + 2), reviewer, keccak256("x")
        );
        vm.expectRevert(DealzaOperator.InvalidTerms.selector);
        operator.createOrder(
            buyer, 0, uint48(block.timestamp + 1), uint48(block.timestamp + 2), reviewer, keccak256("x")
        );
        vm.expectRevert(DealzaOperator.InvalidTerms.selector);
        operator.createOrder(
            buyer, AMOUNT, uint48(block.timestamp + 1), uint48(block.timestamp + 2), buyer, keccak256("x")
        );
        vm.expectRevert(DealzaOperator.InvalidTerms.selector);
        operator.createOrder(
            buyer, AMOUNT, uint48(block.timestamp + 1), uint48(block.timestamp + 2), seller, keccak256("x")
        );
        vm.expectRevert(DealzaOperator.InvalidTerms.selector);
        operator.createOrder(
            buyer, AMOUNT, uint48(block.timestamp + 2), uint48(block.timestamp + 1), reviewer, keccak256("x")
        );
        vm.expectRevert(DealzaOperator.InvalidTerms.selector);
        operator.createOrder(
            buyer, AMOUNT, uint48(block.timestamp + 1), uint48(block.timestamp + 31 days), reviewer, keccak256("x")
        );
        vm.expectRevert(DealzaOperator.InvalidTerms.selector);
        operator.createOrder(
            buyer, AMOUNT, uint48(block.timestamp), uint48(block.timestamp + 2), reviewer, keccak256("x")
        );
        vm.expectRevert(DealzaOperator.InvalidTerms.selector);
        operator.createOrder(
            buyer, AMOUNT, uint48(block.timestamp + 1), uint48(block.timestamp + 2), reviewer, bytes32(0)
        );
        vm.stopPrank();
    }

    function testReentrancyDuringCollectionBlocked() public {
        TestUSDC(USDC_ADDRESS).setCallback(address(operator), abi.encodeCall(operator.release, (id)));
        _fund();
        assertFalse(TestUSDC(USDC_ADDRESS).callbackSucceeded());
        assertEq(TestUSDC(USDC_ADDRESS).callbackResult(), abi.encodeWithSignature("Reentrancy()"));
        _status(DealzaOperator.Status.Reserved);
    }

    function testReentrancyDuringCaptureBlocked() public {
        _fund();
        TestUSDC(USDC_ADDRESS).setCallback(address(operator), abi.encodeCall(operator.cancel, (id)));
        vm.prank(buyer);
        operator.release(id);
        assertFalse(TestUSDC(USDC_ADDRESS).callbackSucceeded());
        assertEq(TestUSDC(USDC_ADDRESS).callbackResult(), abi.encodeWithSignature("Reentrancy()"));
        assertEq(usdc.balanceOf(seller), AMOUNT);
        _status(DealzaOperator.Status.Released);
    }

    function testReentrancyDuringVoidBlocked() public {
        _fund();
        TestUSDC(USDC_ADDRESS).setCallback(address(operator), abi.encodeCall(operator.release, (id)));
        vm.prank(seller);
        operator.cancel(id);
        assertFalse(TestUSDC(USDC_ADDRESS).callbackSucceeded());
        assertEq(TestUSDC(USDC_ADDRESS).callbackResult(), abi.encodeWithSignature("Reentrancy()"));
        assertEq(usdc.balanceOf(seller), 0);
        _status(DealzaOperator.Status.Voided);
    }

    function testHashDomainSeparatesChainEscrowAndOperator() public {
        bytes32 h = escrow.getHash(p);
        vm.chainId(84533);
        assertNotEq(h, escrow.getHash(p));
        vm.chainId(84532);
        AuthCaptureEscrow otherEscrow = new AuthCaptureEscrow();
        assertNotEq(h, otherEscrow.getHash(p));
        AuthCaptureEscrow.PaymentInfo memory q = p;
        q.operator = address(new DealzaOperator());
        assertNotEq(h, escrow.getHash(q));
    }
}
