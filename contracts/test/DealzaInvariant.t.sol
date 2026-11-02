// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {DealzaFixture} from "./DealzaOperator.t.sol";
import {DealzaOperator} from "../src/DealzaOperator.sol";
import {AuthCaptureEscrow} from "commerce-payments/AuthCaptureEscrow.sol";
import {PreApprovalPaymentCollector} from "commerce-payments/collectors/PreApprovalPaymentCollector.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LifecycleHandler is Test {
    DealzaOperator public immutable operator;
    AuthCaptureEscrow public immutable escrow;
    PreApprovalPaymentCollector public immutable collector;
    IERC20 public immutable usdc;
    address public constant BUYER = address(0xB001);
    address public constant SELLER = address(0x5E11);
    address public constant REVIEWER = address(0xAE01);
    bytes32[] public ids;
    uint256 public permittedSellerPayout;
    uint256 public forbiddenSuccesses;

    constructor(DealzaOperator operator_) {
        operator = operator_;
        escrow = operator_.ESCROW();
        collector = operator_.COLLECTOR();
        usdc = IERC20(operator_.USDC());
    }

    function count() external view returns (uint256) {
        return ids.length;
    }

    function create(uint120 amount) public {
        if (ids.length >= 32) return;
        amount = uint120(bound(amount, 1, 1_000_000_000));
        vm.prank(SELLER);
        ids.push(
            operator.createOrder(
                BUYER,
                amount,
                uint48(block.timestamp + 1 days),
                uint48(block.timestamp + 7 days),
                REVIEWER,
                keccak256("invariant terms")
            )
        );
    }

    function fund(uint256 seed) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        DealzaOperator.Order memory o = operator.getOrder(id);
        vm.startPrank(BUYER);
        usdc.approve(address(collector), o.payment.maxAmount);
        try collector.preApprove(o.payment) {} catch {}
        try operator.fund(id, o.payment) {} catch {}
        vm.stopPrank();
    }

    function buyerRelease(uint256 seed) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        uint256 amount = operator.getOrder(id).payment.maxAmount;
        vm.prank(BUYER);
        try operator.release(id) {
            permittedSellerPayout += amount;
        } catch {}
    }

    function openDispute(uint256 seed, bool sellerDisputes) external {
        if (ids.length == 0) return;
        vm.prank(sellerDisputes ? SELLER : BUYER);
        try operator.dispute(ids[seed % ids.length], keccak256("evidence")) {} catch {}
    }

    function resolve(uint256 seed, bool releaseToSeller) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        uint256 amount = operator.getOrder(id).payment.maxAmount;
        vm.prank(REVIEWER);
        try operator.resolve(id, releaseToSeller, keccak256("decision")) {
            if (releaseToSeller) permittedSellerPayout += amount;
        } catch {}
    }

    function cancel(uint256 seed, bool buyerCancels) external {
        if (ids.length == 0) return;
        vm.prank(buyerCancels ? BUYER : SELLER);
        try operator.cancel(ids[seed % ids.length]) {} catch {}
    }

    function reclaim(uint256 seed) external {
        if (ids.length == 0) return;
        AuthCaptureEscrow.PaymentInfo memory p = operator.getOrder(ids[seed % ids.length]).payment;
        vm.prank(BUYER);
        try escrow.reclaim(p) {} catch {}
        try operator.syncRecovery(ids[seed % ids.length]) {} catch {}
    }

    function advanceTime(uint32 elapsed) external {
        vm.warp(block.timestamp + bound(elapsed, 0, 3 days));
    }

    function attack(uint256 seed, bool sellerAttacks) external {
        if (ids.length == 0) return;
        bytes32 id = ids[seed % ids.length];
        vm.startPrank(sellerAttacks ? SELLER : address(0xBAD));
        try operator.release(id) {
            forbiddenSuccesses++;
        } catch {}
        try operator.resolve(id, true, keccak256("forged ruling")) {
            forbiddenSuccesses++;
        } catch {}
        AuthCaptureEscrow.PaymentInfo memory p = operator.getOrder(id).payment;
        try escrow.capture(p, p.maxAmount, 0, address(0)) {
            forbiddenSuccesses++;
        } catch {}
        vm.stopPrank();
    }
}

/// @dev Reuses only the local fixture, not the unit test methods.
contract DealzaInvariantTest is StdInvariant, DealzaFixture {
    LifecycleHandler internal handler;
    uint256 internal initialBalance;

    function setUp() public override {
        _localProtocol();
        _start();
        initialBalance = usdc.balanceOf(buyer);
        handler = new LifecycleHandler(operator);
        handler.create(AMOUNT);
        bytes4[] memory selectors = new bytes4[](9);
        selectors[0] = handler.create.selector;
        selectors[1] = handler.fund.selector;
        selectors[2] = handler.buyerRelease.selector;
        selectors[3] = handler.openDispute.selector;
        selectors[4] = handler.resolve.selector;
        selectors[5] = handler.cancel.selector;
        selectors[6] = handler.reclaim.selector;
        selectors[7] = handler.advanceTime.selector;
        selectors[8] = handler.attack.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariantConservationAndOnlyPermittedPayouts() public view {
        assertEq(handler.forbiddenSuccesses(), 0);
        assertEq(usdc.balanceOf(seller), handler.permittedSellerPayout());
        assertEq(usdc.balanceOf(address(operator)), 0);
        assertEq(
            usdc.balanceOf(buyer) + usdc.balanceOf(seller) + usdc.balanceOf(escrow.getTokenStore(address(operator))),
            initialBalance
        );
    }

    function invariantProtocolStateAgreesWithOrders() public view {
        uint256 totalHeld;
        for (uint256 i; i < handler.count(); ++i) {
            bytes32 orderId = handler.ids(i);
            DealzaOperator.Order memory o = operator.getOrder(orderId);
            (bool collected, uint120 held, uint120 refundable) = escrow.paymentState(o.paymentHash);
            DealzaOperator.Status s = operator.status(orderId);
            assertEq(o.paymentHash, escrow.getHash(o.payment));
            if (
                s == DealzaOperator.Status.Reserved || s == DealzaOperator.Status.Disputed
                    || (s == DealzaOperator.Status.Expired && collected)
            ) assertEq(held, o.payment.maxAmount);
            if (s == DealzaOperator.Status.Released) {
                assertEq(held, 0);
                assertEq(refundable, o.payment.maxAmount);
            } else {
                assertEq(refundable, 0);
            }
            if (s == DealzaOperator.Status.Voided || s == DealzaOperator.Status.Reclaimed) assertEq(held, 0);
            totalHeld += held;
        }
        assertEq(totalHeld, usdc.balanceOf(escrow.getTokenStore(address(operator))));
    }
}
