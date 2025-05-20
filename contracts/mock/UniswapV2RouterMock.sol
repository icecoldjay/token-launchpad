// Mock Uniswap V2 Router
contract UniswapV2Router02Mock {
    address public immutable factory;
    address public immutable WETH;

    struct AddLiquidityResponse {
        uint amountA;
        uint amountB;
        uint liquidity;
    }

    struct AddLiquidityETHResponse {
        uint amountToken;
        uint amountETH;
        uint liquidity;
    }

    AddLiquidityResponse public addLiquidityResponse;
    AddLiquidityETHResponse public addLiquidityETHResponse;

    constructor(address _factory, address _WETH) {
        factory = _factory;
        WETH = _WETH;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity) {
        require(deadline >= block.timestamp, "UniswapV2Router: EXPIRED");
        require(
            amountADesired >= amountAMin,
            "UniswapV2Router: INSUFFICIENT_A_AMOUNT"
        );
        require(
            amountBDesired >= amountBMin,
            "UniswapV2Router: INSUFFICIENT_B_AMOUNT"
        );

        // Return mock values
        return (
            addLiquidityResponse.amountA,
            addLiquidityResponse.amountB,
            addLiquidityResponse.liquidity
        );
    }

    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    )
        external
        payable
        returns (uint amountToken, uint amountETH, uint liquidity)
    {
        require(deadline >= block.timestamp, "UniswapV2Router: EXPIRED");
        require(
            amountTokenDesired >= amountTokenMin,
            "UniswapV2Router: INSUFFICIENT_TOKEN_AMOUNT"
        );
        require(
            msg.value >= amountETHMin,
            "UniswapV2Router: INSUFFICIENT_ETH_AMOUNT"
        );

        // Return mock values
        return (
            addLiquidityETHResponse.amountToken,
            addLiquidityETHResponse.amountETH,
            addLiquidityETHResponse.liquidity
        );
    }

    // Helper function for testing to set addLiquidity response
    function setAddLiquidityResponse(
        AddLiquidityResponse memory response
    ) external {
        addLiquidityResponse = response;
    }

    // Helper function for testing to set addLiquidityETH response
    function setAddLiquidityETHResponse(
        AddLiquidityETHResponse memory response
    ) external {
        addLiquidityETHResponse = response;
    }
}
