// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CreditAttestationVerifier.sol";
import "./WorkerRegistry.sol";

/**
 * @title LoanVault
 * @notice Manages borrowing and repayment using verified credit attestations
 */
contract LoanVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Loan {
        address borrower;
        uint256 principal;
        uint256 interestAmount;
        uint256 totalDue;
        uint256 amountRepaid;
        uint64 startTime;
        uint64 dueDate;
        uint16 aprBps;
        bool isActive;
        bool isDefaulted;
    }

    IERC20 public immutable token;
    CreditAttestationVerifier public immutable verifier;
    WorkerRegistry public immutable registry;

    // Borrower => Loan
    mapping(address => Loan) public loans;
    
    // Total amounts
    uint256 public totalDeposited;
    uint256 public totalBorrowed;

    event Deposited(address indexed depositor, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    event LoanApproved(
        address indexed borrower,
        uint256 principal,
        uint256 interestAmount,
        uint64 dueDate,
        uint64 nonce
    );
    event Repaid(address indexed borrower, uint256 amount, uint256 remaining);
    event LoanFullyRepaid(address indexed borrower, uint256 totalPaid);
    event LoanDefaulted(address indexed borrower, uint256 amountOwed);

    constructor(
        address _token,
        address _verifier,
        address _registry
    ) Ownable(msg.sender) {
        token = IERC20(_token);
        verifier = CreditAttestationVerifier(_verifier);
        registry = WorkerRegistry(_registry);
    }

    /**
     * @notice Deposit funds into the vault (owner only for MVP)
     */
    function deposit(uint256 _amount) external onlyOwner {
        token.safeTransferFrom(msg.sender, address(this), _amount);
        totalDeposited += _amount;
        emit Deposited(msg.sender, _amount);
    }

    /**
     * @notice Withdraw funds from the vault (owner only)
     */
    function withdraw(uint256 _amount) external onlyOwner {
        require(_amount <= getAvailableLiquidity(), "Insufficient liquidity");
        token.safeTransfer(msg.sender, _amount);
        totalDeposited -= _amount;
        emit Withdrawn(msg.sender, _amount);
    }

    /**
     * @notice Get available liquidity for lending
     */
    function getAvailableLiquidity() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /**
     * @notice Request a loan using a valid credit attestation
     */
    function requestLoan(
        uint256 _amount,
        CreditAttestationVerifier.CreditAttestation calldata attestation,
        bytes calldata signature
    ) external nonReentrant {
        // Verify attestation and mark nonce as used
        verifier.verifyAndConsumeAttestation(attestation, signature);

        // Validations
        require(attestation.worker == msg.sender, "Not attestation owner");
        require(registry.isActiveWorker(msg.sender), "Not active worker");
        require(!loans[msg.sender].isActive, "Existing loan active");
        require(_amount > 0 && _amount <= attestation.creditLimit, "Invalid amount");
        require(_amount <= getAvailableLiquidity(), "Insufficient vault liquidity");
        require(attestation.fraudFlags == 0, "Fraud flags detected");

        // Calculate interest
        uint256 interestAmount = (_amount * attestation.aprBps * attestation.tenureDays) / (10000 * 365);
        uint64 dueDate = uint64(block.timestamp) + (uint64(attestation.tenureDays) * 1 days);

        // Create loan
        loans[msg.sender] = Loan({
            borrower: msg.sender,
            principal: _amount,
            interestAmount: interestAmount,
            totalDue: _amount + interestAmount,
            amountRepaid: 0,
            startTime: uint64(block.timestamp),
            dueDate: dueDate,
            aprBps: attestation.aprBps,
            isActive: true,
            isDefaulted: false
        });

        totalBorrowed += _amount;

        // Transfer funds to borrower
        token.safeTransfer(msg.sender, _amount);

        emit LoanApproved(
            msg.sender,
            _amount,
            interestAmount,
            dueDate,
            attestation.nonce
        );
    }

    /**
     * @notice Repay part or all of the loan
     */
    function repay(uint256 _amount) external nonReentrant {
        Loan storage loan = loans[msg.sender];
        require(loan.isActive, "No active loan");
        require(!loan.isDefaulted, "Loan defaulted");

        uint256 remaining = loan.totalDue - loan.amountRepaid;
        uint256 paymentAmount = _amount > remaining ? remaining : _amount;

        token.safeTransferFrom(msg.sender, address(this), paymentAmount);
        loan.amountRepaid += paymentAmount;

        emit Repaid(msg.sender, paymentAmount, loan.totalDue - loan.amountRepaid);

        // Check if fully repaid
        if (loan.amountRepaid >= loan.totalDue) {
            loan.isActive = false;
            totalBorrowed -= loan.principal;
            emit LoanFullyRepaid(msg.sender, loan.amountRepaid);
        }
    }

    /**
     * @notice Mark a loan as defaulted (owner only)
     */
    function markDefault(address _borrower) external onlyOwner {
        Loan storage loan = loans[_borrower];
        require(loan.isActive, "No active loan");
        require(block.timestamp > loan.dueDate, "Not past due date");
        require(!loan.isDefaulted, "Already defaulted");

        loan.isDefaulted = true;
        loan.isActive = false;
        totalBorrowed -= loan.principal;

        emit LoanDefaulted(_borrower, loan.totalDue - loan.amountRepaid);
    }

    /**
     * @notice Get loan details for a borrower
     */
    function getLoan(address _borrower) external view returns (Loan memory) {
        return loans[_borrower];
    }

    /**
     * @notice Check if borrower has an active loan
     */
    function hasActiveLoan(address _borrower) external view returns (bool) {
        return loans[_borrower].isActive;
    }
}
