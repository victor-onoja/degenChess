import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { NextPage } from "next";
import { useEffect, useState } from "react";
import {
  useAccount,
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import { Chessboard } from "react-chessboard";
import { Square } from "chess.js";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../state_management/store";
import {
  makeMove,
  setCurrentPlayer,
  resetGame,
} from "../state_management/game_slice";
import {
  setGameId,
  setStakes,
  setPlayerJoined,
  setCreatingGame,
  setJoiningGame,
  setWithdrawing,
} from "../state_management/contract_slice";
import { ABI, CONTRACT_ADDRESS, LINK_TOKEN_ADDRESS } from "../keys";

const Home: NextPage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { game, gameOver, currentPlayer } = useSelector(
    (state: RootState) => state.game
  );
  const {
    gameId,
    player1Stake,
    player2Stake,
    player1Joined,
    player2Joined,
    isCreatingGame,
    isJoiningGame,
    isWithdrawing,
  } = useSelector((state: RootState) => state.contract);

  const [stake, setStake] = useState("");

  const { address, isConnected } = useAccount();
  const {
    writeContract,
    data: transactionHash,
    error: writeError,
  } = useWriteContract();
  const { isLoading: isTransactionConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: transactionHash });

  const { data: latestGameId } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: "getLatestGameId",
  }) as { data: bigint | undefined };

  const { data: gameDetails, refetch: refetchGameDetails } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: "getGameDetails",
    args: gameId !== null ? [BigInt(gameId)] : undefined,
  }) as {
    data: [string, string, bigint, bigint, boolean] | undefined;
    refetch: () => void;
  };

  useEffect(() => {
    if (latestGameId !== undefined) {
      dispatch(setGameId(Number(latestGameId)));
    }
  }, [latestGameId, dispatch]);

  useEffect(() => {
    if (gameDetails) {
      dispatch(
        setStakes({
          player1: Number(formatEther(gameDetails[2])),
          player2: Number(formatEther(gameDetails[3])),
        })
      );
      dispatch(
        setPlayerJoined({ player: "player1", joined: !!gameDetails[0] })
      );
      dispatch(
        setPlayerJoined({ player: "player2", joined: !!gameDetails[1] })
      );
      dispatch(
        setCurrentPlayer(
          address === gameDetails[0]
            ? "player1"
            : address === gameDetails[1]
            ? "player2"
            : null
        )
      );
    }
  }, [gameDetails, address, dispatch]);

  useEffect(() => {
    if (isConfirmed) {
      refetchGameDetails();
      toast.success("Transaction confirmed!");
    }
  }, [isConfirmed, refetchGameDetails]);

  const handleApprove = async () => {
    if (!isConnected || !stake) return;
    try {
      writeContract({
        address: LINK_TOKEN_ADDRESS,
        abi: [
          {
            constant: false,
            inputs: [
              { name: "_spender", type: "address" },
              { name: "_value", type: "uint256" },
            ],
            name: "approve",
            outputs: [{ name: "", type: "bool" }],
            type: "function",
          },
        ],
        functionName: "approve",
        args: [CONTRACT_ADDRESS, parseEther(stake)],
      });
      toast.info(
        "Approval transaction submitted. Please wait for confirmation."
      );
    } catch (error) {
      console.error("Error approving LINK tokens:", error);
      toast.error("Failed to approve LINK tokens: " + error);
    }
  };

  const handleCreateGame = async () => {
    if (!isConnected || !stake) return;
    dispatch(setCreatingGame(true));
    try {
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "createGame",
        args: [parseEther(stake)],
      });
      toast.success(
        "Game creation transaction submitted. Waiting for confirmation..."
      );
    } catch (error) {
      console.error("Error creating game:", error);
      toast.error("Failed to create game: " + error);
    } finally {
      dispatch(setCreatingGame(false));
    }
  };

  const handleJoinGame = async () => {
    if (!isConnected || gameId === null) return;
    dispatch(setJoiningGame(true));
    try {
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "joinGame",
        args: [gameId],
      });
      toast.success(
        "Join game transaction submitted. Waiting for confirmation..."
      );
    } catch (error) {
      console.error("Error joining game:", error);
      toast.error("Failed to join game: " + error);
    } finally {
      dispatch(setJoiningGame(false));
    }
  };

  // const handleMove = (sourceSquare: Square, targetSquare: Square) => {
  //   if (!player1Joined || !player2Joined || !currentPlayer) {
  //     toast.info(
  //       "Both Player 1 and Player 2 need to join before you can play."
  //     );
  //     return false;
  //   }

  //   try {
  //     dispatch(makeMove({ from: sourceSquare, to: targetSquare }));
  //     // Check if a piece was captured and handle it
  //     const capturedPiece = game.get(targetSquare);
  //     if (capturedPiece && capturedPiece.color !== game.turn()) {
  //       handlePieceTaken(capturedPiece.type);
  //     }
  //     if (game.isGameOver()) {
  //       handleGameEnd();
  //     }
  //     return true;
  //   } catch (error) {
  //     console.error("Invalid move:", error);
  //     toast.error("Invalid move. Please try again.");
  //     return false;
  //   }
  // };

  const handleMove = (sourceSquare: Square, targetSquare: Square) => {
    if (!player1Joined || !player2Joined || !currentPlayer) {
      toast.info(
        "Both Player 1 and Player 2 need to join before you can play."
      );
      return false;
    }

    try {
      // Get the piece at the target square before the move
      const targetPiece = game.get(targetSquare);

      // Make the move
      const moveResult = dispatch(
        makeMove({ from: sourceSquare, to: targetSquare })
      );

      // If the move was successful and a piece was captured
      if (moveResult && targetPiece && targetPiece.color !== game.turn()) {
        handlePieceTaken(targetPiece.type);
      }

      if (game.isGameOver()) {
        handleGameEnd();
      }
      return true;
    } catch (error) {
      console.error("Invalid move:", error);
      toast.error("Invalid move. Please try again.");
      return false;
    }
  };

  const handlePieceTaken = async (pieceType: string) => {
    if (!isConnected || gameId === null) return;
    try {
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "pieceTaken",
        args: [BigInt(gameId), address, getPieceTypeId(pieceType)],
      });
      toast.info("Piece captured! Updating stakes...");
    } catch (error) {
      console.error("Error handling piece taken:", error);
      toast.error("Failed to update stakes: " + error);
    }
  };

  const handleGameEnd = async () => {
    if (!isConnected || gameId === null) return;
    try {
      const winner = game.turn() === "w" ? "black" : "white";
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "endGame",
        args: [BigInt(gameId), address],
      });
      toast.success("Game ended! The winner can now withdraw their winnings.");
    } catch (error) {
      console.error("Error ending game:", error);
      toast.error("Failed to end game: " + error);
    }
  };

  const handleWithdraw = async () => {
    if (!isConnected || gameId === null) return;
    dispatch(setWithdrawing(true));
    try {
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "withdraw",
        args: [BigInt(gameId)],
      });
      toast.success(
        "Withdrawal transaction submitted. Waiting for confirmation..."
      );
    } catch (error) {
      console.error("Error withdrawing:", error);
      toast.error("Failed to withdraw: " + error);
    } finally {
      dispatch(setWithdrawing(false));
    }
  };

  const getPieceTypeId = (pieceType: string): number => {
    const pieceMap: { [key: string]: number } = {
      p: 1,
      n: 2,
      b: 3,
      r: 4,
      q: 5,
      k: 6,
    };
    return pieceMap[pieceType.toLowerCase()] || 0;
  };

  return (
    <div className="container mx-auto px-4 text-retroGreen">
      <ConnectButton />
      <div className="my-8 flex flex-col lg:flex-row items-center">
        <div className="w-full lg:w-1/2 p-4">
          <Chessboard position={game.fen()} onPieceDrop={handleMove} />
        </div>
        <div className="w-full lg:w-1/2 p-4">
          <div className="retro-panel mb-4">
            <h2 className="text-2xl font-bold mb-2">Game Status</h2>
            <p>Game ID: {gameId !== null ? gameId : "No active game"}</p>
            <p>Player 1 Stake: {player1Stake} LINK</p>
            <p>Player 2 Stake: {player2Stake} LINK</p>
            <p>Game Active: {gameOver ? "No" : "Yes"}</p>
            <p>Current Player: {currentPlayer || "Waiting for players"}</p>
          </div>
          {/* {!player1Joined && !gameOver && ( */}
          <div className="retro-panel mb-4">
            <h2 className="text-xl font-bold mb-2">Create New Game</h2>
            <input
              type="text"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="Enter Stake amount (LINK)"
              className="w-full p-2 mb-2 bg-retroBlack text-retroGreen border border-retroGreen"
            />
            <button
              onClick={handleApprove}
              disabled={isCreatingGame || !isConnected || !stake}
              className="w-full p-2 mb-2 bg-retroGreen text-retroBlack font-bold hover:bg-retroGreenLight disabled:opacity-50"
            >
              Approve LINK
            </button>
            <button
              onClick={handleCreateGame}
              disabled={isCreatingGame || !isConnected || !stake}
              className="w-full p-2 bg-retroGreen text-retroBlack font-bold hover:bg-retroGreenLight disabled:opacity-50"
            >
              {isCreatingGame ? "Creating Game..." : "Create Game"}
            </button>
          </div>
          {/* )} */}

          {/* {player1Joined && !player2Joined && currentPlayer !== "player1" && ( */}
          <div className="retro-panel mb-4">
            <h2 className="text-xl font-bold mb-2">Join Game</h2>
            <p>Stake required: {player1Stake} LINK</p>
            <button
              onClick={handleApprove}
              disabled={isJoiningGame || !isConnected}
              className="w-full p-2 mb-2 bg-retroGreen text-retroBlack font-bold hover:bg-retroGreenLight disabled:opacity-50"
            >
              Approve LINK
            </button>
            <button
              onClick={handleJoinGame}
              disabled={isJoiningGame || !isConnected}
              className="w-full p-2 bg-retroGreen text-retroBlack font-bold hover:bg-retroGreenLight disabled:opacity-50"
            >
              {isJoiningGame ? "Joining Game..." : "Join Game"}
            </button>
          </div>
          {/* )} */}

          {/* {gameOver && ( */}
          <div className="retro-panel mb-4">
            <h2 className="text-xl font-bold mb-2">Game Over</h2>
            <button
              onClick={handleWithdraw}
              disabled={isWithdrawing || !isConnected}
              className="w-full p-2 bg-retroGreen text-retroBlack font-bold hover:bg-retroGreenLight disabled:opacity-50"
            >
              {isWithdrawing ? "Withdrawing..." : "Withdraw Winnings"}
            </button>
          </div>
          {/* )} */}

          {writeError && (
            <div className="retro-panel mb-4 bg-red-900">
              <h2 className="text-xl font-bold mb-2">Error</h2>
              <p>{writeError.message}</p>
            </div>
          )}

          {transactionHash && (
            <div className="retro-panel mb-4">
              <h2 className="text-xl font-bold mb-2">Transaction Submitted</h2>
              <p className="break-all">Hash: {transactionHash}</p>
            </div>
          )}
        </div>
      </div>
      <ToastContainer position="bottom-right" theme="dark" />
    </div>
  );
};

export default Home;
