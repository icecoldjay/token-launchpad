// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TimeControl is Ownable {
    // uint256 private lastPhase;
    // uint256 private lastPhaseUpdateTime;
    uint256 public launchTime;
    bool public tradingEnabled;
    
    // Time-based phases
    uint256 public  PHASE_1_DURATION = 1 hours;
    uint256 public  PHASE_2_DURATION = 6 hours;
    uint256 public  PHASE_3_DURATION = 24 hours;
    
    modifier onlyAfterLaunch() {
        require(tradingEnabled && block.timestamp >= launchTime, "Trading not yet enabled");
        _;
    }

    constructor() Ownable(msg.sender) {}
    
    // Optional: Ability to adjust phase durations
    function updatePhaseDurations(
        uint256 phase1Duration,
        uint256 phase2Duration,
        uint256 phase3Duration
    ) external onlyOwner {
        require(
            !tradingEnabled, 
            "Cannot modify durations after trading is enabled"
        );
        

        PHASE_1_DURATION = phase1Duration;
        PHASE_2_DURATION = phase2Duration;
        PHASE_3_DURATION = phase3Duration;
    }

    function getCurrentPhase() public view returns (uint8) {
        if (!tradingEnabled) return 0;
        
        uint256 timeSinceLaunch = block.timestamp - launchTime;
        
        if (timeSinceLaunch < PHASE_1_DURATION) {
            return 1;
        } else if (timeSinceLaunch < PHASE_1_DURATION + PHASE_2_DURATION) {
            return 2;
        } else if (timeSinceLaunch < PHASE_1_DURATION + PHASE_2_DURATION + PHASE_3_DURATION) {
            return 3;
        } else {
            return 4;
        }
    }

    // Utility function to check time remaining in current phase
    function getTimeRemainingInCurrentPhase() external view returns (uint256) {
        if (!tradingEnabled) return 0;
        
        uint256 timeSinceLaunch = block.timestamp - launchTime;
        uint8 currentPhase = getCurrentPhase();
        
        if (currentPhase == 1) {
            return PHASE_1_DURATION - timeSinceLaunch;
        } else if (currentPhase == 2) {
            return (PHASE_1_DURATION + PHASE_2_DURATION) - timeSinceLaunch;
        } else if (currentPhase == 3) {
            return (PHASE_1_DURATION + PHASE_2_DURATION + PHASE_3_DURATION) - timeSinceLaunch;
        }
        
        return 0;
    }
}

// function getCurrentPhase() public returns (uint256) {
//     if (block.timestamp > lastPhaseUpdateTime + 5 minutes) {  
//         lastPhase = _calculatePhase();  // Now calling a private function
//         lastPhaseUpdateTime = block.timestamp;
//     }
//     return lastPhase;
// }


// function calculatePhase() internal view returns (uint256) {
//     uint256 elapsedTime = block.timestamp - launchTime;  

//     if (elapsedTime < 1 hours) {
//         return 1;  // Phase 1: Initial Launch
//     } else if (elapsedTime < 6 hours) {
//         return 2;  // Phase 2: Early Trading
//     } else if (elapsedTime < 24 hours) {
//         return 3;  // Phase 3: Market Stability
//     } else {
//         return 4;  // Phase 4: Fully Operational
//     }
// }
