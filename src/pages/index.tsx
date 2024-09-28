// imports
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { NextPage } from "next";
import { useState, useEffect } from "react";
import {
  useAccount,
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import { Chessboard } from "react-chessboard";
import { Chess, Square } from "chess.js";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ABI, CONTRACT_ADDRESS } from "../keys";

// main code
const Home: NextPage = () => {
  // state management
  const [game, setGame] = useState(new Chess());
  const [gameId, setGameId] = useState<number | null>(null);
  const [stake, setStake] = useState("");
  const [player1Stake, setPlayer1Stake] = useState(0);
  const [player2Stake, setPlayer2Stake] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [isCreatingConfirming, setIsCreatingConfirming] = useState(false);
  const [isJoiningGame, setIsJoiningGame] = useState(false);
  const [isJoiningConfirming, setIsJoiningConfirming] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isWithdrawingConfirming, setIsWithdrawingConfirming] = useState(false);
  const [player1Joined, setPlayer1Joined] = useState(false);
  const [player2Joined, setPlayer2Joined] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null);

  // implementation
  const { address, isConnected } = useAccount();
  const {
    writeContract,
    data: transactionHash,
    error: writeError,
  } = useWriteContract();
  const { isLoading: isTransactionConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: transactionHash });
  // read contract
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
  // watch contract event
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    eventName: "GameCreated",
    onLogs(logs) {
      console.log("Game Created Event:", logs);
      if (logs.length > 0 && logs[0].topics.length > 1) {
        const topic = logs[0].topics[1];
        if (topic) {
          const gameId = Number(BigInt(topic));
          console.log("New Game ID:", gameId);
          setGameId(gameId);
          toast.success("Game created, waiting for Player 2 to join");
          setPlayer1Joined(true);
        } else {
          console.error("Game ID topic is undefined");
        }
      } else {
        console.error("Unexpected log structure:", logs);
      }
    },
  });
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    eventName: "PlayerJoined",
    onLogs(logs) {
      console.log("Player Joined Event:", logs);
      toast.success("Player 2 has joined the game!");
      setPlayer2Joined(true);
    },
  });
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    eventName: "PieceTaken",
    onLogs(logs) {
      console.log("Piece Taken Event:", logs);
      toast.info("A piece has been captured! Stakes updated.");
    },
  });
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    eventName: "GameEnded",
    onLogs(logs) {
      console.log("Game Ended Event:", logs);
      setGameOver(true);
      toast.success("Game has ended! You can now withdraw your stake.");
    },
  });
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    onLogs(logs) {
      console.log("Contract event:", logs);
    },
  });
  // game logic
  const handleCreateGame = async () => {
    if (!isConnected || !stake) return;
    setIsCreatingGame(true);
    try {
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "createGame",
        args: [parseEther(stake)],
      });
      setIsCreatingConfirming(true);
      console.log("Game creation transaction submitted");
      toast.success(
        "Game creation transaction submitted. Waiting for confirmation..."
      );
      console.log("Waiting for GameCreated event...");
    } catch (error) {
      console.error("Error creating game:", error);
      toast.error("Failed to create game: " + error);
    } finally {
      setIsCreatingGame(false);
    }
  };
  const handleJoinGame = async () => {
    if (!isConnected || gameId === null) return;
    setIsJoiningGame(true);
    try {
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "joinGame",
        args: [gameId],
      });
      setIsJoiningConfirming(true);
      console.log("Join game transaction submitted");
      toast.success(
        "Join game transaction submitted. Waiting for confirmation..."
      );
    } catch (error) {
      console.error("Error joining game:", error);
      toast.error("Failed to join game: " + error);
    } finally {
      setIsJoiningGame(false);
    }
  };
  const handleMove = (
    sourceSquare: Square,
    targetSquare: Square,
    piece: string
  ) => {
    if (!player1Joined || !player2Joined || !currentPlayer) {
      toast.info(
        "Both Player 1 and Player 2 need to join before you can play."
      );
      return false;
    }
    // if (
    //   (game.turn() === "w" && currentPlayer !== "player1") ||
    //   (game.turn() === "b" && currentPlayer !== "player2")
    // ) {
    //   toast.info("It's not your turn.");
    //   return false;
    // }
    const newGame = new Chess(game.fen());
    try {
      const move = newGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (move) {
        setGame(newGame);
        if (move.captured) {
          handlePieceTaken(move.captured);
        }
        if (newGame.isGameOver()) {
          handleGameEnd();
        }
        return true;
      }
    } catch (error) {
      console.error("Invalid move:", error);
      toast.error("Invalid move. Please try again.");
    }
    return false;
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
    } catch (error) {
      console.error("Error handling piece taken:", error);
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
      setGameOver(true);
    } catch (error) {
      console.error("Error ending game:", error);
    }
  };
  const handleWithdraw = async () => {
    if (!isConnected || gameId === null) return;
    setIsWithdrawing(true);
    try {
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "withdraw",
        args: [BigInt(gameId)],
      });
      setIsWithdrawingConfirming(true);
      console.log("Withdrawal transaction submitted");
      toast.success(
        "Withdrawal transaction submitted. Waiting for confirmation..."
      );
    } catch (error) {
      console.error("Error withdrawing:", error);
      toast.error("Failed to withdraw: " + error);
    } finally {
      setIsWithdrawing(false);
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

  // state management - use effect
  useEffect(() => {
    if (latestGameId !== undefined) {
      setGameId(Number(latestGameId));
    }
  }, [latestGameId]);
  useEffect(() => {
    if (gameDetails) {
      setPlayer1Stake(Number(formatEther(gameDetails[2])));
      setPlayer2Stake(Number(formatEther(gameDetails[3])));
      setGameOver(!gameDetails[4]);
      setPlayer1Joined(!!gameDetails[0]);
      setPlayer2Joined(!!gameDetails[1]);
      setCurrentPlayer(
        address === gameDetails[0]
          ? "player1"
          : address === gameDetails[1]
          ? "player2"
          : null
      );
    }
  }, [gameDetails]);
  useEffect(() => {
    if (isConfirmed) {
      refetchGameDetails();
      toast.success("Transaction confirmed!");
      setIsCreatingConfirming(false);
      setIsJoiningConfirming(false);
      setIsWithdrawingConfirming(false);
    }
  }, [isConfirmed, refetchGameDetails]);
  useEffect(() => {
    if (writeError) {
      setIsCreatingConfirming(false);
      setIsJoiningConfirming(false);
      setIsWithdrawingConfirming(false);
    }
  }, [writeError]);

  // ui
  return (
    <div className="container mx-auto px-4 text-retroGreen">
      <ConnectButton />
      <div className="my-8 flex flex-col lg:flex-row items-center">
        <div className="w-full lg:w-1/2 p-4">
          <Chessboard position={game.fen()} onPieceDrop={handleMove} />
        </div>
        <div className="w-full lg:w-1/2 p-4">
          <div className="retro-panel">
            <h2>Player 1</h2>
            <p>Stake: {player1Stake} ETH</p>
            {/* {!player1Joined && !gameId && ( */}
            <>
              <input
                type="text"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="Enter stake amount"
              />
              <button
                onClick={handleCreateGame}
                disabled={
                  isCreatingGame ||
                  isCreatingConfirming ||
                  !isConnected ||
                  !stake
                }
              >
                {isCreatingGame
                  ? "Creating Game..."
                  : isCreatingConfirming
                  ? "Confirming..."
                  : "Create Game"}
              </button>
            </>
            {/* )} */}
          </div>
          <div className="retro-panel">
            <h2>Player 2</h2>
            <p>Stake: {player2Stake} ETH</p>
            {/* {player1Joined &&
              !player2Joined &&
              address !== gameDetails?.[0] && ( */}
            <button
              onClick={handleJoinGame}
              disabled={isJoiningGame || isJoiningConfirming || !isConnected}
            >
              {isJoiningGame
                ? "Joining Game..."
                : isJoiningConfirming
                ? "Confirming..."
                : "Join Game"}
            </button>
            {/* )} */}
          </div>
        </div>
      </div>
      <ToastContainer />
      {/* {gameOver && ( */}
      <button
        onClick={handleWithdraw}
        disabled={isWithdrawing || isWithdrawingConfirming || !isConnected}
      >
        {isWithdrawing
          ? "Withdrawing..."
          : isWithdrawingConfirming
          ? "Confirming..."
          : "Withdraw"}
      </button>
      {/* )} */}
      {writeError && <p className="error">Error: {writeError.message}</p>}
      {transactionHash && <p>Transaction Hash: {transactionHash}</p>}
    </div>
  );
};

export default Home;
