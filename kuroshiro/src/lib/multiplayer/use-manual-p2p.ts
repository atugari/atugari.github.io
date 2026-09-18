import { useCallback, useEffect, useRef, useState } from "react";
import { ManualP2P, type ManualPeerInfo } from "./manual-p2p";

export interface UseManualP2POptions {
  isHost: boolean;
  name: string;
}

export interface ManualP2PHandle {
  selfId: string;
  peers: ManualPeerInfo[];
  offerCode: string;
  answerCode: string;
  preparing: boolean;
  error: string | null;
  restart: () => void;
  acceptOffer: (code: string) => Promise<void>;
  acceptAnswer: (code: string) => Promise<void>;
  send: (data: unknown, peerId?: string) => void;
  broadcast: (data: unknown) => void;
  onMessage: (fn: (from: string, data: unknown, channel: "state" | "reliable") => void) => () => void;
}

export function useManualP2P(options: UseManualP2POptions): ManualP2PHandle {
  const [isHost] = useState(options.isHost);
  const [name] = useState(options.name);
  const [peer, setPeer] = useState<ManualPeerInfo | null>(null);
  const [offerCode, setOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [preparing, setPreparing] = useState(options.isHost);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<ManualP2P | null>(null);
  const listeners = useRef(new Set<(from: string, data: unknown, channel: "state" | "reliable") => void>());
  const [selfId, setSelfId] = useState("");
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let disposed = false;
    const room = new ManualP2P({
      isHost,
      name,
      onPeerChanged: (next) => {
        if (!disposed) setPeer(next);
      },
      onMessage: (from, data, channel) => {
        for (const fn of listeners.current) fn(from, data, channel);
      },
    });
    roomRef.current = room;
    setSelfId(room.selfId);

    if (isHost) {
      void room
        .createOfferCode()
        .then((code) => {
          if (!disposed) setOfferCode(code);
        })
        .catch((reason: unknown) => {
          if (!disposed) setError(reason instanceof Error ? reason.message : "招待コードを作れませんでした");
        })
        .finally(() => {
          if (!disposed) setPreparing(false);
        });
    }

    return () => {
      disposed = true;
      roomRef.current = null;
      room.close();
    };
  }, [isHost, name, generation]);

  const restart = useCallback(() => {
    setPeer(null);
    setOfferCode("");
    setAnswerCode("");
    setError(null);
    setPreparing(isHost);
    setGeneration((value) => value + 1);
  }, [isHost]);

  const acceptOffer = useCallback(async (code: string) => {
    const room = roomRef.current;
    if (!room) return;
    setError(null);
    setPreparing(true);
    try {
      const answer = await room.acceptOfferCode(code);
      setAnswerCode(answer);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "招待コードを読み込めませんでした");
      throw reason;
    } finally {
      setPreparing(false);
    }
  }, []);

  const acceptAnswer = useCallback(async (code: string) => {
    const room = roomRef.current;
    if (!room) return;
    setError(null);
    setPreparing(true);
    try {
      await room.acceptAnswerCode(code);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "返答コードを読み込めませんでした");
      throw reason;
    } finally {
      setPreparing(false);
    }
  }, []);

  const send = useCallback((data: unknown, _peerId?: string) => {
    roomRef.current?.send(data, "reliable");
  }, []);
  const broadcast = useCallback((data: unknown) => {
    roomRef.current?.send(data, "reliable");
  }, []);
  const onMessage = useCallback(
    (fn: (from: string, data: unknown, channel: "state" | "reliable") => void) => {
      listeners.current.add(fn);
      return () => listeners.current.delete(fn);
    },
    [],
  );

  return {
    selfId,
    peers: peer ? [peer] : [],
    offerCode,
    answerCode,
    preparing,
    error,
    restart,
    acceptOffer,
    acceptAnswer,
    send,
    broadcast,
    onMessage,
  };
}
