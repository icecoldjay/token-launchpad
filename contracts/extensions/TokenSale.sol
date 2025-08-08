// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IToken.sol";

/**
 * @title TokenSaleManager
 * @dev Manages token sales with features like whitelisting, vesting, and caps
 */
contract TokenSaleManager is Ownable, ReentrancyGuard {
    address public feeCollector;
    uint256 public saleFee;

    // Track sale configurations
    struct SaleConfig {
        address token; // Token being sold
        address paymentToken; // Token used to buy (address(0) for ETH)
        uint256 rate; // Rate of token per payment token (or ETH) in base units
        uint256 hardCap; // Maximum tokens to sell
        uint256 softCap; // Minimum tokens to sell for sale to be successful
        uint256 minContribution; // Minimum contribution per buyer
        uint256 maxContribution; // Maximum contribution per buyer
        uint256 startTime; // Sale start timestamp
        uint256 endTime; // Sale end timestamp
        bool whitelistEnabled; // Whether whitelist is enabled
        bool vestingEnabled; // Whether vesting is enabled
        uint256 vestingDuration; // Vesting duration in seconds
        uint256 vestingStart; // When vesting starts after sale ends
        bool isActive; // Whether the sale is active
        bool isCancelled; // Whether the sale is cancelled
        bool isFinalized; // Whether the sale is finalized
        uint256 tokensSold; // Total tokens sold
        uint256 amountRaised; // Total amount raised
    }

    // Track participant contributions and vesting
    struct Participation {
        uint256 contribution; // How much they contributed
        uint256 tokensOwed; // How many tokens they're owed
        uint256 tokensClaimed; // How many tokens they've claimed
        bool refunded; // Whether they've been refunded (if sale fails)
    }

    // All sales created
    SaleConfig[] public sales;

    // Mapping: saleId => participant address => participation
    mapping(uint256 => mapping(address => Participation)) public participations;

    // Mapping: saleId => participant address => whitelist status
    mapping(uint256 => mapping(address => bool)) public whitelist;

    // Events
    event SaleCreated(
        uint256 indexed saleId,
        address indexed token,
        address indexed creator,
        uint256 hardCap,
        uint256 startTime,
        uint256 endTime
    );
    event WhitelistUpdated(
        uint256 indexed saleId,
        address indexed user,
        bool status
    );
    event TokensPurchased(
        uint256 indexed saleId,
        address indexed buyer,
        uint256 contribution,
        uint256 tokensReceived
    );
    event TokensClaimed(
        uint256 indexed saleId,
        address indexed user,
        uint256 amount
    );
    event SaleFinalized(
        uint256 indexed saleId,
        uint256 tokensSold,
        uint256 amountRaised
    );
    event SaleCancelled(uint256 indexed saleId);
    event ContributionRefunded(
        uint256 indexed saleId,
        address indexed user,
        uint256 amount
    );
    event FeeCollectorUpdated(
        address indexed oldCollector,
        address indexed newCollector
    );
    event SaleFeeUpdated(uint256 oldFee, uint256 newFee);

    constructor(address _feeCollector, uint256 _saleFee) Ownable(msg.sender) {
        require(_feeCollector != address(0), "Invalid fee collector");
        feeCollector = _feeCollector;
        saleFee = _saleFee;
    }

    /**
     * @dev Create a new token sale
     */
    function createSale(
        address token,
        address paymentToken,
        uint256 rate,
        uint256 hardCap,
        uint256 softCap,
        uint256 minContribution,
        uint256 maxContribution,
        uint256 startTime,
        uint256 endTime,
        bool whitelistEnabled,
        bool vestingEnabled,
        uint256 vestingDuration,
        uint256 vestingStart
    ) external payable nonReentrant returns (uint256) {
        require(msg.value >= saleFee, "Insufficient fee");
        require(token != address(0), "Invalid token address");
        require(rate > 0, "Invalid rate");
        require(hardCap > 0, "Invalid hard cap");
        require(softCap > 0 && softCap <= hardCap, "Invalid soft cap");
        require(minContribution > 0, "Invalid min contribution");
        require(maxContribution >= minContribution, "Invalid max contribution");
        require(
            startTime > block.timestamp,
            "Start time must be in the future"
        );
        require(endTime > startTime, "End time must be after start time");

        if (vestingEnabled) {
            require(vestingDuration > 0, "Invalid vesting duration");
        }

        // Transfer tokens from creator to this contract
        IERC20 tokenContract = IERC20(token);
        require(
            tokenContract.transferFrom(msg.sender, address(this), hardCap),
            "Token transfer failed"
        );

        // Create new sale
        uint256 saleId = sales.length;
        sales.push(
            SaleConfig({
                token: token,
                paymentToken: paymentToken,
                rate: rate,
                hardCap: hardCap,
                softCap: softCap,
                minContribution: minContribution,
                maxContribution: maxContribution,
                startTime: startTime,
                endTime: endTime,
                whitelistEnabled: whitelistEnabled,
                vestingEnabled: vestingEnabled,
                vestingDuration: vestingDuration,
                vestingStart: vestingStart,
                isActive: true,
                isCancelled: false,
                isFinalized: false,
                tokensSold: 0,
                amountRaised: 0
            })
        );

        // Pay fee to collector
        (bool sent, ) = payable(feeCollector).call{value: saleFee}("");
        require(sent, "Fee transfer failed");

        // Refund excess fee
        if (msg.value > saleFee) {
            (bool refundSent, ) = payable(msg.sender).call{
                value: msg.value - saleFee
            }("");
            require(refundSent, "Refund failed");
        }

        emit SaleCreated(
            saleId,
            token,
            msg.sender,
            hardCap,
            startTime,
            endTime
        );

        return saleId;
    }

    /**
     * @dev Whitelist users for a sale
     */
    function updateWhitelist(
        uint256 saleId,
        address[] calldata users,
        bool status
    ) external {
        require(saleId < sales.length, "Invalid sale ID");
        SaleConfig storage sale = sales[saleId];
        require(!sale.isFinalized, "Sale already finalized");
        require(
            msg.sender == owner() || msg.sender == tx.origin,
            "Not authorized"
        );

        for (uint256 i = 0; i < users.length; i++) {
            whitelist[saleId][users[i]] = status;
            emit WhitelistUpdated(saleId, users[i], status);
        }
    }

    /**
     * @dev Buy tokens with ETH
     */
    function buyWithETH(uint256 saleId) external payable nonReentrant {
        SaleConfig storage sale = sales[saleId];
        require(sale.isActive && !sale.isCancelled, "Sale not active");
        require(sale.paymentToken == address(0), "Not an ETH sale");
        require(block.timestamp >= sale.startTime, "Sale not started");
        require(block.timestamp <= sale.endTime, "Sale ended");
        require(msg.value >= sale.minContribution, "Below min contribution");
        require(msg.value > 0, "Zero contribution");

        if (sale.whitelistEnabled) {
            require(whitelist[saleId][msg.sender], "Not whitelisted");
        }

        // Calculate tokens to receive
        uint256 tokenAmount = (msg.value * sale.rate) / 1 ether;
        require(
            sale.tokensSold + tokenAmount <= sale.hardCap,
            "Exceeds hard cap"
        );

        // Check maximum contribution limit
        Participation storage participation = participations[saleId][
            msg.sender
        ];
        uint256 totalContribution = participation.contribution + msg.value;
        require(
            totalContribution <= sale.maxContribution,
            "Exceeds max contribution"
        );

        // Update sale and participation state
        sale.tokensSold += tokenAmount;
        sale.amountRaised += msg.value;
        participation.contribution += msg.value;
        participation.tokensOwed += tokenAmount;

        emit TokensPurchased(saleId, msg.sender, msg.value, tokenAmount);

        // If vesting is not enabled, transfer tokens immediately
        if (!sale.vestingEnabled) {
            IERC20(sale.token).transfer(msg.sender, tokenAmount);
            participation.tokensClaimed += tokenAmount;
            emit TokensClaimed(saleId, msg.sender, tokenAmount);
        }
    }

    /**
     * @dev Buy tokens with ERC20 tokens
     */
    function buyWithToken(
        uint256 saleId,
        uint256 amount
    ) external nonReentrant {
        SaleConfig storage sale = sales[saleId];
        require(sale.isActive && !sale.isCancelled, "Sale not active");
        require(sale.paymentToken != address(0), "Not a token sale");
        require(block.timestamp >= sale.startTime, "Sale not started");
        require(block.timestamp <= sale.endTime, "Sale ended");
        require(amount >= sale.minContribution, "Below min contribution");
        require(amount > 0, "Zero contribution");

        if (sale.whitelistEnabled) {
            require(whitelist[saleId][msg.sender], "Not whitelisted");
        }

        // Calculate tokens to receive
        uint256 tokenAmount = (amount * sale.rate) / 10 ** 18;
        require(
            sale.tokensSold + tokenAmount <= sale.hardCap,
            "Exceeds hard cap"
        );

        // Check maximum contribution limit
        Participation storage participation = participations[saleId][
            msg.sender
        ];
        uint256 totalContribution = participation.contribution + amount;
        require(
            totalContribution <= sale.maxContribution,
            "Exceeds max contribution"
        );

        // Transfer payment tokens from user to contract
        IERC20 paymentToken = IERC20(sale.paymentToken);
        require(
            paymentToken.transferFrom(msg.sender, address(this), amount),
            "Token transfer failed"
        );

        // Update sale and participation state
        sale.tokensSold += tokenAmount;
        sale.amountRaised += amount;
        participation.contribution += amount;
        participation.tokensOwed += tokenAmount;

        emit TokensPurchased(saleId, msg.sender, amount, tokenAmount);

        // If vesting is not enabled, transfer tokens immediately
        if (!sale.vestingEnabled) {
            IERC20(sale.token).transfer(msg.sender, tokenAmount);
            participation.tokensClaimed += tokenAmount;
            emit TokensClaimed(saleId, msg.sender, tokenAmount);
        }
    }

    /**
     * @dev Claim vested tokens
     */
    function claimTokens(uint256 saleId) external nonReentrant {
        SaleConfig storage sale = sales[saleId];
        require(sale.isFinalized, "Sale not finalized");
        require(!sale.isCancelled, "Sale was cancelled");

        Participation storage participation = participations[saleId][
            msg.sender
        ];
        require(
            participation.tokensOwed > participation.tokensClaimed,
            "No tokens to claim"
        );

        uint256 claimableTokens;

        if (sale.vestingEnabled) {
            uint256 vestingEndTime = sale.vestingStart + sale.vestingDuration;

            if (block.timestamp < sale.vestingStart) {
                // Vesting hasn't started yet
                return;
            } else if (block.timestamp >= vestingEndTime) {
                // Vesting completed - claim all remaining tokens
                claimableTokens =
                    participation.tokensOwed -
                    participation.tokensClaimed;
            } else {
                // Vesting in progress - calculate proportional amount
                uint256 vestingElapsed = block.timestamp - sale.vestingStart;
                uint256 totalClaimable = (participation.tokensOwed *
                    vestingElapsed) / sale.vestingDuration;
                claimableTokens = totalClaimable - participation.tokensClaimed;
            }
        } else {
            // No vesting - claim all tokens
            claimableTokens =
                participation.tokensOwed -
                participation.tokensClaimed;
        }

        require(claimableTokens > 0, "No tokens claimable at this time");

        // Transfer tokens to participant
        IERC20(sale.token).transfer(msg.sender, claimableTokens);
        participation.tokensClaimed += claimableTokens;

        emit TokensClaimed(saleId, msg.sender, claimableTokens);
    }

    /**
     * @dev Get claimable tokens for a user
     */
    function getClaimableTokens(
        uint256 saleId,
        address user
    ) external view returns (uint256) {
        SaleConfig storage sale = sales[saleId];
        if (!sale.isFinalized || sale.isCancelled) {
            return 0;
        }

        Participation storage participation = participations[saleId][user];
        if (participation.tokensOwed <= participation.tokensClaimed) {
            return 0;
        }

        uint256 claimableTokens;

        if (sale.vestingEnabled) {
            uint256 vestingEndTime = sale.vestingStart + sale.vestingDuration;

            if (block.timestamp < sale.vestingStart) {
                // Vesting hasn't started yet
                return 0;
            } else if (block.timestamp >= vestingEndTime) {
                // Vesting completed - all remaining tokens are claimable
                claimableTokens =
                    participation.tokensOwed -
                    participation.tokensClaimed;
            } else {
                // Vesting in progress - calculate proportional amount
                uint256 vestingElapsed = block.timestamp - sale.vestingStart;
                uint256 totalClaimable = (participation.tokensOwed *
                    vestingElapsed) / sale.vestingDuration;
                claimableTokens = totalClaimable - participation.tokensClaimed;
            }
        } else {
            // No vesting - all tokens are claimable
            claimableTokens =
                participation.tokensOwed -
                participation.tokensClaimed;
        }

        return claimableTokens;
    }

    /**
     * @dev Finalize a sale
     */
    function finalizeSale(uint256 saleId) external nonReentrant {
        SaleConfig storage sale = sales[saleId];
        require(sale.isActive && !sale.isCancelled, "Sale not active");
        require(
            block.timestamp > sale.endTime || sale.tokensSold >= sale.hardCap,
            "Sale still in progress"
        );
        require(
            msg.sender == owner() || msg.sender == tx.origin,
            "Not authorized"
        );

        bool isSuccessful = sale.amountRaised >= sale.softCap;

        if (isSuccessful) {
            // Mark sale as finalized and set vesting start time if enabled
            sale.isFinalized = true;
            if (sale.vestingEnabled) {
                sale.vestingStart = block.timestamp;
            }

            // Transfer raised funds to owner
            if (sale.paymentToken == address(0)) {
                // ETH sale
                (bool sent, ) = payable(owner()).call{value: sale.amountRaised}(
                    ""
                );
                require(sent, "ETH transfer failed");
            } else {
                // Token sale
                IERC20(sale.paymentToken).transfer(owner(), sale.amountRaised);
            }

            // Return unsold tokens to owner
            uint256 unsoldTokens = sale.hardCap - sale.tokensSold;
            if (unsoldTokens > 0) {
                IERC20(sale.token).transfer(owner(), unsoldTokens);
            }
        } else {
            // Sale failed - mark as cancelled
            sale.isCancelled = true;

            // Return all tokens to owner
            IERC20(sale.token).transfer(owner(), sale.hardCap);
        }

        sale.isActive = false;

        if (isSuccessful) {
            emit SaleFinalized(saleId, sale.tokensSold, sale.amountRaised);
        } else {
            emit SaleCancelled(saleId);
        }
    }

    /**
     * @dev Manual cancel sale (only owner)
     */
    function cancelSale(uint256 saleId) external onlyOwner {
        SaleConfig storage sale = sales[saleId];
        require(sale.isActive && !sale.isCancelled, "Sale not active");

        // Mark sale as cancelled
        sale.isActive = false;
        sale.isCancelled = true;

        // Return all tokens to owner
        IERC20(sale.token).transfer(owner(), sale.hardCap - sale.tokensSold);

        emit SaleCancelled(saleId);
    }

    /**
     * @dev Claim refund if sale was unsuccessful
     */
    function claimRefund(uint256 saleId) external nonReentrant {
        SaleConfig storage sale = sales[saleId];
        require(!sale.isActive, "Sale still active");
        require(sale.isCancelled, "Sale not cancelled");

        Participation storage participation = participations[saleId][
            msg.sender
        ];
        require(participation.contribution > 0, "No contribution found");
        require(!participation.refunded, "Already refunded");

        uint256 refundAmount = participation.contribution;
        participation.refunded = true;

        if (sale.paymentToken == address(0)) {
            // Refund ETH
            (bool sent, ) = payable(msg.sender).call{value: refundAmount}("");
            require(sent, "ETH refund failed");
        } else {
            // Refund tokens
            IERC20(sale.paymentToken).transfer(msg.sender, refundAmount);
        }

        emit ContributionRefunded(saleId, msg.sender, refundAmount);
    }

    /**
     * @dev Get sale information by ID
     */
    function getSaleInfo(
        uint256 saleId
    ) external view returns (SaleConfig memory) {
        require(saleId < sales.length, "Invalid sale ID");
        return sales[saleId];
    }

    /**
     * @dev Get the total number of sales
     */
    function getSaleCount() external view returns (uint256) {
        return sales.length;
    }

    /**
     * @dev Get participant information
     */
    function getParticipation(
        uint256 saleId,
        address user
    ) external view returns (Participation memory) {
        return participations[saleId][user];
    }

    /**
     * @dev Check if a user is whitelisted for a sale
     */
    function isWhitelisted(
        uint256 saleId,
        address user
    ) external view returns (bool) {
        return whitelist[saleId][user];
    }

    /**
     * @dev Update fee collector address
     */
    function updateFeeCollector(address _newCollector) external onlyOwner {
        require(_newCollector != address(0), "Invalid collector address");
        address oldCollector = feeCollector;
        feeCollector = _newCollector;
        emit FeeCollectorUpdated(oldCollector, _newCollector);
    }

    /**
     * @dev Update sale fee
     */
    function updateSaleFee(uint256 _newFee) external onlyOwner {
        uint256 oldFee = saleFee;
        saleFee = _newFee;
        emit SaleFeeUpdated(oldFee, _newFee);
    }

    /**
     * @dev Emergency function to rescue ERC20 tokens sent to this contract by mistake
     */
    function rescueTokens(
        address tokenAddress,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        IERC20(tokenAddress).transfer(recipient, amount);
    }

    /**
     * @dev Emergency function to rescue ETH sent to this contract by mistake
     */
    function rescueETH(
        address payable recipient,
        uint256 amount
    ) external onlyOwner {
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    /**
     * @dev Handle received ETH
     */
    receive() external payable {}
}
