import { useCallback, useEffect, useState } from "react";

/** Which 3D pieces play: the Heroes and Undead armies, or the classic Staunton set. */
export type PieceSet = "armies" | "classic";
const KEY = "degenchess.set";

/** The viewer's choice of 3D pieces, remembered on this device. Armies unless they chose classic. */
export function usePieceSet(): [PieceSet, (next: PieceSet) => void] {
  const [set, setSet] = useState<PieceSet>("armies");
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "classic") setSet("classic");
    } catch {}
  }, []);
  const choose = useCallback((next: PieceSet) => {
    setSet(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }, []);
  return [set, choose];
}
