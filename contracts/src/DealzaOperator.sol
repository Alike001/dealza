// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AuthCaptureEscrow} from "commerce-payments/AuthCaptureEscrow.sol";
import {PreApprovalPaymentCollector} from "commerce-payments/collectors/PreApprovalPaymentCollector.sol";
import {ReentrancyGuardTransient} from "solady/utils/ReentrancyGuardTransient.sol";

/// @notice Base Sepolia only. No owner, upgrade, arbitrary call, charge, or refund entry point.
/// @dev Funding accepts the buyer's transaction plus CPP's exact-hash pre-approval.
///      All USDC transfers are between the buyer, CPP TokenStore, and seller.
contract DealzaOperator is ReentrancyGuardTransient {
    AuthCaptureEscrow public constant ESCROW = AuthCaptureEscrow(0xf96815976523E00e65Be8f34cA5e64b4f41EB19c);
    PreApprovalPaymentCollector public constant COLLECTOR =
        PreApprovalPaymentCollector(0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea);
    address public constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    uint256 public constant CHAIN_ID = 84532;
    uint48 public constant MAX_DURATION = 30 days;

    enum Status {
        None,
        Pending,
        Reserved,
        Disputed,
        Released,
        Voided,
        Expired,
        Reclaimed
    }

    struct Order {
        AuthCaptureEscrow.PaymentInfo payment;
        address reviewer;
        bytes32 descriptionHash;
        bytes32 paymentHash;
        Status status;
    }

    mapping(bytes32 => Order) private _orders;
    mapping(address => uint256) public sellerNonce;

    error InvalidConfiguration();
    error InvalidTerms();
    error UnknownOrder();
    error Unauthorized();
    error InvalidState();
    error Expired();
    error PaymentMismatch();
    error UnexpectedProtocolState();

    event OrderCreated(
        bytes32 indexed orderId,
        address indexed seller,
        address indexed buyer,
        address reviewer,
        bytes32 descriptionHash,
        bytes32 paymentHash,
        AuthCaptureEscrow.PaymentInfo payment
    );
    event OrderFunded(bytes32 indexed orderId, bytes32 indexed paymentHash);
    event DeliveryNoted(bytes32 indexed orderId, bytes32 evidenceHash);
    event DisputeOpened(bytes32 indexed orderId, address indexed by, bytes32 evidenceHash);
    event DisputeResolved(bytes32 indexed orderId, bool releaseToSeller, bytes32 decisionHash);
    event OrderReleased(bytes32 indexed orderId, address indexed authorizedBy);
    event OrderVoided(bytes32 indexed orderId, address indexed authorizedBy);
    event RecoverySynced(bytes32 indexed orderId);

    constructor() {
        if (
            block.chainid != CHAIN_ID || address(ESCROW).code.length == 0 || USDC.code.length == 0
                || address(COLLECTOR).code.length == 0 || address(COLLECTOR.authCaptureEscrow()) != address(ESCROW)
        ) {
            revert InvalidConfiguration();
        }
    }

    /// @notice Seller fixes terms for a named buyer; buyer accepts by funding this order.
    /// @dev No offchain signature scheme. The collector pre-approval commits the exact CPP hash.
    function createOrder(
        address buyer,
        uint120 amount,
        uint48 preApprovalExpiry,
        uint48 expiry,
        address reviewer,
        bytes32 descriptionHash
    ) external nonReentrant returns (bytes32 id) {
        if (
            buyer == address(0) || buyer == msg.sender || reviewer == address(0) || reviewer == buyer
                || reviewer == msg.sender || buyer == address(this) || reviewer == address(this) || amount == 0
                || descriptionHash == bytes32(0) || preApprovalExpiry <= block.timestamp || preApprovalExpiry > expiry
                || expiry > block.timestamp + MAX_DURATION
        ) revert InvalidTerms();

        id = keccak256(abi.encode(block.chainid, address(this), msg.sender, sellerNonce[msg.sender]++));
        AuthCaptureEscrow.PaymentInfo memory p = AuthCaptureEscrow.PaymentInfo({
            operator: address(this),
            payer: buyer,
            receiver: msg.sender,
            token: USDC,
            maxAmount: amount,
            preApprovalExpiry: preApprovalExpiry,
            authorizationExpiry: expiry,
            refundExpiry: expiry,
            minFeeBps: 0,
            maxFeeBps: 0,
            feeReceiver: address(0),
            salt: uint256(id)
        });
        bytes32 h = ESCROW.getHash(p);
        _orders[id] = Order(p, reviewer, descriptionHash, h, Status.Pending);
        emit OrderCreated(id, msg.sender, buyer, reviewer, descriptionHash, h, p);
    }

    /// @notice Returns stored terms/history; stored status may lag a direct CPP reclaim. Also read status(id).
    function getOrder(bytes32 id) external view returns (Order memory) {
        return _order(id);
    }

    /// @notice Derived status reflects direct CPP reclaims even without a Dealza transaction.
    function status(bytes32 id) public view returns (Status) {
        Order storage o = _order(id);
        if (
            (o.status == Status.Reserved || o.status == Status.Disputed)
                && block.timestamp >= o.payment.authorizationExpiry
        ) {
            (bool collected, uint120 capturable, uint120 refundable) = ESCROW.paymentState(o.paymentHash);
            if (collected && capturable == 0 && refundable == 0) return Status.Reclaimed;
            return Status.Expired;
        }
        if (o.status == Status.Pending && block.timestamp >= o.payment.preApprovalExpiry) return Status.Expired;
        return o.status;
    }

    /// @notice Buyer must first approve COLLECTOR for exactly amount and call COLLECTOR.preApprove(payment).
    function fund(bytes32 id, AuthCaptureEscrow.PaymentInfo calldata payment) external nonReentrant {
        Order storage o = _order(id);
        if (msg.sender != o.payment.payer) revert Unauthorized();
        if (o.status != Status.Pending) revert InvalidState();
        if (ESCROW.getHash(payment) != o.paymentHash) revert PaymentMismatch();
        if (block.timestamp >= o.payment.preApprovalExpiry) revert Expired();
        o.status = Status.Reserved;
        ESCROW.authorize(payment, o.payment.maxAmount, address(COLLECTOR), "");
        (bool collected, uint120 capturable, uint120 refundable) = ESCROW.paymentState(o.paymentHash);
        if (!collected || capturable != o.payment.maxAmount || refundable != 0) revert UnexpectedProtocolState();
        emit OrderFunded(id, o.paymentHash);
    }

    /// @notice Informational evidence only; does not grant capture permission.
    function noteDelivery(bytes32 id, bytes32 evidenceHash) external nonReentrant {
        Order storage o = _order(id);
        if (msg.sender != o.payment.receiver) revert Unauthorized();
        _active(o);
        if (evidenceHash == bytes32(0)) revert InvalidTerms();
        emit DeliveryNoted(id, evidenceHash);
    }

    /// @notice Explicit buyer authorization, executed atomically; blocked while disputed.
    function release(bytes32 id) external nonReentrant {
        Order storage o = _order(id);
        if (msg.sender != o.payment.payer) revert Unauthorized();
        if (o.status != Status.Reserved) revert InvalidState();
        _capture(id, o);
    }

    /// @notice Requests review without extending or freezing CPP's authorization expiry.
    /// @dev At expiry the buyer can reclaim directly in CPP even if this dispute is unresolved.
    function dispute(bytes32 id, bytes32 evidenceHash) external nonReentrant {
        Order storage o = _order(id);
        if (msg.sender != o.payment.payer && msg.sender != o.payment.receiver) revert Unauthorized();
        if (o.status != Status.Reserved) revert InvalidState();
        _active(o);
        if (evidenceHash == bytes32(0)) revert InvalidTerms();
        o.status = Status.Disputed;
        emit DisputeOpened(id, msg.sender, evidenceHash);
    }

    /// @notice Reviewer can only choose full release or full return before the capture deadline.
    function resolve(bytes32 id, bool releaseToSeller, bytes32 decisionHash) external nonReentrant {
        Order storage o = _order(id);
        if (msg.sender != o.reviewer) revert Unauthorized();
        if (o.status != Status.Disputed) revert InvalidState();
        _active(o);
        if (decisionHash == bytes32(0)) revert InvalidTerms();
        if (releaseToSeller) _capture(id, o);
        else _void(id, o);
        emit DisputeResolved(id, releaseToSeller, decisionHash);
    }

    /// @notice Either party can cancel unfunded terms. Only seller can voluntarily void a funded order.
    /// @dev Buyer recovery before expiry requires seller cooperation or a reviewer ruling.
    function cancel(bytes32 id) external nonReentrant {
        Order storage o = _order(id);
        if (o.status == Status.Pending) {
            if (msg.sender != o.payment.payer && msg.sender != o.payment.receiver) revert Unauthorized();
            o.status = Status.Voided;
            emit OrderVoided(id, msg.sender);
        } else {
            if (msg.sender != o.payment.receiver) revert Unauthorized();
            if (o.status != Status.Reserved && o.status != Status.Disputed) revert InvalidState();
            _void(id, o); // CPP void permits return even after expiry; never a capture.
        }
    }

    /// @notice Optional bookkeeping after buyer called ESCROW.reclaim(payment) directly.
    function syncRecovery(bytes32 id) external nonReentrant {
        Order storage o = _order(id);
        if (o.status != Status.Reserved && o.status != Status.Disputed) revert InvalidState();
        if (status(id) != Status.Reclaimed) revert InvalidState();
        o.status = Status.Reclaimed;
        emit RecoverySynced(id);
    }

    function _capture(bytes32 id, Order storage o) private {
        _active(o);
        o.status = Status.Released;
        ESCROW.capture(o.payment, o.payment.maxAmount, 0, address(0));
        emit OrderReleased(id, msg.sender);
    }

    function _void(bytes32 id, Order storage o) private {
        o.status = Status.Voided;
        ESCROW.void(o.payment);
        emit OrderVoided(id, msg.sender);
    }

    function _active(Order storage o) private view {
        if (o.status != Status.Reserved && o.status != Status.Disputed) revert InvalidState();
        if (block.timestamp >= o.payment.authorizationExpiry) revert Expired();
    }

    function _order(bytes32 id) private view returns (Order storage o) {
        o = _orders[id];
        if (o.status == Status.None) revert UnknownOrder();
    }

    function _useTransientReentrancyGuardOnlyOnMainnet() internal pure override returns (bool) {
        return false;
    }
}
